export const WORKSPACE_PROFILE_SCHEMA_VERSION = 1 as const;

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
  animation: {
    enabled: boolean;
    speed: number;
    particles: boolean;
    shootingStars: boolean;
  };
};

export type WorkspaceDockSlotV1 = {
  id: 1 | 2 | 3;
  title: string;
  url: string;
  collapsed: boolean;
  volume: number;
  muted: boolean;
};

export type WorkspaceProfileV1 = {
  schemaVersion: typeof WORKSPACE_PROFILE_SCHEMA_VERSION;
  revision: number;
  appearance: WorkspaceAppearanceV1;
  dockSlots: WorkspaceDockSlotV1[];
  activeOverlaySceneId: string | null;
  ttsSubscriptions: string[];
  appThemeMappings: Record<string, string>;
  updatedAt: string;
};

export type WorkspaceProfileValidation = {
  profile: WorkspaceProfileV1;
  fields: Record<string, string>;
};

const THEME_IDS = new Set(['solar-flare', 'nebula-purple', 'oceanic-blue', 'aurora-green']);
const CORNER_RADII = new Set(['sm', 'md', 'lg', 'full']);
const DENSITIES = new Set(['compact', 'comfortable', 'spacious']);
const SIDEBAR_STYLES = new Set(['docked', 'floating', 'hidden']);
const SIDEBAR_POSITIONS = new Set(['left', 'right']);
const TOPBAR_STYLES = new Set(['transparent', 'glass']);
const TAB_STYLES = new Set(['pills', 'underline', 'cards']);
const TAB_POSITIONS = new Set(['top', 'bottom', 'left', 'right']);
const SENSITIVE_URL_KEYS = /^(?:access_?token|api_?key|auth|authorization|key|password|secret|session|token)$/i;

export function createDefaultWorkspaceProfile(now = new Date().toISOString(), themeId = 'solar-flare'): WorkspaceProfileV1 {
  return {
    schemaVersion: WORKSPACE_PROFILE_SCHEMA_VERSION,
    revision: 1,
    appearance: {
      themeId: THEME_IDS.has(themeId) ? themeId : 'solar-flare',
      glowIntensity: 80,
      starDensity: 70,
      glassOpacity: 65,
      blurStrength: 22,
      nebulaIntensity: 80,
      parallaxDepth: 65,
      borderStrength: 60,
      cornerRadius: 'md',
      density: 'comfortable',
      sidebarCollapsed: false,
      sidebarStyle: 'docked',
      sidebarPosition: 'left',
      topbarStyle: 'transparent',
      tabStyle: 'pills',
      tabPosition: 'top',
      chatTransparency: 65,
      showAvatars: true,
      smoothTransitions: true,
      pushToTalk: true,
      animation: { enabled: true, speed: 85, particles: true, shootingStars: true },
    },
    dockSlots: [
      { id: 1, title: 'ChatTag Overlay', url: 'https://chat-tag-new.fly.dev/overlay', collapsed: true, volume: 1, muted: false },
      { id: 2, title: 'Quackverse Game', url: 'https://spacemountain.live/chat-tag/quackverse', collapsed: false, volume: 1, muted: false },
      { id: 3, title: 'DSH Dashboard', url: 'https://discord-stream-hub-new.fly.dev/dashboard', collapsed: true, volume: 1, muted: false },
    ],
    activeOverlaySceneId: null,
    ttsSubscriptions: [],
    appThemeMappings: {},
    updatedAt: now,
  };
}

export function mergeWorkspaceProfile(current: WorkspaceProfileV1, patch: any): any {
  const appearancePatch = patch?.appearance && typeof patch.appearance === 'object' && !Array.isArray(patch.appearance)
    ? patch.appearance
    : {};
  const animationPatch = appearancePatch.animation && typeof appearancePatch.animation === 'object' && !Array.isArray(appearancePatch.animation)
    ? appearancePatch.animation
    : {};
  return {
    ...current,
    ...patch,
    schemaVersion: WORKSPACE_PROFILE_SCHEMA_VERSION,
    revision: current.revision,
    updatedAt: current.updatedAt,
    appearance: {
      ...current.appearance,
      ...appearancePatch,
      animation: { ...current.appearance.animation, ...animationPatch },
    },
    dockSlots: patch?.dockSlots ?? current.dockSlots,
    activeOverlaySceneId: patch?.activeOverlaySceneId === undefined ? current.activeOverlaySceneId : patch.activeOverlaySceneId,
    ttsSubscriptions: patch?.ttsSubscriptions ?? current.ttsSubscriptions,
    appThemeMappings: patch?.appThemeMappings ?? current.appThemeMappings,
  };
}

