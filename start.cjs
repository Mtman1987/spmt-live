'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Athena's coding gateway migration compatibility is unrelated to the runtime
// command route below. The live Athena command path uses the caller's SPMT
// OAuth/session bearer and does not depend on this legacy Codex setting.
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

// The Docker image runs this file directly, so production shell bootstraps must
// live here instead of only in scripts/start.mjs. Ensure the canonical workspace
// renderers are present before Express begins serving public/index.html.
function ensureWorkspaceShellBootstrap() {
  const publicIndexPath = process.env.SPMT_PUBLIC_INDEX_PATH
    ? path.resolve(process.env.SPMT_PUBLIC_INDEX_PATH)
    : path.join(__dirname, 'public', 'index.html');
  ensureScripts(publicIndexPath, [
    '/shared/session-cache.js',
    '/shared/shell-theme.js',
    '/shared/shell-chrome.js',
    '/shared/companion-installer-ui.js',
    '/shared/overlay-bay-shell-nav.js',
  ]);

  // Shared surfaces need the same tenant event publisher and the copyable,
  // read-only Personal renderer URL. These scripts enhance the existing v2/v3
  // Overlay Bay instead of introducing another editor/runtime.
  const sharedIndexPath = process.env.SPMT_SHARED_INDEX_PATH
    ? path.resolve(process.env.SPMT_SHARED_INDEX_PATH)
    : path.join(__dirname, 'public', 'shared', 'index.html');
  ensureScripts(sharedIndexPath, [
    '/shared/tenant-overlay-alert-publisher.js',
    '/shared/personal-overlay-launch-client.js',
    '/shared/overlay-app-catalog.js',
    '/shared/overlay-text-controls.js',
  ]);

  // Public and Personal use the same canonical tenant renderer. Rich text is a
  // renderer enhancement layered onto the existing scene contract so old URLs
  // and old saved layouts remain valid.
  const tenantOutputPath = process.env.SPMT_TENANT_OUTPUT_PATH
    ? path.resolve(process.env.SPMT_TENANT_OUTPUT_PATH)
    : path.join(__dirname, 'public', 'tenant-output.html');
  ensureScripts(tenantOutputPath, [
    '/shared/tenant-text-runtime.js',
  ]);
}

ensureWorkspaceShellBootstrap();

// Install authenticated pre-routes before the bundled server creates Express.
// Xbox Chromium now lives in the dedicated Fly xbox process group; this web
// process only authenticates the user and proxies Overlay Bay control requests.
require('./oauth-authorize-recovery-bootstrap.cjs').installOauthAuthorizeRecoveryBootstrap();
require('./cloud-xbox-bootstrap.cjs').installCloudXboxBootstrap();
require('./athena-command-bootstrap.cjs').installAthenaCommandBootstrap();
// Event/grant routes must be installed before the older tenant routes because
// they extend the Personal data contract with a narrow read-only render key.
require('./tenant-overlay-events-bootstrap.cjs').installTenantOverlayEventsBootstrap();
// Canonical tenant outputs shadow the legacy single-overlay API as a PUBLIC
// compatibility alias, so existing Xbox/Worktray consumers keep one source of truth.
require('./tenant-overlay-bootstrap.cjs').installTenantOverlayBootstrap();

require('./dist/server.cjs');
