import { defaultAutoGroupPresets } from './auto-group-defaults';
import type {
  AutoCloseCondition,
  AutoCloseInactiveTabsMinutes,
  AutoCollapseInactiveGroupsMinutes,
  AutoDeduplicationScope,
  AutoSleepInactiveTabsMinutes,
  AutoGroupConfig,
  AutoGroupRule,
  AutoGroupRuleField,
  AutoGroupRuleOperator,
  LaunchSurface,
  LocaleMode,
  ManagerSettings,
  TabGroupColor,
  ThemeMode
} from './contracts';

const validLaunchSurfaces: readonly LaunchSurface[] = ['sidepanel', 'dashboard'];
const validRefreshIntervals = new Set([0, 15, 30, 60]);
export const autoInactiveMinuteChoices = [0, 5, 10, 30, 60, 120] as const;
const validAutoCollapseInactiveGroupMinutes = new Set<AutoCollapseInactiveGroupsMinutes>(
  autoInactiveMinuteChoices
);
const validAutoSleepInactiveTabsMinutes = new Set<AutoSleepInactiveTabsMinutes>(
  autoInactiveMinuteChoices
);
const validAutoCloseInactiveTabsMinutes = new Set<AutoCloseInactiveTabsMinutes>(
  autoInactiveMinuteChoices
);
const validAutoCloseConditions: readonly AutoCloseCondition[] = ['sleeping-only', 'deep-idle'];
const validAutoDeduplicationScopes: readonly AutoDeduplicationScope[] = [
  'global-except-listed',
  'listed-only'
];
const validThemes: readonly ThemeMode[] = ['light', 'dark', 'system'];
const validLocales: readonly LocaleMode[] = ['system', 'en', 'zh-CN', 'ja', 'fr', 'es', 'ar'];
const validRuleFields: readonly AutoGroupRuleField[] = ['hostname', 'url', 'title'];
const validRuleOperators: readonly AutoGroupRuleOperator[] = ['contains', 'equals'];
const validGroupColors: readonly TabGroupColor[] = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange'
];

export const defaultSettings: ManagerSettings = {
  launchSurface: 'sidepanel',
  autoRefreshSeconds: 15,
  autoCollapseInactiveGroupsMinutes: 10,
  autoSleepInactiveTabsMinutes: 0,
  autoCloseInactiveTabsMinutes: 0,
  autoCloseCondition: 'sleeping-only',
  autoCleanupWhitelist: [],
  autoDeduplicateTabs: false,
  autoDeduplicationScope: 'global-except-listed',
  autoDeduplicationSites: [],
  autoGroupEnabled: true,
  autoSnapshotsEnabled: true,
  redirectTrackingEnabled: false,
  autoGroupPresetIds: defaultAutoGroupPresets.map((preset) => preset.id),
  autoGroupConfigs: defaultAutoGroupPresets.map((preset) => ({
    id: `preset:${preset.id}`,
    presetId: preset.id,
    title: preset.titles.en,
    color: preset.color,
    enabled: true,
    websites: [],
    rules: []
  })),
  theme: 'system',
  locale: 'system'
};

export const SETTINGS_KEY = 'manager-settings';
let settingsUpdateQueue: Promise<ManagerSettings> = Promise.resolve(defaultSettings);

function normalizeLaunchSurface(value: unknown): LaunchSurface {
  return validLaunchSurfaces.includes(value as LaunchSurface)
    ? (value as LaunchSurface)
    : defaultSettings.launchSurface;
}

function normalizeAutoRefreshSeconds(value: unknown): number {
  return typeof value === 'number' && validRefreshIntervals.has(value)
    ? value
    : defaultSettings.autoRefreshSeconds;
}

function normalizeAutoCollapseInactiveGroupsMinutes(
  value: unknown
): AutoCollapseInactiveGroupsMinutes {
  return typeof value === 'number' &&
    validAutoCollapseInactiveGroupMinutes.has(value as AutoCollapseInactiveGroupsMinutes)
    ? (value as AutoCollapseInactiveGroupsMinutes)
    : defaultSettings.autoCollapseInactiveGroupsMinutes;
}

