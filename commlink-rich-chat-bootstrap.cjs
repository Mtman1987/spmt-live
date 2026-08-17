'use strict';

const fs = require('node:fs');
const path = require('node:path');

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    const complete = source.includes('function renderProviderChatText(')
      && source.includes('const discordEmbeds =')
      && source.includes("message.provider === 'discord' && item.type === 'emote'");
    if (complete) return source;
    throw new Error(`Commlink rich chat bootstrap could not find ${label}`);
  }
  return source.replace(from, to);
}

function installCommlinkRichChatBootstrap() {
  const jsPath = process.env.SPMT_COMMLINK_JS_PATH
    ? path.resolve(process.env.SPMT_COMMLINK_JS_PATH)
    : path.join(__dirname, 'public', 'commlink', 'commlink.js');
  const cssPath = process.env.SPMT_COMMLINK_CSS_PATH
    ? path.resolve(process.env.SPMT_COMMLINK_CSS_PATH)
    : path.join(__dirname, 'public', 'commlink', 'commlink.css');

  let source = fs.readFileSync(jsPath, 'utf8');

  if (!source.includes('function renderProviderChatText(')) {
    const marker = 'function canonicalProvider(item) {';
    if (!source.includes(marker)) throw new Error('Commlink rich chat bootstrap could not find provider renderer');
    const helper = [
      'function friendlyChannelName(provider, value) {',
      "  const raw = String(value || 'unknown');",
      "  if (provider === 'discord' && /^discord:\\d+$/.test(raw)) return 'Discord channel';",
      '  return raw;',
      '}',
      '',
      'function renderProviderChatText(item, provider) {',
      '  const normalized = normalizeProviderMentions(item?.text, item);',
      "  let rendered = escapeHtml(normalized).replaceAll('\\n', '<br>');",
      "  if (provider === 'discord') {",
      '    rendered = rendered.replace(/&lt;(a?):([A-Za-z0-9_~.-]{1,64}):(\\d{15,24})&gt;/g, (_token, animated, name, id) => {',
      "      const src = 'https://cdn.discordapp.com/emojis/' + encodeURIComponent(id) + '.webp?size=48' + (animated ? '&animated=true' : '');",
      "      return '<img class=\"inline-chat-emote\" src=\"' + escapeHtml(src) + '\" alt=\":' + escapeHtml(name) + ':\" title=\":' + escapeHtml(name) + ':\" loading=\"lazy\">';",
      '    });',
      '  }',
      '  return rendered;',
      '}',
      '',
    ].join('\n');
    source = source.replace(marker, helper + marker);
  }

  source = replaceRequired(
    source,
    "    channel: String(item.channelName || item.sourceName || item.channelId || 'unknown'),",
    "    channel: friendlyChannelName(provider, item.channelName || item.sourceName || item.channelId || 'unknown'),",
    'message channel normalization',
  );
  source = replaceRequired(
    source,
    "    text: escapeHtml(normalizeProviderMentions(item.text, item)).replaceAll('\\n', '<br>'),",
    '    text: renderProviderChatText(item, provider),',
    'message text renderer',
  );

  if (!source.includes("discord: item.meta?.discord")) {
    const marker = "    streamweaver: item.meta?.streamweaver && typeof item.meta.streamweaver === 'object' ? item.meta.streamweaver : null,";
    if (!source.includes(marker)) throw new Error('Commlink rich chat bootstrap could not find StreamWeaver metadata marker');
    source = source.replace(marker, `${marker}\n    discord: item.meta?.discord && typeof item.meta.discord === 'object' ? item.meta.discord : null,`);
  }

  source = replaceRequired(
    source,
    "      channel: String(channel.channelName || channel.sourceName || channel.channelId),",
    "      channel: friendlyChannelName(provider, channel.channelName || channel.sourceName || channel.channelId),",
    'source channel normalization',
  );

  if (!source.includes('const discordEmbeds =')) {
    const marker = "  const media = (message.media || []).slice(0, 4).map((item) => {";
    if (!source.includes(marker)) throw new Error('Commlink rich chat bootstrap could not find media renderer');
    const renderer = [
      "  const discordEmbeds = (message.discord?.embeds || []).slice(0, 4).map((embed) => {",
      "    const fields = (embed.fields || []).slice(0, 8).map((field) => '<div class=\"discord-embed-field\"><strong>' + escapeHtml(field.name || '') + '</strong><span>' + escapeHtml(field.value || '') + '</span></div>').join('');",
      "    return '<div class=\"discord-embed-card\">'",
      "      + (embed.author ? '<small>' + escapeHtml(embed.author) + '</small>' : '')",
      "      + (embed.title ? '<strong>' + escapeHtml(embed.title) + '</strong>' : '')",
      "      + (embed.description ? '<p>' + escapeHtml(embed.description) + '</p>' : '')",
      "      + (fields ? '<div class=\"discord-embed-fields\">' + fields + '</div>' : '')",
      "      + (embed.provider || embed.footer ? '<small>' + escapeHtml([embed.provider, embed.footer].filter(Boolean).join(' · ')) + '</small>' : '')",
      "      + '</div>';",
      "  }).join('');",
    ].join('\n') + '\n';
    source = source.replace(marker, renderer + marker);
  }

  source = replaceRequired(
    source,
    "  const media = (message.media || []).slice(0, 4).map((item) => {",
    "  const media = (message.media || []).filter((item) => !(message.provider === 'discord' && item.type === 'emote')).slice(0, 4).map((item) => {",
    'Discord inline-emote media filter',
  );

  const oldMediaRow = "      ${media ? `<div class=\"message-media-row\">${media}</div>` : ''}";
  const newMediaRow = oldMediaRow + "\n      ${discordEmbeds ? `<div class=\"discord-embed-list\">${discordEmbeds}</div>` : ''}";
  source = replaceRequired(source, oldMediaRow, newMediaRow, 'Discord embed message row');

  fs.writeFileSync(jsPath, source, 'utf8');

  let css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('.inline-chat-emote')) {
    css += `\n\n/* Canonical rich-chat rendering: provider emotes and Discord embeds stay inside the message card. */\n.inline-chat-emote {\n  display: inline-block;\n  width: 1.5em;\n  height: 1.5em;\n  object-fit: contain;\n  vertical-align: -0.32em;\n  margin: 0 0.08em;\n}\n.discord-embed-list {\n  display: grid;\n  gap: 8px;\n  margin-top: 8px;\n}\n.discord-embed-card {\n  display: grid;\n  gap: 5px;\n  max-width: 680px;\n  padding: 10px 12px;\n  border-left: 3px solid rgba(88, 101, 242, 0.8);\n  border-radius: 6px;\n  background: rgba(88, 101, 242, 0.08);\n}\n.discord-embed-card > strong { font-size: 0.92rem; }\n.discord-embed-card > p,\n.discord-embed-field span {\n  margin: 0;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n.discord-embed-card > small { opacity: 0.7; }\n.discord-embed-fields {\n  display: grid;\n  gap: 7px;\n}\n.discord-embed-field {\n  display: grid;\n  gap: 2px;\n  font-size: 0.82rem;\n}\n`;
    fs.writeFileSync(cssPath, css, 'utf8');
  }
}

module.exports = { installCommlinkRichChatBootstrap };
