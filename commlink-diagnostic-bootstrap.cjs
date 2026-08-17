'use strict';

const { createHash, timingSafeEqual } = require('node:crypto');
const path = require('node:path');
const Database = require('better-sqlite3');

const ROUTE = '/api/internal/commlink/diagnostic-feed';
const DEFAULT_WINDOW_MINUTES = 10;
const MAX_WINDOW_MINUTES = 60;
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 2000;
const MAX_RESPONSE_BYTES = 900_000;

function compactText(value, max = 8000) {
  const text = String(value ?? '').trim();
  return text.length > max ? text.slice(0, max) : text;
}

function parseObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function redactString(value) {
  return String(value ?? '')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk-|github_pat_)[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(/([?&](?:access_token|refresh_token|token|secret|key|api_key)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/(["']?(?:access_token|refresh_token|id_token|client_secret|password|authorization|api[_-]?key|token|secret|cookie|session)["']?\s*[:=]\s*["'])([^"']+)(["'])/gi, '$1[REDACTED]$3');
}

function sensitiveKey(key) {
  return /(?:^|[_-])(authorization|password|passwd|token|secret|api[_-]?key|client[_-]?secret|cookie|session)(?:$|[_-])/i.test(String(key || ''));
}

function redactValue(value, depth = 0) {
  if (depth > 8) return '[TRUNCATED_DEPTH]';
  if (typeof value === 'string') return redactString(value).slice(0, 20_000);
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactValue(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 150)) {
      out[key] = sensitiveKey(key) ? '[REDACTED]' : redactValue(item, depth + 1);
    }
    return out;
  }
  return redactString(value);
}

function hash(value) {
  return createHash('sha256').update(String(value || '')).digest();
}

function sameSecret(a, b) {
  if (!a || !b) return false;
  return timingSafeEqual(hash(a), hash(b));
}

function configuredDiagnosticKeys(env = process.env) {
  return [...new Set([
    env.COMMLINK_DIAGNOSTIC_KEY,
    env.SPMT_API_KEY,
    env.SPMT_SYSTEM_API_KEY,
    env.SYSTEM_API_KEY,
  ].map((value) => String(value || '').trim()).filter(Boolean))];
}

function suppliedDiagnosticKeys(req) {
  const bearer = String(req?.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return [...new Set([
    req?.headers?.['x-spmt-key'],
    req?.headers?.['x-api-key'],
    bearer,
  ].map((value) => String(value || '').trim()).filter(Boolean))];
}

function isAuthorized(req, env = process.env) {
  const expected = configuredDiagnosticKeys(env);
  const supplied = suppliedDiagnosticKeys(req);
  return expected.length > 0 && expected.some((candidate) => supplied.some((value) => sameSecret(candidate, value)));
}

function parseDate(value, fallbackMs) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallbackMs;
}

function resolveWindow(query = {}, nowMs = Date.now()) {
  let untilMs = parseDate(query.until, nowMs);
  if (untilMs > nowMs + 60_000) untilMs = nowMs;
  let sinceMs = parseDate(query.since, untilMs - DEFAULT_WINDOW_MINUTES * 60_000);
  if (sinceMs > untilMs) sinceMs = untilMs - DEFAULT_WINDOW_MINUTES * 60_000;
  const minimumSince = untilMs - MAX_WINDOW_MINUTES * 60_000;
  let windowClamped = false;
  if (sinceMs < minimumSince) {
    sinceMs = minimumSince;
    windowClamped = true;
  }
  return {
    since: new Date(sinceMs).toISOString(),
    until: new Date(untilMs).toISOString(),
    windowClamped,
  };
}

function resolveLimit(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(requested)));
}

function queryOrEmpty(db, sql, params, label, errors) {
  try {
    return db.prepare(sql).all(...params);
  } catch (error) {
    errors.push({ source: label, error: compactText(error?.message || error, 500) });
    return [];
  }
}

function eventText(row, payload) {
  return compactText(payload.summary || payload.title || payload.message || payload.text || String(row.type || '').replace(/\./g, ' '), 20_000);
}

