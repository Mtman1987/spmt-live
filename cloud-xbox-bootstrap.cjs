'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');

const CLOUD_XBOX_MODES = {
  'cloud-gaming': 'https://play.xbox.com/',
  'remote-play': 'https://www.xbox.com/remoteplay',
};

const VIEWPORT = { width: 1280, height: 720 };
const PROFILE_ROOT = process.env.CLOUD_XBOX_PROFILE_ROOT || '/data/cloud-xbox-profiles';
const MAX_SESSIONS = Math.max(1, Number(process.env.CLOUD_XBOX_MAX_SESSIONS || 1));
const IDLE_MS = Math.max(5 * 60 * 1000, Number(process.env.CLOUD_XBOX_IDLE_MS || 60 * 60 * 1000));
const sessions = new Map();
let sweeper = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(res, status, body) {
  res.status(status).set('cache-control', 'private, no-store').json(body);
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((piece) => {
    const index = piece.indexOf('=');
    if (index < 1) return;
    const key = piece.slice(0, index).trim();
    const value = piece.slice(index + 1).trim();
    if (!key) return;
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  });
  return out;
}

function authUser(req) {
  const secret = String(process.env.JWT_SECRET || '');
  if (!secret) return null;
  const cookies = parseCookies(req.headers.cookie);
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const token = cookies.spmt_token || bearer;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret);
    if (!payload || typeof payload !== 'object') return null;
    const id = payload.id || payload.userId || payload.sub;
    if (!id) return null;
    return { id: String(id), payload };
  } catch {
    return null;
  }
}

function authenticateCloudXbox(req, res, next) {
  const user = authUser(req);
  if (!user) return safeJson(res, 401, { error: 'Not authenticated' });
  req.cloudXboxUser = user;
  next();
}

function requireSameOrigin(req, res, next) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return next();
  try {
    const parsed = new URL(origin);
    if (parsed.host !== req.headers.host) {
      return safeJson(res, 403, { error: 'Cross-origin cloud browser control is not allowed' });
    }
  } catch {
    return safeJson(res, 403, { error: 'Invalid request origin' });
  }
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
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    this.ws = new WebSocket(this.url, { origin: 'http://127.0.0.1' });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP websocket timeout')), 5000);
      this.ws.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      this.ws.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    this.ws.on('message', (raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'CDP error'));
      else pending.resolve(message.result || {});
    });
    this.ws.on('close', () => {
      for (const pending of this.pending.values()) pending.reject(new Error('CDP connection closed'));
      this.pending.clear();
    });
  }

  async call(method, params = {}, timeoutMs = 10000) {
    await this.connect();
    const id = this.nextId++;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
    this.ws.send(JSON.stringify({ id, method, params }));
    return await promise;
  }

  close() {
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}

async function pageTargets(session) {
  const targets = await fetchJson(`http://127.0.0.1:${session.port}/json/list`);
  return Array.isArray(targets) ? targets.filter((target) => target.type === 'page') : [];
}

async function ensurePage(session) {
  const targets = await pageTargets(session);
  if (!targets.length) throw new Error('Cloud browser has no page target');
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

async function waitForBrowser(session) {
  let lastError = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (session.process.exitCode !== null) throw new Error(`Chromium exited with code ${session.process.exitCode}`);
    try {
      await fetchJson(`http://127.0.0.1:${session.port}/json/version`, 1000);
      await ensurePage(session);
      return;
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw lastError || new Error('Cloud Chromium did not become ready');
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
  if (sessions.size >= MAX_SESSIONS) {
    const error = new Error('Cloud Xbox browser capacity is currently full');
    error.code = 'CAPACITY';
    throw error;
  }

  const binary = findChromium();
  if (!binary) {
    const error = new Error('Chromium is not installed in the SPMT runtime');
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
    '--autoplay-policy=no-user-gesture-required',
    '--use-gl=swiftshader',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    '--force-device-scale-factor=1',
    '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    url,
  ];
  const child = spawn(binary, args, { stdio: 'ignore', env: { ...process.env, HOME: profileDir } });
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
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  sessions.set(key, session);
  child.once('exit', () => {
    session.cdp?.close();
    if (sessions.get(key) === session) sessions.delete(key);
  });
  try {
    await waitForBrowser(session);
    return session;
  } catch (error) {
    await stopSession(session);
    throw error;
  }
}

async function stopSession(session) {
  if (!session) return;
  sessions.delete(session.key);
  session.cdp?.close();
  try {
    if (session.process.exitCode === null) session.process.kill('SIGTERM');
  } catch {}
  await sleep(100);
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

async function sessionStatus(session) {
  if (!session || session.process.exitCode !== null) return { running: false };
  session.lastActivityAt = Date.now();
  try { await ensurePage(session); } catch {}
  const media = await mediaProbe(session);
  return {
    running: true,
    mode: session.mode,
    url: session.url,
    title: session.title,
    viewport: VIEWPORT,
    media,
    profilePersistent: true,
    startedAt: new Date(session.createdAt).toISOString(),
  };
}

async function captureFrame(session) {
  session.lastActivityAt = Date.now();
  const cdp = await ensurePage(session);
  const result = await cdp.call('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 62,
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
      await cdp.call('Input.dispatchKeyEvent', { type: 'char', key, code, text: String(payload.text).slice(0, 8), modifiers });
    }
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers });
    return;
  }
  throw new Error('Unsupported cloud browser input event');
}

