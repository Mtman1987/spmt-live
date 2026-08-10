export const WORKSPACE_PROFILE_SCHEMA_VERSION = 1 as const;

export type WorkspaceAppearanceV1 = {
  themeId: string;
  accentColor: string;
  accentSaturation: number;
  glowIntensity: number;
  starDensity: number;
  glassOpacity: number;
  blurStrength: number;
  nebulaIntensity: number;
  parallaxDepth: number;
  borderStrength: number;
  borderGlow: boolean;
  hoverGlow: boolean;
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
  pushToTalkKey: string;
  micButtonStyle: 'round' | 'square' | 'minimal';
  voiceWaveStyle: 'bars' | 'wave' | 'pulse';
  accessibility: {
    highContrast: boolean;
    colorVisionMode: 'default' | 'deuteranopia' | 'protanopia' | 'tritanopia';
    textScale: number;
    reduceMotion: boolean;
    focusHighlight: boolean;
  };
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
  savedThemes: WorkspaceSavedThemeV1[];
  updatedAt: string;
};

export type WorkspaceSavedThemeV1 = {
  id: string;
  name: string;
  appearance: WorkspaceAppearanceV1;
  createdAt: string;
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
const MIC_BUTTON_STYLES = new Set(['round', 'square', 'minimal']);
const VOICE_WAVE_STYLES = new Set(['bars', 'wave', 'pulse']);
const COLOR_VISION_MODES = new Set(['default', 'deuteranopia', 'protanopia', 'tritanopia']);
const SENSITIVE_URL_KEYS = /^(?:access_?token|api_?key|auth|authorization|key|password|secret|session|token)$/i;

export function createDefaultWorkspaceProfile(now = new Date().toISOString(), themeId = 'solar-flare'): WorkspaceProfileV1 {
  return {
    schemaVersion: WORKSPACE_PROFILE_SCHEMA_VERSION,
    revision: 1,
    appearance: {
      themeId: THEME_IDS.has(themeId) ? themeId : 'solar-flare',
      accentColor: '#f97316',
      accentSaturation: 90,
      glowIntensity: 80,
      starDensity: 70,
      glassOpacity: 65,
      blurStrength: 22,
      nebulaIntensity: 80,
      parallaxDepth: 65,
      borderStrength: 60,
      borderGlow: true,
      hoverGlow: true,
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
      pushToTalkKey: 'V',
      micButtonStyle: 'round',
      voiceWaveStyle: 'wave',
      accessibility: {
        highContrast: false,
        colorVisionMode: 'default',
        textScale: 100,
        reduceMotion: false,
        focusHighlight: true,
      },
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
    savedThemes: [],
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
  const accessibilityPatch = appearancePatch.accessibility && typeof appearancePatch.accessibility === 'object' && !Array.isArray(appearancePatch.accessibility)
    ? appearancePatch.accessibility
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
      accessibility: { ...current.appearance.accessibility, ...accessibilityPatch },
    },
    dockSlots: patch?.dockSlots ?? current.dockSlots,
    activeOverlaySceneId: patch?.activeOverlaySceneId === undefined ? current.activeOverlaySceneId : patch.activeOverlaySceneId,
    ttsSubscriptions: patch?.ttsSubscriptions ?? current.ttsSubscriptions,
    appThemeMappings: patch?.appThemeMappings ?? current.appThemeMappings,
    savedThemes: patch?.savedThemes ?? current.savedThemes,
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
  const accessibility = appearance.accessibility && typeof appearance.accessibility === 'object' && !Array.isArray(appearance.accessibility)
    ? appearance.accessibility
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
  const shortText = (value: unknown, path: string, maximum: number, defaultValue: string) => {
    const text = String(value ?? '').trim();
    if (!text || text.length > maximum) {
      fields[path] = `Must contain 1 to ${maximum} characters`;
      return defaultValue;
    }
    return text;
  };
  const color = (value: unknown, path: string, defaultValue: string) => {
    const text = String(value ?? '').trim();
    if (!/^#[0-9a-f]{6}$/i.test(text)) {
      fields[path] = 'Must be a six-digit hex color';
      return defaultValue;
    }
    return text.toLowerCase();
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

  const rawSavedThemes = Array.isArray(input?.savedThemes) ? input.savedThemes : [];
  if (input?.savedThemes !== undefined && !Array.isArray(input?.savedThemes)) fields.savedThemes = 'Must be an array';
  if (rawSavedThemes.length > 20) fields.savedThemes = 'No more than 20 saved themes are allowed';
  const savedThemes = rawSavedThemes.slice(0, 20).map((item: any, index: number) => {
    const savedFallback = fallback.savedThemes[index];
    const savedAppearance = validateWorkspaceProfile({
      ...fallback,
      appearance: item?.appearance || fallback.appearance,
      savedThemes: [],
    }, fallback);
    for (const [path, message] of Object.entries(savedAppearance.fields)) {
      if (path.startsWith('appearance.')) fields[`savedThemes.${index}.${path}`] = message;
    }
    const now = new Date().toISOString();
    return {
      id: compactIdentifier(item?.id, `savedThemes.${index}.id`, 80, savedFallback?.id || `theme-${index + 1}`),
      name: shortText(item?.name, `savedThemes.${index}.name`, 80, savedFallback?.name || `Theme ${index + 1}`),
      appearance: savedAppearance.profile.appearance,
      createdAt: typeof item?.createdAt === 'string' && item.createdAt ? item.createdAt : savedFallback?.createdAt || now,
      updatedAt: typeof item?.updatedAt === 'string' && item.updatedAt ? item.updatedAt : savedFallback?.updatedAt || now,
    };
  });

  return {
    fields,
    profile: {
      schemaVersion: WORKSPACE_PROFILE_SCHEMA_VERSION,
      revision: Number.isInteger(Number(input?.revision)) ? Math.max(1, Number(input.revision)) : fallback.revision,
      appearance: {
        themeId: THEME_IDS.has(themeId) ? themeId : fallback.appearance.themeId,
        accentColor: appearance.accentColor === undefined ? fallback.appearance.accentColor : color(appearance.accentColor, 'appearance.accentColor', fallback.appearance.accentColor),
        accentSaturation: appearance.accentSaturation === undefined ? fallback.appearance.accentSaturation : number(appearance.accentSaturation, 'appearance.accentSaturation', 0, 100, fallback.appearance.accentSaturation),
        glowIntensity: number(appearance.glowIntensity, 'appearance.glowIntensity', 0, 100, fallback.appearance.glowIntensity),
        starDensity: number(appearance.starDensity, 'appearance.starDensity', 0, 100, fallback.appearance.starDensity),
        glassOpacity: number(appearance.glassOpacity, 'appearance.glassOpacity', 0, 100, fallback.appearance.glassOpacity),
        blurStrength: number(appearance.blurStrength, 'appearance.blurStrength', 0, 60, fallback.appearance.blurStrength),
        nebulaIntensity: number(appearance.nebulaIntensity, 'appearance.nebulaIntensity', 0, 100, fallback.appearance.nebulaIntensity),
        parallaxDepth: number(appearance.parallaxDepth, 'appearance.parallaxDepth', 0, 100, fallback.appearance.parallaxDepth),
        borderStrength: number(appearance.borderStrength, 'appearance.borderStrength', 0, 100, fallback.appearance.borderStrength),
        borderGlow: appearance.borderGlow === undefined ? fallback.appearance.borderGlow : boolean(appearance.borderGlow, 'appearance.borderGlow', fallback.appearance.borderGlow),
        hoverGlow: appearance.hoverGlow === undefined ? fallback.appearance.hoverGlow : boolean(appearance.hoverGlow, 'appearance.hoverGlow', fallback.appearance.hoverGlow),
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
        pushToTalkKey: appearance.pushToTalkKey === undefined ? fallback.appearance.pushToTalkKey : shortText(appearance.pushToTalkKey, 'appearance.pushToTalkKey', 24, fallback.appearance.pushToTalkKey),
        micButtonStyle: appearance.micButtonStyle === undefined ? fallback.appearance.micButtonStyle : enumValue(appearance.micButtonStyle, 'appearance.micButtonStyle', MIC_BUTTON_STYLES, fallback.appearance.micButtonStyle),
        voiceWaveStyle: appearance.voiceWaveStyle === undefined ? fallback.appearance.voiceWaveStyle : enumValue(appearance.voiceWaveStyle, 'appearance.voiceWaveStyle', VOICE_WAVE_STYLES, fallback.appearance.voiceWaveStyle),
        accessibility: {
          highContrast: accessibility.highContrast === undefined ? fallback.appearance.accessibility.highContrast : boolean(accessibility.highContrast, 'appearance.accessibility.highContrast', fallback.appearance.accessibility.highContrast),
          colorVisionMode: accessibility.colorVisionMode === undefined ? fallback.appearance.accessibility.colorVisionMode : enumValue(accessibility.colorVisionMode, 'appearance.accessibility.colorVisionMode', COLOR_VISION_MODES, fallback.appearance.accessibility.colorVisionMode),
          textScale: accessibility.textScale === undefined ? fallback.appearance.accessibility.textScale : number(accessibility.textScale, 'appearance.accessibility.textScale', 80, 140, fallback.appearance.accessibility.textScale),
          reduceMotion: accessibility.reduceMotion === undefined ? fallback.appearance.accessibility.reduceMotion : boolean(accessibility.reduceMotion, 'appearance.accessibility.reduceMotion', fallback.appearance.accessibility.reduceMotion),
          focusHighlight: accessibility.focusHighlight === undefined ? fallback.appearance.accessibility.focusHighlight : boolean(accessibility.focusHighlight, 'appearance.accessibility.focusHighlight', fallback.appearance.accessibility.focusHighlight),
        },
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
      savedThemes,
      updatedAt: typeof input?.updatedAt === 'string' && input.updatedAt ? input.updatedAt : fallback.updatedAt,
    },
  };
}
