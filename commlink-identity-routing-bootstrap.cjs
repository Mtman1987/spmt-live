'use strict';

const fs = require('node:fs');
const path = require('node:path');

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) {
    if (source.includes(to)) return source;
    throw new Error(`Commlink identity/routing bootstrap could not find ${label}`);
  }
  return source.replace(from, to);
}

function installCommlinkIdentityRoutingBootstrap() {
  const jsPath = process.env.SPMT_COMMLINK_JS_PATH
    ? path.resolve(process.env.SPMT_COMMLINK_JS_PATH)
    : path.join(__dirname, 'public', 'commlink', 'commlink.js');
  const htmlPath = process.env.SPMT_COMMLINK_INDEX_PATH
    ? path.resolve(process.env.SPMT_COMMLINK_INDEX_PATH)
    : path.join(__dirname, 'public', 'commlink', 'index.html');
  const cssPath = process.env.SPMT_COMMLINK_CSS_PATH
    ? path.resolve(process.env.SPMT_COMMLINK_CSS_PATH)
    : path.join(__dirname, 'public', 'commlink', 'commlink.css');

  let html = fs.readFileSync(htmlPath, 'utf8');
  html = replaceRequired(html, '<span>Canonical SPMT messaging workspace</span>', '<span>SPMT-owned Commlink workspace</span>', 'ownership banner');
  html = replaceRequired(
    html,
    '<span class="account-avatar">MT</span>\n        <span><strong id="account-title">Mountain Crew</strong><small id="account-xp">Loading account XP…</small><small id="sync-summary">Checking SPMT sync…</small></span>',
    '<span class="account-avatar" id="account-avatar">?</span>\n        <span><strong id="account-title">SPMT account</strong><small id="account-auth-status">Checking SPMT identity…</small><small id="account-provider-status">Provider identities are separate from your SPMT account.</small><small id="account-xp">Loading account XP…</small><small id="sync-summary">Checking SPMT sync…</small></span>',
    'account identity card',
  );
  html = replaceRequired(
    html,
    '<button class="avatar-action" type="button" aria-label="Account menu">MT</button>',
    '<button class="avatar-action" id="topbar-account-avatar" type="button" aria-label="Open SPMT account" title="Open SPMT account">?</button>',
    'topbar account avatar',
  );
  fs.writeFileSync(htmlPath, html, 'utf8');

  let source = fs.readFileSync(jsPath, 'utf8');
  source = replaceRequired(source, '  accountXp: null,\n  workspaceEditor: null,', '  accountXp: null,\n  accountIdentity: null,\n  workspaceEditor: null,', 'identity state');

  const identityHelpers = [
    'function accountInitials(user) {',
    "  const value = String(user?.displayName || user?.display_name || user?.username || 'SPMT').trim();",
    "  return value.split(/\\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?';",
    '}',
    '',
    'function renderAccountIdentity() {',
    '  const user = state.accountIdentity;',
    "  const displayName = String(user?.displayName || user?.display_name || user?.username || 'SPMT account');",
    "  const username = String(user?.username || '').trim();",
    "  const rewardTitle = state.discoveryStatus?.complete ? String(state.discoveryStatus?.reward?.title || '').trim() : '';",
    "  const title = $('#account-title');",
    "  if (title) title.textContent = rewardTitle ? displayName + ' · ' + rewardTitle : displayName;",
    "  const authStatus = $('#account-auth-status');",
    "  if (authStatus) authStatus.textContent = user ? 'Signed into SPMT as ' + (username ? '@' + username : displayName) : 'Not signed into SPMT';",
    "  const linked = Array.isArray(user?.linkedAccounts) ? user.linkedAccounts : Array.isArray(user?.linked_accounts) ? user.linked_accounts : [];",
    "  const twitch = linked.find((account) => account?.provider === 'twitch');",
    "  const providerStatus = $('#account-provider-status');",
    "  if (providerStatus) providerStatus.textContent = twitch ? 'Twitch channel: @' + (twitch.username || twitch.displayName || twitch.providerUserId) + ' · bot send identity is separate' : 'Commlink belongs to this SPMT account · provider identities are separate';",
    '  const avatarUrl = safeHttpUrl(user?.avatarUrl || user?.avatar_url);',
    '  const initials = accountInitials(user);',
    "  for (const element of [$('#account-avatar'), $('#topbar-account-avatar')].filter(Boolean)) {",
    "    element.innerHTML = avatarUrl ? '<img class=\"account-avatar-image\" src=\"' + escapeHtml(avatarUrl) + '\" alt=\"\" loading=\"lazy\">' : escapeHtml(initials);",
    "    element.title = user ? 'SPMT: ' + displayName : 'SPMT account';",
    '  }',
    '}',
    '',
    'async function loadCommlinkIdentity() {',
    '  try {',
    "    const response = await fetch('/api/me', { headers: commlinkAuthHeaders(), credentials: 'include' });",
    '    if (response.status === 401 || response.status === 403) {',
    '      state.accountIdentity = null;',
    '      renderAccountIdentity();',
    '      return;',
    '    }',
    "    if (!response.ok) throw new Error('SPMT identity returned ' + response.status);",
    '    const payload = await response.json();',
    '    state.accountIdentity = payload?.user || null;',
    '    renderAccountIdentity();',
    '  } catch {',
    "    const authStatus = $('#account-auth-status');",
    "    if (authStatus) authStatus.textContent = 'SPMT identity temporarily unavailable';",
    '  }',
    '}',
    '',
  ].join('\n');
  if (!source.includes('function loadCommlinkIdentity()')) {
    const marker = 'function renderDiscoveryStatus(status, showUnlock = false) {';
    if (!source.includes(marker)) throw new Error('Commlink identity/routing bootstrap could not find discovery renderer');
    source = source.replace(marker, identityHelpers + marker);
  }

  source = replaceRequired(
    source,
    "  $('#account-title').textContent = complete ? `Mountain Crew · ${status.reward.title}` : 'Mountain Crew';",
    '  renderAccountIdentity();',
    'discovery identity ownership',
  );

  if (!source.includes('function humanChannelLabel(')) {
    const marker = 'function canonicalProvider(item) {';
    const helper = [
      'function humanChannelLabel(provider, value) {',
      "  const raw = String(value || 'Unknown channel').trim();",
      "  if (provider !== 'discord') return raw;",
      "  if (/^discord:\\d+$/.test(raw)) return '#' + raw.replace(/^discord:/, '');",
      "  if (/^\\d+$/.test(raw)) return '#' + raw;",
      "  return raw.startsWith('#') ? raw : '#' + raw;",
      '}',
      '',
      'function canonicalCommlinkSourceId(provider, item) {',
      "  const rawChannelId = String(item?.channelId || '').trim();",
      "  if (provider === 'discord') {",
      "    const channelId = rawChannelId.replace(/^discord:/i, '');",
      "    return 'discord:' + (channelId || 'unknown');",
      '  }',
      "  return String(item?.sourceId || (provider + ':' + (rawChannelId || 'unknown')));",
      '}',
      '',
    ].join('\n');
    if (!source.includes(marker)) throw new Error('Commlink identity/routing bootstrap could not find provider helper marker');
    source = source.replace(marker, helper + marker);
  }

  source = replaceRequired(
    source,
    "function friendlyChannelName(provider, value) {\n  const raw = String(value || 'unknown');\n  if (provider === 'discord' && /^discord:\\d+$/.test(raw)) return 'Discord channel';\n  return raw;\n}",
    'function friendlyChannelName(provider, value) {\n  return humanChannelLabel(provider, value);\n}',
    'legacy generic Discord channel label',
  );

  const baseChannelLine = "    channel: String(item.channelName || item.sourceName || item.channelId || 'unknown'),";
  const richChannelLine = "    channel: friendlyChannelName(provider, item.channelName || item.sourceName || 'Unknown channel'),";
  const newChannelLine = "    channel: humanChannelLabel(provider, item.channelName || item.channelId || item.sourceName || 'Unknown channel'),";
  if (!source.includes(newChannelLine)) {
    if (source.includes(richChannelLine)) source = source.replace(richChannelLine, newChannelLine);
    else if (source.includes(baseChannelLine)) source = source.replace(baseChannelLine, newChannelLine);
    else throw new Error('Commlink identity/routing bootstrap could not find message channel label');
  }

  const sourceIdLine = "    sourceId: String(item.sourceId || `${provider}:${item.channelId || 'unknown'}`),";
  if (source.includes(sourceIdLine)) source = source.replace(sourceIdLine, '    sourceId: canonicalCommlinkSourceId(provider, item),');

  const newSourceChannel = "      channel: humanChannelLabel(provider, channel.channelName || channel.displayName || channel.channelId || channel.sourceName || 'Unknown channel'),";
  if (!source.includes(newSourceChannel)) {
    const sourceChannelPatterns = [
      "      channel: friendlyChannelName(provider, channel.channelName || channel.displayName || channel.sourceName || 'Unknown channel'),",
      "      channel: friendlyChannelName(provider, channel.channelName || channel.sourceName || channel.channelId),",
      "      channel: String(channel.channelName || channel.sourceName || channel.channelId),",
    ];
    const matched = sourceChannelPatterns.find((candidate) => source.includes(candidate));
    if (matched) {
      source = source.replace(matched, newSourceChannel);
    } else {
      const genericFriendlyChannel = /      channel: friendlyChannelName\(provider, channel\.channelName \|\| [^\n]+\),/;
      if (!genericFriendlyChannel.test(source)) throw new Error('Commlink identity/routing bootstrap could not find source channel label');
      source = source.replace(genericFriendlyChannel, newSourceChannel);
    }
  }

  const channelIdLine = "      id: String(channel.sourceId || `${provider}:${channel.channelId || 'unknown'}`),";
  if (source.includes(channelIdLine)) source = source.replace(channelIdLine, '      id: canonicalCommlinkSourceId(provider, channel),');

  const eventSourceIdLine = "    const sourceId = String(item.sourceId || `${provider}:${item.channelId || 'unknown'}`);";
  if (source.includes(eventSourceIdLine)) source = source.replace(eventSourceIdLine, '    const sourceId = canonicalCommlinkSourceId(provider, item);');

  source = replaceRequired(
    source,
    "      channel: friendlyChannelName(provider, item.channelName || item.sourceName || 'Unknown channel'),",
    "      channel: humanChannelLabel(provider, item.channelName || item.channelId || item.sourceName || 'Unknown channel'),",
    'event-backed channel label',
  );

  source = replaceRequired(
    source,
    "    const sources = $('[data-space-source]:checked').map((input) => input.dataset.spaceSource);",
    "    const sources = $$('[data-space-source]:checked').map((input) => input.dataset.spaceSource);",
    'ChatSpace selected source collection',
  );
  source = replaceRequired(
    source,
    "    const presentationCategories = $('[data-presentation-category]:checked').map((input) => input.dataset.presentationCategory);",
    "    const presentationCategories = $$('[data-presentation-category]:checked').map((input) => input.dataset.presentationCategory);",
    'ChatSpace selected presentation category collection',
  );

  const destinationReplacement = [
    '  const selectedBeforeRefresh = [...state.selectedDestinations];',
    '  state.sources = unique;',
    '  state.selectedDestinations = Array.from(new Set(selectedBeforeRefresh.map((id) => {',
    '    if (unique.some((source) => source.id === id)) return id;',
    '    const previous = previousSources.get(id);',
    '    if (!previous) return null;',
    "    const key = previous.provider + ':' + String(previous.channelId || previous.channel).toLowerCase();",
    '    return sourceByProviderChannel.get(key) || null;',
    '  }).filter(Boolean)));',
    '  rememberSpaceDestinations();',
  ].join('\n');
  source = replaceRequired(
    source,
    '  state.sources = unique;\n  state.selectedDestinations = state.selectedDestinations.filter((id) => unique.some((source) => source.id === id));',
    destinationReplacement,
    'destination persistence across feed refresh',
  );

  source = replaceRequired(source, 'loadWorkspaceProfile();\nloadAccountXp();', 'loadWorkspaceProfile();\nloadCommlinkIdentity();\nloadAccountXp();', 'identity startup load');

  const settingsListener = "  $('#settings-button').addEventListener('click', () => $('#settings-drawer').classList.remove('hidden'));";
  const accountListener = [
    "  const settingsButton = $('#settings-button');",
    "  settingsButton.addEventListener('click', () => $('#settings-drawer').classList.remove('hidden'));",
    "  $('#topbar-account-avatar')?.addEventListener('click', () => {",
    "    const target = '/?view=account';",
    '    if (window.top && window.top !== window) window.top.location.href = target;',
    '    else window.location.href = target;',
    '  });',
  ].join('\n');
  source = replaceRequired(source, settingsListener, accountListener, 'account navigation');

  fs.writeFileSync(jsPath, source, 'utf8');

  let css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('.account-avatar-image')) {
    css += `\n\n/* Canonical Commlink identity: the SPMT user is visually distinct from provider/bot identities. */\n.account-avatar, .avatar-action { overflow: hidden; }\n.account-avatar-image { width: 100%; height: 100%; display: block; object-fit: cover; border-radius: inherit; }\n#account-auth-status { color: var(--text); }\n#account-provider-status { color: var(--muted); }\n`;
  }
  fs.writeFileSync(cssPath, css, 'utf8');
}

module.exports = { installCommlinkIdentityRoutingBootstrap };