function normalizeAutoSleepInactiveTabsMinutes(value: unknown): AutoSleepInactiveTabsMinutes {
  return typeof value === 'number' &&
    validAutoSleepInactiveTabsMinutes.has(value as AutoSleepInactiveTabsMinutes)
    ? (value as AutoSleepInactiveTabsMinutes)
    : defaultSettings.autoSleepInactiveTabsMinutes;
}

function normalizeAutoCloseInactiveTabsMinutes(value: unknown): AutoCloseInactiveTabsMinutes {
  return typeof value === 'number' &&
    validAutoCloseInactiveTabsMinutes.has(value as AutoCloseInactiveTabsMinutes)
    ? (value as AutoCloseInactiveTabsMinutes)
    : defaultSettings.autoCloseInactiveTabsMinutes;
}

function normalizeAutoCloseCondition(value: unknown): AutoCloseCondition {
  return validAutoCloseConditions.includes(value as AutoCloseCondition)
    ? (value as AutoCloseCondition)
    : defaultSettings.autoCloseCondition;
}

function normalizeAutoCleanupWhitelist(value: unknown): string[] {
  if (!Array.isArray(value)) return defaultSettings.autoCleanupWhitelist;

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const next = item.trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    normalized.push(next);
  }

  return normalized;
}

function normalizeAutoDeduplicationSites(value: unknown): string[] {
  if (!Array.isArray(value)) return defaultSettings.autoDeduplicationSites;

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const next = item.trim();
    if (!next || seen.has(next)) continue;
    seen.add(next);
    normalized.push(next);
  }

  return normalized;
}

function normalizeTheme(value: unknown): ThemeMode {
  return validThemes.includes(value as ThemeMode) ? (value as ThemeMode) : defaultSettings.theme;
}

function normalizeLocale(value: unknown): LocaleMode {
  return validLocales.includes(value as LocaleMode) ? (value as LocaleMode) : defaultSettings.locale;
}

function normalizePresetIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : defaultSettings.autoGroupPresetIds;
}

function normalizeAutoGroupEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : defaultSettings.autoGroupEnabled;
}

function normalizeAutoSnapshotsEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : defaultSettings.autoSnapshotsEnabled;
}

function normalizeRedirectTrackingEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : defaultSettings.redirectTrackingEnabled;
}

function normalizeAutoDeduplicateTabs(value: unknown): boolean {
  return typeof value === 'boolean' ? value : defaultSettings.autoDeduplicateTabs;
}

function normalizeAutoDeduplicationScope(value: unknown): AutoDeduplicationScope {
  return validAutoDeduplicationScopes.includes(value as AutoDeduplicationScope)
    ? (value as AutoDeduplicationScope)
    : defaultSettings.autoDeduplicationScope;
}

function normalizeRule(raw: unknown): AutoGroupRule | null {
  if (!raw || typeof raw !== 'object') return null;

  const candidate = raw as Partial<AutoGroupRule>;
  const value = typeof candidate.value === 'string' ? candidate.value : '';

  return {
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    field: validRuleFields.includes(candidate.field as AutoGroupRuleField)
      ? (candidate.field as AutoGroupRuleField)
      : 'url',
    operator: validRuleOperators.includes(candidate.operator as AutoGroupRuleOperator)
      ? (candidate.operator as AutoGroupRuleOperator)
      : 'contains',
    value
  };
}

function normalizeWebsites(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''))
    .filter(Boolean);
}

