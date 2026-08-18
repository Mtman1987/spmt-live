// Production bootstrap for SPMT.
// Reuse the existing SPMT_API_KEY for the Athena Codex gateway so the
// deployment does not require a second duplicate service credential.
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const spmtApiKey = String(process.env.SPMT_API_KEY || '').trim();
if (!String(process.env.SPMT_CODEX_SERVICE_SECRET || '').trim() && spmtApiKey) {
  process.env.SPMT_CODEX_SERVICE_SECRET = spmtApiKey;
}

// Keep the primary SPMT account shell and Commlink on the same canonical
// WorkspaceProfileV1 appearance contract as the reusable shared surfaces.
const publicIndexPath = fileURLToPath(new URL('../public/index.html', import.meta.url));
let publicIndex = await readFile(publicIndexPath, 'utf8');
const shellScripts = [
  '/shared/session-cache.js',
  '/shared/shell-theme.js',
  '/shared/shell-chrome.js',
  '/shared/ecosystem-header.js',
  '/shared/workspace-controller.js',
  '/shared/companion-installer-ui.js',
  '/shared/overlay-bay-shell-nav.js',
  '/shared/black-hole-easter-egg.js',
];
if (!publicIndex.includes('</body>')) throw new Error('SPMT shell bootstrap could not find </body>');
let shellChanged = false;
for (const script of shellScripts) {
  if (publicIndex.includes(script)) continue;
  publicIndex = publicIndex.replace('</body>', `  <script src="${script}" defer></script>\n</body>`);
  shellChanged = true;
}
if (shellChanged) await writeFile(publicIndexPath, publicIndex, 'utf8');

const commlinkIndexPath = fileURLToPath(new URL('../public/commlink/index.html', import.meta.url));
let commlinkIndex = await readFile(commlinkIndexPath, 'utf8');
if (!commlinkIndex.includes('/shared/commlink-canonical.js')) {
  const marker = '  <script src="/commlink/commlink.js" defer></script>';
  if (!commlinkIndex.includes(marker)) throw new Error('Commlink canonical UI bootstrap marker was not found');
  commlinkIndex = commlinkIndex.replace(marker, `  <script src="/shared/commlink-canonical.js" defer></script>\n${marker}`);
  await writeFile(commlinkIndexPath, commlinkIndex, 'utf8');
}

// Auth deployment guardrails. These are intentionally narrow replacements in
// the generated server bundle so the live bootstrap can correct the launcher
// and owner-assisted recovery without rewriting unrelated server.ts content.
// If any expected marker disappears, fail startup rather than silently running
// a partially-applied authentication fix.
const serverBundlePath = fileURLToPath(new URL('../dist/server.cjs', import.meta.url));
let serverBundle = await readFile(serverBundlePath, 'utf8');

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) {
    throw new Error(`SPMT auth bootstrap could not apply ${label}; expected bundle marker was not found`);
  }
  return source.replace(from, to);
}

serverBundle = replaceRequired(
  serverBundle,
  'https://spmt.live/api/oauth/authorize?client_id=spacemountain-live&redirect_uri=https%3A%2F%2Fspacemountain.live%2Fauth%2Fcallback',
  'https://spacemountain.live/auth/login',
  'SpaceMountain state-preserving launcher',
);

serverBundle = replaceRequired(
  serverBundle,
  "SELECT id, username FROM users WHERE username = ? AND password_hash != 'SYSTEM_NO_LOGIN'",
  'SELECT id, username FROM users WHERE username = ?',
  'owner-assisted provider account recovery',
);

serverBundle = replaceRequired(
  serverBundle,
  "SELECT id FROM users WHERE username = ? AND password_hash != 'SYSTEM_NO_LOGIN'",
  'SELECT id FROM users WHERE username = ?',
  'provider-owned password reset',
);

await writeFile(serverBundlePath, serverBundle, 'utf8');

// Register canonical pre-routes before the bundled server creates Express.
// Presence is intentionally public and privacy-limited; authenticated actions
// continue to use the existing SPMT OAuth/session bearer. Commlink diagnostics
// are machine-only and use the existing ecosystem service key.
require('../presence-bootstrap.cjs').installPresenceBootstrap();
require('../athena-command-bootstrap.cjs').installAthenaCommandBootstrap();
require('../tenant-overlay-bootstrap.cjs').installTenantOverlayBootstrap();
require('../commlink-diagnostic-bootstrap.cjs').installCommlinkDiagnosticBootstrap();
require('../easter-egg-entitlement-bootstrap.cjs').installEasterEggEntitlementBootstrap();
require('../lost-signal-transmission-bootstrap.cjs').installLostSignalTransmissionBootstrap();

await import('../dist/server.cjs');

// Rotator is a separate SPMT application from MountainView. Seed its OAuth
// registration after the server initializes the persistent schema. Prefer a
// dedicated client secret, but reuse an already-deployed ecosystem credential
// during migration so a new secret is not required just to decouple sessions.
const rotatorClientSecret = String(
  process.env.ROTATOR_CLIENT_SECRET
  || process.env.MOUNTAINVIEW_CLIENT_SECRET
  || spmtApiKey
  || '',
).trim();
if (rotatorClientSecret) {
  const { default: Database } = await import('better-sqlite3');
  const databasePath = process.env.DATABASE_PATH || (process.env.NODE_ENV === 'production' || process.env.FLY_APP_NAME ? '/data/spmt.db' : new URL('../spmt.db', import.meta.url).pathname);
  const db = new Database(databasePath);
  try {
    db.prepare(`
      INSERT INTO oauth_clients (client_id, client_secret, name, redirect_uris, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(client_id) DO UPDATE SET
        client_secret = excluded.client_secret,
        name = excluded.name,
        redirect_uris = excluded.redirect_uris
    `).run(
      'rotator',
      rotatorClientSecret,
      'SpaceMountain Rotator / Athena Coder',
      'https://mtman-machine-rotator.fly.dev/auth/spmt/callback',
      new Date().toISOString(),
    );
  } finally {
    db.close();
  }
} else {
  console.warn('Rotator OAuth client was not seeded because no migration-safe client credential is configured.');
}
