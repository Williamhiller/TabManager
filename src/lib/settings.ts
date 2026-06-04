import { defaultAutoGroupPresets } from './auto-group-defaults';
import { normalizeWebsitePattern } from './shared-utils';
import type {
  AutoCloseDomainMode,
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

const SYNC_STORAGE_ITEM_LIMIT = 8_192; // 8KB per item
const SYNC_STORAGE_FALLBACK_KEY = 'tab-manager/settings-fallback';
// Embedded in sync data itself so the marker and the data are written in a
// single chrome.storage.sync.set call (atomic).  This avoids the race where
// the service worker dies between writing the data and writing a separate marker.
const SYNC_AUTHORED_AT_KEY = '__syncAuthoredAt';
// Marker for minimal sync data that should not be used as authoritative.
const SYNC_MINIMAL_MARKER = '__syncMinimal';

function getStorageByteSize(data: unknown): number {
  try {
    return new Blob([JSON.stringify(data)]).size;
  } catch {
    return 0;
  }
}

async function saveSettingsToStorage(key: string, settings: ManagerSettings): Promise<void> {
  const size = getStorageByteSize(settings);

  if (size <= SYNC_STORAGE_ITEM_LIMIT) {
    // Data fits in sync — embed a timestamp so loadSettingsFromStorage knows
    // this is a full, authoritative copy.
    const tagged = { ...settings, [SYNC_AUTHORED_AT_KEY]: Date.now() };
    await chrome.storage.sync.set({ [key]: tagged });
    // Clear any previous fallback — the sync copy now has everything.
    await chrome.storage.local.remove(SYNC_STORAGE_FALLBACK_KEY);
  } else {
    // Data too large for sync storage, fall back to local.
    console.warn(`Settings size (${size} bytes) exceeds sync storage limit. Using local storage.`);
    await chrome.storage.local.set({ [SYNC_STORAGE_FALLBACK_KEY]: settings });
    // Save a minimal version to sync for cross-device awareness.
    // Include SYNC_MINIMAL_MARKER to signal this is an incomplete copy.
    const minimal = { ...settings, autoGroupConfigs: [], [SYNC_MINIMAL_MARKER]: true };
    await chrome.storage.sync.set({ [key]: minimal });
  }
}

async function loadSettingsFromStorage(key: string): Promise<Partial<ManagerSettings> | undefined> {
  // Try sync first
  const syncResult = await chrome.storage.sync.get(key);
  if (syncResult[key]) {
    const syncData = syncResult[key] as Record<string, unknown>;

    // The syncAuthoredAt marker is embedded directly in the sync data.
    // If it exists, the sync copy is a full, authoritative write.
    if (syncData[SYNC_AUTHORED_AT_KEY]) {
      // Strip the internal marker before returning.
      const { [SYNC_AUTHORED_AT_KEY]: _, ...rest } = syncData;
      return rest as Partial<ManagerSettings>;
    }

    // If the sync data has the minimal marker, it's an incomplete copy.
    // Always prefer the local fallback in this case.
    const isMinimal = syncData[SYNC_MINIMAL_MARKER] === true;

    // No marker → the sync copy is likely minimal (settings exceeded the sync
    // limit).  Prefer the local fallback if one exists.
    const localResult = await chrome.storage.local.get(SYNC_STORAGE_FALLBACK_KEY);
    const fallback = localResult[SYNC_STORAGE_FALLBACK_KEY] as
      | Partial<ManagerSettings>
      | undefined;
    if (fallback) {
      return fallback;
    }

    // No local fallback — only return sync data if it's not minimal.
    // Minimal data without fallback means the full settings are lost.
    if (isMinimal) {
      console.warn('Sync data is minimal and no local fallback found. Settings may be incomplete.');
    }
    return syncData as unknown as Partial<ManagerSettings>;
  }

  // Try local fallback
  const localResult = await chrome.storage.local.get(SYNC_STORAGE_FALLBACK_KEY);
  if (localResult[SYNC_STORAGE_FALLBACK_KEY]) {
    return localResult[SYNC_STORAGE_FALLBACK_KEY] as Partial<ManagerSettings>;
  }

  return undefined;
}

const validLaunchSurfaces: readonly LaunchSurface[] = ['sidepanel', 'popup', 'dashboard'];
const validAutoCloseDomainModes: readonly AutoCloseDomainMode[] = ['exclude', 'include', 'all'];
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
const validAutoDeduplicationScopes: readonly AutoDeduplicationScope[] = [
  'global-except-listed',
  'listed-only'
];
const validThemes: readonly ThemeMode[] = ['light', 'dark', 'system'];
const validLocales: readonly LocaleMode[] = ['system', 'en', 'zh-CN', 'ja', 'fr', 'es', 'ar', 'ru', 'el', 'ko'];
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
  autoCollapseInactiveGroupsMinutes: 30,
  autoSleepInactiveTabsMinutes: 0,
  autoCloseInactiveTabsMinutes: 0,
  autoCloseDomainMode: 'exclude',
  autoCleanupWhitelist: [],
  autoDeduplicateTabs: false,
  autoDeduplicationScope: 'global-except-listed',
  autoDeduplicationSites: [],
  blockChromeAutoGroup: true,
  autoGroupEnabled: true,
  autoSnapshotsEnabled: true,
  showHistory: true,
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
  locale: 'system',
  sidepanelShowSnapshots: false,
  sidepanelShowBookmarks: false
};

export const SETTINGS_KEY = 'manager-settings';
const SETTINGS_MIGRATIONS_KEY = 'manager-settings-migrations';
let settingsUpdateQueue: Promise<ManagerSettings> = Promise.resolve(defaultSettings);

interface SettingsMigrationState {
  autoCollapseDefault30?: boolean;
}

