import { defineBackground } from 'wxt/utils/define-background';

import { installBackgroundService } from '../lib/background-service';
import type { LaunchSurface, ManagerSettings } from '../lib/contracts';
import { getSettings, SETTINGS_KEY, updateSettings } from '../lib/settings';

let preferredLaunchSurface: LaunchSurface = 'sidepanel';

async function openDashboardPage(): Promise<void> {
  const url = chrome.runtime.getURL('/dashboard.html');
  const dashboardUrlPrefix = chrome.runtime.getURL('/dashboard.html');
  const existingTabs = await chrome.tabs.query({});
  const existingTab = existingTabs.find((candidate) => candidate.url?.startsWith(dashboardUrlPrefix));

  if (existingTab?.id != null) {
    await chrome.tabs.update(existingTab.id, { active: true, url });
    if (existingTab.windowId != null) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url });
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
        await chrome.sidePanel.open({ windowId });
        return;
      } catch (error) {
        console.warn('Failed to open side panel from action click, falling back to dashboard.', error);
      }
    }
  }

  await openDashboardPage();
}

async function configureActionClickBehavior(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: false
  });
}

async function handleInstalled(details: chrome.runtime.InstalledDetails): Promise<void> {
  if (details.reason === 'install') {
    await updateSettings({ launchSurface: 'dashboard' });
    preferredLaunchSurface = 'dashboard';
    await openDashboardPage();
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
