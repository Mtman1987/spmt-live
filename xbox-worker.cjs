'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const express = require('express');
const WebSocket = require('ws');

const CLOUD_XBOX_MODES = {
  'cloud-gaming': 'https://play.xbox.com/',
  'remote-play': 'https://www.xbox.com/remoteplay',
};

const VIEWPORT = { width: 1280, height: 720 };
const PORT = Math.max(1, Number(process.env.CLOUD_XBOX_WORKER_PORT || 3003));
const PROFILE_ROOT = process.env.CLOUD_XBOX_PROFILE_ROOT || '/var/lib/spmt-xbox/profiles';
const MAX_SESSIONS = Math.max(1, Number(process.env.CLOUD_XBOX_MAX_SESSIONS || 1));
const IDLE_MS = Math.max(5 * 60 * 1000, Number(process.env.CLOUD_XBOX_IDLE_MS || 60 * 60 * 1000));
const WORKER_SECRET = String(process.env.CLOUD_XBOX_WORKER_SECRET || process.env.JWT_SECRET || '').trim();
const sessions = new Map();
const lastDiagnostics = new Map();
const MAX_DIAGNOSTIC_TAIL = 6000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redact(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:token|access_token|auth|authorization|code|session|sig|signature)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/\/var\/lib\/spmt-xbox\/profiles\/[^\s/'"]+/g, '/var/lib/spmt-xbox/profiles/[user]')
    .replace(/\/data\/cloud-xbox-profiles\/[^\s/'"]+/g, '/data/cloud-xbox-profiles/[user]')
    .slice(-MAX_DIAGNOSTIC_TAIL);
}

function secretsMatch(actual, expected) {
  const a = Buffer.from(String(actual || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function requireWorkerAuth(req, res, next) {
  const supplied = String(req.get('x-spmt-worker-secret') || '');
  if (!WORKER_SECRET || !secretsMatch(supplied, WORKER_SECRET)) {
    return res.status(401).json({ error: 'Xbox worker authentication failed' });
  }
  const userId = String(req.get('x-spmt-user-id') || '').trim();
  if (!userId) return res.status(400).json({ error: 'Missing SPMT user id' });
  req.cloudXboxUserId = userId;
  next();
}

function userKey(userId) {
  return crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 24);
}

function findChromium() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function fetchJson(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.connecting = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  rejectPendingForSocket(socket, error) {
    for (const pending of [...this.pending.values()]) {
      if (pending.socket === socket) pending.reject(error);
    }
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connecting) return await this.connecting;

    const socket = new WebSocket(this.url, { origin: 'http://127.0.0.1' });
    this.ws = socket;
    this.connecting = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try { socket.terminate(); } catch {}
        reject(new Error('CDP websocket timeout'));
      }, 5000);
      const onSocketError = (error) => {
        const failure = error instanceof Error ? error : new Error(String(error || 'CDP connection error'));
        if (this.ws === socket) this.ws = null;
        this.rejectPendingForSocket(socket, failure);
        try { socket.terminate(); } catch {}
      };
      const onOpen = () => {
        clearTimeout(timer);
        socket.off('error', onConnectError);
        socket.on('error', onSocketError);
        resolve();
      };
      const onConnectError = (error) => {
        clearTimeout(timer);
        socket.off('open', onOpen);
        if (this.ws === socket) this.ws = null;
        try { socket.terminate(); } catch {}
        reject(error);
      };
      socket.once('open', onOpen);
      socket.once('error', onConnectError);
    });

    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }

    socket.on('message', (raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending || pending.socket !== socket) return;
      if (message.error) pending.reject(new Error(message.error.message || 'CDP error'));
      else pending.resolve(message.result || {});
    });
    socket.on('close', () => {
      if (this.ws === socket) this.ws = null;
      this.rejectPendingForSocket(socket, new Error('CDP connection closed'));
    });
  }

  async call(method, params = {}, timeoutMs = 10000) {
    await this.connect();
    const socket = this.ws;
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('CDP connection is not open');
    const id = this.nextId++;
    let timer = null;
    let settled = false;
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      this.pending.delete(id);
      handler(value);
    };
    const pending = {
      socket,
      resolve: (value) => finish(resolvePromise, value),
      reject: (error) => finish(rejectPromise, error instanceof Error ? error : new Error(String(error || 'CDP request failed'))),
    };
    this.pending.set(id, pending);
    timer = setTimeout(() => pending.reject(new Error(`${method} timed out`)), timeoutMs);

    try {
      socket.send(JSON.stringify({ id, method, params }), (error) => {
        if (error) pending.reject(error);
      });
    } catch (error) {
      pending.reject(error);
    }
    return await promise;
  }

  close() {
    const socket = this.ws;
    this.ws = null;
    try { socket?.close(); } catch {}
    const failure = new Error('CDP connection closed');
    for (const pending of [...this.pending.values()]) pending.reject(failure);
  }
}

