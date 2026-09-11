'use strict';

const fs = require('node:fs');
const path = require('node:path');

if (!process.env.SPMT_CODEX_SERVICE_SECRET && process.env.SPMT_API_KEY) {
  process.env.SPMT_CODEX_SERVICE_SECRET = process.env.SPMT_API_KEY;
}

function ensureScripts(filePath, scripts) {
  let html = fs.readFileSync(filePath, 'utf8');
  if (!html.includes('</body>')) throw new Error(`SPMT shell bootstrap could not find </body> in ${filePath}`);
  let changed = false;
  for (const script of scripts) {
    if (html.includes(script)) continue;
    html = html.replace('</body>', `  <script src="${script}" defer></script>\n</body>`);
    changed = true;
  }
  if (changed) fs.writeFileSync(filePath, html, 'utf8');
}

function ensureScriptBefore(filePath, script, beforeScript) {
  let html = fs.readFileSync(filePath, 'utf8');
  if (html.includes(script)) return;
  const marker = `<script src="${beforeScript}"></script>`;
  const deferredMarker = `<script src="${beforeScript}" defer></script>`;
  const tag = `<script src="${script}"></script>`;
  if (html.includes(marker)) html = html.replace(marker, `${tag}\n  ${marker}`);
  else if (html.includes(deferredMarker)) html = html.replace(deferredMarker, `${tag}\n  ${deferredMarker}`);
  else if (html.includes('</body>')) html = html.replace('</body>', `  ${tag}\n</body>`);
  else throw new Error(`SPMT shell bootstrap could not insert ${script} in ${filePath}`);
  fs.writeFileSync(filePath, html, 'utf8');
}

function ensureWorkspaceShellBootstrap() {
  const publicIndexPath = process.env.SPMT_PUBLIC_INDEX_PATH
    ? path.resolve(process.env.SPMT_PUBLIC_INDEX_PATH)
    : path.join(__dirname, 'public', 'index.html');
  ensureScriptBefore(publicIndexPath, '/shared/auth-performance-guard.js', '/shared/session-cache.js');
  ensureScripts(publicIndexPath, [
    '/shared/session-cache.js',
    '/shared/shell-theme.js',
    '/shared/shell-chrome.js',
    '/shared/ecosystem-header.js',
    '/shared/workspace-controller.js',
    '/shared/companion-installer-ui.js',
    '/shared/overlay-bay-shell-nav.js',
    '/shared/account-recovery-ui.js',
  ]);

  const sharedIndexPath = process.env.SPMT_SHARED_INDEX_PATH
    ? path.resolve(process.env.SPMT_SHARED_INDEX_PATH)
    : path.join(__dirname, 'public', 'shared', 'index.html');
  ensureScripts(sharedIndexPath, [
    '/shared/tenant-overlay-alert-publisher.js',
    '/shared/personal-overlay-launch-client.js',
    '/shared/overlay-app-catalog.js',
    '/shared/overlay-text-controls.js',
  ]);

  const tenantOutputPath = process.env.SPMT_TENANT_OUTPUT_PATH
    ? path.resolve(process.env.SPMT_TENANT_OUTPUT_PATH)
    : path.join(__dirname, 'public', 'tenant-output.html');
  ensureScripts(tenantOutputPath, ['/shared/tenant-text-runtime.js']);
}

// These operations rewrite the immutable application bundle or static assets.
// They are intentionally executed once while the Docker image is being built.
// Running them on every process restart made a successful first patch remove
// the marker required by the next restart, which could trap the Fly machine in
// a permanent crash loop.
function prepareRuntimeFiles() {
  ensureWorkspaceShellBootstrap();
  require('./auth-shell-stability-bootstrap.cjs').patchAuthShellStability();
  const identityReconciliation = require('./verified-identity-reconciliation-bootstrap.cjs');
  const serverBundlePath = process.env.SPMT_SERVER_BUNDLE_PATH
    ? path.resolve(process.env.SPMT_SERVER_BUNDLE_PATH)
    : path.join(__dirname, 'dist', 'server.cjs');
  const serverBundle = fs.readFileSync(serverBundlePath, 'utf8');
  // New builds compile the safe gate directly from server.ts. Only older
  // bundles still need the compatibility rewrite.
  if (serverBundle.includes(identityReconciliation.CONFLICT_GATE)) {
    identityReconciliation.patchProductionServerBundle();
  } else if (!serverBundle.includes(identityReconciliation.SAFE_RECONCILIATION_GATE)) {
    throw new Error('SPMT identity reconciliation gate is missing from the production bundle');
  }
  require('./commlink-rich-chat-bootstrap.cjs').installCommlinkRichChatBootstrap();
  require('./commlink-source-controls-bootstrap.cjs').installCommlinkSourceControlsBootstrap();
  require('./commlink-identity-routing-bootstrap.cjs').installCommlinkIdentityRoutingBootstrap();
  require('./commlink-production-bootstrap.cjs').installCommlinkProductionBootstrap();
  require('./commlink-auth-recovery-bootstrap.cjs').patchCommlinkAuthRecovery();
  require('./commlink-chat-navigation-bootstrap.cjs').installCommlinkChatNavigationBootstrap();
  console.log('[SPMT] Runtime files prepared for restart-safe launch.');
}

// These bootstraps install process-local Express hooks/routes or runtime data
// services. A new Node process must install them on every start, but they do not
// rewrite the shipped server bundle or Commlink application files.
function installProcessBootstraps() {
  require('./commlink-feed-projection-bootstrap.cjs').installCommlinkFeedProjectionBootstrap();
  require('./commlink-diagnostic-bootstrap.cjs').installCommlinkDiagnosticBootstrap();
  require('./presence-bootstrap.cjs').installPresenceBootstrap();
  require('./oauth-authorize-recovery-bootstrap.cjs').installOauthAuthorizeRecoveryBootstrap();
  require('./account-recovery-bootstrap.cjs').installAccountRecoveryBootstrap();
  require('./admin-recovery-bootstrap.cjs').installAdminRecoveryBootstrap();
  require('./cloud-xbox-bootstrap.cjs').installCloudXboxBootstrap();
  require('./athena-command-bootstrap.cjs').installAthenaCommandBootstrap();
  require('./easter-egg-entitlement-bootstrap.cjs').installEasterEggEntitlementBootstrap();
  require('./tenant-overlay-events-bootstrap.cjs').installTenantOverlayEventsBootstrap();
  require('./tenant-overlay-bootstrap.cjs').installTenantOverlayBootstrap();
}

function main() {
  const prepareOnly = process.env.SPMT_PREPARE_RUNTIME === '1';
  const imagePrepared = process.env.SPMT_RUNTIME_PREPARED === '1';

  // Local/dev and older images retain a compatibility fallback. Production
  // images built by the current Dockerfile set SPMT_RUNTIME_PREPARED=1, so a
  // Fly restart never mutates application code or static assets.
  if (prepareOnly || !imagePrepared) prepareRuntimeFiles();
  if (prepareOnly) return;

  installProcessBootstraps();
  require('./dist/server.cjs');
}

if (require.main === module) main();

module.exports = {
  ensureWorkspaceShellBootstrap,
  prepareRuntimeFiles,
  installProcessBootstraps,
  main,
};
