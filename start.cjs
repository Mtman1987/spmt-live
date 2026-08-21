'use strict';

const fs = require('node:fs');
const path = require('node:path');

if (!process.env.SPMT_CODEX_SERVICE_SECRET && process.env.SPMT_API_KEY) {
  process.env.SPMT_CODEX_SERVICE_SECRET = process.env.SPMT_API_KEY;
}

function ensureScripts(filePath, scripts) {
  let html = fs.readFileSync(filePath, 'utf8');
  if (!html.includes('</body>')) throw new Error(`SPMT shell bootstrap could not find </body> in ${filePath}`);
  for (const script of scripts) {
    if (html.includes(script)) continue;
    html = html.replace('</body>', `  <script src="${script}" defer></script>\n</body>`);
  }
  fs.writeFileSync(filePath, html, 'utf8');
}

function ensureWorkspaceShellBootstrap() {
  const publicIndexPath = process.env.SPMT_PUBLIC_INDEX_PATH
    ? path.resolve(process.env.SPMT_PUBLIC_INDEX_PATH)
    : path.join(__dirname, 'public', 'index.html');
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

ensureWorkspaceShellBootstrap();

require('./verified-identity-reconciliation-bootstrap.cjs').patchProductionServerBundle();
require('./commlink-feed-projection-bootstrap.cjs').installCommlinkFeedProjectionBootstrap();
require('./commlink-rich-chat-bootstrap.cjs').installCommlinkRichChatBootstrap();
require('./commlink-source-controls-bootstrap.cjs').installCommlinkSourceControlsBootstrap();
require('./commlink-identity-routing-bootstrap.cjs').installCommlinkIdentityRoutingBootstrap();
require('./commlink-production-bootstrap.cjs').installCommlinkProductionBootstrap();
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

require('./dist/server.cjs');
