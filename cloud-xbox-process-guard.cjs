'use strict';

const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const jwt = require('jsonwebtoken');

const MAX_TAIL = 6000;
const STATUS_FILE = process.env.CLOUD_XBOX_DIAGNOSTIC_FILE || '/data/cloud-xbox-last.json';
const state = {
  active: false,
  pid: null,
  startedAt: null,
  exitedAt: null,
  exitCode: null,
  exitSignal: null,
  lastError: '',
  stderrTail: '',
  vmMemoryMb: Number(process.env.FLY_VM_MEMORY_MB || 0) || null,
};
let installed = false;

function redact(text) {
  return String(text || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:token|access_token|auth|authorization|code|session|sig|signature)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\/data\/cloud-xbox-profiles\/[^\s/'"]+/g, '/data/cloud-xbox-profiles/[user]')
    .slice(-MAX_TAIL);
}

function restorePersistedState() {
  try {
    if (!fs.existsSync(STATUS_FILE)) return;
    const saved = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    if (!saved || typeof saved !== 'object') return;
    state.startedAt = saved.startedAt || null;
    state.exitedAt = saved.exitedAt || null;
    state.exitCode = Number.isInteger(saved.exitCode) ? saved.exitCode : null;
    state.exitSignal = saved.exitSignal || null;
    state.lastError = redact(saved.lastError || '');
    state.stderrTail = redact(saved.stderrTail || '');
    state.vmMemoryMb = Number(process.env.FLY_VM_MEMORY_MB || saved.vmMemoryMb || 0) || null;
    if (saved.active) {
      state.lastError = state.lastError || 'SPMT restarted while the previous Chromium session was active.';
    }
  } catch {}
}

restorePersistedState();

function persist() {
  try {
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    fs.writeFileSync(STATUS_FILE, JSON.stringify({ ...state, stderrTail: redact(state.stderrTail) }, null, 2));
  } catch {}
}

function appendTail(chunk) {
  const text = redact(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || ''));
  if (!text) return;
  state.stderrTail = redact(`${state.stderrTail}${text}`);
  persist();
}

function isCloudChromium(command, args) {
  const name = path.basename(String(command || '')).toLowerCase();
  if (!name.includes('chromium') && !name.includes('chrome')) return false;
  return Array.isArray(args) && args.some((arg) => String(arg).startsWith('--remote-debugging-port='));
}

function addFlag(args, flag) {
  const key = flag.split('=')[0];
  if (!args.some((arg) => String(arg) === key || String(arg).startsWith(`${key}=`))) args.push(flag);
}

function installSpawnGuard() {
  const realSpawn = childProcess.spawn;
  if (realSpawn.__spmtCloudXboxGuard) return;

  function guardedSpawn(command, args = [], options = {}) {
    if (!isCloudChromium(command, args)) return realSpawn.call(childProcess, command, args, options);

    const nextArgs = [...args];
    addFlag(nextArgs, '--disable-gpu');
    addFlag(nextArgs, '--renderer-process-limit=2');
    addFlag(nextArgs, '--disable-extensions');
    addFlag(nextArgs, '--disable-default-apps');
    addFlag(nextArgs, '--disable-sync');
    addFlag(nextArgs, '--disable-background-networking');
    addFlag(nextArgs, '--disable-component-update');
    addFlag(nextArgs, '--metrics-recording-only');
    addFlag(nextArgs, '--password-store=basic');

    state.active = true;
    state.pid = null;
    state.startedAt = new Date().toISOString();
    state.exitedAt = null;
    state.exitCode = null;
    state.exitSignal = null;
    state.lastError = '';
    state.stderrTail = '';
    state.vmMemoryMb = Number(process.env.FLY_VM_MEMORY_MB || 0) || null;
    persist();

    const child = realSpawn.call(childProcess, command, nextArgs, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...(options.env || process.env),
        TMPDIR: '/tmp',
      },
    });
    state.pid = child.pid || null;
    persist();

    child.stdout?.on('data', appendTail);
    child.stderr?.on('data', appendTail);
    child.on('error', (error) => {
      state.lastError = redact(error?.message || String(error));
      appendTail(`\nspawn error: ${state.lastError}\n`);
    });
    child.on('exit', (code, signal) => {
      state.active = false;
      state.exitedAt = new Date().toISOString();
      state.exitCode = Number.isInteger(code) ? code : null;
      state.exitSignal = signal || null;
      if (!state.lastError && (code || signal)) {
        state.lastError = signal ? `Chromium exited via ${signal}` : `Chromium exited with code ${code}`;
      }
      if (signal === 'SIGKILL') {
        state.lastError = 'Chromium was killed with SIGKILL. This commonly indicates VM memory or resource pressure.';
      }
      persist();
    });
    return child;
  }
  guardedSpawn.__spmtCloudXboxGuard = true;
  childProcess.spawn = guardedSpawn;
}

function cookieValue(header, name) {
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(idx + 1).trim()); } catch { return part.slice(idx + 1).trim(); }
  }
  return '';
}

function diagnosticAuth(req, res, next) {
  const secret = String(process.env.JWT_SECRET || '');
  const auth = String(req.headers.authorization || '');
  const token = cookieValue(req.headers.cookie, 'spmt_token') || (auth.startsWith('Bearer ') ? auth.slice(7).trim() : '');
  if (!secret || !token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.cloudXboxDiagnosticUser = jwt.verify(token, secret);
    next();
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
  }
}

function installDiagnosticRoutePatch() {
  const expressPath = require.resolve('express');
  const currentExpress = require(expressPath);
  if (currentExpress.__spmtCloudXboxDiagnosticFactory) return;

  function wrappedExpress(...args) {
    const app = currentExpress(...args);
    if (!app.__spmtCloudXboxDiagnosticRoute) {
      app.__spmtCloudXboxDiagnosticRoute = true;
      app.get('/api/cloud-xbox/diagnostics', diagnosticAuth, (_req, res) => {
        res.status(200).set('cache-control', 'private, no-store').json({
          active: state.active,
          pid: state.pid,
          startedAt: state.startedAt,
          exitedAt: state.exitedAt,
          exitCode: state.exitCode,
          exitSignal: state.exitSignal,
          lastError: state.lastError,
          stderrTail: redact(state.stderrTail),
          vmMemoryMb: state.vmMemoryMb,
        });
      });
    }
    return app;
  }
  for (const key of Object.keys(currentExpress)) wrappedExpress[key] = currentExpress[key];
  wrappedExpress.__spmtCloudXboxDiagnosticFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installCloudXboxProcessGuard() {
  if (installed) return;
  installed = true;
  installSpawnGuard();
  installDiagnosticRoutePatch();
}

module.exports = { installCloudXboxProcessGuard };
