'use strict';

const childProcess = require('node:child_process');

const MAX_TAIL = 5000;
const originalSpawn = childProcess.spawn;

function redact(value) {
  return String(value || '')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, '$1[redacted]')
    .replace(/([?&](?:token|access_token|refresh_token|id_token|auth|authorization|code|session|sig|signature)=)[^&\s"'<>]+/gi, '$1[redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[redacted-jwt]')
    .replace(/\/var\/lib\/spmt-xbox\/profiles\/[^\s/'"]+/g, '/var/lib/spmt-xbox/profiles/[user]')
    .replace(/\/data\/cloud-xbox-profiles\/[^\s/'"]+/g, '/data/cloud-xbox-profiles/[user]')
    .slice(-MAX_TAIL);
}

function usefulTail(value) {
  return redact(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/DevTools listening on/i.test(line))
    .slice(-12)
    .join(' | ')
    .slice(-MAX_TAIL);
}

function isChromiumCommand(command) {
  return /(?:^|\/)(?:chromium|chromium-browser|google-chrome|google-chrome-stable)$/i.test(String(command || ''));
}

childProcess.spawn = function guardedSpawn(command, args, options) {
  const child = originalSpawn.call(childProcess, command, args, options);
  if (!isChromiumCommand(command)) return child;

  const startedAt = Date.now();
  let diagnosticTail = '';
  const collect = (chunk) => {
    diagnosticTail = redact(`${diagnosticTail}${Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '')}`);
  };

  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);

  console.log(`[XboxWorkerGuard] Chromium spawned pid=${child.pid || 'unknown'}`);

  child.once('error', (error) => {
    console.error(`[XboxWorkerGuard] Chromium spawn error: ${redact(error?.message || error)}`);
  });

  child.once('exit', (code, signal) => {
    const runtimeMs = Date.now() - startedAt;
    const tail = usefulTail(diagnosticTail);
    console.error(
      `[XboxWorkerGuard] Chromium exited pid=${child.pid || 'unknown'} code=${Number.isInteger(code) ? code : 'null'} signal=${signal || 'none'} runtimeMs=${runtimeMs}${tail ? ` stderr=${tail}` : ''}`,
    );
  });

  return child;
};

process.on('unhandledRejection', (reason) => {
  console.error(`[XboxWorkerGuard] unhandled rejection kept alive: ${redact(reason?.stack || reason?.message || reason)}`);
});

process.on('uncaughtExceptionMonitor', (error) => {
  console.error(`[XboxWorkerGuard] uncaught exception: ${redact(error?.stack || error?.message || error)}`);
});

console.log('[XboxWorkerGuard] runtime logging enabled');
require('./xbox-worker.cjs');
