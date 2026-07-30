export type SpaceMountainTokenProvider = string | (() => string | Promise<string | undefined>) | undefined;

export type SpaceMountainClientOptions = {
  baseUrl?: string;
  appId?: string;
  token?: SpaceMountainTokenProvider;
  apiKey?: SpaceMountainTokenProvider;
  fetchImpl?: typeof fetch;
};

export type EventVisibility = 'private' | 'creator' | 'community' | 'public' | 'system';

export type EcosystemEventInput = {
  id?: string;
  type: string;
  version?: number;
  timestamp?: string;
  sourceApp: string;
  actor?: {
    userId?: string;
    username?: string;
    displayName?: string;
  };
  visibility?: EventVisibility;
  payload?: Record<string, unknown>;
  links?: Array<{
    label: string;
    url: string;
    kind: 'launch' | 'details' | 'manage' | 'external';
  }>;
};

export type NotificationInput = {
  to?: string;
  toId?: string;
  title: string;
  body: string;
  sourceApp?: string;
  linkUrl?: string;
};

export type CommlinkDestinationV1 = {
  platform: 'twitch' | 'discord' | 'kick' | 'youtube';
  channelId: string;
  channelName: string;
};

export type CommlinkDispatchInputV1 = {
  idempotencyKey: string;
  action?: 'compose' | 'reply' | 'timeout' | 'delete';
  destinations: CommlinkDestinationV1[];
  message?: string;
  eventId?: string;
  durationSeconds?: number;
};