function installRoutes(app, express) {
  if (app.__spmtCloudXboxRoutesInstalled) return;
  app.__spmtCloudXboxRoutesInstalled = true;
  const jsonBody = express.json({ limit: '64kb' });

  app.get('/api/cloud-xbox/status', authenticateCloudXbox, async (req, res) => {
    const session = sessions.get(userKey(req.cloudXboxUser.id));
    safeJson(res, 200, await sessionStatus(session));
  });

  app.post('/api/cloud-xbox/session', authenticateCloudXbox, requireSameOrigin, jsonBody, async (req, res) => {
    try {
      const mode = CLOUD_XBOX_MODES[req.body?.mode] ? req.body.mode : 'cloud-gaming';
      const session = await startSession(req.cloudXboxUser.id, mode);
      safeJson(res, 200, await sessionStatus(session));
    } catch (error) {
      const status = error?.code === 'CAPACITY' ? 503 : error?.code === 'NO_BROWSER' ? 503 : 500;
      safeJson(res, status, { error: error?.message || 'Cloud Xbox browser could not start' });
    }
  });

  app.post('/api/cloud-xbox/navigate', authenticateCloudXbox, requireSameOrigin, jsonBody, async (req, res) => {
    const session = sessions.get(userKey(req.cloudXboxUser.id));
    if (!session) return safeJson(res, 409, { error: 'Cloud Xbox browser is not running' });
    try {
      const mode = CLOUD_XBOX_MODES[req.body?.mode] ? req.body.mode : session.mode;
      await navigate(session, mode);
      safeJson(res, 200, await sessionStatus(session));
    } catch (error) {
      safeJson(res, 500, { error: error?.message || 'Navigation failed' });
    }
  });

  app.post('/api/cloud-xbox/reload', authenticateCloudXbox, requireSameOrigin, async (req, res) => {
    const session = sessions.get(userKey(req.cloudXboxUser.id));
    if (!session) return safeJson(res, 409, { error: 'Cloud Xbox browser is not running' });
    try {
      const cdp = await ensurePage(session);
      await cdp.call('Page.reload', { ignoreCache: false });
      safeJson(res, 200, { ok: true });
    } catch (error) {
      safeJson(res, 500, { error: error?.message || 'Reload failed' });
    }
  });

  app.post('/api/cloud-xbox/input', authenticateCloudXbox, requireSameOrigin, jsonBody, async (req, res) => {
    const session = sessions.get(userKey(req.cloudXboxUser.id));
    if (!session) return safeJson(res, 409, { error: 'Cloud Xbox browser is not running' });
    try {
      await sendInput(session, req.body || {});
      safeJson(res, 200, { ok: true });
    } catch (error) {
      safeJson(res, 400, { error: error?.message || 'Input failed' });
    }
  });

  app.get('/api/cloud-xbox/frame', authenticateCloudXbox, async (req, res) => {
    const session = sessions.get(userKey(req.cloudXboxUser.id));
    if (!session) return safeJson(res, 409, { error: 'Cloud Xbox browser is not running' });
    try {
      const frame = await captureFrame(session);
      res.status(200)
        .set('content-type', 'image/jpeg')
        .set('cache-control', 'private, no-store, max-age=0')
        .set('content-length', String(frame.length))
        .send(frame);
    } catch (error) {
      safeJson(res, 503, { error: error?.message || 'Cloud browser frame unavailable' });
    }
  });

  app.delete('/api/cloud-xbox/session', authenticateCloudXbox, requireSameOrigin, async (req, res) => {
    const key = userKey(req.cloudXboxUser.id);
    const session = sessions.get(key);
    if (session) await stopSession(session);
    safeJson(res, 200, { ok: true, running: false });
  });
}

function patchExpress() {
  const expressPath = require.resolve('express');
  const realExpress = require(expressPath);
  if (realExpress.__spmtCloudXboxFactory) return;

  function wrappedExpress(...args) {
    const app = realExpress(...args);
    installRoutes(app, realExpress);
    return app;
  }
  for (const key of Object.keys(realExpress)) wrappedExpress[key] = realExpress[key];
  wrappedExpress.__spmtCloudXboxFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installCloudXboxBootstrap() {
  fs.mkdirSync(PROFILE_ROOT, { recursive: true, mode: 0o700 });
  patchExpress();
  if (!sweeper) {
    sweeper = setInterval(() => {
      const now = Date.now();
      for (const session of sessions.values()) {
        if (now - session.lastActivityAt > IDLE_MS) stopSession(session).catch(() => {});
      }
    }, 60 * 1000);
    sweeper.unref?.();
  }
}

async function shutdownCloudXboxBrowsers() {
  await Promise.all([...sessions.values()].map((session) => stopSession(session)));
}

module.exports = {
  CLOUD_XBOX_MODES,
  installCloudXboxBootstrap,
  shutdownCloudXboxBrowsers,
};