async function pageTargets(session) {
  const targets = await fetchJson(`http://127.0.0.1:${session.port}/json/list`);
  return Array.isArray(targets) ? targets.filter((target) => target.type === 'page') : [];
}

async function ensurePage(session) {
  const targets = await pageTargets(session);
  if (!targets.length) throw new Error('Xbox worker browser has no page target');
  const target = targets[0];
  if (!session.cdp || session.targetId !== target.id || session.cdp.url !== target.webSocketDebuggerUrl) {
    session.cdp?.close();
    session.targetId = target.id;
    session.cdp = new CdpClient(target.webSocketDebuggerUrl);
    await session.cdp.connect();
    await session.cdp.call('Page.enable');
    await session.cdp.call('Runtime.enable');
    await session.cdp.call('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: 1,
      mobile: false,
    }).catch(() => {});
  }
  session.url = target.url || session.url;
  session.title = target.title || session.title;
  return session.cdp;
}

function appendDiagnostic(session, chunk) {
  const text = redact(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || ''));
  if (!text) return;
  session.stderrTail = redact(`${session.stderrTail || ''}${text}`);
}

function sessionDiagnostic(session, extra = {}) {
  return {
    at: new Date().toISOString(),
    exitCode: session?.process?.exitCode ?? null,
    exitSignal: session?.exitSignal || null,
    lastError: redact(session?.lastError || ''),
    stderrTail: redact(session?.stderrTail || ''),
    ...extra,
  };
}

