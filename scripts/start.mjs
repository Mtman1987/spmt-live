// Production bootstrap for SPMT.
// Reuse the existing SPMT_API_KEY for the Athena Codex gateway so the
// deployment does not require a second duplicate service credential.
const spmtApiKey = String(process.env.SPMT_API_KEY || '').trim();
if (!String(process.env.SPMT_CODEX_SERVICE_SECRET || '').trim() && spmtApiKey) {
  process.env.SPMT_CODEX_SERVICE_SECRET = spmtApiKey;
}

await import('../dist/server.cjs');