function normalizeEvent(row) {
  const payload = parseObject(row.payload);
  return {
    id: `spmt-event:${row.id}`,
    kind: 'event',
    timestamp: new Date(Date.parse(row.timestamp || row.created_at) || 0).toISOString(),
    sourceApp: compactText(row.source_app || 'spmt', 120),
    eventType: compactText(row.type || 'event', 160),
    channel: compactText(row.type || 'events', 200),
    actor: {
      id: compactText(row.actor_user_id, 160) || null,
      username: compactText(row.actor_username, 160) || null,
      displayName: compactText(row.actor_display_name, 200) || null,
    },
    text: eventText(row, payload),
    details: redactValue({ payload, links: parseArray(row.links), visibility: row.visibility || null }),
  };
}

function normalizeMessage(row) {
  const metadata = parseObject(row.metadata);
  const provider = compactText(metadata.platform || metadata.provider || metadata.source || metadata.sourceApp || 'spmt', 80).toLowerCase();
  return {
    id: `spmt-message:${row.id}`,
    kind: 'message',
    timestamp: new Date(Date.parse(row.created_at) || 0).toISOString(),
    sourceApp: compactText(metadata.sourceApp || metadata.app || provider || 'spmt', 120),
    eventType: compactText(row.message_type || 'message', 120),
    channel: compactText(row.conversation_id || row.channel || 'direct', 200),
    actor: {
      id: compactText(row.from_id, 160) || null,
      username: compactText(row.from_user, 160) || null,
      displayName: compactText(row.from_name || row.from_user, 200) || null,
    },
    text: compactText([row.subject, row.body].filter(Boolean).join(row.subject ? ': ' : ''), 20_000),
    details: redactValue({
      provider,
      recipientId: row.to_id || null,
      metadata,
      attachments: parseArray(row.attachments),
    }),
  };
}

function normalizeNotification(row) {
  return {
    id: `spmt-notification:${row.id}`,
    kind: 'notification',
    timestamp: new Date(Date.parse(row.created_at) || 0).toISOString(),
    sourceApp: compactText(row.source_app || 'spmt', 120),
    eventType: compactText(row.type || 'notification', 120),
    channel: 'notifications',
    actor: { id: null, username: null, displayName: compactText(row.source_app || 'SPMT', 200) },
    text: compactText([row.title, row.body].filter(Boolean).join(': '), 20_000),
    details: redactValue({ recipientUserId: row.user_id || null, linkUrl: row.link_url || null, readAt: row.read_at || null }),
  };
}

function queryGlobalCommlink(db, window, limit) {
  const errors = [];
  const perSourceLimit = Math.min(MAX_LIMIT, Math.max(limit, Math.ceil(limit * 1.5)));
  const events = queryOrEmpty(db, `
    SELECT id, type, timestamp, source_app, actor_user_id, actor_username,
      actor_display_name, visibility, payload, links, created_at
    FROM platform_events
    WHERE datetime(COALESCE(timestamp, created_at)) >= datetime(?)
      AND datetime(COALESCE(timestamp, created_at)) <= datetime(?)
    ORDER BY datetime(COALESCE(timestamp, created_at)) DESC
    LIMIT ?
  `, [window.since, window.until, perSourceLimit], 'platform_events', errors).map(normalizeEvent);
  const messages = queryOrEmpty(db, `
    SELECT m.id, m.conversation_id, m.subject, m.body, m.channel, m.message_type,
      m.metadata, m.attachments, m.created_at, m.from_id, m.to_id,
      from_user.username AS from_user, from_user.display_name AS from_name
    FROM messages m
    LEFT JOIN users from_user ON from_user.id = m.from_id
    WHERE datetime(m.created_at) >= datetime(?) AND datetime(m.created_at) <= datetime(?)
    ORDER BY datetime(m.created_at) DESC
    LIMIT ?
  `, [window.since, window.until, perSourceLimit], 'messages', errors).map(normalizeMessage);
  const notifications = queryOrEmpty(db, `
    SELECT id, type, title, body, source_app, link_url, read_at, created_at, user_id
    FROM notifications
    WHERE datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `, [window.since, window.until, perSourceLimit], 'notifications', errors).map(normalizeNotification);

  const all = [...events, ...messages, ...notifications]
    .filter((item) => item.timestamp && item.timestamp !== '1970-01-01T00:00:00.000Z')
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const limited = all.length > limit ? all.slice(-limit) : all;
  return {
    items: limited,
    totalMatched: all.length,
    sourceCounts: { platformEvents: events.length, messages: messages.length, notifications: notifications.length },
    errors,
    rowLimitTruncated: all.length > limit,
  };
}

