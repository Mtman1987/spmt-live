'use strict';

const fs = require('node:fs');
const path = require('node:path');

function patchCommlinkAuthRecovery() {
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
  const oldButton = '<button class="account-session-action" id="account-session-action" type="button">Sign in</button>';
  const nativeLink = '<a class="account-session-action" id="account-session-action" href="/?view=account" target="_top">Sign in</a>';
  if (html.includes(oldButton)) {
    html = html.replace(oldButton, nativeLink);
  } else if (!html.includes(nativeLink)) {
    const actionTag = /<(?:button|a) class="account-session-action" id="account-session-action"[^>]*>Sign in<\/(?:button|a)>/;
    if (!actionTag.test(html)) throw new Error('Commlink auth recovery could not find the sign-in control');
    html = html.replace(actionTag, nativeLink);
  }
  fs.writeFileSync(htmlPath, html, 'utf8');

  let source = fs.readFileSync(jsPath, 'utf8');

  const oldIdentityFetch = "    const response = await fetch('/api/me', { headers: commlinkAuthHeaders(), credentials: 'include' });";
  const boundedIdentityFetch = "    const response = await fetch('/api/me', { headers: commlinkAuthHeaders(), credentials: 'include', signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(5000) : undefined });";
  if (source.includes(oldIdentityFetch)) source = source.replace(oldIdentityFetch, boundedIdentityFetch);
  if (!source.includes("AbortSignal.timeout(5000)")) throw new Error('Commlink auth recovery could not bound the SPMT identity lookup');

  const handlerPattern = /async function handleAccountSessionAction\(\) \{[\s\S]*?\n\}\n\nfunction renderAccountIdentity\(\) \{/;
  const recoveredHandler = [
    'async function handleAccountSessionAction(event) {',
    "  const action = $('#account-session-action');",
    '  // Signed-out users must always retain a native href so auth works even if',
    '  // account/session JavaScript or an embedded shell is partially degraded.',
    '  if (!state.accountIdentity) return;',
    '  event?.preventDefault();',
    "  if (action) { action.setAttribute('aria-busy', 'true'); action.style.pointerEvents = 'none'; }",
    '  try {',
    "    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });",
    "    if (!response.ok) throw new Error('Sign out returned ' + response.status);",
    "    try { localStorage.removeItem('spmt_token'); } catch {}",
    "    navigateCommlinkAccount('/?view=account');",
    '  } catch (error) {',
    "    toast(error?.message || 'Could not sign out of SPMT');",
    "    if (action) { action.removeAttribute('aria-busy'); action.style.pointerEvents = ''; }",
    '  }',
    '}',
    '',
    'function renderAccountIdentity() {',
  ].join('\n');
  if (handlerPattern.test(source)) {
    source = source.replace(handlerPattern, recoveredHandler);
  } else if (!source.includes('async function handleAccountSessionAction(event) {')) {
    throw new Error('Commlink auth recovery could not find the account session handler');
  }

  const oldSessionRender = [
    "  const sessionAction = $('#account-session-action');",
    '  if (sessionAction) {',
    "    sessionAction.textContent = user ? 'Sign out' : 'Sign in';",
    "    sessionAction.dataset.sessionState = user ? 'signed-in' : 'signed-out';",
    '  }',
  ].join('\n');
  const recoveredSessionRender = [
    "  const sessionAction = $('#account-session-action');",
    '  if (sessionAction) {',
    "    sessionAction.textContent = user ? 'Sign out' : 'Sign in';",
    "    sessionAction.dataset.sessionState = user ? 'signed-in' : 'signed-out';",
    "    sessionAction.setAttribute('href', '/?view=account');",
    "    sessionAction.setAttribute('target', '_top');",
    "    sessionAction.removeAttribute('aria-busy');",
    "    sessionAction.style.pointerEvents = '';",
    '  }',
  ].join('\n');
  if (source.includes(oldSessionRender)) source = source.replace(oldSessionRender, recoveredSessionRender);
  if (!source.includes("sessionAction.setAttribute('href', '/?view=account')")) {
    throw new Error('Commlink auth recovery could not preserve native sign-in navigation');
  }

  fs.writeFileSync(jsPath, source, 'utf8');

  let css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('/* Commlink auth recovery */')) {
    css += `\n\n/* Commlink auth recovery: the signed-out control is a real link, not JS-only. */\n.account-session-action { display: inline-block; text-decoration: none; }\n.account-session-action[aria-busy="true"] { opacity: .55; cursor: wait; }\n`;
    fs.writeFileSync(cssPath, css, 'utf8');
  }

  console.log('[SPMT] Commlink auth recovery applied.');
}

module.exports = { patchCommlinkAuthRecovery };