export function validateWorkspaceProfile(input: any, fallback = createDefaultWorkspaceProfile()): WorkspaceProfileValidation {
  const fields: Record<string, string> = {};
  const appearance = input?.appearance && typeof input.appearance === 'object' && !Array.isArray(input.appearance)
    ? input.appearance
    : {};
  const animation = appearance.animation && typeof appearance.animation === 'object' && !Array.isArray(appearance.animation)
    ? appearance.animation
    : {};

  const number = (value: unknown, path: string, minimum: number, maximum: number, defaultValue: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
      fields[path] = `Must be a number from ${minimum} to ${maximum}`;
      return defaultValue;
    }
    return parsed;
  };
  const boolean = (value: unknown, path: string, defaultValue: boolean) => {
    if (typeof value !== 'boolean') {
      fields[path] = 'Must be true or false';
      return defaultValue;
    }
    return value;
  };
  const enumValue = <T extends string>(value: unknown, path: string, values: Set<string>, defaultValue: T): T => {
    if (typeof value !== 'string' || !values.has(value)) {
      fields[path] = `Must be one of: ${Array.from(values).join(', ')}`;
      return defaultValue;
    }
    return value as T;
  };
  const compactIdentifier = (value: unknown, path: string, maximum: number, defaultValue: string) => {
    const text = String(value ?? '').trim();
    if (!text || text.length > maximum || !/^[a-z0-9][a-z0-9._-]*$/i.test(text)) {
      fields[path] = `Must be a simple identifier up to ${maximum} characters`;
      return defaultValue;
    }
    return text;
  };
  const dockUrl = (value: unknown, path: string, defaultValue: string) => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    try {
      const parsed = new URL(text, 'https://spacemountain.live');
      if (parsed.protocol !== 'https:') {
        fields[path] = 'Must use an https URL';
        return defaultValue;
      }
      for (const key of parsed.searchParams.keys()) {
        if (SENSITIVE_URL_KEYS.test(key)) {
          fields[path] = `Remove the sensitive ${key} query parameter`;
          return defaultValue;
        }
      }
      return parsed.toString();
    } catch {
      fields[path] = 'Must be a valid https URL';
      return defaultValue;
    }
  };

  if (Number(input?.schemaVersion) !== WORKSPACE_PROFILE_SCHEMA_VERSION) {
    fields.schemaVersion = `Must equal ${WORKSPACE_PROFILE_SCHEMA_VERSION}`;
  }

  const themeId = String(appearance.themeId || '').trim();
  if (!THEME_IDS.has(themeId)) fields['appearance.themeId'] = `Must be one of: ${Array.from(THEME_IDS).join(', ')}`;

  const rawSlots = Array.isArray(input?.dockSlots) ? input.dockSlots : [];
  if (rawSlots.length !== 3) fields.dockSlots = 'Exactly three dock slots are required';
  const slotsById = new Map(rawSlots.map((slot: any) => [Number(slot?.id), slot]));
  const dockSlots = ([1, 2, 3] as const).map((id, index) => {
    const slot: any = slotsById.get(id) || {};
    const defaultSlot = fallback.dockSlots[index];
    if (!slotsById.has(id)) fields[`dockSlots.${id}`] = `Dock slot ${id} is required`;
    const title = String(slot.title ?? '').trim();
    if (!title || title.length > 80) fields[`dockSlots.${id}.title`] = 'Must contain 1 to 80 characters';
    return {
      id,
      title: title && title.length <= 80 ? title : defaultSlot.title,
      url: dockUrl(slot.url, `dockSlots.${id}.url`, defaultSlot.url),
      collapsed: boolean(slot.collapsed, `dockSlots.${id}.collapsed`, defaultSlot.collapsed),
      volume: number(slot.volume, `dockSlots.${id}.volume`, 0, 1, defaultSlot.volume),
      muted: boolean(slot.muted, `dockSlots.${id}.muted`, defaultSlot.muted),
    };
  });

  const rawSubscriptions = Array.isArray(input?.ttsSubscriptions) ? input.ttsSubscriptions : [];
  if (!Array.isArray(input?.ttsSubscriptions)) fields.ttsSubscriptions = 'Must be an array';
  if (rawSubscriptions.length > 20) fields.ttsSubscriptions = 'No more than 20 TTS subscriptions are allowed';
  const ttsSubscriptions: string[] = Array.from(new Set<string>(rawSubscriptions.slice(0, 20).map((value: unknown, index: number) => (
    compactIdentifier(value, `ttsSubscriptions.${index}`, 80, '')
  )).filter(Boolean) as string[]));

  const rawMappings = input?.appThemeMappings && typeof input.appThemeMappings === 'object' && !Array.isArray(input.appThemeMappings)
    ? input.appThemeMappings
    : {};
  if (!input?.appThemeMappings || typeof input.appThemeMappings !== 'object' || Array.isArray(input.appThemeMappings)) {
    fields.appThemeMappings = 'Must be an object';
  }
  const appThemeMappings: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawMappings).slice(0, 40)) {
    const cleanKey = compactIdentifier(key, `appThemeMappings.${key}`, 80, '');
    const cleanValue = compactIdentifier(value, `appThemeMappings.${key}`, 80, '');
    if (cleanKey && cleanValue) appThemeMappings[cleanKey] = cleanValue;
  }

  const activeOverlaySceneId = input?.activeOverlaySceneId === null
    ? null
    : compactIdentifier(input?.activeOverlaySceneId, 'activeOverlaySceneId', 80, fallback.activeOverlaySceneId || '');

  return {
    fields,
    profile: {
      schemaVersion: WORKSPACE_PROFILE_SCHEMA_VERSION,
      revision: Number.isInteger(Number(input?.revision)) ? Math.max(1, Number(input.revision)) : fallback.revision,
      appearance: {
        themeId: THEME_IDS.has(themeId) ? themeId : fallback.appearance.themeId,
        glowIntensity: number(appearance.glowIntensity, 'appearance.glowIntensity', 0, 100, fallback.appearance.glowIntensity),
        starDensity: number(appearance.starDensity, 'appearance.starDensity', 0, 100, fallback.appearance.starDensity),
        glassOpacity: number(appearance.glassOpacity, 'appearance.glassOpacity', 0, 100, fallback.appearance.glassOpacity),
        blurStrength: number(appearance.blurStrength, 'appearance.blurStrength', 0, 60, fallback.appearance.blurStrength),
        nebulaIntensity: number(appearance.nebulaIntensity, 'appearance.nebulaIntensity', 0, 100, fallback.appearance.nebulaIntensity),
        parallaxDepth: number(appearance.parallaxDepth, 'appearance.parallaxDepth', 0, 100, fallback.appearance.parallaxDepth),
        borderStrength: number(appearance.borderStrength, 'appearance.borderStrength', 0, 100, fallback.appearance.borderStrength),
        cornerRadius: enumValue(appearance.cornerRadius, 'appearance.cornerRadius', CORNER_RADII, fallback.appearance.cornerRadius),
        density: enumValue(appearance.density, 'appearance.density', DENSITIES, fallback.appearance.density),
        sidebarCollapsed: boolean(appearance.sidebarCollapsed, 'appearance.sidebarCollapsed', fallback.appearance.sidebarCollapsed),
        sidebarStyle: enumValue(appearance.sidebarStyle, 'appearance.sidebarStyle', SIDEBAR_STYLES, fallback.appearance.sidebarStyle),
        sidebarPosition: enumValue(appearance.sidebarPosition, 'appearance.sidebarPosition', SIDEBAR_POSITIONS, fallback.appearance.sidebarPosition),
        topbarStyle: enumValue(appearance.topbarStyle, 'appearance.topbarStyle', TOPBAR_STYLES, fallback.appearance.topbarStyle),
        tabStyle: enumValue(appearance.tabStyle, 'appearance.tabStyle', TAB_STYLES, fallback.appearance.tabStyle),
        tabPosition: enumValue(appearance.tabPosition, 'appearance.tabPosition', TAB_POSITIONS, fallback.appearance.tabPosition),
        chatTransparency: number(appearance.chatTransparency, 'appearance.chatTransparency', 0, 100, fallback.appearance.chatTransparency),
        showAvatars: boolean(appearance.showAvatars, 'appearance.showAvatars', fallback.appearance.showAvatars),
        smoothTransitions: boolean(appearance.smoothTransitions, 'appearance.smoothTransitions', fallback.appearance.smoothTransitions),
        pushToTalk: boolean(appearance.pushToTalk, 'appearance.pushToTalk', fallback.appearance.pushToTalk),
        animation: {
          enabled: boolean(animation.enabled, 'appearance.animation.enabled', fallback.appearance.animation.enabled),
          speed: number(animation.speed, 'appearance.animation.speed', 20, 200, fallback.appearance.animation.speed),
          particles: boolean(animation.particles, 'appearance.animation.particles', fallback.appearance.animation.particles),
          shootingStars: boolean(animation.shootingStars, 'appearance.animation.shootingStars', fallback.appearance.animation.shootingStars),
        },
      },
      dockSlots,
      activeOverlaySceneId: activeOverlaySceneId || null,
      ttsSubscriptions,
      appThemeMappings,
      updatedAt: typeof input?.updatedAt === 'string' && input.updatedAt ? input.updatedAt : fallback.updatedAt,
    },
  };
}
