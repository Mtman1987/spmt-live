import { rotateOauthRefreshToken } from './oauth-refresh';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import http from 'http';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket, WebSocketServer } from 'ws';
import { db, getDatabaseReadiness, initDb } from './db.js';
import {
  createDefaultWorkspaceProfile,
  mergeWorkspaceProfile,
  validateWorkspaceProfile,
  type WorkspaceProfileV1,
} from './workspace-profile.js';
import { migrateLegacyXpBalance } from './xp-balance-migration.js';
import { settleGambleWallet } from './xp-gamble-settlement.js';
import { SHARED_SURFACES, SHARED_SURFACE_MODES, sharedSurface } from './shared-surfaces.js';
import { discoveryStatus, reconcileEasterEggs, mergeEasterEggData, LEGACY_EGGS, EGG_DEFINITIONS } from './easter-egg-state.cjs';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.FLY_APP_NAME);
const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? '' : crypto.randomBytes(32).toString('hex'));
const APP_VERSION = '1.0.0';
const BUILD_SHA = process.env.BUILD_SHA || 'development';
const RECOVERY_DELIVERY_COOLDOWN_MS = 10 * 60 * 1000;
const OAUTH_ACCESS_TOKEN_SECONDS = 7 * 24 * 60 * 60;
const OAUTH_REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;
const EMBED_LAUNCH_CODE_SECONDS = 90;
const recoveryDeliveryAttempts = new Map<string, number>();
const OAUTH_CLIENT_SECRET_NAMES = [
  'SPACEMOUNTAIN_CLIENT_SECRET',
  'DSH_CLIENT_SECRET',
  'STREAMWEAVER_CLIENT_SECRET',
  'CHAT_TAG_CLIENT_SECRET',
  'HEARMEOUT_CLIENT_SECRET',
  'MOUNTAINVIEW_CLIENT_SECRET',
] as const;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || [
  'https://spacemountain.live',
  'https://spacemountain-live.fly.dev',
  'https://discord-stream-hub-new.fly.dev',
  'https://streamweaver-new.fly.dev',
  'https://chat-tag-new.fly.dev',
  'https://hearmeout-main.fly.dev',
  'https://mtman-machine-rotator.fly.dev',
].join(',')).split(',');

const EMBED_SCOPES_BY_CLIENT: Record<string, string[]> = {
  streamweaver: [
    'identity:read',
    'workspace:read',
    'workspace:write',
    'tts:control',
    'overlay:control',
  ],
  'discord-stream-hub': ['identity:read', 'workspace:read', 'discord:control'],
  hearmeout: ['identity:read', 'workspace:read', 'media:control', 'rooms:control'],
  'chat-tag': ['identity:read', 'game:control'],
  'spacemountain-live': ['identity:read'],
};

const OAUTH_CLIENT_CREDENTIAL_SCOPES_BY_CLIENT: Record<string, string[]> = {
  'spacemountain-live': ['xp:write'],
  streamweaver: ['entitlements:read', 'events:write', 'account-recovery:write', 'chat-tag:blacklist:read', 'jobs:read', 'jobs:write'],
  'discord-stream-hub': ['discord:control', 'athena:write'],
};

const COMPANION_ACTION_CAPABILITIES: Record<string, string> = {
  'companion.status': 'companion.status',
  'overlay.show': 'overlay.control',
  'overlay.hide': 'overlay.control',
  'popout.show': 'overlay.control',
  'popout.hide': 'overlay.control',
  'obs.scene.set': 'obs.control',
  'audio.mute': 'audio.control',
  'audio.volume': 'audio.control',
  'media.transcode': 'media.write',
  'obs.media.play': 'obs.control',
  'workflow.run': 'workflow.run',
  'diagnostics.snapshot.write': 'diagnostics.write',
};
const COMPANION_CAPABILITIES = [...new Set(Object.values(COMPANION_ACTION_CAPABILITIES))];
const companionSockets = new Map<string, WebSocket>();
const COMPANION_WORKFLOWS = new Set(['test.echo', 'audio.jingle.play', 'song.render.request']);
const COMPANION_BOOTSTRAP_SECONDS = 60 * 60;
const SPMT_SESSION_SECONDS = 30 * 24 * 60 * 60;

function companionText(value: unknown, max: number) {
  return String(value || '').trim().slice(0, max);
}

function redactCompanionDiagnosticText(value: unknown) {
  return String(value ?? '')
    .replace(/([?&](?:access_token|refresh_token|id_token|token|api_key|apikey|key|signature|jwt)=)[^&\s"'<>]+/gi, '$1[REDACTED]')
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, '$1[REDACTED]')
    .replace(/(\b(?:authorization|x-api-key|api-key)\s*[:=]\s*)([^\s,;}\]]{8,})/gi, '$1[REDACTED]')
    .replace(/(["']?(?:access_token|refresh_token|id_token|api_key|apikey|client_secret|password|authorization)["']?\s*[:=]\s*["'])([^"']+)(["'])/gi, '$1[REDACTED]$3')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]');
}

function sanitizeCompanionDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return '[TRUNCATED]';
  if (typeof value === 'string') return redactCompanionDiagnosticText(value).slice(0, 8_000);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (Array.isArray(value)) return value.slice(-500).map((item) => sanitizeCompanionDiagnosticValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 500).map(([key, item]) => [
      key.slice(0, 120),
      /(?:authorization|password|secret|token|api[_-]?key|cookie)/i.test(key)
        ? '[REDACTED]'
        : sanitizeCompanionDiagnosticValue(item, depth + 1),
    ]));
  }
  return redactCompanionDiagnosticText(value);
}

function validateCompanionPayload(action: string, value: unknown): Record<string, unknown> | null {
  const payload = value && typeof value === 'object' && !Array.isArray(value)