export type CommlinkDispatchReceiptV1 = {
  id: string;
  groupId: string;
  idempotencyKey: string;
  action: NonNullable<CommlinkDispatchInputV1['action']>;
  destination: CommlinkDestinationV1;
  status: 'dispatching' | 'delivered' | 'failed';
  error?: { code: string; message: string } | null;
  duplicate: boolean;
  retryOf?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommlinkDispatchGroupV1 = {
  version: 'commlink-dispatch-group.v1';
  groupId: string;
  status: 'delivered' | 'partial' | 'failed';
  delivered: number;
  failed: number;
  receipts: CommlinkDispatchReceiptV1[];
};

export type AthenaMemoryInput = {
  topic: string;
  content: string;
  sourceApp?: string;
  scope?: string;
};

export type WebhookInput = {
  url: string;
  events: string[];
};

export type AppSubmissionInput = {
  appId: string;
  name: string;
  description: string;
  category?: string;
  launchUrl: string;
  authUrl?: string;
  healthUrl?: string;
  iconUrl?: string;
  version?: string;
  permissions?: string[];
};

export type GameEventOptions = {
  sourceApp?: string;
  visibility?: EventVisibility;
  actor?: EcosystemEventInput['actor'];
  links?: EcosystemEventInput['links'];
  version?: number;
  timestamp?: string;
};

export type AppStateInput = {
  schemaVersion?: number;
  revision?: number;
  data: Record<string, unknown>;
};

export type WorkspaceAppearanceV1 = {
  themeId: string;
  glowIntensity: number;
  starDensity: number;
  glassOpacity: number;
  blurStrength: number;
  nebulaIntensity: number;
  parallaxDepth: number;
  borderStrength: number;
  cornerRadius: 'sm' | 'md' | 'lg' | 'full';
  density: 'compact' | 'comfortable' | 'spacious';
  sidebarCollapsed: boolean;
  sidebarStyle: 'docked' | 'floating' | 'hidden';
  sidebarPosition: 'left' | 'right';
  topbarStyle: 'transparent' | 'glass';
  tabStyle: 'pills' | 'underline' | 'cards';
  tabPosition: 'top' | 'bottom' | 'left' | 'right';
  chatTransparency: number;
  showAvatars: boolean;
  smoothTransitions: boolean;
  pushToTalk: boolean;
  animation: { enabled: boolean; speed: number; particles: boolean; shootingStars: boolean };
};

export type WorkspaceDockSlotV1 = {
  id: 1 | 2 | 3;
  title: string;
  url: string;
  collapsed: boolean;
  volume: number;
  muted: boolean;
};

export type WorkspaceOverlayWidgetV1 = {
  id: string;
  title: string;
  kind: 'chat' | 'media' | 'avatar' | 'audio' | 'custom';
  url: string;
  visible: boolean;
  locked: boolean;
  interactive: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
};

export type WorkspaceOverlayWorkflowV1 = {
  id: string;
  trigger: string;
  condition: string;
  action: string;
  destination: string;
  enabled: boolean;
};

export type WorkspaceOverlayLayoutV1 = {
  enabled: boolean;
  widgets: WorkspaceOverlayWidgetV1[];
  workflows: WorkspaceOverlayWorkflowV1[];
};

export type WorkspaceProfileV1 = {
  schemaVersion: 1;
  revision: number;
  appearance: WorkspaceAppearanceV1;
  dockSlots: WorkspaceDockSlotV1[];
  activeOverlaySceneId: string | null;
  ttsSubscriptions: string[];
  appThemeMappings: Record<string, string>;
  updatedAt: string;
};

export type WorkspaceThemeTokensV1 = {
  schemaVersion: 1;
  followWorkspace: boolean;
  themeId: string;
  background: string;
  surface: string;
  text: string;
  accent: string;
  radius: string;
  density: string;
  motion: { enabled: boolean; speed: number; particles: boolean; shootingStars: boolean };
  appearance: WorkspaceAppearanceV1;
  dockSlots: WorkspaceDockSlotV1[];
  activeOverlaySceneId: string | null;
  overlayWorkspace: WorkspaceOverlayLayoutV1 | null;
  ttsSubscriptions: string[];
  appThemeMappings: Record<string, string>;
};

export const COMPANION_CAPABILITIES_V1 = [
  'companion.status',
  'overlay.read',
  'overlay.control',
  'obs.read',
  'obs.control',
  'audio.read',
  'audio.control',
  'media.read',
  'media.write',
  'rooms.control',
  'tts.control',
  'workflow.run',
] as const;

export type CompanionCapabilityV1 = typeof COMPANION_CAPABILITIES_V1[number];

export const COMPANION_ACTION_CAPABILITY_V1 = {
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
} as const satisfies Record<string, CompanionCapabilityV1>;

export type CompanionActionV1 = keyof typeof COMPANION_ACTION_CAPABILITY_V1;

export type CompanionCommandV1 = {
  schemaVersion: 1;
  id: string;
  issuedAt: string;
  expiresAt: string;
  userId: string;
  deviceId: string;
  source: 'spmt' | 'spacemountain' | 'discord-activity' | 'streamweaver' | 'hearmeout' | string;
  capability: CompanionCapabilityV1;
  action: CompanionActionV1;
  payload: Record<string, unknown>;
  requiresConfirmation: boolean;
  status?: 'queued' | 'sent' | 'completed' | 'failed' | 'expired';
};

export type CompanionDeviceV1 = {
  id: string;
  name: string;
  capabilities: CompanionCapabilityV1[];
  status: 'online' | 'offline' | 'revoked' | string;
  lastSeenAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export function validateCompanionCommandV1(input: unknown):
  | { ok: true; command: CompanionCommandV1 }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const command = input as Partial<CompanionCommandV1> | null;
  if (!command || typeof command !== 'object') return { ok: false, errors: ['command must be an object'] };
  requireLiteral(command.schemaVersion, 1, 'schemaVersion', errors);
  requireString(command.id, 'id', errors);
  requireString(command.userId, 'userId', errors);
  requireString(command.deviceId, 'deviceId', errors);
  requireString(command.source, 'source', errors);
  requireIsoTimestamp(command.issuedAt, 'issuedAt', errors);
  requireIsoTimestamp(command.expiresAt, 'expiresAt', errors);
  const capability = String(command.capability || '') as CompanionCapabilityV1;
  const action = String(command.action || '') as CompanionActionV1;
  if (!COMPANION_CAPABILITIES_V1.includes(capability)) errors.push('capability is not supported');
  if (!(action in COMPANION_ACTION_CAPABILITY_V1)) errors.push('action is not supported');
  if (action in COMPANION_ACTION_CAPABILITY_V1 && COMPANION_ACTION_CAPABILITY_V1[action] !== capability) {
    errors.push('capability does not authorize action');
  }
  if (!command.payload || typeof command.payload !== 'object' || Array.isArray(command.payload)) errors.push('payload must be an object');
  if (typeof command.requiresConfirmation !== 'boolean') errors.push('requiresConfirmation must be boolean');
  return errors.length ? { ok: false, errors } : { ok: true, command: command as CompanionCommandV1 };
}

export type SharedChatPlatformV1 = 'twitch' | 'discord' | 'kick' | 'youtube' | 'social-stream' | 'spmt' | 'app' | 'unknown';

export type SharedChatEventTypeV1 =
  | 'message'
  | 'reply'
  | 'donation'
  | 'membership'
  | 'reward'
  | 'follow'
  | 'raid'
  | 'system'
  | 'edit'
  | 'delete';

export type SharedChatSenderV1 = {
  id: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  badges?: string[];
  roles?: string[];
};

export type SharedChatMediaV1 = {
  type: 'image' | 'video' | 'audio' | 'sticker' | 'emote' | 'link';
  url: string;
  label?: string;
  mimeType?: string;
};

export type SharedChatMoneyV1 = {
  amount: number;
  currency: string;
  label?: string;
};

export type SharedChatReplyContextV1 = {
  eventId?: string;
  upstreamId?: string;
  senderId?: string;
  textPreview?: string;
};

export type SharedChatRoutingV1 = {
  reflected?: boolean;
  replayed?: boolean;
  canReply?: boolean;
  replyTargetId?: string;
  botReadable?: boolean;
  botCanReply?: boolean;
};

export type SharedChatEventV1 = {
  schemaVersion: 1;
  eventId: string;
  upstreamId: string;
  tenantId: string;
  platform: SharedChatPlatformV1;
  sourceId: string;
  sourceName?: string;
  channelId: string;
  channelName?: string;
  type: SharedChatEventTypeV1;
  sender: SharedChatSenderV1;
  text: string;
  sanitizedHtml?: string;
  media?: SharedChatMediaV1[];
  links?: Array<{ url: string; label?: string }>;
  donation?: SharedChatMoneyV1;
  membership?: { tier?: string; months?: number; label?: string };
  reward?: { id?: string; title: string; cost?: number };
  replyTo?: SharedChatReplyContextV1;
  originalTimestamp: string;
  receivedTimestamp: string;
  editedTimestamp?: string;
  deletedTimestamp?: string;
  meta?: Record<string, unknown>;
  dedupeKey?: string;
  routing?: SharedChatRoutingV1;
};

export type SharedChatEventValidationResult =
  | { ok: true; event: SharedChatEventV1 }
  | { ok: false; errors: string[] };

const SHARED_CHAT_PLATFORMS: SharedChatPlatformV1[] = ['twitch', 'discord', 'kick', 'youtube', 'social-stream', 'spmt', 'app', 'unknown'];
const SHARED_CHAT_EVENT_TYPES: SharedChatEventTypeV1[] = ['message', 'reply', 'donation', 'membership', 'reward', 'follow', 'raid', 'system', 'edit', 'delete'];

export function validateSharedChatEventV1(input: unknown): SharedChatEventValidationResult {
  const errors: string[] = [];
  const event = input as Partial<SharedChatEventV1> | null | undefined;
  if (!event || typeof event !== 'object') {
    return { ok: false, errors: ['event must be an object'] };
  }

  requireLiteral(event.schemaVersion, 1, 'schemaVersion', errors);
  requireString(event.eventId, 'eventId', errors);
  requireString(event.upstreamId, 'upstreamId', errors);
  requireString(event.tenantId, 'tenantId', errors);
  requireString(event.sourceId, 'sourceId', errors);
  requireString(event.channelId, 'channelId', errors);
  requireString(event.text, 'text', errors);
  requireIsoTimestamp(event.originalTimestamp, 'originalTimestamp', errors);
  requireIsoTimestamp(event.receivedTimestamp, 'receivedTimestamp', errors);
  if (!SHARED_CHAT_PLATFORMS.includes(event.platform as SharedChatPlatformV1)) errors.push('platform is not supported');
  if (!SHARED_CHAT_EVENT_TYPES.includes(event.type as SharedChatEventTypeV1)) errors.push('type is not supported');

  if (!event.sender || typeof event.sender !== 'object') {
    errors.push('sender must be an object');
  } else {
    requireString(event.sender.id, 'sender.id', errors);
    if (event.sender.badges && !isStringArray(event.sender.badges)) errors.push('sender.badges must be strings');
    if (event.sender.roles && !isStringArray(event.sender.roles)) errors.push('sender.roles must be strings');
  }

  if (event.media && (!Array.isArray(event.media) || event.media.some((item) => !item || typeof item !== 'object' || !isNonEmptyString(item.url)))) {
    errors.push('media items must include url');
  }
  if (event.links && (!Array.isArray(event.links) || event.links.some((item) => !item || typeof item !== 'object' || !isNonEmptyString(item.url)))) {
    errors.push('links items must include url');
  }
  if (event.donation && (!Number.isFinite(event.donation.amount) || !isNonEmptyString(event.donation.currency))) {
    errors.push('donation requires finite amount and currency');
  }
  if (event.reward && !isNonEmptyString(event.reward.title)) {
    errors.push('reward.title is required when reward is present');
  }

  return errors.length ? { ok: false, errors } : { ok: true, event: event as SharedChatEventV1 };
}

export function isSharedChatEventV1(input: unknown): input is SharedChatEventV1 {
  return validateSharedChatEventV1(input).ok;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function requireString(value: unknown, field: string, errors: string[]): void {
  if (!isNonEmptyString(value)) errors.push(`${field} is required`);
}

function requireLiteral(value: unknown, expected: unknown, field: string, errors: string[]): void {
  if (value !== expected) errors.push(`${field} must equal ${String(expected)}`);
}

function requireIsoTimestamp(value: unknown, field: string, errors: string[]): void {
  if (!isNonEmptyString(value) || Number.isNaN(Date.parse(value))) errors.push(`${field} must be an ISO timestamp`);
}

const THEME_PALETTES: Record<string, Pick<WorkspaceThemeTokensV1, 'background' | 'surface' | 'text' | 'accent'>> = {
  'solar-flare': { background: '#080b14', surface: '#171321', text: '#f8fafc', accent: '#ff8a3d' },
  'nebula-purple': { background: '#090712', surface: '#1d1530', text: '#f8f4ff', accent: '#a855f7' },
  'oceanic-blue': { background: '#06111a', surface: '#0c2535', text: '#effaff', accent: '#22d3ee' },
  'aurora-green': { background: '#07110d', surface: '#10291e', text: '#f0fdf4', accent: '#34d399' },
};

export function workspaceThemeTokens(
  profile: WorkspaceProfileV1,
  appId: string,
  overlayWorkspace: WorkspaceOverlayLayoutV1 | null = null,
): WorkspaceThemeTokensV1 {
  const mapping = String(profile.appThemeMappings?.[appId] || 'follow-workspace');
  const followWorkspace = mapping === 'follow-workspace';
  const themeId = followWorkspace ? profile.appearance.themeId : mapping;
  const palette = THEME_PALETTES[themeId] || THEME_PALETTES['solar-flare'];
  return {
    schemaVersion: 1,
    followWorkspace,
    themeId,
    ...palette,
    radius: profile.appearance.cornerRadius,
    density: profile.appearance.density,
    motion: { ...profile.appearance.animation },
    appearance: { ...profile.appearance },
    dockSlots: profile.dockSlots.map((slot) => ({ ...slot })),
    activeOverlaySceneId: profile.activeOverlaySceneId,
    overlayWorkspace: overlayWorkspace ? {
      enabled: overlayWorkspace.enabled !== false,
      widgets: Array.isArray(overlayWorkspace.widgets) ? overlayWorkspace.widgets.map((widget) => ({ ...widget })) : [],
      workflows: Array.isArray(overlayWorkspace.workflows) ? overlayWorkspace.workflows.map((workflow) => ({ ...workflow })) : [],
    } : null,
    ttsSubscriptions: [...profile.ttsSubscriptions],
    appThemeMappings: { ...profile.appThemeMappings },
  };
}

export const SPMT_XP_LEDGER_SCHEMA_VERSION = 1 as const;

export const SPMT_XP_EVENT_MAP_V1 = {
  'chat-tag.tag': { sourceApp: 'chat-tag', eventType: 'chat-tag-tag', defaultDelta: 100 },
  'chat-tag.pass': { sourceApp: 'chat-tag', eventType: 'chat-tag-pass', defaultDelta: 200 },
  'chat-tag.bingo.square': { sourceApp: 'chat-tag', eventType: 'chat-tag-bingo-square', defaultDelta: 10 },
  'chat-tag.bingo.win': { sourceApp: 'chat-tag', eventType: 'chat-tag-bingo-win', defaultDelta: 250 },
  'dsh.discord.message': { sourceApp: 'discord-stream-hub', eventType: 'dsh-discord-message', defaultDelta: 1 },
  'dsh.twitch.message': { sourceApp: 'discord-stream-hub', eventType: 'dsh-twitch-message', defaultDelta: 10 },
  'dsh.twitch.follow': { sourceApp: 'discord-stream-hub', eventType: 'dsh-twitch-follow', defaultDelta: 25 },
  'dsh.twitch.raid': { sourceApp: 'discord-stream-hub', eventType: 'dsh-twitch-raid', defaultDelta: 50 },
  'dsh.twitch.sub': { sourceApp: 'discord-stream-hub', eventType: 'dsh-twitch-sub', defaultDelta: 100 },
  'spacemountain.tool.trigger': { sourceApp: 'spacemountain', eventType: 'spacemountain-tool-trigger', defaultDelta: 5 },
  'spacemountain.arena.kill': { sourceApp: 'spacemountain', eventType: 'spacemountain-arena-kill', defaultDelta: 1 },
} as const;

export type XpMappedEventTypeV1 = keyof typeof SPMT_XP_EVENT_MAP_V1;

export type XpLedgerMetadataV1 = {
  schemaVersion?: 1;
  tenantId?: string;
  sourceId?: string;
  sourceName?: string;
  channelId?: string;
  channelName?: string;
  upstreamEventId?: string;
  reason?: string;
  summary?: string;
  [key: string]: unknown;
};

export type XpAwardInput = {
  userId: string;
  eventType: string;
  idempotencyKey: string;
  delta: number;
  sourceApp?: string;
  metadata?: XpLedgerMetadataV1;
};

export type XpLedgerEntryV1 = {
  id: string;
  userId?: string;
  sourceApp: string;
  eventType: string;
  delta: number;
  metadata: XpLedgerMetadataV1;
  createdAt: string;
};

export type XpAwardResultV1 = {
  awarded: boolean;
  duplicate: boolean;
  entry: XpLedgerEntryV1;
};

export type XpBalanceV1 = {
  xp: number;
  level: number;
  entries: XpLedgerEntryV1[];
};

export type XpAwardValidationResult =
  | { ok: true; award: XpAwardInput }
  | { ok: false; errors: string[] };

export function buildXpIdempotencyKey(parts: {
  sourceApp: string;
  eventType: string;
  upstreamEventId: string;
  userId: string;
}): string {
  return [
    cleanXpKeyPart(parts.sourceApp),
    cleanXpKeyPart(parts.eventType),
    cleanXpKeyPart(parts.upstreamEventId),
    cleanXpKeyPart(parts.userId),
  ].join(':').slice(0, 200);
}

export function mappedXpAwardV1(input: {
  userId: string;
  mappedEventType: XpMappedEventTypeV1;
  upstreamEventId: string;
  deltaOverride?: number;
  metadata?: XpLedgerMetadataV1;
}): XpAwardInput {
  const mapping = SPMT_XP_EVENT_MAP_V1[input.mappedEventType];
  return {
    userId: input.userId,
    sourceApp: mapping.sourceApp,
    eventType: mapping.eventType,
    idempotencyKey: buildXpIdempotencyKey({
      sourceApp: mapping.sourceApp,
      eventType: mapping.eventType,
      upstreamEventId: input.upstreamEventId,
      userId: input.userId,
    }),
    delta: input.deltaOverride ?? mapping.defaultDelta,
    metadata: { schemaVersion: SPMT_XP_LEDGER_SCHEMA_VERSION, upstreamEventId: input.upstreamEventId, ...input.metadata },
  };
}

export function validateXpAwardV1(input: unknown): XpAwardValidationResult {
  const errors: string[] = [];
  const award = input as Partial<XpAwardInput> | null | undefined;
  if (!award || typeof award !== 'object') return { ok: false, errors: ['award must be an object'] };
  requireString(award.userId, 'userId', errors);
  requireString(award.eventType, 'eventType', errors);
  requireString(award.idempotencyKey, 'idempotencyKey', errors);
  if (isNonEmptyString(award.idempotencyKey) && award.idempotencyKey.length > 200) errors.push('idempotencyKey must be 200 characters or fewer');
  if (!Number.isInteger(award.delta) || Math.abs(Number(award.delta)) > 10000) errors.push('delta must be an integer from -10000 to 10000');
  if (award.sourceApp !== undefined) requireString(award.sourceApp, 'sourceApp', errors);
  if (award.metadata !== undefined && (!award.metadata || typeof award.metadata !== 'object' || Array.isArray(award.metadata))) errors.push('metadata must be an object');
  return errors.length ? { ok: false, errors } : { ok: true, award: award as XpAwardInput };
};

function cleanXpKeyPart(value: unknown): string {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

export type GrandfatherIdentityInput = {
  provider: 'discord' | 'twitch';
  providerUserId: string;
  providerUsername?: string;
  username?: string;
  displayName?: string;
  issueSession?: boolean;
};

export class SpaceMountainApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.name = 'SpaceMountainApiError';
    this.status = status;
    this.data = data;
  }
}

export class SpaceMountainClient {
  readonly baseUrl: string;
  readonly appId?: string;
  private readonly token?: SpaceMountainTokenProvider;
  private readonly apiKey?: SpaceMountainTokenProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SpaceMountainClientOptions = {}) {
    this.baseUrl = (options.baseUrl || 'https://spmt.live').replace(/\/$/, '');
    this.appId = options.appId;
    this.token = options.token;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  identity = {
    me: () => this.request('/api/me'),
    platformMe: () => this.request('/api/platform/me', { authMode: 'apiKey' }),
    refresh: () => this.request('/api/auth/refresh', { method: 'POST' }),
    claimImported: (password: string) => this.request('/api/auth/claim-imported', { method: 'POST', body: { password } }),
    grandfather: (input: GrandfatherIdentityInput) => this.request('/api/platform/identity/grandfather', { method: 'POST', authMode: 'apiKey', body: input }),
  };

  apps = {
    list: () => this.request('/api/apps'),
    publicList: () => this.request('/api/platform/apps/public', { authMode: 'apiKey' }),
    get: (appId: string) => this.request(`/api/apps/${encodeURIComponent(appId)}`),
    install: (appId: string) => this.request(`/api/apps/${encodeURIComponent(appId)}/install`, { method: 'POST' }),
    disable: (appId: string) => this.request(`/api/apps/${encodeURIComponent(appId)}/disable`, { method: 'POST' }),
  };

  developer = {
    verifyKey: () => this.request('/api/platform/api-keys/verify', { method: 'POST', authMode: 'apiKey' }),
    submitApp: (input: AppSubmissionInput) => this.request('/api/platform/apps/submit', {
      method: 'POST',
      authMode: 'apiKey',
      body: input,
    }),
    submissions: () => this.request('/api/platform/apps/submissions', { authMode: 'apiKey' }),
  };

  events = {
    publish: (event: EcosystemEventInput) => this.request('/api/platform/events', {
      method: 'POST',
      authMode: 'apiKey',
      body: {
        visibility: 'creator',
        payload: {},
        ...event,
      },
    }),
    publishAsUser: (event: EcosystemEventInput) => this.request('/api/events', {
      method: 'POST',
      body: {
        visibility: 'creator',
        payload: {},
        ...event,
      },
    }),
    list: (limit = 50) => this.request(`/api/platform/events?limit=${encodeURIComponent(String(limit))}`, { authMode: 'apiKey' }),
  };

  game = {
    publish: (eventType: string, payload: Record<string, unknown> = {}, options: GameEventOptions = {}) => {
      const normalizedType = String(eventType || '').trim().toLowerCase();
      const type = normalizedType.startsWith('game.') ? normalizedType : `game.${normalizedType}`;
      const sourceApp = options.sourceApp || this.appId;
      if (!sourceApp) throw new Error('appId is required in the client options or game event options');
      return this.events.publish({
        type,
        sourceApp,
        payload,
        visibility: options.visibility || 'creator',
        actor: options.actor,
        links: options.links,
        version: options.version,
        timestamp: options.timestamp,
      });
    },
    list: (limit = 50) => this.events.list(limit),
  };

  workspace = {
    profile: () => this.request('/api/workspace-profile') as Promise<{ profile: WorkspaceProfileV1 }>,
    patchProfile: (profile: Partial<WorkspaceProfileV1>, revision: number) => this.request('/api/workspace-profile', { method: 'PATCH', body: { profile, revision } }) as Promise<{ profile: WorkspaceProfileV1 }>,
    replaceProfile: (profile: WorkspaceProfileV1, revision: number) => this.request('/api/workspace-profile', { method: 'PUT', body: { profile, revision } }) as Promise<{ profile: WorkspaceProfileV1 }>,
    resetProfile: (revision: number) => this.request('/api/workspace-profile/reset', { method: 'POST', body: { revision } }) as Promise<{ profile: WorkspaceProfileV1 }>,
    themeTokens: async (appId = this.appId || '') => {
      if (!appId) throw new Error('appId is required to derive workspace theme tokens');
      const [profileResponse, overlayResponse] = await Promise.all([
        this.request('/api/workspace-profile') as Promise<{ profile: WorkspaceProfileV1 }>,
        this.request('/api/overlay-workspace') as Promise<{ layout: WorkspaceOverlayLayoutV1 | null }>,
      ]);
      return workspaceThemeTokens(profileResponse.profile, appId, overlayResponse.layout);
    },
    overlayWorkspace: () => this.request('/api/overlay-workspace') as Promise<{ layout: WorkspaceOverlayLayoutV1 | null; updatedAt: string | null }>,
    overlayScenes: () => this.request('/api/workspace/overlay-scenes'),
    workflows: () => this.request('/api/workspace/workflows'),
    saveOverlayScene: (id: string, input: { name: string; revision?: number; data: Record<string, unknown> }) => this.request(`/api/workspace/overlay-scenes/${encodeURIComponent(id)}`, { method: 'PUT', body: input }),
    saveWorkflow: (id: string, input: { name: string; revision?: number; data: Record<string, unknown> }) => this.request(`/api/workspace/workflows/${encodeURIComponent(id)}`, { method: 'PUT', body: input }),
  };

  appState = {
    get: (appId: string, namespace: string) => this.request(`/api/app-state/${encodeURIComponent(appId)}/${encodeURIComponent(namespace)}`),
    put: (appId: string, namespace: string, input: AppStateInput) => this.request(`/api/app-state/${encodeURIComponent(appId)}/${encodeURIComponent(namespace)}`, { method: 'PUT', body: input }),
  };

  companion = {
    capabilities: () => this.request('/api/companion/capabilities'),
    devices: () => this.request('/api/companion/devices') as Promise<{ devices: CompanionDeviceV1[] }>,
    pair: (input: { name?: string; capabilities?: CompanionCapabilityV1[] } = {}) =>
      this.request('/api/companion/devices/pair', { method: 'POST', body: input }) as Promise<{
        device: CompanionDeviceV1;
        pairingToken: string;
        relayUrl: string;
      }>,
    revoke: (deviceId: string) =>
      this.request(`/api/companion/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }),
    command: (input: {
      deviceId: string;
      action: CompanionActionV1;
      payload?: Record<string, unknown>;
      source?: CompanionCommandV1['source'];
      requiresConfirmation?: boolean;
    }) => {
      const capability = COMPANION_ACTION_CAPABILITY_V1[input.action];
      return this.request('/api/companion/commands', {
        method: 'POST',
        body: { ...input, capability },
      }) as Promise<{ command: CompanionCommandV1 }>;
    },
    commandStatus: (commandId: string) =>
      this.request(`/api/companion/commands/${encodeURIComponent(commandId)}`) as Promise<{ command: CompanionCommandV1 }>,
  };

  experience = {
    balance: () => this.request('/api/xp') as Promise<XpBalanceV1>,
    award: (input: XpAwardInput) => {
      const body = { sourceApp: input.sourceApp || this.appId, ...input };
      const validation = validateXpAwardV1(body);
      if (validation.ok === false) throw new Error(`Invalid XP award: ${validation.errors.join('; ')}`);
      return this.request('/api/platform/xp', {
        method: 'POST',
        authMode: 'apiKey',
        body,
      }) as Promise<XpAwardResultV1>;
    },
  };

  commlink = {
    notify: (input: NotificationInput) => this.request('/api/system/message', {
      method: 'POST',
      body: {
        to: input.to || input.toId,
        subject: input.title,
        body: input.body,
        sourceApp: input.sourceApp,
        linkUrl: input.linkUrl,
        type: 'notification',
      },
    }),
    messages: () => this.request('/api/messages'),
    notifications: () => this.request('/api/notifications'),
    dispatch: (input: CommlinkDispatchInputV1) => this.request('/api/commlink/dispatch', {
      method: 'POST',
      body: input,
    }) as Promise<CommlinkDispatchGroupV1>,
    dispatchAsApp: (input: CommlinkDispatchInputV1) => this.request('/api/platform/commlink/dispatch', {
      method: 'POST',
      authMode: 'apiKey',
      body: input,
    }) as Promise<CommlinkDispatchGroupV1>,
    retryFailed: (groupId: string) => this.request(`/api/commlink/dispatch/${encodeURIComponent(groupId)}/retry`, {
      method: 'POST',
    }) as Promise<CommlinkDispatchGroupV1>,
  };

  athena = {
    remember: (input: AthenaMemoryInput) => this.request('/api/athena/memory', {
      method: 'POST',
      body: input,
    }),
    context: () => this.request('/api/athena/context'),
    command: (command: string, context?: Record<string, unknown>) => this.request('/api/athena/commands', {
      method: 'POST',
      body: { command, context },
    }),
  };

  webhooks = {
    list: () => this.request('/api/platform/webhooks'),
    create: (input: WebhookInput) => this.request('/api/platform/webhooks', {
      method: 'POST',
      body: input,
    }),
  };

  private async resolveToken(provider: SpaceMountainTokenProvider) {
    if (!provider) return undefined;
    return typeof provider === 'function' ? provider() : provider;
  }

  private async request(path: string, options: {
    method?: string;
    body?: unknown;
    authMode?: 'user' | 'apiKey';
  } = {}) {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    const authMode = options.authMode || 'user';
    const token = await this.resolveToken(authMode === 'apiKey' ? this.apiKey : this.token);
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: options.method || (options.body === undefined ? 'GET' : 'POST'),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
    });

    const text = await response.text();
    const data = text ? safeJson(text) : null;
    if (!response.ok) {
      const message = typeof data === 'object' && data && 'error' in data
        ? String((data as any).error?.message || (data as any).error)
        : `SPMT request failed with ${response.status}`;
      throw new SpaceMountainApiError(response.status, message, data);
    }
    return data;
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export { SpaceMountainClient as SpaceMountain };
