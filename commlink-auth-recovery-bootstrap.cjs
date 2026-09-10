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

  // The account shell historically stores the current SPMT bearer in the same-origin
  // localStorage while newer sessions also carry an HttpOnly cookie. During migration,
  // either can be the valid session. Commlink must accept both or a user can be visibly
  // signed in to SPMT while the embedded Commlink incorrectly loops back to Sign in.
  const cookieOnlyAuthHelper = [
    'function commlinkAuthHeaders(extra = {}) {',
    '  // Commlink is same-origin with SPMT. The HttpOnly SPMT session cookie is',
    '  // authoritative; localStorage is not a second authentication system.',
    '  return { ...extra };',
    '}',
  ].join('\n');
  const legacyAuthHelper = [
    'function commlinkAuthHeaders(extra = {}) {',
    "  const token = localStorage.getItem('spmt_token');",
    '  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;',
    '}',
  ].join('\n');
  const bridgedAuthHelper = [
    'function commlinkAuthHeaders(extra = {}) {',
    "  let token = '';",
    "  try { token = String(localStorage.getItem('spmt_token') || '').trim(); } catch {}",
    '  // credentials: include still sends the HttpOnly cookie. The bearer is only a',
    '  // compatibility bridge for existing SPMT sessions until every client has a cookie.',
    '  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };',
    '}',
  ].join('\n');
  if (source.includes(cookieOnlyAuthHelper)) source = source.replace(cookieOnlyAuthHelper, bridgedAuthHelper);
  else if (source.includes(legacyAuthHelper)) source = source.replace(legacyAuthHelper, bridgedAuthHelper);
  else if (!source.includes(bridgedAuthHelper)) throw new Error('Commlink auth recovery could not bridge the existing SPMT session');

  const oldIdentityFetch = "    const response = await fetch('/api/me', { headers: commlinkAuthHeaders(), credentials: 'include' });";
  const boundedIdentityFetch = "    const response = await fetch('/api/me', { headers: commlinkAuthHeaders(), credentials: 'include', signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(5000) : undefined });";
  if (source.includes(oldIdentityFetch)) source = source.replace(oldIdentityFetch, boundedIdentityFetch);
  if (!source.includes("AbortSignal.timeout(5000)")) throw new Error('Commlink auth recovery could not bound the SPMT identity lookup');

  // The production bootstrap currently emits the two functions with a single
  // newline, while older images emitted a blank line. Accept both layouts so
  // the image-preparation pass can actually apply the auth recovery patch.
  const handlerPattern = /async function handleAccountSessionAction\(\) \{[\s\S]*?\n\}\n+function renderAccountIdentity\(\) \{/;
  const recoveredHandler = [
    'async function handleAccountSessionAction(event) {',
    "  const action = $('#account-session-action');",
    '  // Signed-out users retain a native href as a last-resort account route.',
    '  // A valid account-shell bearer is accepted directly, so this link is not',
    '  // used as a fake sign-in loop when the SPMT account is already authenticated.',
    '  if (!state.accountIdentity) return;',
    '  event?.preventDefault();',
    "  if (action) { action.setAttribute('aria-busy', 'true'); action.style.pointerEvents = 'none'; }",
    '  try {',
    "    const response = await fetch('/api/auth/logout', { method: 'POST', headers: commlinkAuthHeaders(), credentials: 'include' });",
    "    if (!response.ok && response.status !== 401 && response.status !== 403) throw new Error('Sign out returned ' + response.status);",
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
  } else {
    source = source.replace(
      "    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });",
      "    const response = await fetch('/api/auth/logout', { method: 'POST', headers: commlinkAuthHeaders(), credentials: 'include' });",
    );
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
  if (!source.includes("Authorization: `Bearer ${token}`")) {
    throw new Error('Commlink auth recovery did not preserve the existing SPMT bearer bridge');
  }

  fs.writeFileSync(jsPath, source, 'utf8');

  let css = fs.readFileSync(cssPath, 'utf8');
  if (!css.includes('/* Commlink auth recovery */')) {
    css += `\n\n/* Commlink auth recovery: the signed-out control is a real link, not JS-only. */\n.account-session-action { display: inline-block; text-decoration: none; }\n.account-session-action[aria-busy="true"] { opacity: .55; cursor: wait; }\n`;
    fs.writeFileSync(cssPath, css, 'utf8');
  }

  console.log('[SPMT] Commlink auth recovery applied with cookie + bearer session bridge.');
}

module.exports = { patchCommlinkAuthRecovery };
