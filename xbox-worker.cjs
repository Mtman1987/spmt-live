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
  restream: String(process.env.RESTREAM_STUDIO_URL || 'https://studio.restream.io/').trim() || 'https://studio.restream.io/',
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
const restreamStartTasks = new Map();

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

function findXvfb() {
  const candidates = [
    process.env.XVFB_PATH,
    '/usr/bin/Xvfb',
    '/usr/local/bin/Xvfb',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function startVirtualDisplay() {
  const binary = findXvfb();
  if (!binary) {
    const error = new Error('Xvfb is not installed in the Xbox worker');
    error.code = 'NO_DISPLAY';
    throw error;
  }

  const state = { process: null, number: null, stderrTail: '' };
  const child = spawn(binary, [
    '-displayfd', '3',
    '-screen', '0', `${VIEWPORT.width}x${VIEWPORT.height}x24`,
    '-nolisten', 'tcp',
    '-ac',
  ], { stdio: ['ignore', 'ignore', 'pipe', 'pipe'] });
  state.process = child;
  child.stderr?.on('data', (chunk) => {
    state.stderrTail = redact(`${state.stderrTail}${Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '')}`);
  });

  state.number = await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('Xvfb display did not start')), 8000);
    child.once('error', (error) => finish(reject, error));
    child.once('exit', (code, signal) => {
      finish(reject, new Error(`Xvfb exited before ready (code=${code ?? 'null'}, signal=${signal || 'none'})`));
    });
    const displayFd = child.stdio?.[3];
    if (!displayFd) return finish(reject, new Error('Xvfb display pipe is unavailable'));
    displayFd.once('data', (bytes) => {
      const value = String(bytes || '').trim().split(/\s+/)[0];
      if (!/^\d+$/.test(value)) return finish(reject, new Error('Xvfb returned an invalid display number'));
      finish(resolve, value);
    });
  });

  return state;
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
  if (!targets.length) throw new Error('Cloud browser has no page target');
  // Restream sign-in may open an OAuth popup/new tab. Follow the newest page
  // target while in Restream mode so the remote controller stays usable.
  const target = session.mode === 'restream' ? targets[targets.length - 1] : targets[0];
  if (!session.cdp || session.targetId !== target.id || session.cdp.url !== target.webSocketDebuggerUrl) {
    session.cdp?.close();
    session.targetId = target.id;
    session.cdp = new CdpClient(target.webSocketDebuggerUrl);
    await session.cdp.connect();
    await session.cdp.call('Page.enable');
    await session.cdp.call('Runtime.enable');
    if(session.mode === 'restream'){
      await session.cdp.call('Page.addScriptToEvaluateOnNewDocument',{source:RESTREAM_MEDIA_OBSERVER});
      await session.cdp.call('Runtime.evaluate',{expression:RESTREAM_MEDIA_OBSERVER});
    }
    await session.cdp.call('Emulation.setDeviceMetricsOverride', {
      width: (session.controllerViewport || VIEWPORT).width,
      height: (session.controllerViewport || VIEWPORT).height,
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
    if (session.displayProcess && session.displayProcess.exitCode !== null) {
      const detail = redact(session.stderrTail).split('\n').filter(Boolean).slice(-2).join(' · ');
      throw new Error(`Xvfb exited with code ${session.displayProcess.exitCode}${detail ? ` · ${detail}` : ''}`);
    }
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
  if (session.mode === 'restream' && mode !== 'restream') {
    const error = new Error('Restream Studio is hosting the Lounge. Stop the Restream host before opening another cloud-browser mode.');
    error.code = 'HOST_LOCKED';
    throw error;
  }
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
  // Restream gets the same proven headed-Chromium-on-Xvfb model used by the
  // HearMeOut Lounge/Spotlight workers. Xbox modes keep the lightweight
  // headless path they already use.
  const display = mode === 'restream' ? await startVirtualDisplay() : null;
  const args = [
    ...(mode === 'restream' ? [] : ['--headless=new']),
    '--no-sandbox',
    '--disable-dev-shm-usage',
    ...(mode === 'restream' ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] : []),
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-extensions',
    '--disable-default-apps',
    ...(mode === 'restream' ? [] : ['--disable-sync']),
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
    env: {
      ...process.env,
      HOME: profileDir,
      TMPDIR: '/tmp',
      ...(display ? { DISPLAY: `:${display.number}` } : {}),
    },
  });
  const session = {
    key,
    userId: String(userId),
    mode,
    process: child,
    displayProcess: display?.process || null,
    displayNumber: display?.number || null,
    port,
    profileDir,
    cdp: null,
    targetId: null,
    url,
    title: mode === 'restream' ? 'Restream Studio' : 'Xbox',
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
  if (display?.stderrTail) appendDiagnostic(session, `[Xvfb] ${display.stderrTail}`);
  display?.process?.stderr?.on('data', (chunk) => appendDiagnostic(session, `[Xvfb] ${chunk}`));
  display?.process?.once('exit', (code, signal) => {
    if (child.exitCode === null) {
      session.lastError = `Xvfb exited while Chromium was running (code=${code ?? 'null'}, signal=${signal || 'none'})`;
    }
  });
  child.on('error', (error) => {
    session.lastError = redact(error?.message || String(error));
  });
  child.once('exit', (code, signal) => {
    session.exitSignal = signal || null;
    session.cdp?.close();
    try {
      if (session.displayProcess?.exitCode === null) session.displayProcess.kill('SIGTERM');
    } catch {}
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
  try {
    if (session.displayProcess?.exitCode === null) session.displayProcess.kill('SIGTERM');
  } catch {}
  await sleep(100);
  try {
    if (session.displayProcess?.exitCode === null) session.displayProcess.kill('SIGKILL');
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
  const media = session.mode === 'restream'
    ? { videoTracks: 0, audioTracks: 0, width: null, height: null, frameRate: null }
    : await mediaProbe(session);
  return {
    running: true,
    worker: 'dedicated',
    mode: session.mode,
    url: session.url,
    title: session.title,
    viewport: session.controllerViewport || VIEWPORT,
    controllerOptimization: session.controllerOptimization || null,
    media,
    profilePersistent: true,
    browserPresentation: session.mode === 'restream' ? 'headed-xvfb' : 'headless',
    persistentHost: session.mode === 'restream',
    idleTimeoutDisabled: session.mode === 'restream',
    startedAt: new Date(session.createdAt).toISOString(),
    resources: resourceSnapshot(session),
  };
}

async function inspectSession(session) {
  session.lastActivityAt = Date.now();
  const cdp = await ensurePage(session);
  const result = await cdp.call('Runtime.evaluate', {
    expression: `(() => {
      const visible = (el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      };
      const buttons = [...document.querySelectorAll('button,[role="button"],a')]
        .filter(visible)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\\s+/g,' ').slice(0,120)
        }))
        .filter((x) => x.text)
        .slice(0,120);
      const bodyText = (document.body?.innerText || '').replace(/\\s+/g,' ').trim().slice(0,6000);
      return { url: location.href, title: document.title, buttons, bodyText };
    })()`,
    returnByValue: true,
  }, 5000);
  return result?.result?.value || { url: session.url, title: session.title, buttons: [], bodyText: '' };
}

const RESTREAM_ENTER_LABELS = ['Enter Studio'];
const RESTREAM_START_LABELS = ['Go Live', 'Go live', 'GO LIVE', 'Start Stream', 'Start stream', 'START STREAM'];
const RESTREAM_LIVE_LABELS = ['End Stream', 'End stream', 'END STREAM', 'Stop Stream', 'Stop stream', 'STOP STREAM'];

async function clickVisibleExact(session, labels) {
  const cdp = await ensurePage(session);
  const serialized = JSON.stringify(labels);
  const result = await cdp.call('Runtime.evaluate', {
    expression: `(() => {
      const labels = ${serialized}.map((value) => String(value || '').trim().replace(/\\s+/g, ' ').toLowerCase());
      const norm = (value) => String(value || '').trim().replace(/\\s+/g, ' ');
      const visible = (el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.disabled;
      };
      const candidates = [...document.querySelectorAll('button,[role="button"]')].filter(visible);
      const target = candidates.find((el) => labels.includes(norm(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title')).toLowerCase()));
      if (!target) return null;
      const text = norm(target.innerText || target.getAttribute('aria-label') || target.getAttribute('title'));
      target.click();
      return text;
    })()`,
    returnByValue: true,
  }, 5000);
  return result?.result?.value || null;
}

function restreamState(snapshot) {
  const labels = new Set((snapshot?.buttons || []).map((button) => String(button?.text || '').trim().toLowerCase()));
  if ([...RESTREAM_LIVE_LABELS].some((label) => labels.has(String(label).toLowerCase()))) return 'live';
  if ([...RESTREAM_START_LABELS].some((label) => labels.has(String(label).toLowerCase()))) return 'ready';
  if ([...RESTREAM_ENTER_LABELS].some((label) => labels.has(String(label).toLowerCase()))) return 'prestudio';
  if (/restream\.io\/login/i.test(String(snapshot?.url || '')) || /\blog in\b/i.test(String(snapshot?.title || ''))) return 'login_required';
  if (/setting the stage for you/i.test(String(snapshot?.bodyText || ''))) return 'loading';
  return 'unknown';
}

async function runControlledRestreamStart(userId) {
  const session = await startSession(userId, 'restream');
  let enteredWith = null;
  let startedWith = null;
  let startClicked = false;
  let startRetried = false;
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const snapshot = await inspectSession(session);
    const state = restreamState(snapshot);

    if (state === 'login_required') {
      const error = new Error('Restream persistent browser requires login');
      error.code = 'LOGIN_REQUIRED';
      error.snapshot = snapshot;
      throw error;
    }
    if (state === 'live') {
      session.controllerOptimization=await optimizeRestreamController(session).catch(()=>({applied:false}));
      return {
        ok: true,
        action: 'start-only',
        alreadyLive: !startClicked,
        enteredWith,
        startedWith,
        state,
        snapshot,
      };
    }
    if (state === 'prestudio') {
      if (startClicked) throw new Error('Restream returned to the pre-studio screen after Go Live was clicked');
      enteredWith = await clickVisibleExact(session, RESTREAM_ENTER_LABELS);
      if (!enteredWith) throw new Error('Restream Enter Studio control disappeared before it could be clicked');
      await sleep(1500);
      continue;
    }
    if (state === 'ready') {
      if (!startClicked) {
        startedWith = await clickVisibleExact(session, RESTREAM_START_LABELS);
        if (!startedWith) throw new Error('Restream Go Live control disappeared before it could be clicked');
        startClicked = true;
        await sleep(3500);
        continue;
      }
      if (!startRetried && Date.now() + 5000 < deadline) {
        const retry = await clickVisibleExact(session, RESTREAM_START_LABELS);
        if (retry) {
          startRetried = true;
          startedWith = `${startedWith} -> ${retry}`;
          await sleep(3500);
          continue;
        }
      }
      await sleep(1000);
      continue;
    }
    if (state === 'unknown' && startClicked) {
      await sleep(1000);
      continue;
    }
    if (state === 'unknown' && Date.now() + 45_000 < deadline) {
      await sleep(1000);
      continue;
    }
    await sleep(1000);
  }

  const snapshot = await inspectSession(session).catch(() => null);
  const error = new Error(startClicked
    ? 'Restream Go Live was clicked but a live state was not confirmed'
    : 'Restream Studio did not become ready for a start-only action');
  error.code = 'START_NOT_CONFIRMED';
  error.snapshot = snapshot;
  throw error;
}

async function runRecoverableRestreamStart(userId) {
  const isControlTimeout = (error) => /^(?:(?:Runtime\.evaluate|Page\.enable|Runtime\.enable) timed out|CDP websocket timeout)$/.test(String(error?.message || ''));
  try {
    return await runControlledRestreamStart(userId);
  } catch (error) {
    if (!isControlTimeout(error)) throw error;
  }

  // Reconnect control without replacing the broadcasting Chromium process.
  const current = sessionForUser(userId);
  if (!current || current.mode !== 'restream') throw new Error('Existing Restream host is unavailable');
  current.cdp?.close();
  current.cdp = null;
  current.targetId = null;
  try {
    return await runControlledRestreamStart(userId);
  } catch (error) {
    if (!isControlTimeout(error)) throw error;
    const { twitchLiveState } = require('./cloud-xbox-bootstrap.cjs');
    const twitch = await twitchLiveState();
    if (!twitch.ok || twitch.isLive !== false) {
      // A live stream or failed probe must never trigger browser replacement.
      throw error;
    }
    console.warn('[RestreamRecovery] Twitch confirmed offline; replacing unresponsive host with the same saved profile.');
    await stopSession(current);
    return await runControlledRestreamStart(userId);
  }
}

async function controlledRestreamStart(userId) {
  const key = userKey(userId);
  const existing = restreamStartTasks.get(key);
  if (existing) return await existing;
  const task = runRecoverableRestreamStart(userId)
    .finally(() => restreamStartTasks.delete(key));
  restreamStartTasks.set(key, task);
  return await task;
}


const RESTREAM_CONTROLLER_VIEWPORT = { width: 640, height: 360 };
const RESTREAM_MEDIA_OBSERVER = `(() => {
 if(window.__spmtControllerMedia)return;
 const state=window.__spmtControllerMedia={tracks:[],peers:[]};
 const media=navigator.mediaDevices;
 if(media?.getUserMedia){
  const original=media.getUserMedia.bind(media);
  media.getUserMedia=async function(constraints){
   const stream=await original(constraints);
   for(const track of stream.getTracks()){state.tracks.push(track);if(state.tracks.length>32)state.tracks.shift();}
   return stream;
  };
 }
 const Original=window.RTCPeerConnection;
 if(Original)window.RTCPeerConnection=class extends Original {
  constructor(...args){super(...args);state.peers=state.peers.filter(p=>p.connectionState!=='closed').slice(-15);state.peers.push(this)}
 };
})()`;

async function optimizeRestreamController(session) {
 if(session.mode!=='restream')return {applied:false};
 let policy;try{policy=JSON.parse(fs.readFileSync(path.join(session.profileDir,'spmt-local-preview-policy.json'),'utf8'))}catch{}
 if(!policy?.enabled)return {applied:false};
 const cdp=await ensurePage(session);
 const snapshot=await inspectSession(session);
 if(restreamState(snapshot)!=='live')return {applied:false,state:restreamState(snapshot)};
 const result=await cdp.call('Runtime.evaluate',{
  expression:`(() => {
   const all=()=>[...document.querySelectorAll('button,[role="button"]')].filter(el=>!el.disabled&&el.getBoundingClientRect().width>0);
   const label=el=>(el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').trim().toLowerCase();
   const clickOne=pattern=>{const matches=all().filter(el=>pattern.test(label(el)));if(matches.length===1){matches[0].click();return true}return false};
   const cameraDisabled=clickOne(/^(turn off camera|stop camera|disable camera)(?:\\s*\\([^)]*\\))?$/);
   const microphoneMuted=clickOne(/^(mute|mute microphone|turn off microphone)(?:\\s*\\([^)]*\\))?$/);
   const state=window.__spmtControllerMedia;
   let fakeTracksStopped=0;
   for(const t of state?.tracks||[])if(t.readyState==='live'&&/fake|dummy/i.test(t.label||'')){t.stop();fakeTracksStopped++}
   const inputs=(state?.tracks||[]).slice(-16).map(t=>({kind:t.kind,live:t.readyState==='live',fake:/fake|dummy/i.test(t.label||'')}));
   const senders=(state?.peers||[]).filter(p=>p.connectionState!=='closed').flatMap(p=>p.getSenders()).filter(s=>s.track).slice(0,16).map(s=>{const t=s.track,z=t.getSettings();return {kind:t.kind,live:t.readyState==='live',fake:/fake|dummy/i.test(t.label||''),width:z.width||null,height:z.height||null,frameRate:z.frameRate||null}});
   return {cameraDisabled,microphoneMuted,fakeTracksStopped,observerActive:Boolean(state),inputs,senders};
  })()`,returnByValue:true
 },8000);
 session.controllerViewport=RESTREAM_CONTROLLER_VIEWPORT;
 await cdp.call('Emulation.setDeviceMetricsOverride',{...RESTREAM_CONTROLLER_VIEWPORT,deviceScaleFactor:1,mobile:false});
 // Saved preview policy is specific to this profile; server Browser Source URL is untouched.
 let previewDisabled=false;
 try {
  const policy=JSON.parse(fs.readFileSync(path.join(session.profileDir,'spmt-local-preview-policy.json'),'utf8'));
  if(policy.enabled){
   const targets=await fetchJson('http://127.0.0.1:'+session.port+'/json/list');
   for(const target of targets){
    let url;try{url=new URL(target.url)}catch{continue}
    if(url.hostname!=='spmt.live'||url.pathname!=='/tenant/mtman1987/lounge')continue;
    if(url.searchParams.get('localControllerPreview')==='off'){previewDisabled=true;continue}
    url.searchParams.set('localControllerPreview','off');url.searchParams.delete('previewRestoreMs');
    const frame=new CdpClient(target.webSocketDebuggerUrl);
    try{await frame.call('Runtime.evaluate',{expression:'location.replace('+JSON.stringify(url.href)+')'});previewDisabled=true}finally{frame.close()}
   }
  }
 } catch {}
 return {applied:true,viewport:RESTREAM_CONTROLLER_VIEWPORT,previewDisabled,media:result?.result?.value||null};
}

const controllerMaintenance=setInterval(async()=>{
 for(const session of sessions.values()){
  if(session.mode!=='restream'||session.process.exitCode!==null||session.controllerMaintenanceBusy)continue;
  session.controllerMaintenanceBusy=true;
  try{session.controllerOptimization=await optimizeRestreamController(session)}catch{}
  finally{session.controllerMaintenanceBusy=false}
 }
},30000);
controllerMaintenance.unref?.();

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
  const xvfb = findXvfb();
  const ready = Boolean(WORKER_SECRET && binary && xvfb);
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'not-ready',
    worker: 'spmt-xbox',
    chromium: Boolean(binary),
    xvfb: Boolean(xvfb),
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
    res.status(error?.code === 'HOST_LOCKED' ? 409 : 500).json({ error: redact(error?.message || 'Navigation failed') });
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

app.post('/v1/restream/start', async (req, res) => {
  try {
    const result = await controlledRestreamStart(req.cloudXboxUserId);
    res.status(200).set('cache-control', 'no-store').json(result);
  } catch (error) {
    const snapshot = error?.snapshot
      ? {
          url: String(error.snapshot.url || '').slice(0, 500),
          title: String(error.snapshot.title || '').slice(0, 300),
          buttons: Array.isArray(error.snapshot.buttons) ? error.snapshot.buttons.slice(0, 80) : [],
          bodyText: String(error.snapshot.bodyText || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]').slice(0, 3500),
        }
      : null;
    res.status(error?.code === 'LOGIN_REQUIRED' ? 409 : 422).set('cache-control', 'no-store').json({
      ok: false,
      error: redact(error?.message || 'Restream start-only action failed'),
      snapshot,
    });
  }
});

app.get('/v1/inspect', async (req, res) => {
  const session = sessionForUser(req.cloudXboxUserId);
  if (!session) return res.status(409).json({ error: 'Xbox browser is not running' });
  try {
    res.status(200).set('cache-control', 'no-store').json(await inspectSession(session));
  } catch (error) {
    res.status(503).json({ error: redact(error?.message || 'Xbox browser inspection unavailable') });
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
    // A live Restream Studio tab is the broadcast host. It must outlive the
    // Overlay Bay/controller tab and therefore never participates in idle reap.
    if (session.mode === 'restream') continue;
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
  clearInterval(controllerMaintenance);
  await Promise.all([...sessions.values()].map((session) => stopSession(session)));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref?.();
}

process.on('SIGTERM', () => { shutdown().catch(() => process.exit(0)); });
process.on('SIGINT', () => { shutdown().catch(() => process.exit(0)); });
