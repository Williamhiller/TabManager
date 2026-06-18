import { defineBackground } from 'wxt/utils/define-background';

import { installBackgroundService } from '../lib/background-service';
import type { LaunchSurface, ManagerSettings } from '../lib/contracts';
import { openOrRefreshDashboardTab } from '../lib/dashboard-tabs';
import { executeAction } from '../lib/keyboard-shortcuts/actions';
import type { ShortcutAction } from '../lib/keyboard-shortcuts/types';
import { getSettings, SETTINGS_KEY, updateSettings } from '../lib/settings';
import { withTimeout } from '../lib/shared-utils';

let preferredLaunchSurface: LaunchSurface = 'sidepanel';
const LAUNCH_SURFACE_OPEN_TIMEOUT_MS = 4_000;
const ACTION_POPUP_PATH = 'popup.html';

function isLaunchSurface(value: unknown): value is LaunchSurface {
  return value === 'sidepanel' || value === 'popup' || value === 'dashboard';
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
    // Settings may be stored in sync or local (fallback for large configs).
    const isSettingsChange =
      (areaName === 'sync' && changes[SETTINGS_KEY]) ||
      (areaName === 'local' && changes['tab-manager/settings-fallback']);
    if (!isSettingsChange) return;
    // When settings fall back to local storage, the sync change event does not
    // contain the full settings.  Read from storage to get the authoritative
    // value regardless of which area triggered the change.
    void getSettings().then((settings) => {
      const nextSurface = settings.launchSurface;
      if (isLaunchSurface(nextSurface)) {
        preferredLaunchSurface = nextSurface;
        void syncActionBehavior(nextSurface).catch((error) => {
          console.warn('Failed to sync action behavior for launch surface change.', error);
        });
      }
    }).catch((error) => {
      console.warn('Failed to read settings for launch surface change.', error);
    });
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

function handleCommand(command: string): void {
  if (command === 'toggle-command-palette') {
    void (async () => {
      // If a dashboard tab already exists, focus it and toggle the switcher there
      const allTabs = await chrome.tabs.query({});
      const dashboardTab = allTabs.find(
        (t) =>
          t.url?.startsWith(chrome.runtime.getURL('/dashboard.html')) ||
          t.pendingUrl?.startsWith(chrome.runtime.getURL('/dashboard.html')),
      );

      if (dashboardTab?.id != null) {
        await chrome.tabs.update(dashboardTab.id, { active: true });
        if (dashboardTab.windowId != null) {
          await chrome.windows.update(dashboardTab.windowId, { focused: true });
        }
        await chrome.storage.session.set({ tmToggleTabSwitcher: Date.now() });
        return;
      }

      // No dashboard tab open — inject content script and toggle in-page palette
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id && activeTab.url?.startsWith('http')) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content-scripts/content.js'],
          });
          await chrome.tabs.sendMessage(activeTab.id, { type: 'tab-manager/toggle-page-palette' });
          return;
        } catch {
          // Injection failed (e.g. chrome:// page) — fall through
        }
      }

      // Fallback — open a new dashboard with command palette
      await openOrRefreshDashboardTab('/dashboard.html?commandPalette=1');
    })().catch((error) => {
      console.warn('Failed to toggle command palette.', error);
    });
    return;
  }

  void executeAction(command as ShortcutAction).catch((error) => {
    console.warn(`Failed to execute keyboard shortcut action: ${command}`, error);
  });
}

export default defineBackground(() => {
  installBackgroundService();
  bindPreferredLaunchSurface();

  chrome.commands.onCommand.addListener((command) => {
    handleCommand(command);
  });

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
