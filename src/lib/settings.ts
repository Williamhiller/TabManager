import { defaultAutoGroupPresets } from './auto-group-defaults';
import type { ManagerSettings } from './contracts';

export const defaultSettings: ManagerSettings = {
  launchSurface: 'sidepanel',
  autoRefreshSeconds: 15,
  autoGroupEnabled: true,
  autoGroupPresetIds: defaultAutoGroupPresets.map((preset) => preset.id),
  theme: 'system',
  locale: 'system'
};

export const SETTINGS_KEY = 'manager-settings';

export async function getSettings(): Promise<ManagerSettings> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  const raw = stored[SETTINGS_KEY] as Partial<ManagerSettings> | undefined;

  return {
    launchSurface: raw?.launchSurface ?? defaultSettings.launchSurface,
    autoRefreshSeconds: raw?.autoRefreshSeconds ?? defaultSettings.autoRefreshSeconds,
    autoGroupEnabled: raw?.autoGroupEnabled ?? defaultSettings.autoGroupEnabled,
    autoGroupPresetIds: raw?.autoGroupPresetIds ?? defaultSettings.autoGroupPresetIds,
    theme: raw?.theme ?? defaultSettings.theme,
    locale: raw?.locale ?? defaultSettings.locale
  };
}

export async function updateSettings(
  patch: Partial<ManagerSettings>
): Promise<ManagerSettings> {
  const next = {
    ...(await getSettings()),
    ...patch
  };

  await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}
