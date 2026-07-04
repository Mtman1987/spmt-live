export type SpaceMountainTokenProvider = string | (() => string | Promise<string | undefined>) | undefined;

export type SpaceMountainClientOptions = {
  baseUrl?: string;
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
  private readonly token?: SpaceMountainTokenProvider;
  private readonly apiKey?: SpaceMountainTokenProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SpaceMountainClientOptions = {}) {
    this.baseUrl = (options.baseUrl || 'https://spmt.live').replace(/\/$/, '');
    this.token = options.token;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  identity = {
    me: () => this.request('/api/me'),
    platformMe: () => this.request('/api/platform/me', { authMode: 'apiKey' }),
    refresh: () => this.request('/api/auth/refresh', { method: 'POST' }),
  };

  apps = {
    list: () => this.request('/api/apps'),
    publicList: () => this.request('/api/platform/apps/public', { authMode: 'apiKey' }),
    get: (appId: string) => this.request(`/api/apps/${encodeURIComponent(appId)}`),
    install: (appId: string) => this.request(`/api/apps/${encodeURIComponent(appId)}/install`, { method: 'POST' }),
    disable: (appId: string) => this.request(`/api/apps/${encodeURIComponent(appId)}/disable`, { method: 'POST' }),
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
