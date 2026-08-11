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
// theme loader is present before Express begins serving public/index.html.
function ensureWorkspaceThemeBootstrap() {
  const publicIndexPath = process.env.SPMT_PUBLIC_INDEX_PATH
    ? path.resolve(process.env.SPMT_PUBLIC_INDEX_PATH)
    : path.join(__dirname, 'public', 'index.html');
  let publicIndex = fs.readFileSync(publicIndexPath, 'utf8');
  const themeScript = '/shared/shell-theme.js';
  if (publicIndex.includes(themeScript)) return;
  if (!publicIndex.includes('</body>')) {
    throw new Error('SPMT shell theme bootstrap could not find </body>');
  }
  publicIndex = publicIndex.replace(
    '</body>',
    `  <script src="${themeScript}" defer></script>\n</body>`,
  );
  fs.writeFileSync(publicIndexPath, publicIndex, 'utf8');
}

ensureWorkspaceThemeBootstrap();

require('./dist/server.cjs');