async function waitForBrowser(session) {
  let lastError = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (session.process.exitCode !== null) {
      const detail = redact(session.stderrTail).split('\n').filter(Boolean).slice(-2).join(' · ');
      throw new Error(`Chromium exited with code ${session.process.exitCode}${detail ? ` · ${detail}` : ''}`);
    }
    try {
      await fetchJson(`http://127.0.0.1:${session.port}/json/version`, 1000);
      await ensurePage(session);
      return;
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError || new Error('Xbox worker Chromium did not become ready');
}

async function navigate(session, mode) {
  const url = CLOUD_XBOX_MODES[mode];
  if (!url) throw new Error('Unsupported Xbox browser mode');
  const cdp = await ensurePage(session);
  await cdp.call('Page.navigate', { url });
  session.mode = mode;
  session.url = url;
  session.lastActivityAt = Date.now();
}

async function startSession(userId, requestedMode) {
  const mode = CLOUD_XBOX_MODES[requestedMode] ? requestedMode : 'cloud-gaming';
  const key = userKey(userId);
  const existing = sessions.get(key);
  if (existing && existing.process.exitCode === null) {
    existing.lastActivityAt = Date.now();
    if (existing.mode !== mode) await navigate(existing, mode);
    return existing;
  }
  if (existing) await stopSession(existing);

  const liveSessions = [...sessions.values()].filter((item) => item.process.exitCode === null);
  if (liveSessions.length >= MAX_SESSIONS) {
    const error = new Error('Xbox worker is busy with another stream');
    error.code = 'CAPACITY';
    throw error;
  }

  const binary = findChromium();
  if (!binary) {
    const error = new Error('Chromium is not installed in the Xbox worker');
    error.code = 'NO_BROWSER';
    throw error;
  }

  const port = await freePort();
  const profileDir = path.join(PROFILE_ROOT, key);
  fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
  const url = CLOUD_XBOX_MODES[mode];
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-extensions',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-component-update',
    '--autoplay-policy=no-user-gesture-required',
    '--password-store=basic',
    '--use-gl=swiftshader',
    '--remote-allow-origins=*',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    '--force-device-scale-factor=1',
    url,
  ];

  const child = spawn(binary, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOME: profileDir, TMPDIR: '/tmp' },
  });
  const session = {
    key,
    userId: String(userId),
    mode,
    process: child,
    port,
    profileDir,
    cdp: null,
    targetId: null,
    url,
    title: 'Xbox',
    stderrTail: '',
    lastError: '',
    exitSignal: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  sessions.set(key, session);
  lastDiagnostics.delete(key);

  child.stdout?.on('data', (chunk) => appendDiagnostic(session, chunk));
  child.stderr?.on('data', (chunk) => appendDiagnostic(session, chunk));
  child.on('error', (error) => {
    session.lastError = redact(error?.message || String(error));
  });
  child.once('exit', (code, signal) => {
    session.exitSignal = signal || null;
    session.cdp?.close();
    lastDiagnostics.set(key, sessionDiagnostic(session, {
      exitCode: Number.isInteger(code) ? code : null,
      exitSignal: signal || null,
    }));
    if (sessions.get(key) === session) sessions.delete(key);
  });

  try {
    await waitForBrowser(session);
    return session;
  } catch (error) {
    session.lastError = redact(error?.message || String(error));
    lastDiagnostics.set(key, sessionDiagnostic(session));
    await stopSession(session);
    throw error;
  }
}

async function stopSession(session) {
  if (!session) return;
  if (sessions.get(session.key) === session) sessions.delete(session.key);
  session.cdp?.close();
  try {
    if (session.process.exitCode === null) session.process.kill('SIGTERM');
  } catch {}
  await sleep(250);
  try {
    if (session.process.exitCode === null) session.process.kill('SIGKILL');
  } catch {}
}

async function mediaProbe(session) {
  try {
    const cdp = await ensurePage(session);
    const result = await cdp.call('Runtime.evaluate', {
      expression: `(() => {
        const summary = { videoTracks: 0, audioTracks: 0, width: null, height: null, frameRate: null };
        for (const el of document.querySelectorAll('video,audio')) {
          const stream = el.srcObject;
          if (!stream || typeof stream.getTracks !== 'function') continue;
          for (const track of stream.getTracks()) {
            if (track.readyState !== 'live') continue;
            if (track.kind === 'video') {
              summary.videoTracks += 1;
              let s = {};
              try { s = track.getSettings ? track.getSettings() : {}; } catch {}
              summary.width = summary.width || s.width || el.videoWidth || null;
              summary.height = summary.height || s.height || el.videoHeight || null;
              summary.frameRate = summary.frameRate || s.frameRate || null;
            }
            if (track.kind === 'audio') summary.audioTracks += 1;
          }
        }
        return summary;
      })()`,
      returnByValue: true,
    }, 3000);
    return result?.result?.value || { videoTracks: 0, audioTracks: 0, width: null, height: null, frameRate: null };
  } catch {
    return { videoTracks: 0, audioTracks: 0, width: null, height: null, frameRate: null };
  }
}

function processRssMb(pid) {
  if (!pid) return null;
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    return match ? Math.round((Number(match[1]) / 1024) * 10) / 10 : null;
  } catch {
    return null;
  }
}

