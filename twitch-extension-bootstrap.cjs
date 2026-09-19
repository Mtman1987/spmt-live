'use strict';

const jwt = require('jsonwebtoken');

const STREAMWEAVER_URL = String(process.env.STREAMWEAVER_URL || 'https://streamweaver-new.fly.dev').replace(/\/+$/, '');
const DSH_URL = String(process.env.DSH_PUBLIC_BASE_URL || 'https://discord-stream-hub-new.fly.dev').replace(/\/+$/, '');
const TENANT_ID = String(process.env.TWITCH_EXTENSION_TENANT_ID || 'spacemountainlive').trim();
const BROADCASTER_LOGIN = String(process.env.TWITCH_EXTENSION_BROADCASTER_LOGIN || 'mtman1987').trim().toLowerCase();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 12;
const rate = new Map();

function safeJson(res, status, body) {
  return res.status(status).set('cache-control', 'private, no-store').json(body);
}

function extensionSecret() {
  const raw = String(process.env.TWITCH_EXTENSION_SECRET_B64 || process.env.TWITCH_EXTENSION_SECRET || '').trim();
  if (!raw) return null;
  try { return Buffer.from(raw, 'base64'); } catch { return null; }
}

function verifyViewer(req) {
  const token = String(req.headers['x-extension-jwt'] || req.headers.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  const secret = extensionSecret();
  if (!secret) return { error: 'Twitch Extension secret is not configured', status: 503 };
  if (!token) return { error: 'Twitch Extension viewer token required', status: 401 };
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (!payload || typeof payload !== 'object') throw new Error('invalid token');
    const channelId = String(payload.channel_id || '').trim();
    const opaqueId = String(payload.opaque_user_id || '').trim();
    const userId = String(payload.user_id || '').trim();
    if (!channelId || !opaqueId) return { error: 'Invalid Twitch Extension viewer token', status: 401 };
    return {
      channelId,
      viewerId: userId || opaqueId,
      opaqueId,
      userId: userId || null,
      linked: Boolean(userId),
      role: String(payload.role || 'viewer'),
    };
  } catch {
    return { error: 'Invalid Twitch Extension viewer token', status: 401 };
  }
}

function rateAllowed(viewerId) {
  const now = Date.now();
  const key = String(viewerId || 'unknown');
  const existing = rate.get(key) || { startedAt: now, count: 0 };
  if (now - existing.startedAt >= RATE_WINDOW_MS) {
    existing.startedAt = now;
    existing.count = 0;
  }
  existing.count += 1;
  rate.set(key, existing);
  return existing.count <= RATE_MAX;
}

async function fetchJson(url, init = {}, timeoutMs = 4500) {
  const response = await fetch(url, {
    ...init,
    signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function activePrompt(latest) {
  const prompt = latest?.data?.viewerPrompt || latest?.viewerPrompt || null;
  if (!prompt || !Array.isArray(prompt.options) || !prompt.options.length) return null;
  const expiresAt = Date.parse(String(prompt.expiresAt || ''));
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return null;
  return {
    id: String(prompt.id || ''),
    question: String(prompt.question || latest?.data?.text || latest?.text || '').slice(0, 500),
    options: prompt.options.map(String).map((value) => value.slice(0, 80)).filter(Boolean).slice(0, 5),
    expiresAt: prompt.expiresAt || null,
  };
}

async function readState() {
  const [spotlightResult, ttsResult] = await Promise.allSettled([
    fetchJson(`${DSH_URL}/api/community-spotlight`, { headers: { accept: 'application/json' }, cache: 'no-store' }),
    fetchJson(`${STREAMWEAVER_URL}/api/tts/current?tenant=${encodeURIComponent(TENANT_ID)}&latest=1`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    }),
  ]);

  const spotlightPayload = spotlightResult.status === 'fulfilled' ? spotlightResult.value : null;
  const spotlight = spotlightPayload?.spotlight || spotlightPayload?.data?.spotlight || null;
  const login = String(spotlight?.twitchLogin || spotlight?.user?.twitchLogin || '').trim().toLowerCase();
  const ttsPayload = ttsResult.status === 'fulfilled' ? ttsResult.value : null;

  return {
    featured: login ? {
      login,
      title: String(spotlight?.streamTitle || '').slice(0, 180),
      game: String(spotlight?.gameTitle || '').slice(0, 120),
      avatarUrl: String(spotlight?.avatarUrl || spotlight?.user?.avatarUrl || '').slice(0, 1000),
    } : null,
    prompt: activePrompt(ttsPayload),
  };
}

function spmtCoreToken(scope) {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) throw new Error('JWT_SECRET is required for SPMT core service auth');
  return jwt.sign({
    client_id: 'spmt-core',
    scopes: [scope],
    token_use: 'client_credentials',
  }, secret, { algorithm: 'HS256', expiresIn: 300 });
}

async function forwardDshAction(viewer, body) {
  const key = String(process.env.SPMT_API_KEY || process.env.SPMT_PLATFORM_API_KEY || '').trim();
  if (!key) throw new Error('SPMT_API_KEY is not configured for Discord viewer actions');
  return fetchJson(`${DSH_URL}/api/internal/twitch-extension-action`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: body.type,
      message: String(body.message || '').slice(0, 600),
      viewerId: viewer.userId || viewer.opaqueId,
      channelId: viewer.channelId,
      featuredLogin: String(body.featuredLogin || '').slice(0, 80),
    }),
  }, 7000);
}

