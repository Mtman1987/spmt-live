'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Athena's server-to-server bridge reuses the existing SPMT_API_KEY.
// Keep the legacy variable populated internally so the current verifier
// can continue to use its constant-time comparison without a second secret.
if (!process.env.SPMT_CODEX_SERVICE_SECRET && process.env.SPMT_API_KEY) {
  process.env.SPMT_CODEX_SERVICE_SECRET = process.env.SPMT_API_KEY;
}

// The Docker image runs this file directly, so production shell bootstraps must
// live here instead of only in scripts/start.mjs. Ensure the canonical workspace
// renderers are present before Express begins serving public/index.html.
function ensureWorkspaceShellBootstrap() {
  const publicIndexPath = process.env.SPMT_PUBLIC_INDEX_PATH
    ? path.resolve(process.env.SPMT_PUBLIC_INDEX_PATH)
    : path.join(__dirname, 'public', 'index.html');
  let publicIndex = fs.readFileSync(publicIndexPath, 'utf8');
  const scripts = [
    '/shared/shell-theme.js',
    '/shared/shell-chrome.js',
    '/shared/companion-installer-ui.js',
    '/shared/overlay-bay-shell-nav.js',
  ];
  if (!publicIndex.includes('</body>')) {
    throw new Error('SPMT shell bootstrap could not find </body>');
  }
  for (const script of scripts) {
    if (publicIndex.includes(script)) continue;
    publicIndex = publicIndex.replace(
      '</body>',
      `  <script src="${script}" defer></script>\n</body>`,
    );
  }
  fs.writeFileSync(publicIndexPath, publicIndex, 'utf8');
}

ensureWorkspaceShellBootstrap();

// Production installs the authenticated Cloud Xbox routes before the bundled
// server creates its Express app. The cloud browser stays server-side; Overlay
// Bay only receives sanitized screenshots/status and forwards user input.
require('./cloud-xbox-bootstrap.cjs').installCloudXboxBootstrap();

require('./dist/server.cjs');
