export type LaunchSurface = 'sidepanel' | 'dashboard';
export type ThemeMode = 'light' | 'dark' | 'system';
export type LocaleMode = 'system' | 'en' | 'zh-CN';
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
  autoGroupEnabled: boolean;
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

export type ExtensionRequest =
  | { type: 'tab-manager/get-overview' }
  | { type: 'tab-manager/get-tab-detail'; tabId: number }
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
  | { type: 'tab-manager/update-group'; groupId: number; patch: TabGroupUpdatePatch }
  | { type: 'tab-manager/smart-group-tabs'; tabIds: number[]; strategy: SmartGroupStrategy };

export type ExtensionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };
