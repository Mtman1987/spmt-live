'use strict';

const fs = require('node:fs');
const path = require('node:path');

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`Commlink identity/routing bootstrap could not find ${label}`);
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
  html = replaceRequired(
    html,
    '<span>Canonical SPMT messaging workspace</span>',
    '<span>SPMT-owned Commlink workspace</span>',
    'ownership banner',
  );
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
  source = replaceRequired(
    source,
    '  accountXp: null,\n  workspaceEditor: null,',
    '  accountXp: null,\n  accountIdentity: null,\n  workspaceEditor: null,',
    'identity state',
  );

  const identityHelpers = `function accountInitials(user) {\n  const value = String(user?.displayName || user?.display_name || user?.username || 'SPMT').trim();\n  return value.split(/\\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?';\n}\n\nfunction renderAccountIdentity() {\n  const user = state.accountIdentity;\n  const displayName = String(user?.displayName || user?.display_name || user?.username || 'SPMT account');\n  const username = String(user?.username || '').trim();\n  const rewardTitle = state.discoveryStatus?.complete ? String(state.discoveryStatus?.reward?.title || '').trim() : '';\n  const title = $('#account-title');\n  if (title) title.textContent = rewardTitle ? \\`${'${displayName} · ${rewardTitle}'}\\` : displayName;\n  const authStatus = $('#account-auth-status');\n  if (authStatus) authStatus.textContent = user ? \\`Signed into SPMT as ${'${username ? `@${username}` : displayName}'}\\` : 'Not signed into SPMT';\n  const linked = Array.isArray(user?.linkedAccounts) ? user.linkedAccounts : Array.isArray(user?.linked_accounts) ? user.linked_accounts : [];\n  const twitch = linked.find((account) => account?.provider === 'twitch');\n  const providerStatus = $('#account-provider-status');\n  if (providerStatus) providerStatus.textContent = twitch\n    ? \\`Twitch channel: @${'${twitch.username || twitch.displayName || twitch.providerUserId}'} · bot send identity is separate\\`\n    : 'Commlink belongs to this SPMT account · provider identities are separate';\n  const avatarUrl = safeHttpUrl(user?.avatarUrl || user?.avatar_url);\n  const initials = accountInitials(user);\n  for (const element of [$('#account-avatar'), $('#topbar-account-avatar')].filter(Boolean)) {\n    element.innerHTML = avatarUrl\n      ? \\`<img class="account-avatar-image" src="${'${escapeHtml(avatarUrl)}'}" alt="" loading="lazy">\\`\n      : escapeHtml(initials);\n    element.title = user ? \\`SPMT: ${'${displayName}'}\\` : 'SPMT account';\n  }\n}\n\nasync function loadCommlinkIdentity() {\n  try {\n    const response = await fetch('/api/me', { headers: commlinkAuthHeaders(), credentials: 'include' });\n    if (response.status === 401 || response.status === 403) {\n      state.accountIdentity = null;\n      renderAccountIdentity();\n      return;\n    }\n    if (!response.ok) throw new Error(\\`SPMT identity returned ${'${response.status}'}\\`);\n    const payload = await response.json();\n    state.accountIdentity = payload?.user || null;\n    renderAccountIdentity();\n  } catch {\n    const authStatus = $('#account-auth-status');\n    if (authStatus) authStatus.textContent = 'SPMT identity temporarily unavailable';\n  }\n}\n\n`;
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

  const baseChannelLine = "    channel: String(item.channelName || item.sourceName || item.channelId || 'unknown'),";
  const richChannelLine = "    channel: friendlyChannelName(provider, item.channelName || item.sourceName || 'Unknown channel'),";
  const newChannelLine = "    channel: humanChannelLabel(provider, item.channelName || item.sourceName || item.channelId || 'Unknown channel'),";
  if (!source.includes(newChannelLine)) {
    if (source.includes(richChannelLine)) source = source.replace(richChannelLine, newChannelLine);
    else if (source.includes(baseChannelLine)) source = source.replace(baseChannelLine, newChannelLine);
    else throw new Error('Commlink identity/routing bootstrap could not find message channel label');
  }

  if (!source.includes('function humanChannelLabel(')) {
    const marker = 'function canonicalProvider(item) {';
    const helper = `function humanChannelLabel(provider, value) {\n  const raw = String(value || 'Unknown channel').trim();\n  if (provider !== 'discord') return raw;\n  if (/^discord:\\d+$/.test(raw)) return '#' + raw.replace(/^discord:/, '');\n  if (/^\\d+$/.test(raw)) return '#' + raw;\n  return raw.startsWith('#') ? raw : '#' + raw;\n}\n\n`;
    if (!source.includes(marker)) throw new Error('Commlink identity/routing bootstrap could not find provider helper marker');
    source = source.replace(marker, helper + marker);
  }

  const baseSourceChannel = "      channel: String(channel.channelName || channel.sourceName || channel.channelId),";
  const richSourceChannel = "      channel: friendlyChannelName(provider, channel.channelName || channel.displayName || channel.sourceName || 'Unknown channel'),";
  const oldRichSourceChannel = "      channel: friendlyChannelName(provider, channel.channelName || channel.sourceName || channel.channelId),";
  const newSourceChannel = "      channel: humanChannelLabel(provider, channel.channelName || channel.displayName || channel.sourceName || channel.channelId || 'Unknown channel'),";
  if (!source.includes(newSourceChannel)) {
    if (source.includes(richSourceChannel)) source = source.replace(richSourceChannel, newSourceChannel);
    else if (source.includes(oldRichSourceChannel)) source = source.replace(oldRichSourceChannel, newSourceChannel);
    else if (source.includes(baseSourceChannel)) source = source.replace(baseSourceChannel, newSourceChannel);
    else throw new Error('Commlink identity/routing bootstrap could not find source channel label');
  }

  source = replaceRequired(
    source,
    '  state.sources = unique;\n  state.selectedDestinations = state.selectedDestinations.filter((id) => unique.some((source) => source.id === id));',
    `  const selectedBeforeRefresh = [...state.selectedDestinations];\n  state.sources = unique;\n  state.selectedDestinations = Array.from(new Set(selectedBeforeRefresh.map((id) => {\n    if (unique.some((source) => source.id === id)) return id;\n    const previous = previousSources.get(id);\n    if (!previous) return null;\n    return sourceByProviderChannel.get(\\`${'${previous.provider}:${String(previous.channelId || previous.channel).toLowerCase()}'}\\`) || null;\n  }).filter(Boolean)));\n  rememberSpaceDestinations();`,
    'destination persistence across feed refresh',
  );

  source = replaceRequired(
    source,
    'loadWorkspaceProfile();\nloadAccountXp();',
    'loadWorkspaceProfile();\nloadCommlinkIdentity();\nloadAccountXp();',
    'identity startup load',
  );

  const settingsListener = "  $('#settings-button').addEventListener('click', () => $('#settings-drawer').classList.remove('hidden'));";
  const accountListener = `${settingsListener}\n  $('#topbar-account-avatar')?.addEventListener('click', () => {\n    const target = '/?view=account';\n    if (window.top && window.top !== window) window.top.location.href = target;\n    else window.location.href = target;\n  });`;
  source = replaceRequired(source, settingsListener, accountListener, 'account navigation');

  fs.writeFileSync(jsPath, source, 'utf8');

  let css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('.account-avatar-image')) {
    css += `\n\n/* Canonical Commlink identity: the SPMT user is visually distinct from provider/bot identities. */\n.account-avatar, .avatar-action { overflow: hidden; }\n.account-avatar-image { width: 100%; height: 100%; display: block; object-fit: cover; border-radius: inherit; }\n#account-auth-status { color: var(--text); }\n#account-provider-status { color: var(--muted); }\n`;
  }
  fs.writeFileSync(cssPath, css, 'utf8');
}

module.exports = { installCommlinkIdentityRoutingBootstrap };
