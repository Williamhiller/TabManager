import { getSettings } from './settings';
import type {
  BookmarkNodeSnapshot,
  BookmarksInvalidatedMessage,
  ExtensionRequest,
  ExtensionResult,
  BookmarkTreeSnapshot,
  BookmarkUpdatePatch,
  GroupTabsOptions,
  LaunchSurface,
  OverviewInvalidatedMessage,
  OverviewSnapshot,
  RedirectTrackingPermissionState,
  SessionRecord,
  SessionRestoreMode,
  SessionRestoreResult,
  SessionsInvalidatedMessage,
  SessionsSnapshot,
  SessionUpdatePatch,
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

export function subscribeToBookmarksUpdates(
  listener: (message: BookmarksInvalidatedMessage) => void
): () => void {
  const handleMessage = (message: unknown) => {
    const payload = message as Partial<BookmarksInvalidatedMessage> | null;
    if (
      !payload ||
      payload.type !== 'tab-manager/bookmarks-invalidated' ||
      typeof payload.at !== 'number'
    ) {
      return;
    }

    listener(payload as BookmarksInvalidatedMessage);
  };

  chrome.runtime.onMessage.addListener(handleMessage);
  return () => chrome.runtime.onMessage.removeListener(handleMessage);
}

export function subscribeToSessionsUpdates(
  listener: (message: SessionsInvalidatedMessage) => void
): () => void {
  const handleMessage = (message: unknown) => {
    const payload = message as Partial<SessionsInvalidatedMessage> | null;
    if (
      !payload ||
      payload.type !== 'tab-manager/sessions-invalidated' ||
      typeof payload.at !== 'number'
    ) {
      return;
    }

    listener(payload as SessionsInvalidatedMessage);
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

export async function getBookmarks(): Promise<BookmarkTreeSnapshot> {
  const response = await sendRequest<BookmarkTreeSnapshot>({
    type: 'tab-manager/get-bookmarks'
  });

  if (!response.ok) throw new Error(response.error);
  return response.data;
}

export async function getSessions(): Promise<SessionsSnapshot> {
  const response = await sendRequest<SessionsSnapshot>({
    type: 'tab-manager/get-sessions'
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

export async function openDashboardPage(
  view?: string,
  params: Record<string, string | undefined> = {}
): Promise<void> {
  const searchParams = new URLSearchParams();
  if (view) searchParams.set('view', view);

  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, value);
  });

  const query = searchParams.toString();
  const path = query ? `/dashboard.html?${query}` : '/dashboard.html';
  const url = chrome.runtime.getURL(path);
  const dashboardUrlPrefix = chrome.runtime.getURL('/dashboard.html');
  const existingTabs = await chrome.tabs.query({});
  const existingTab = existingTabs.find((tab) => tab.url?.startsWith(dashboardUrlPrefix));

  if (existingTab?.id != null) {
    await chrome.tabs.update(existingTab.id, { active: true, url });
    if (existingTab.windowId != null) {
      await chrome.windows.update(existingTab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url });
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
    | Extract<ExtensionRequest, { type: 'tab-manager/create-bookmark-folder' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/create-bookmark-from-active-tab' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/update-bookmark' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/delete-bookmark' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/move-bookmark' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/restore-session' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/delete-session' }>
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
    | Extract<ExtensionRequest, { type: 'tab-manager/move-group' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/update-group' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/smart-group-tabs' }>
): Promise<TabMutationResult> {
  const response = await sendRequest<TabMutationResult>(request);
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

async function sendSessionRequest(
  request:
    | Extract<ExtensionRequest, { type: 'tab-manager/save-current-window-session' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/save-all-windows-session' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/update-session' }>
): Promise<SessionRecord> {
  const response = await sendRequest<SessionRecord>(request);
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

async function sendBookmarkRequest<T extends BookmarkNodeSnapshot | null>(
  request:
    | Extract<ExtensionRequest, { type: 'tab-manager/create-bookmark-folder' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/create-bookmark-from-active-tab' }>
    | Extract<ExtensionRequest, { type: 'tab-manager/update-bookmark' }>
): Promise<T> {
  const response = await sendRequest<T>(request);
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

export async function moveGroup(
  groupId: number,
  target: { kind: 'group' | 'tab'; id: number },
  position: 'before' | 'after'
): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/move-group', groupId, target, position });
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

export async function createBookmarkFolder(
  parentId: string,
  title: string,
  index?: number
): Promise<BookmarkNodeSnapshot | null> {
  return sendBookmarkRequest({
    type: 'tab-manager/create-bookmark-folder',
    parentId,
    title,
    index
  });
}

export async function createBookmarkFromActiveTab(
  parentId: string,
  index?: number
): Promise<BookmarkNodeSnapshot | null> {
  return sendBookmarkRequest({
    type: 'tab-manager/create-bookmark-from-active-tab',
    parentId,
    index
  });
}

export async function updateBookmark(
  bookmarkId: string,
  patch: BookmarkUpdatePatch
): Promise<BookmarkNodeSnapshot | null> {
  return sendBookmarkRequest({
    type: 'tab-manager/update-bookmark',
    bookmarkId,
    patch
  });
}

export async function deleteBookmark(bookmarkId: string): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/delete-bookmark', bookmarkId });
}

export async function moveBookmark(
  bookmarkId: string,
  parentId: string,
  index?: number
): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/move-bookmark', bookmarkId, parentId, index });
}

export async function saveCurrentWindowSession(title?: string): Promise<SessionRecord> {
  return sendSessionRequest({ type: 'tab-manager/save-current-window-session', title });
}

export async function saveAllWindowsSession(title?: string): Promise<SessionRecord> {
  return sendSessionRequest({ type: 'tab-manager/save-all-windows-session', title });
}

export async function restoreSession(
  sessionId: string,
  mode: SessionRestoreMode = 'new-window'
): Promise<SessionRestoreResult> {
  const response = await sendRequest<SessionRestoreResult>({
    type: 'tab-manager/restore-session',
    sessionId,
    mode
  });
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

export async function updateSession(
  sessionId: string,
  patch: SessionUpdatePatch
): Promise<SessionRecord> {
  return sendSessionRequest({ type: 'tab-manager/update-session', sessionId, patch });
}

export async function deleteSession(sessionId: string): Promise<TabMutationResult> {
  return sendMutation({ type: 'tab-manager/delete-session', sessionId });
}
