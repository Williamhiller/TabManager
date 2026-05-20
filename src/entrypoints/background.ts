import { defineBackground } from 'wxt/utils/define-background';

import { installBackgroundService } from '../lib/background-service';
import type { LaunchSurface, ManagerSettings } from '../lib/contracts';
import { openOrRefreshDashboardTab } from '../lib/dashboard-tabs';
import { getSettings, SETTINGS_KEY, updateSettings } from '../lib/settings';

let preferredLaunchSurface: LaunchSurface = 'sidepanel';
const LAUNCH_SURFACE_OPEN_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function syncPreferredLaunchSurface(): Promise<void> {
  const settings = await getSettings();
  preferredLaunchSurface = settings.launchSurface;
}

async function getStoredLaunchSurface(): Promise<LaunchSurface | null> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  const raw = stored[SETTINGS_KEY] as Partial<ManagerSettings> | undefined;
  const launchSurface = raw?.launchSurface;

  return launchSurface === 'sidepanel' || launchSurface === 'dashboard' ? launchSurface : null;
}

function bindPreferredLaunchSurface(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    const raw = changes[SETTINGS_KEY]?.newValue as Partial<ManagerSettings> | undefined;
    const nextSurface = raw?.launchSurface;
    if (nextSurface === 'sidepanel' || nextSurface === 'dashboard') {
      preferredLaunchSurface = nextSurface;
    }
  });
}

async function openConfiguredLaunchSurface(tab?: chrome.tabs.Tab): Promise<void> {
  if (preferredLaunchSurface === 'sidepanel' && chrome.sidePanel?.open) {
    const windowId = tab?.windowId;
    if (windowId != null) {
      try {
        await withTimeout(
          chrome.sidePanel.open({ windowId }),
          LAUNCH_SURFACE_OPEN_TIMEOUT_MS,
          'Timed out opening side panel from action click.'
        );
        return;
      } catch (error) {
        console.warn('Failed to open side panel from action click, falling back to dashboard.', error);
      }
    }
  }

  await openOrRefreshDashboardTab();
}

async function configureActionClickBehavior(): Promise<void> {
  if (!chrome.sidePanel?.setPanelBehavior) return;

  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: false
  });
}

async function handleInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
  if (details.reason === 'install') {
    await updateSettings({ launchSurface: 'dashboard' });
    preferredLaunchSurface = 'dashboard';
    await openOrRefreshDashboardTab();
    return;
  }

  if (details.reason !== 'update') return;

  const storedLaunchSurface = await getStoredLaunchSurface();
  if (storedLaunchSurface != null) {
    preferredLaunchSurface = storedLaunchSurface;
    return;
  }

  await updateSettings({ launchSurface: 'sidepanel' });
  preferredLaunchSurface = 'sidepanel';
}

export default defineBackground(() => {
  installBackgroundService();
  bindPreferredLaunchSurface();

  chrome.runtime.onInstalled.addListener((details) => {
    void handleInstalled(details).catch((error) => {
      console.warn('Failed to handle install migration.', error);
    });
  });

  chrome.action.onClicked.addListener((tab) => {
    void openConfiguredLaunchSurface(tab).catch((error) => {
      console.warn('Failed to open configured launch surface from action click.', error);
    });
  });

  void syncPreferredLaunchSurface().catch((error) => {
    console.warn('Failed to initialize preferred launch surface.', error);
  });

  void configureActionClickBehavior().catch((error) => {
    console.warn('Failed to configure action click behavior.', error);
  });
});