function capPayload(snapshot) {
  const items = [...snapshot.items];
  let omittedForBytes = 0;
  while (items.length > 0) {
    const candidate = { ...snapshot, items, count: items.length, omittedForBytes };
    if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') <= MAX_RESPONSE_BYTES) {
      return { ...candidate, truncated: snapshot.truncated || omittedForBytes > 0 };
    }
    items.shift();
    omittedForBytes += 1;
  }
  return { ...snapshot, items: [], count: 0, omittedForBytes, truncated: true };
}

function buildSnapshot(db, query = {}, nowMs = Date.now()) {
  const window = resolveWindow(query, nowMs);
  const limit = resolveLimit(query.limit);
  const result = queryGlobalCommlink(db, window, limit);
  const snapshot = {
    schemaVersion: 'commlink.diagnostic-feed/v1',
    capturedAt: new Date(nowMs).toISOString(),
    scope: 'ecosystem-global',
    tenantIdHint: compactText(query.tenantId, 160) || null,
    sourceHint: compactText(query.source, 120) || null,
    window,
    limits: { requestedItems: limit, maxItems: MAX_LIMIT, maxResponseBytes: MAX_RESPONSE_BYTES },
    count: result.items.length,
    totalMatched: result.totalMatched,
    sourceCounts: result.sourceCounts,
    sourceErrors: result.errors,
    truncated: result.rowLimitTruncated || window.windowClamped,
    items: redactValue(result.items),
  };
  return capPayload(snapshot);
}

function databasePath(env = process.env) {
  return String(env.DATABASE_PATH || (env.NODE_ENV === 'production' || env.FLY_APP_NAME ? '/data/spmt.db' : path.join(__dirname, 'spmt.db'))).trim();
}

let diagnosticDb = null;
function getDiagnosticDb(env = process.env) {
  if (diagnosticDb) return diagnosticDb;
  diagnosticDb = new Database(databasePath(env), { readonly: true, fileMustExist: true });
  return diagnosticDb;
}

function safeJson(res, status, body) {
  return res.status(status).set('cache-control', 'private, no-store').set('x-content-type-options', 'nosniff').json(body);
}

function handleDiagnosticFeed(req, res) {
  if (!isAuthorized(req)) return safeJson(res, 401, { error: 'Unauthorized' });
  try {
    return safeJson(res, 200, buildSnapshot(getDiagnosticDb(), req.query || {}));
  } catch (error) {
    console.error('[CommlinkDiagnostic] snapshot failed:', error?.message || error);
    return safeJson(res, 503, { error: 'Commlink diagnostic snapshot unavailable' });
  }
}

function installRoutes(app) {
  if (app.__spmtCommlinkDiagnosticRoutesInstalled) return;
  app.__spmtCommlinkDiagnosticRoutesInstalled = true;
  app.get(ROUTE, handleDiagnosticFeed);
}

function patchExpress() {
  const expressPath = require.resolve('express');
  const currentExpress = require(expressPath);
  if (currentExpress.__spmtCommlinkDiagnosticFactory) return;
  function wrappedExpress(...args) {
    const app = currentExpress(...args);
    installRoutes(app);
    return app;
  }
  for (const key of Object.keys(currentExpress)) wrappedExpress[key] = currentExpress[key];
  wrappedExpress.__spmtCommlinkDiagnosticFactory = true;
  require.cache[expressPath].exports = wrappedExpress;
}

function installCommlinkDiagnosticBootstrap() {
  patchExpress();
}

module.exports = {
  ROUTE,
  DEFAULT_WINDOW_MINUTES,
  MAX_WINDOW_MINUTES,
  MAX_LIMIT,
  MAX_RESPONSE_BYTES,
  redactValue,
  isAuthorized,
  resolveWindow,
  resolveLimit,
  queryGlobalCommlink,
  buildSnapshot,
  installCommlinkDiagnosticBootstrap,
};
