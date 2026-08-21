'use strict';

const fs = require('node:fs');
const path = require('node:path');

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`Commlink production bootstrap could not find ${label}`);
  return source.replace(from, to);
}

function replaceRegexRequired(source, pattern, replacement, label, alreadyApplied = null) {
  if (alreadyApplied && source.includes(alreadyApplied)) return source;
  if (!pattern.test(source)) throw new Error(`Commlink production bootstrap could not find ${label}`);
  return source.replace(pattern, replacement);
}

function installCommlinkProductionBootstrap() {
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
  if (!html.includes('SPMT-owned Commlink workspace')) {
    throw new Error('Commlink production bootstrap requires the identity bootstrap to run first');
  }
  html = replaceRequired(html, '<span id="desk-name">Live Show</span>', '<span id="desk-name">Account</span>', 'account desk default');
  html = replaceRequired(html, '<h1 id="space-title">Friday Stream</h1>', '<h1 id="space-title">All messages</h1>', 'account ChatSpace default');
  html = replaceRequired(html, '<strong id="source-count">4 sources live</strong>', '<strong id="source-count">Loading account sources…</strong>', 'source loading state');
  html = replaceRequired(html, '<button type="button" data-filter="queued">Queue <span id="queue-count">2</span></button>', '<button type="button" data-filter="queued">Queue <span id="queue-count">0</span></button>', 'queue loading count');
  html = replaceRequired(html, '<span id="save-note">Preview changes are local until saved.</span>', '<span id="save-note">Changes are local until saved to your SPMT account.</span>', 'settings save note');
  html = replaceRequired(html, '<button class="secondary-button" id="reset-preview" type="button">Reset preview</button>', '<button class="secondary-button" id="reset-preview" type="button">Reset unsaved changes</button>', 'settings reset label');
  html = replaceRequired(html, '<span>Review</span>\n                <strong id="send-label">Send → 4</strong>', '<span>Send</span>\n                <strong id="send-label">Choose destination</strong>', 'composer action label');

  if (!html.includes('id="account-session-action"')) {
    const providerStatus = '<small id="account-provider-status">Provider identities are separate from your SPMT account.</small>';
    if (!html.includes(providerStatus)) throw new Error('Commlink production bootstrap could not find account provider status');
    html = html.replace(
      providerStatus,
      `${providerStatus}<button class="account-session-action" id="account-session-action" type="button">Sign in</button>`,
    );
  }
  fs.writeFileSync(htmlPath, html, 'utf8');

  let source = fs.readFileSync(jsPath, 'utf8');
  if (!source.includes('function loadCommlinkIdentity()')) {
    throw new Error('Commlink production bootstrap requires the identity routing bootstrap to run first');
  }

  if (source.includes("const commlinkParams = new URLSearchParams(window.location.search);")) {
    source = source.replace(
      "const commlinkParams = new URLSearchParams(window.location.search);\nconst demoMode = commlinkParams.get('demo') === '1';\n",
      '',
    );
  }

  if (source.includes('const defaultSources = [')) {
    source = replaceRegexRequired(
      source,
      /const defaultSources = \[[\s\S]*?\nconst defaultAppearance = \{/,
      'const defaultAppearance = {',
      'synthetic fixture block',
    );
  }

  const stateReplacements = [
    ["  activeSpace: demoMode ? 'friday' : 'account',", "  activeSpace: 'account',", 'active account ChatSpace'],
    ["  activeDesk: demoMode ? 'live-show' : 'account',", "  activeDesk: 'account',", 'active account desk'],
    ["  sources: demoMode ? structuredClone(defaultSources) : [],", '  sources: [],', 'empty production sources'],
    ["  feedMode: demoMode ? 'synthetic' : 'loading',", "  feedMode: 'loading',", 'production feed mode'],
    ["  selectedDestinations: demoMode ? defaultSources.filter((source) => source.capabilities.compose).map((source) => source.id) : [],", '  selectedDestinations: [],', 'empty production destinations'],
    ["  messages: demoMode ? initialMessages.map((message) => ({ ...message, xpLinked: message.xp > 0 })) : [],", '  messages: [],', 'empty production message feed'],
    ['  chatSpaces: structuredClone(demoMode ? defaultChatSpaces : accountChatSpaces),', '  chatSpaces: structuredClone(accountChatSpaces),', 'account ChatSpaces only'],
    ['  desks: structuredClone(demoMode ? defaultDesks : accountDesks),', '  desks: structuredClone(accountDesks),', 'account desks only'],
  ];
  for (const [from, to, label] of stateReplacements) source = replaceRequired(source, from, to, label);

  source = source.replaceAll("state.feedMode !== 'synthetic' && ", '');
  source = source.replace("  if (state.feedMode === 'synthetic' && state.activeSpace === 'friday') return true;\n", '');

  source = replaceRegexRequired(
    source,
    /  \$\('#source-count'\)\.textContent = state\.feedMode === 'synthetic'\n    \? `\$\{current\.length\} preview source\$\{current\.length === 1 \? '' : 's'\}`\n    : `\$\{current\.length\} source\$\{current\.length === 1 \? '' : 's'\} · \$\{live\} active`;/,
    "  $('#source-count').textContent = `${current.length} source${current.length === 1 ? '' : 's'} · ${live} active`;",
    'production source count',
    "$('#source-count').textContent = `${current.length} source",
  );

  source = replaceRegexRequired(
    source,
    /  \$\('#source-health-summary'\)\.textContent = state\.feedMode === 'synthetic'\n    \? 'Preview data'\n    : degraded\.length\n      \? `Unavailable: \$\{degraded\.join\(', '\)\}`\n      : 'No source outages reported';/,
    "  $('#source-health-summary').textContent = degraded.length ? `Unavailable: ${degraded.join(', ')}` : 'No source outages reported';",
    'production source health',
    "$('#source-health-summary').textContent = degraded.length",
  );

  source = source.replace("              : 'Explicit demo mode · sample data';", "              : 'Account feed unavailable';");
  source = source.replace("<span>${state.feedMode === 'real' ? 'Live contract' : 'Preview'}</span>", "<span>${state.feedMode === 'real' ? 'Live contract' : 'Unavailable'}</span>");
  source = source.replace("  if (demoMode || state.feedMode === 'signed-out' || state.searchQuery || state.replayActive) return;", "  if (state.feedMode === 'signed-out' || state.searchQuery || state.replayActive) return;");

  if (source.includes('  if (demoMode) {')) {
    source = replaceRequired(
      source,
      "  if (demoMode) {\n    setFeedBanner('synthetic', 'Explicit demo mode · sample data only · no provider writes');\n    renderAll();\n    return;\n  }\n",
      '',
      'demo feed short-circuit',
    );
  }

  // A later/older source-control pass can leave a harmless demoMode reference
  // after the fixture declarations themselves are gone. Production has no demo
  // switch: force any residual guard to false so repeated bootstrap passes are
  // deterministic and cannot resurrect preview behavior or throw at runtime.
  source = source.replace(/\bdemoMode\b/g, 'false');

  source = replaceRequired(
    source,
    "  $('#simulate-send').textContent = state.feedMode === 'real' ? (state.replyToMessageId ? 'Send source-locked reply' : 'Send deliberately') : 'Simulate send';\n  $('#simulate-send').dataset.receiptMode = '';\n  $('#send-safety-note').innerHTML = state.feedMode === 'real'\n    ? '<span>✓</span> Every destination receives its own idempotent request and receipt. Partial failure never appears as a complete send.'\n    : '<span>✓</span> Synthetic preview mode never contacts a provider.';",
    "  $('#simulate-send').textContent = state.replyToMessageId ? 'Send source-locked reply' : 'Send deliberately';\n  $('#simulate-send').dataset.receiptMode = '';\n  $('#send-safety-note').innerHTML = '<span>✓</span> Every destination receives its own idempotent request and receipt. Partial failure never appears as a complete send.';",
    'real provider send modal',
  );

  source = replaceRegexRequired(
    source,
    /async function simulateSend\(\) \{[\s\S]*?\n\}\n\nfunction dispatchDestination\(source\) \{/,
    "async function simulateSend() {\n  return dispatchComposer();\n}\n\nfunction dispatchDestination(source) {",
    'synthetic send implementation',
    "async function simulateSend() {\n  return dispatchComposer();\n}",
  );

  if (!source.includes('function handleAccountSessionAction()')) {
    const marker = 'function renderAccountIdentity() {';
    if (!source.includes(marker)) throw new Error('Commlink production bootstrap could not find identity renderer');
    const helper = [
      'function navigateCommlinkAccount(pathname) {',
      '  const target = window.top && window.top !== window ? window.top : window;',
      '  target.location.href = pathname;',
      '}',
      '',
      'async function handleAccountSessionAction() {',
      "  if (!state.accountIdentity) return navigateCommlinkAccount('/');",
      "  const button = $('#account-session-action');",
      '  if (button) button.disabled = true;',
      '  try {',
      "    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });",
      "    if (!response.ok) throw new Error('Sign out returned ' + response.status);",
      "    try { localStorage.removeItem('spmt_token'); } catch {}",
      "    navigateCommlinkAccount('/');",
      '  } catch (error) {',
      "    toast(error?.message || 'Could not sign out of SPMT');",
      '    if (button) button.disabled = false;',
      '  }',
      '}',
      '',
    ].join('\n');
    source = source.replace(marker, helper + marker);
  }

  if (!source.includes("const sessionAction = $('#account-session-action');")) {
    source = replaceRequired(
      source,
      '  const avatarUrl = safeHttpUrl(user?.avatarUrl || user?.avatar_url);',
      "  const sessionAction = $('#account-session-action');\n  if (sessionAction) {\n    sessionAction.textContent = user ? 'Sign out' : 'Sign in';\n    sessionAction.dataset.sessionState = user ? 'signed-in' : 'signed-out';\n  }\n  const avatarUrl = safeHttpUrl(user?.avatarUrl || user?.avatar_url);",
      'account session state renderer',
    );
  }

  if (!source.includes("$('#account-session-action')?.addEventListener('click', handleAccountSessionAction);")) {
    source = replaceRequired(
      source,
      "  const settingsButton = $('#settings-button');",
      "  $('#account-session-action')?.addEventListener('click', handleAccountSessionAction);\n  const settingsButton = $('#settings-button');",
      'account session action binding',
    );
  }

  const forbidden = [
    'demoMode',
    'const defaultSources',
    'PixelRanger',
    'creatorA',
    'Synthetic preview mode',
    'Synthetic message added',
    "name: 'Mountain Crew'",
    "state.feedMode === 'synthetic'",
    "state.feedMode !== 'synthetic'",
  ];
  const remaining = forbidden.filter((value) => source.includes(value));
  if (remaining.length) throw new Error(`Commlink production bootstrap left preview fixtures in the served runtime: ${remaining.join(', ')}`);

  fs.writeFileSync(jsPath, source, 'utf8');

  let css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('.account-session-action')) {
    css += `\n\n/* Commlink account session control belongs to the canonical SPMT identity. */\n.account-session-action { margin-top: 5px; border: 0; padding: 0; background: transparent; color: var(--accent); font-size: 8px; font-weight: 800; text-align: left; cursor: pointer; }\n.account-session-action:hover { color: var(--text); text-decoration: underline; }\n.account-session-action:disabled { opacity: .55; cursor: wait; }\n`;
  }
  fs.writeFileSync(cssPath, css, 'utf8');
}

module.exports = { installCommlinkProductionBootstrap };
