export const SHARED_SURFACE_MODES = ['full', 'panel', 'dock', 'compact', 'overlay'] as const;
export type SharedSurfaceMode = typeof SHARED_SURFACE_MODES[number];

export type SharedSurfaceDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string;
  path: string;
  modes: SharedSurfaceMode[];
  scopes: string[];
  dataSources: string[];
  status: 'ready' | 'beta';
};

export const SHARED_SURFACES: SharedSurfaceDefinition[] = [
  {
    id: 'commlink',
    name: 'Commlink',
    description: 'Account-scoped conversations, connected provider feeds, and deliberate dispatch.',
    icon: 'messages-square',
    path: '/embed/commlink',
    modes: ['full', 'panel', 'dock', 'compact', 'overlay'],
    scopes: ['messages:read', 'messages:write'],
    dataSources: ['/api/commlink/feed', '/api/conversations', '/api/messages'],
    status: 'ready',
  },
  {
    id: 'settings',
    name: 'Universal Settings',
    description: 'One appearance, accessibility, voice, motion, and layout profile shared by every app.',
    icon: 'sliders-horizontal',
    path: '/embed/settings',
    modes: ['full', 'panel', 'dock', 'compact'],
    scopes: ['workspace:read', 'workspace:write'],
    dataSources: ['/api/workspace-profile'],
    status: 'ready',
  },
  {
    id: 'worktray',
    name: 'Worktray',
    description: 'A repeatable launcher for shared surfaces and app-provided components.',
    icon: 'panel-top-open',
    path: '/embed/worktray',
    modes: ['panel', 'dock', 'compact'],
    scopes: ['apps:read'],
    dataSources: ['/api/platform/surfaces', '/api/platform/components'],
    status: 'ready',
  },
  {
    id: 'notifications',
    name: 'Notifications',
    description: 'A universal, account-scoped notification center for the full ecosystem.',
    icon: 'bell',
    path: '/embed/notifications',
    modes: ['full', 'panel', 'dock', 'compact', 'overlay'],
    scopes: ['messages:read'],
    dataSources: ['/api/notifications'],
    status: 'ready',
  },
  {
    id: 'profile',
    name: 'Profile',
    description: 'SPMT identity, linked providers, and the universal account card.',
    icon: 'circle-user-round',
    path: '/embed/profile',
    modes: ['full', 'panel', 'compact'],
    scopes: ['identity:read'],
    dataSources: ['/api/me', '/api/session/bridge'],
    status: 'ready',
  },
  {
    id: 'overlays',
    name: 'Overlay Bay',
    description: 'Shared scenes, widgets, and outputs for streaming and companion surfaces.',
    icon: 'panels-top-left',
    path: '/embed/overlays',
    modes: ['full', 'panel', 'dock', 'overlay'],
    scopes: ['workspace:read', 'overlay:control'],
    dataSources: ['/api/workspace/overlay-scenes', '/api/overlay-workspace'],
    status: 'beta',
  },
];

export function sharedSurface(id: unknown) {
  const normalized = String(id || '').trim().toLowerCase();
  return SHARED_SURFACES.find((surface) => surface.id === normalized) || null;
}

