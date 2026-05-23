import { defineBackground } from 'wxt/utils/define-background';

import { installBackgroundService } from '../lib/background-service';
import type { LaunchSurface, ManagerSettings } from '../lib/contracts';
import { openOrRefreshDashboardTab } from '../lib/dashboard-tabs';
import { getSettings, SETTINGS_KEY, updateSettings } from '../lib/settings';

let preferredLaunchSurface: LaunchSurface = 'sidepanel';
const LAUNCH_SURFACE_OPEN_TIMEOUT_MS = 4_000;
const ACTION_POPUP_PATH = 'popup.html';

function isLaunchSurface(value: unknown): value is LaunchSurface {
  return value === 'sidepanel' || value === 'popup' || value === 'dashboard';
}

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
  await syncActionBehavior(settings.launchSurface);
}

async function getStoredLaunchSurface(): Promise<LaunchSurface | null> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  const raw = stored[SETTINGS_KEY] as Partial<ManagerSettings> | undefined;
  const launchSurface = raw?.launchSurface;

  return isLaunchSurface(launchSurface) ? launchSurface : null;
}

function bindPreferredLaunchSurface(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    const raw = changes[SETTINGS_KEY]?.newValue as Partial<ManagerSettings> | undefined;
    const nextSurface = raw?.launchSurface;
    if (isLaunchSurface(nextSurface)) {
      preferredLaunchSurface = nextSurface;
      void syncActionBehavior(nextSurface).catch((error) => {
        console.warn('Failed to sync action behavior for launch surface change.', error);
      });
    }
  });
}

async function syncActionBehavior(surface = preferredLaunchSurface): Promise<void> {
  await chrome.action?.setPopup?.({
    popup: surface === 'popup' ? ACTION_POPUP_PATH : ''
  });

  await chrome.sidePanel?.setPanelBehavior?.({
    openPanelOnActionClick: surface === 'sidepanel'
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

  if (preferredLaunchSurface === 'popup') {
    if (chrome.action?.openPopup) {
      try {
        await withTimeout(
          chrome.action.openPopup(),
          LAUNCH_SURFACE_OPEN_TIMEOUT_MS,
          'Timed out opening popup from action click.'
        );
        return;
      } catch (error) {
        console.warn('Failed to open popup from action click, falling back to dashboard.', error);
      }
    }

    await openOrRefreshDashboardTab();
    return;
  }

  await openOrRefreshDashboardTab();
}

async function handleInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
  if (details.reason === 'install') {
    await updateSettings({ launchSurface: 'dashboard' });
    preferredLaunchSurface = 'dashboard';
    await syncActionBehavior('dashboard');
    await openOrRefreshDashboardTab();
    return;
  }

  if (details.reason !== 'update') return;

  const storedLaunchSurface = await getStoredLaunchSurface();
  if (storedLaunchSurface != null) {
    preferredLaunchSurface = storedLaunchSurface;
    await syncActionBehavior(storedLaunchSurface);
    return;
  }

  await updateSettings({ launchSurface: 'sidepanel' });
  preferredLaunchSurface = 'sidepanel';
  await syncActionBehavior('sidepanel');
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
});