function normalizeAutoGroupConfigs(
  value: unknown,
  selectedPresetIds: string[]
): AutoGroupConfig[] {
  const hasStoredConfigs = Array.isArray(value);
  const rawItems = hasStoredConfigs ? value : [];
  const items = rawItems
    .map((raw): AutoGroupConfig | null => {
      if (!raw || typeof raw !== 'object') return null;

      const candidate = raw as Partial<AutoGroupConfig>;
      const preset = candidate.presetId
        ? defaultAutoGroupPresets.find((entry) => entry.id === candidate.presetId)
        : null;
      const id =
        typeof candidate.id === 'string' && candidate.id
          ? candidate.id
          : preset
            ? `preset:${preset.id}`
            : `custom:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const title =
        typeof candidate.title === 'string' && candidate.title.trim()
          ? candidate.title.trim()
          : preset?.titles.en ?? 'Custom group';

      return {
        id,
        presetId: typeof candidate.presetId === 'string' ? candidate.presetId : undefined,
        title,
        color: validGroupColors.includes(candidate.color as TabGroupColor)
          ? (candidate.color as TabGroupColor)
          : preset?.color ?? 'blue',
        enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : true,
        websites: normalizeWebsites(candidate.websites),
        rules: Array.isArray(candidate.rules)
          ? candidate.rules.map(normalizeRule).filter((rule): rule is AutoGroupRule => rule !== null)
          : []
      };
    })
    .filter((item): item is AutoGroupConfig => item !== null);

  if (!hasStoredConfigs) {
    return defaultAutoGroupPresets.map((preset) => ({
      id: `preset:${preset.id}`,
      presetId: preset.id,
      title: preset.titles.en,
      color: preset.color,
      enabled: selectedPresetIds.includes(preset.id),
      websites: [],
      rules: []
    }));
  }

  const seenIds = new Set<string>();
  const next: AutoGroupConfig[] = [];

  for (const item of items) {
    if (seenIds.has(item.id)) continue;
    next.push(item);
    seenIds.add(item.id);
  }

  return next;
}

function normalizeSettings(raw?: Partial<ManagerSettings>): ManagerSettings {
  const autoGroupPresetIds = normalizePresetIds(raw?.autoGroupPresetIds);
  const autoGroupConfigs = normalizeAutoGroupConfigs(raw?.autoGroupConfigs, autoGroupPresetIds);

  return {
    launchSurface: normalizeLaunchSurface(raw?.launchSurface),
    autoRefreshSeconds: normalizeAutoRefreshSeconds(raw?.autoRefreshSeconds),
    autoCollapseInactiveGroupsMinutes: normalizeAutoCollapseInactiveGroupsMinutes(
      raw?.autoCollapseInactiveGroupsMinutes
    ),
    autoSleepInactiveTabsMinutes: normalizeAutoSleepInactiveTabsMinutes(
      raw?.autoSleepInactiveTabsMinutes
    ),
    autoCloseInactiveTabsMinutes: normalizeAutoCloseInactiveTabsMinutes(
      raw?.autoCloseInactiveTabsMinutes
    ),
    autoCloseCondition: normalizeAutoCloseCondition(raw?.autoCloseCondition),
    autoCleanupWhitelist: normalizeAutoCleanupWhitelist(raw?.autoCleanupWhitelist),
    autoDeduplicateTabs: normalizeAutoDeduplicateTabs(raw?.autoDeduplicateTabs),
    autoDeduplicationScope: normalizeAutoDeduplicationScope(raw?.autoDeduplicationScope),
    autoDeduplicationSites: normalizeAutoDeduplicationSites(raw?.autoDeduplicationSites),
    autoGroupEnabled: normalizeAutoGroupEnabled(raw?.autoGroupEnabled),
    autoSnapshotsEnabled: normalizeAutoSnapshotsEnabled(raw?.autoSnapshotsEnabled),
    redirectTrackingEnabled: normalizeRedirectTrackingEnabled(raw?.redirectTrackingEnabled),
    autoGroupPresetIds: autoGroupConfigs
      .filter((config) => config.presetId && config.enabled)
      .map((config) => config.presetId!),
    autoGroupConfigs,
    theme: normalizeTheme(raw?.theme),
    locale: normalizeLocale(raw?.locale)
  };
}

export async function getSettings(): Promise<ManagerSettings> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  const raw = stored[SETTINGS_KEY] as Partial<ManagerSettings> | undefined;

  return normalizeSettings(raw);
}

export async function updateSettings(
  patch: Partial<ManagerSettings>
): Promise<ManagerSettings> {
  const nextUpdate = settingsUpdateQueue
    .catch(() => getSettings())
    .then(async () => {
      const next = normalizeSettings({
        ...(await getSettings()),
        ...patch
      });

      await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
      return next;
    });

  settingsUpdateQueue = nextUpdate;
  return nextUpdate;
}