async function forwardPromptResponse(viewer, body, prompt) {
  const legacyKey = String(process.env.SYSTEM_API_KEY || process.env.SPMT_SYSTEM_KEY || '').trim();
  return fetchJson(`${STREAMWEAVER_URL}/api/internal/twitch-extension-response`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${spmtCoreToken('commlink:control')}`,
      ...(legacyKey ? { 'x-spmt-key': legacyKey } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      broadcasterLogin: BROADCASTER_LOGIN,
      viewerId: viewer.userId || viewer.opaqueId,
      promptId: prompt.id,
      promptText: prompt.question,
      choice: String(body.choice || '').slice(0, 80),
    }),
  }, 8000);
}

function installRoutes(app, express) {
  const jsonBody = express.json({ limit: '16kb' });

  app.get('/api/twitch-extension/state', async (req, res) => {
    const viewer = verifyViewer(req);
    if (viewer.error) return safeJson(res, viewer.status, { error: viewer.error });
    try {
      const state = await readState();
      return safeJson(res, 200, {
        version: 'spmt-twitch-extension.v1',
        viewer: { linked: viewer.linked, role: viewer.role },
        featured: state.featured,
        prompt: state.prompt,
        capabilities: {
          watch: true,
          follow: true,
          mediaRequest: true,
          joinRequest: true,
          help: true,
          ttsActions: true,
        },
      });
    } catch (error) {
      return safeJson(res, 502, { error: error?.message || 'Extension state unavailable' });
    }
  });

  app.post('/api/twitch-extension/action', jsonBody, async (req, res) => {
    const viewer = verifyViewer(req);
    if (viewer.error) return safeJson(res, viewer.status, { error: viewer.error });
    if (!rateAllowed(viewer.viewerId)) return safeJson(res, 429, { error: 'Too many viewer actions; try again shortly' });

    const type = String(req.body?.type || '').trim();
    if (!['help', 'join_request', 'media_request', 'prompt_response'].includes(type)) {
      return safeJson(res, 400, { error: 'Unsupported viewer action' });
    }
    if ((type === 'help' || type === 'join_request') && !viewer.linked) {
      return safeJson(res, 409, { error: 'identity_required', identityRequired: true });
    }

    try {
      if (type === 'prompt_response') {
        const state = await readState();
        if (!state.prompt || state.prompt.id !== String(req.body?.promptId || '')) {
          return safeJson(res, 409, { error: 'That viewer prompt is no longer active' });
        }
        const choice = String(req.body?.choice || '').trim();
        if (!state.prompt.options.includes(choice)) return safeJson(res, 400, { error: 'Invalid prompt choice' });
        const result = await forwardPromptResponse(viewer, req.body, state.prompt);
        return safeJson(res, 200, { ok: true, delivered: 'streamweaver', result });
      }

      const result = await forwardDshAction(viewer, req.body || {});
      return safeJson(res, 200, { ok: true, delivered: 'discord', result });
    } catch (error) {
      return safeJson(res, 502, { error: error?.message || 'Viewer action delivery failed' });
    }
  });
}

function patchExpress() {
  const expressPath = require.resolve('express');
  const currentExpress = require(expressPath);
  if (currentExpress.__spmtTwitchExtensionFactory) return;
  function wrappedExpress(...args) {
    const app = currentExpress(...args);
    installRoutes(app, currentExpress);
    return app;
  }
  for (const key of Object.keys(currentExpress)) wrappedExpress[key] = currentExpress[key];
  wrappedExpress.__spmtTwitchExtensionFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installTwitchExtensionBootstrap() {
  patchExpress();
}

module.exports = {
  installTwitchExtensionBootstrap,
  _test: { activePrompt },
};
