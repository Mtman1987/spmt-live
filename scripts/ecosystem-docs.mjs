export const ECOSYSTEM_SCHEMA_VERSION = 'spmt.ecosystem-state/v1';
export const DEFAULT_ECOSYSTEM_SNAPSHOT_URL = 'https://mtman-machine-rotator.fly.dev/ecosystem/v1/public.json';

export function validateEcosystemSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('Ecosystem snapshot must be an object');
  if (snapshot.schemaVersion !== ECOSYSTEM_SCHEMA_VERSION) {
    throw new Error(`Unsupported ecosystem snapshot schema: ${snapshot.schemaVersion || '<missing>'}`);
  }
  if (!snapshot.generatedAt || typeof snapshot.generatedAt !== 'string') throw new Error('Ecosystem snapshot generatedAt is required');
  if (!snapshot.apps || typeof snapshot.apps !== 'object' || Array.isArray(snapshot.apps)) throw new Error('Ecosystem snapshot apps map is required');
  return snapshot;
}

export async function fetchEcosystemSnapshot({ url = process.env.SPMT_ECOSYSTEM_SNAPSHOT_URL || DEFAULT_ECOSYSTEM_SNAPSHOT_URL, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Ecosystem snapshot request failed: HTTP ${response.status}`);
  return validateEcosystemSnapshot(await response.json());
}

export function resolveSnapshotPath(snapshot, expression) {
  const path = String(expression || '').trim();
  if (!path || !/^[A-Za-z0-9_.-]+$/.test(path)) throw new Error(`Invalid ecosystem template path: ${path || '<empty>'}`);
  let value = snapshot;
  for (const segment of path.split('.')) {
    if (!value || typeof value !== 'object' || !(segment in value)) {
      throw new Error(`Missing ecosystem template value: ${path}`);
    }
    value = value[segment];
  }
  if (value === null || value === undefined || (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')) {
    throw new Error(`Ecosystem template value must be a scalar: ${path}`);
  }
  return String(value);
}

export function resolveEcosystemTemplates(markdown, snapshot) {
  validateEcosystemSnapshot(snapshot);
  return String(markdown).replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, expression) => resolveSnapshotPath(snapshot, expression));
}
