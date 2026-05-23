export type LaunchSurface = 'sidepanel' | 'popup' | 'dashboard';
export type ThemeMode = 'light' | 'dark' | 'system';
export type LocaleMode = 'system' | 'en' | 'zh-CN' | 'ja' | 'fr' | 'es' | 'ar';
export type AutoCollapseInactiveGroupsMinutes = 0 | 5 | 10 | 30 | 60 | 120;
export type AutoSleepInactiveTabsMinutes = 0 | 5 | 10 | 30 | 60 | 120;
export type AutoCloseInactiveTabsMinutes = 0 | 5 | 10 | 30 | 60 | 120;
export type AutoCloseCondition = 'sleeping-only' | 'deep-idle';
export type AutoDeduplicationScope = 'global-except-listed' | 'listed-only';
export type AutoGroupRuleField = 'hostname' | 'url' | 'title';
export type AutoGroupRuleOperator = 'contains' | 'equals';
export type TabGroupColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

export interface AutoGroupRule {
  id: string;
  field: AutoGroupRuleField;
  operator: AutoGroupRuleOperator;
  value: string;
}

export interface AutoGroupConfig {
  id: string;
  presetId?: string;
  title: string;
  color: TabGroupColor;
  enabled: boolean;
  websites: string[];
  rules: AutoGroupRule[];
}

export interface TabGroupUpdatePatch {
  title?: string;
  color?: TabGroupColor;
  collapsed?: boolean;
  autoGroupEnabled?: boolean;
  autoGroupConfigId?: string | null;
  autoGroupPresetIds?: string[];
  autoGroupRules?: AutoGroupRule[];
}

export type SmartGroupStrategy = 'domain' | 'site-type';

export interface GroupTabsOptions {
  groupId?: number;
  title?: string;
  color?: TabGroupColor;
}

export interface ManagerSettings {
  launchSurface: LaunchSurface;
  autoRefreshSeconds: number;
  autoCollapseInactiveGroupsMinutes: AutoCollapseInactiveGroupsMinutes;
  autoSleepInactiveTabsMinutes: AutoSleepInactiveTabsMinutes;
  autoCloseInactiveTabsMinutes: AutoCloseInactiveTabsMinutes;
  autoCloseCondition: AutoCloseCondition;
  autoCleanupWhitelist: string[];
  autoDeduplicateTabs: boolean;
  autoDeduplicationScope: AutoDeduplicationScope;
  autoDeduplicationSites: string[];
  autoGroupEnabled: boolean;
  autoSnapshotsEnabled: boolean;
  showHistory: boolean;
  redirectTrackingEnabled: boolean;
  autoGroupPresetIds: string[];
  autoGroupConfigs: AutoGroupConfig[];
  theme: ThemeMode;
  locale: LocaleMode;
}

export interface TabGroupSnapshot {
  id: number;
  title: string;
  color: string;
  collapsed: boolean;
  autoGroupEnabled: boolean;
  autoGroupConfigId?: string | null;
  autoGroupPresetIds: string[];
  autoGroupRules: AutoGroupRule[];
}

export interface RuntimeTabTelemetry {
  observedAt: number;
  openedAt: number | null;
  lastActivatedAt: number | null;
  totalActiveMs: number;
}

export type TabHistoryEventKind =
  | 'observed'
  | 'created'
  | 'closed'
  | 'navigated'
  | 'redirected'
  | 'history-state'
  | 'retitled'
  | 'activated'
  | 'pinned'
  | 'muted'
  | 'discarded'
  | 'grouped'
  | 'ungrouped';

export interface TabHistoryEvent {
  id: string;
  at: number;
  kind: TabHistoryEventKind;
  title: string;
  url: string;
  hostname: string;
  fromTitle?: string | null;
  fromUrl?: string | null;
  fromGroupTitle?: string | null;
  toGroupTitle?: string | null;
  value?: boolean | null;
}

export interface TabSnapshot {
  id: number;
  windowId: number;
  index: number;
  groupId: number;
  title: string;
  url: string;
  hostname: string;
  favIconUrl: string | null;
  active: boolean;
  pinned: boolean;
  audible: boolean;
  muted: boolean;
  discarded: boolean;
  frozen: boolean;
  status: string;
  incognito: boolean;
  openerTabId: number | null;
  lastAccessed: number | null;
  telemetry: RuntimeTabTelemetry;
  group: TabGroupSnapshot | null;
}

export interface HistoryTabSnapshot {
  id: string;
  originalTabId: number;
  title: string;
  url: string;
  hostname: string;
  favIconUrl: string | null;
  groupTitle: string | null;
  closedAt: number;
  telemetry: RuntimeTabTelemetry;
}

export interface SystemMemorySnapshot {
  totalBytes: number;
  availableBytes: number;
  usedBytes: number;
}

export interface OverviewStats {
  totalTabs: number;
  windowCount: number;
  groupedTabs: number;
  sleepingTabs: number;
  audibleTabs: number;
}

export interface OverviewSnapshot {
  generatedAt: number;
  stats: OverviewStats;
  systemMemory: SystemMemorySnapshot | null;
  tabs: TabSnapshot[];
  historyTabs: HistoryTabSnapshot[];
}

