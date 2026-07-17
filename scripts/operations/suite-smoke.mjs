import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, '..', '..', '..');
const manifestPath = path.join(workspaceRoot, 'spmt-live', 'docs', 'ecosystem', 'production-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const featurePaths = {
  'spmt-live': '/api/platform/sdk',
  'spacemountain-live': '/',
  'streamweaver-new': '/',
  'discord-stream-hub-new': '/login',
  'dsh-clip-worker': '/',
  'hearmeout-main': '/',
  'hmo-dj-worker': '/health',
  'chat-tag-new': '/api/tag',
  'chat-tag-bot-new': '/health',
  'mtman-machine-rotator': '/mountainview/api/status',
};

function run(command, args, cwd = workspaceRoot) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

function joinUrl(base, pathname) {
  return new URL(pathname, base.endsWith('/') ? base : `${base}/`).toString();
}

async function checkUrl(url) {
  const startedAt = Date.now();
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  const body = await response.text();
  return { url, status: response.status, ok: response.ok, bytes: Buffer.byteLength(body), durationMs: Date.now() - startedAt };
}

const results = [];
for (const repository of manifest.repositories) {
  if (!repository.deployments?.length) continue;
  const repoPath = path.join(workspaceRoot, repository.path);
  const localSha = run('git', ['rev-parse', 'HEAD'], repoPath);
  const originSha = run('git', ['rev-parse', 'origin/main'], repoPath);

  for (const deployment of repository.deployments) {
    const imageRows = JSON.parse(run('flyctl', ['image', 'show', '-a', deployment.app, '--json']));
    const labels = imageRows[0]?.Labels ? JSON.parse(imageRows[0].Labels) : {};
    const deployedSha = labels.GH_SHA || labels.GITHUB_SHA || null;
    const healthPath = deployment.readinessPath || deployment.healthPath || deployment.livenessPath || '/';
    const health = await checkUrl(joinUrl(deployment.publicUrl, healthPath));
    const feature = await checkUrl(joinUrl(deployment.publicUrl, featurePaths[deployment.app] || '/'));
    const parity = Boolean(deployedSha && deployedSha === localSha && localSha === originSha);
    results.push({ repository: repository.id, app: deployment.app, localSha, originSha, deployedSha, parity, health, feature });
  }
}

const failed = results.filter((result) => !result.parity || !result.health.ok || !result.feature.ok);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), passed: failed.length === 0, results }, null, 2));
if (failed.length) process.exitCode = 1;