interface SettingsMigrationResult {
  raw?: Partial<ManagerSettings>;
  migrations: SettingsMigrationState;
  migrationsChanged: boolean;
  settingsChanged: boolean;
}

function normalizeSettingsMigrationState(value: unknown): SettingsMigrationState {
  if (!value || typeof value !== 'object') return {};

  const state = value as Partial<SettingsMigrationState>;
  return {
    autoCollapseDefault30: state.autoCollapseDefault30 === true
  };
}

function migrateStoredSettings(
  raw: Partial<ManagerSettings> | undefined,
  migrations: SettingsMigrationState
): SettingsMigrationResult {
  const nextMigrations = { ...migrations };
  let nextRaw = raw;
  let migrationsChanged = false;
  let settingsChanged = false;

  if (!nextMigrations.autoCollapseDefault30) {
    nextMigrations.autoCollapseDefault30 = true;
    migrationsChanged = true;

    if (raw?.autoCollapseInactiveGroupsMinutes === 10) {
      nextRaw = {
        ...raw,
        autoCollapseInactiveGroupsMinutes: 30
      };
      settingsChanged = true;
    }
  }

  return {
    raw: nextRaw,
    migrations: nextMigrations,
    migrationsChanged,
    settingsChanged
  };
}

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

function normalizeAutoCloseDomainMode(value: unknown): AutoCloseDomainMode {
  return validAutoCloseDomainModes.includes(value as AutoCloseDomainMode)
    ? (value as AutoCloseDomainMode)
    : defaultSettings.autoCloseDomainMode;
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

function normalizeBlockChromeAutoGroup(value: unknown): boolean {
  return typeof value === 'boolean' ? value : defaultSettings.blockChromeAutoGroup;
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

function normalizeShowHistory(value: unknown): boolean {
  return typeof value === 'boolean' ? value : defaultSettings.showHistory;
}

function normalizeRedirectTrackingEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : defaultSettings.redirectTrackingEnabled;
}

function normalizeAutoDeduplicateTabs(value: unknown): boolean {
  return typeof value === 'boolean' ? value : defaultSettings.autoDeduplicateTabs;
}

function normalizeSidepanelShowSnapshots(value: unknown): boolean {
  return typeof value === 'boolean' ? value : defaultSettings.sidepanelShowSnapshots;
}

function normalizeSidepanelShowBookmarks(value: unknown): boolean {
  return typeof value === 'boolean' ? value : defaultSettings.sidepanelShowBookmarks;
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
    .map((item) => normalizeWebsitePattern(item))
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
    autoCloseDomainMode: normalizeAutoCloseDomainMode(raw?.autoCloseDomainMode),
    autoCleanupWhitelist: normalizeAutoCleanupWhitelist(raw?.autoCleanupWhitelist),
    autoDeduplicateTabs: normalizeAutoDeduplicateTabs(raw?.autoDeduplicateTabs),
    autoDeduplicationScope: normalizeAutoDeduplicationScope(raw?.autoDeduplicationScope),
    autoDeduplicationSites: normalizeAutoDeduplicationSites(raw?.autoDeduplicationSites),
    blockChromeAutoGroup: normalizeBlockChromeAutoGroup(raw?.blockChromeAutoGroup),
    autoGroupEnabled: normalizeAutoGroupEnabled(raw?.autoGroupEnabled),
    autoSnapshotsEnabled: normalizeAutoSnapshotsEnabled(raw?.autoSnapshotsEnabled),
    showHistory: normalizeShowHistory(raw?.showHistory),
    redirectTrackingEnabled: normalizeRedirectTrackingEnabled(raw?.redirectTrackingEnabled),
    autoGroupPresetIds: autoGroupConfigs
      .filter((config) => config.presetId && config.enabled)
      .map((config) => config.presetId!),
    autoGroupConfigs,
    theme: normalizeTheme(raw?.theme),
    locale: normalizeLocale(raw?.locale),
    sidepanelShowSnapshots: normalizeSidepanelShowSnapshots(raw?.sidepanelShowSnapshots),
    sidepanelShowBookmarks: normalizeSidepanelShowBookmarks(raw?.sidepanelShowBookmarks)
  };
}

export async function getSettings(): Promise<ManagerSettings> {
  const [raw, migrationsRaw] = await Promise.all([
    loadSettingsFromStorage(SETTINGS_KEY),
    chrome.storage.sync.get(SETTINGS_MIGRATIONS_KEY).then((r) => r[SETTINGS_MIGRATIONS_KEY])
  ]);
  const migrationResult = migrateStoredSettings(
    raw,
    normalizeSettingsMigrationState(migrationsRaw)
  );
  const settings = normalizeSettings(migrationResult.raw);

  if (migrationResult.settingsChanged || migrationResult.migrationsChanged) {
    await saveSettingsToStorage(SETTINGS_KEY, settings);
    if (migrationResult.migrationsChanged) {
      await chrome.storage.sync.set({ [SETTINGS_MIGRATIONS_KEY]: migrationResult.migrations });
    }
  }

  return settings;
}

export async function updateSettings(
  patch: Partial<ManagerSettings>
): Promise<ManagerSettings> {
  const nextUpdate = settingsUpdateQueue
    .catch(async () => {
      // Previous update failed — recover by reading current settings.
      // Guard against getSettings() also failing (e.g. storage temporarily
      // unavailable) so the queue chain does not stay rejected.
      try {
        return await getSettings();
      } catch {
        return defaultSettings;
      }
    })
    .then(async () => {
      const next = normalizeSettings({
        ...(await getSettings()),
        ...patch
      });

      await saveSettingsToStorage(SETTINGS_KEY, next);
      return next;
    });

  settingsUpdateQueue = nextUpdate;
  return nextUpdate;
}