function resourceSnapshot(session) {
  const memory = process.memoryUsage();
  return {
    workerRssMb: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
    chromiumParentRssMb: processRssMb(session?.process?.pid),
    systemTotalMb: Math.round(os.totalmem() / 1024 / 1024),
    systemFreeMb: Math.round(os.freemem() / 1024 / 1024),
    loadAverage1m: Math.round(os.loadavg()[0] * 100) / 100,
  };
}

async function sessionStatus(userId) {
  const key = userKey(userId);
  const session = sessions.get(key);
  if (!session || session.process.exitCode !== null) {
    return {
      running: false,
      worker: 'dedicated',
      resources: resourceSnapshot(null),
      diagnostics: lastDiagnostics.get(key) || null,
    };
  }
  session.lastActivityAt = Date.now();
  try { await ensurePage(session); } catch {}
  const media = await mediaProbe(session);
  return {
    running: true,
    worker: 'dedicated',
    mode: session.mode,
    url: session.url,
    title: session.title,
    viewport: VIEWPORT,
    media,
    profilePersistent: true,
    startedAt: new Date(session.createdAt).toISOString(),
    resources: resourceSnapshot(session),
  };
}

async function captureFrame(session) {
  session.lastActivityAt = Date.now();
  const cdp = await ensurePage(session);
  const result = await cdp.call('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 58,
    fromSurface: true,
    captureBeyondViewport: false,
  }, 8000);
  return Buffer.from(result.data || '', 'base64');
}

async function sendInput(session, payload) {
  session.lastActivityAt = Date.now();
  const cdp = await ensurePage(session);
  const type = String(payload?.type || '');
  if (type === 'click') {
    const x = Math.max(0, Math.min(VIEWPORT.width, Number(payload.x) || 0));
    const y = Math.max(0, Math.min(VIEWPORT.height, Number(payload.y) || 0));
    const button = ['left', 'middle', 'right'].includes(payload.button) ? payload.button : 'left';
    await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 });
    return;
  }
  if (type === 'wheel') {
    const x = Math.max(0, Math.min(VIEWPORT.width, Number(payload.x) || VIEWPORT.width / 2));
    const y = Math.max(0, Math.min(VIEWPORT.height, Number(payload.y) || VIEWPORT.height / 2));
    await cdp.call('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x, y,
      deltaX: Number(payload.deltaX) || 0,
      deltaY: Number(payload.deltaY) || 0,
    });
    return;
  }
  if (type === 'text') {
    const text = String(payload.text || '').slice(0, 4000);
    if (text) await cdp.call('Input.insertText', { text });
    return;
  }
  if (type === 'key') {
    const key = String(payload.key || '').slice(0, 80);
    const code = String(payload.code || '').slice(0, 80);
    const modifiers = Number(payload.modifiers) || 0;
    if (!key) return;
    await cdp.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, modifiers });
    if (String(payload.text || '')) {
      await cdp.call('Input.dispatchKeyEvent', {
        type: 'char', key, code, text: String(payload.text).slice(0, 8), modifiers,
      });
    }
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
    return;
  }
  throw new Error('Unsupported cloud browser input event');
}

