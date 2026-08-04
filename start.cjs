'use strict';

// Athena's server-to-server bridge reuses the existing SPMT_API_KEY.
// Keep the legacy variable populated internally so the current verifier
// can continue to use its constant-time comparison without a second secret.
if (!process.env.SPMT_CODEX_SERVICE_SECRET && process.env.SPMT_API_KEY) {
  process.env.SPMT_CODEX_SERVICE_SECRET = process.env.SPMT_API_KEY;
}

require('./dist/server.cjs');
