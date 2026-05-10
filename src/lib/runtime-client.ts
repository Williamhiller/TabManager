import { getSettings } from './settings';
import type {
  ExtensionRequest,
  ExtensionResult,
  GroupTabsOptions,
  LaunchSurface,
  OverviewInvalidatedMessage,
  OverviewSnapshot,
  RedirectTrackingPermissionState,
  SmartGroupStrategy,
  TabDetailSnapshot,
  TabGroupUpdatePatch,
  TabMutationResult
} from './contracts';

async function sendRequest<T>(
  request: ExtensionRequest
): Promise<ExtensionResult<T>> {
  return chrome.runtime.sendMessage(request) as Promise<ExtensionResult<T>>;
}

export async function getOverview(): Promise<OverviewSnapshot> {
  const response = await sendRequest<OverviewSnapshot>({
    type: 'tab-manager/get-overview'
  });

  if (!response.ok) throw new Error(response.error);
  return response.data;
}

export function subscribeToOverviewUpdates(
  listener: (message: OverviewInvalidatedMessage) => void
): () => void {
  const handleMessage = (message: unknown) => {
    const payload = message as Partial<OverviewInvalidatedMessage> | null;
    if (
      !payload ||
      payload.type !== 'tab-manager/overview-invalidated' ||
      typeof payload.at !== 'number'
    ) {
      return;
    }

    listener(payload as OverviewInvalidatedMessage);
  };

  chrome.runtime.onMessage.addListener(handleMessage);
  return () => chrome.runtime.onMessage.removeListener(handleMessage);
}

export async function getTabDetail(tabId: number): Promise<TabDetailSnapshot> {
  const response = await sendRequest<TabDetailSnapshot>({
    type: 'tab-manager/get-tab-detail',
    tabId
  });

  if (!response.ok) throw new Error(response.error);
  return response.data;
}

const redirectTrackingPermissions: chrome.permissions.Permissions = {
  permissions: ['webNavigation', 'webRequest'],
  origins: ['http://*/*', 'https://*/*']
};

export async function getRedirectTrackingPermissionState(): Promise<RedirectTrackingPermissionState> {
  const response = await sendRequest<RedirectTrackingPermissionState>({
    type: 'tab-manager/get-redirect-tracking-permission'
  });

  if (!response.ok) throw new Error(response.error);
  return response.data;
}

export async function refreshRedirectTracking(): Promise<RedirectTrackingPermissionState> {
  const response = await sendRequest<RedirectTrackingPermissionState>({
    type: 'tab-manager/refresh-redirect-tracking'
  });

  if (!response.ok) throw new Error(response.error);
  return response.data;
}

export async function requestRedirectTrackingPermission(): Promise<boolean> {
  return chrome.permissions.request(redirectTrackingPermissions);
}

export async function removeRedirectTrackingPermission(): Promise<boolean> {
  return chrome.permissions.remove(redirectTrackingPermissions);
}

export async function requestOpenDashboard(): Promise<void> {
  const response = await sendRequest({
    type: 'tab-manager/open-dashboard'
  });

  if (!response.ok) throw new Error(response.error);
}

export async function openDashboardPage(): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') });
}

export async function openSidePanel(): Promise<boolean> {
  if (!chrome.sidePanel?.open) return false;

  const currentWindow = await chrome.windows.getCurrent();
  if (!currentWindow.id) return false;

  await chrome.sidePanel.open({ windowId: currentWindow.id });
  return true;
}

export async function openLaunchSurface(surface: LaunchSurface): Promise<void> {
  if (surface === 'sidepanel') {
    const opened = await openSidePanel();
    if (opened) return;
  }

  await openDashboardPage();
}

export async function openPreferredLaunchSurface(): Promise<void> {
  const settings = await getSettings();
  await openLaunchSurface(settings.launchSurface);
}

export async function focusTab(tabId: number, windowId: number): Promise<void> {
  await chrome.windows.update(windowId, { focused: true });
  await chrome.tabs.update(tabId, { active: true });
}

async function sendMutation(
  request:
    | Extract<ExtensionRequest, { type: 'tab-manager/close-tabs' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/pin-tabs' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/mute-tabs' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/discard-tabs' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/group-tabs' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/ungroup-tabs' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/move-tab-before' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/move-tab-after' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/move-tabs-before' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/move-tabs-after' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/update-group' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/smart-group-tabs' }>
): Promise<TabMutationResult> {
  const response = await sendRequest<TabMutationResult>(request);
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

export async function closeTabs(tabIds: number[]): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/close-tabs', tabIds });
}

export async function pinTabs(
  tabIds: number[],
  pinned: boolean
): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/pin-tabs', tabIds, pinned });
}

export async function muteTabs(
  tabIds: number[],
  muted: boolean
): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/mute-tabs', tabIds, muted });
}

export async function discardTabs(tabIds: number[]): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/discard-tabs', tabIds });
}

export async function groupTabs(
  tabIds: number[],
  options?: GroupTabsOptions
): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/group-tabs', tabIds, options });
}

export async function ungroupTabs(tabIds: number[]): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/ungroup-tabs', tabIds });
}

export async function moveTabBefore(
  tabId: number,
  beforeTabId: number
): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/move-tab-before', tabId, beforeTabId });
}

export async function moveTabAfter(
  tabId: number,
  afterTabId: number
): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/move-tab-after', tabId, afterTabId });
}

export async function moveTabsBefore(
  tabIds: number[],
  beforeTabId: number
): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/move-tabs-before', tabIds, beforeTabId });
}

export async function moveTabsAfter(
  tabIds: number[],
  afterTabId: number
): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/move-tabs-after', tabIds, afterTabId });
}

export async function updateGroup(
  groupId: number,
  patch: TabGroupUpdatePatch
): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/update-group', groupId, patch });
}

export async function smartGroupTabs(
  tabIds: number[],
  strategy: SmartGroupStrategy
): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/smart-group-tabs', tabIds, strategy });
}