function sessionForUser(userId) {
  const session = sessions.get(userKey(userId));
  return session && session.process.exitCode === null ? session : null;
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

app.get('/health', (_req, res) => {
  const binary = findChromium();
  res.status(WORKER_SECRET && binary ? 200 : 503).json({
    status: WORKER_SECRET && binary ? 'ok' : 'not-ready',
    worker: 'spmt-xbox',
    chromium: Boolean(binary),
    maxSessions: MAX_SESSIONS,
    activeSessions: [...sessions.values()].filter((item) => item.process.exitCode === null).length,
    resources: resourceSnapshot(null),
  });
});

app.use('/v1', requireWorkerAuth);

app.get('/v1/status', async (req, res) => {
  res.status(200).set('cache-control', 'no-store').json(await sessionStatus(req.cloudXboxUserId));
});

app.post('/v1/session', async (req, res) => {
  try {
    const mode = CLOUD_XBOX_MODES[req.body?.mode] ? req.body.mode : 'cloud-gaming';
    await startSession(req.cloudXboxUserId, mode);
    res.status(200).set('cache-control', 'no-store').json(await sessionStatus(req.cloudXboxUserId));
  } catch (error) {
    const status = error?.code === 'CAPACITY' || error?.code === 'NO_BROWSER' ? 503 : 500;
    res.status(status).json({ error: redact(error?.message || 'Xbox worker could not start Chromium') });
  }
});

app.post('/v1/navigate', async (req, res) => {
  const session = sessionForUser(req.cloudXboxUserId);
  if (!session) return res.status(409).json({ error: 'Xbox browser is not running' });
  try {
    const mode = CLOUD_XBOX_MODES[req.body?.mode] ? req.body.mode : session.mode;
    await navigate(session, mode);
    res.status(200).json(await sessionStatus(req.cloudXboxUserId));
  } catch (error) {
    res.status(500).json({ error: redact(error?.message || 'Navigation failed') });
  }
});

app.post('/v1/reload', async (req, res) => {
  const session = sessionForUser(req.cloudXboxUserId);
  if (!session) return res.status(409).json({ error: 'Xbox browser is not running' });
  try {
    const cdp = await ensurePage(session);
    await cdp.call('Page.reload', { ignoreCache: false });
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: redact(error?.message || 'Reload failed') });
  }
});

app.post('/v1/input', async (req, res) => {
  const session = sessionForUser(req.cloudXboxUserId);
  if (!session) return res.status(409).json({ error: 'Xbox browser is not running' });
  try {
    await sendInput(session, req.body || {});
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: redact(error?.message || 'Input failed') });
  }
});

app.get('/v1/frame', async (req, res) => {
  const session = sessionForUser(req.cloudXboxUserId);
  if (!session) return res.status(409).json({ error: 'Xbox browser is not running' });
  try {
    const frame = await captureFrame(session);
    res.status(200)
      .set('content-type', 'image/jpeg')
      .set('cache-control', 'no-store')
      .set('content-length', String(frame.length))
      .send(frame);
  } catch (error) {
    res.status(503).json({ error: redact(error?.message || 'Xbox browser frame unavailable') });
  }
});

app.get('/v1/diagnostics', (req, res) => {
  const key = userKey(req.cloudXboxUserId);
  const session = sessionForUser(req.cloudXboxUserId);
  res.status(200).set('cache-control', 'no-store').json({
    running: Boolean(session),
    diagnostics: session ? sessionDiagnostic(session) : (lastDiagnostics.get(key) || null),
    resources: resourceSnapshot(session),
  });
});

app.delete('/v1/session', async (req, res) => {
  const session = sessionForUser(req.cloudXboxUserId);
  if (session) await stopSession(session);
  res.status(200).json({ ok: true, running: false });
});

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (now - session.lastActivityAt > IDLE_MS) stopSession(session).catch(() => {});
  }
}, 60 * 1000);
sweeper.unref?.();

fs.mkdirSync(PROFILE_ROOT, { recursive: true, mode: 0o700 });

const server = app.listen(PORT, '::', () => {
  console.log(`[XboxWorker] listening on [::]:${PORT}; maxSessions=${MAX_SESSIONS}; profileRoot=${PROFILE_ROOT}`);
});

async function shutdown() {
  clearInterval(sweeper);
  await Promise.all([...sessions.values()].map((session) => stopSession(session)));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref?.();
}

process.on('SIGTERM', () => { shutdown().catch(() => process.exit(0)); });
process.on('SIGINT', () => { shutdown().catch(() => process.exit(0)); });