export interface TabDetailSnapshot {
  tab: TabSnapshot | null;
  history: TabHistoryEvent[];
}

export interface TabMutationResult {
  affectedTabIds: number[];
  affectedCount: number;
}

export interface RedirectTrackingPermissionState {
  granted: boolean;
}

export interface BookmarkNodeSnapshot {
  id: string;
  parentId: string | null;
  index: number;
  title: string;
  url: string | null;
  dateAdded: number | null;
  dateGroupModified: number | null;
  folderType: string | null;
  syncing: boolean;
  unmodifiable: string | null;
  children: BookmarkNodeSnapshot[];
}

export interface BookmarkTreeSnapshot {
  roots: BookmarkNodeSnapshot[];
  totalBookmarks: number;
  totalFolders: number;
}

export interface BookmarkUpdatePatch {
  title?: string;
  url?: string;
}

export type SessionSource = 'manual' | 'auto';

export interface SessionTabRecord {
  url: string;
  title: string;
  hostname: string;
  favIconUrl: string | null;
  pinned: boolean;
  muted: boolean;
  group: {
    key: string;
    title: string;
    color: TabGroupColor;
  } | null;
}

export interface SessionWindowRecord {
  id: string;
  title: string;
  tabs: SessionTabRecord[];
}

export interface SessionStats {
  windowCount: number;
  tabCount: number;
  groupCount: number;
}

export interface SessionRecord {
  id: string;
  title: string;
  note: string;
  tags: string[];
  pinned: boolean;
  source: SessionSource;
  createdAt: number;
  updatedAt: number;
  windows: SessionWindowRecord[];
  stats: SessionStats;
}

export interface SessionsSnapshot {
  generatedAt: number;
  sessions: SessionRecord[];
  totalSessions: number;
}

export interface SessionUpdatePatch {
  title?: string;
  note?: string;
  tags?: string[];
  pinned?: boolean;
}

export type SessionRestoreMode = 'new-window' | 'current-window';

export interface SessionRestoreResult extends TabMutationResult {
  failedCount: number;
}

export type OverviewChangeReason =
  | 'created'
  | 'updated'
  | 'activated'
  | 'removed'
  | 'focused';

export interface OverviewInvalidatedMessage {
  type: 'tab-manager/overview-invalidated';
  at: number;
  reason: OverviewChangeReason;
}

export interface BookmarksInvalidatedMessage {
  type: 'tab-manager/bookmarks-invalidated';
  at: number;
}

export interface SessionsInvalidatedMessage {
  type: 'tab-manager/sessions-invalidated';
  at: number;
}

export type ExtensionRequest =
  | { type: 'tab-manager/get-overview' }
  | { type: 'tab-manager/get-tab-detail'; tabId: number }
  | { type: 'tab-manager/get-bookmarks' }
  | { type: 'tab-manager/get-sessions' }
  | { type: 'tab-manager/save-current-window-session'; title?: string }
  | { type: 'tab-manager/save-all-windows-session'; title?: string }
  | { type: 'tab-manager/restore-session'; sessionId: string; mode?: SessionRestoreMode }
  | { type: 'tab-manager/update-session'; sessionId: string; patch: SessionUpdatePatch }
  | { type: 'tab-manager/delete-session'; sessionId: string }
  | { type: 'tab-manager/create-bookmark-folder'; parentId: string; title: string; index?: number }
  | { type: 'tab-manager/create-bookmark-from-active-tab'; parentId: string; index?: number }
  | { type: 'tab-manager/update-bookmark'; bookmarkId: string; patch: BookmarkUpdatePatch }
  | { type: 'tab-manager/delete-bookmark'; bookmarkId: string }
  | { type: 'tab-manager/move-bookmark'; bookmarkId: string; parentId: string; index?: number }
  | { type: 'tab-manager/get-redirect-tracking-permission' }
  | { type: 'tab-manager/refresh-redirect-tracking' }
  | { type: 'tab-manager/open-dashboard' }
  | { type: 'tab-manager/close-tabs'; tabIds: number[] }
  | { type: 'tab-manager/pin-tabs'; tabIds: number[]; pinned: boolean }
  | { type: 'tab-manager/mute-tabs'; tabIds: number[]; muted: boolean }
  | { type: 'tab-manager/discard-tabs'; tabIds: number[] }
  | { type: 'tab-manager/group-tabs'; tabIds: number[]; options?: GroupTabsOptions }
  | { type: 'tab-manager/ungroup-tabs'; tabIds: number[] }
  | { type: 'tab-manager/move-tab-before'; tabId: number; beforeTabId: number }
  | { type: 'tab-manager/move-tab-after'; tabId: number; afterTabId: number }
  | { type: 'tab-manager/move-tabs-before'; tabIds: number[]; beforeTabId: number }
  | { type: 'tab-manager/move-tabs-after'; tabIds: number[]; afterTabId: number }
  | {
      type: 'tab-manager/move-group';
      groupId: number;
      target: { kind: 'group' | 'tab'; id: number };
      position: 'before' | 'after';
    }
  | { type: 'tab-manager/update-group'; groupId: number; patch: TabGroupUpdatePatch }
  | { type: 'tab-manager/smart-group-tabs'; tabIds: number[]; strategy: SmartGroupStrategy };

export type ExtensionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };
