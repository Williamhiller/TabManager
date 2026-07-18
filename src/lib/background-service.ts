import type {
  AutoGroupConfig,
  AutoGroupRule,
  BookmarkNodeSnapshot,
  BookmarksInvalidatedMessage,
  BookmarkTreeSnapshot,
  BookmarkUpdatePatch,
  BrowserCommandShortcutState,
  ExtensionRequest,
  ExtensionResult,
  GroupTabsOptions,
  LocaleMode,
  ManagerSettings,
  OverviewChangeReason,
  OverviewInvalidatedMessage,
  OverviewSnapshot,
  RedirectTrackingPermissionState,
  RuntimeTabTelemetry,
  RuntimeTabListItem,
  SessionRecord,
  SessionRestoreMode,
  SessionRestoreResult,
  SessionsInvalidatedMessage,
  SessionsSnapshot,
  SessionStats,
  SessionTabRecord,
  SessionUpdatePatch,
  SessionWindowRecord,
  SmartGroupStrategy,
  SystemMemorySnapshot,
  TabDetailSnapshot,
  TabHistoryEvent,
  TabHistoryEventKind,
  TabGroupSnapshot,
  TabGroupColor,
  TabGroupUpdatePatch,
  TabMutationResult,
  TabSnapshot
} from './contracts';
import {
  defaultAutoGroupPresets,
  getDefaultAutoGroupPresetTitle,
  isDefaultAutoGroupPresetTitle,
  matchesDefaultAutoGroupPresetById,
  matchDefaultAutoGroupPreset
} from './auto-group-defaults';
import { createAutoGroupConfig } from './auto-group-config';
import {
  matchesAutoGroupConfig,
  matchesAutoGroupRule,
  normalizeAutoGroupRuleValue
} from './auto-group-matcher';
import { planAutoDeduplication } from './auto-deduplicate';
import { updateAutoGroupConfigTitleFromGroup } from './auto-group-config-sync';
import {
  AUTO_GROUP_MIN_TAB_COUNT,
  collectCreateableAutoGroupTabIds,
  shouldCleanupSingleTabAutoGroup
} from './auto-group-tab-policy';
import { openOrRefreshDashboardTab } from './dashboard-tabs';
import { resolveFavIconUrl } from './favicon';
import { getErrorMessage } from './format';
import {
  getShortcutConfig,
  updateShortcutConfig,
  updateSingleShortcut
} from './keyboard-shortcuts/config';
import type {
  KeyboardShortcutsConfig,
  ShortcutConfig
} from './keyboard-shortcuts/types';
import { getSettings, SETTINGS_KEY, updateSettings } from './settings';
import { filterSameWindowTabs, findSameWindowGroup } from './window-scope';
import { normalizeHostname, normalizeWebsitePattern, allGroupColors, redirectTrackingPermissions } from './shared-utils';

interface RuntimeTabState {
  observedAt: number;
  openedAt: number | null;
  lastActivatedAt: number | null;
  lastAudibleAt: number | null;
  autoDeduplicationPendingFromCreate: boolean;
  totalActiveMs: number;
}

interface ActiveWindowSession {
  tabId: number;
  startedAt: number;
}

interface StoredTabState {
  tabId: number;
  windowId: number;
  index: number;
  title: string;
  url: string;
  hostname: string;
  favIconUrl: string | null;
  active: boolean;
  pinned: boolean;
  muted: boolean;
  discarded: boolean;
  frozen: boolean;
  status: string;
  groupId: number;
  groupTitle: string | null;
  lastAccessed: number | null;
}

interface TabHistoryRecord {
  snapshot: StoredTabState;
  telemetry: RuntimeTabTelemetry;
  history: TabHistoryEvent[];
  updatedAt: number;
}

interface ClosedTabHistoryRecord {
  id: string;
  closedAt: number;
  snapshot: StoredTabState;
  telemetry: RuntimeTabTelemetry;
  history: TabHistoryEvent[];
}

interface PersistedTabHistoryState {
  active: Record<string, TabHistoryRecord>;
  recentClosed: ClosedTabHistoryRecord[];
}

interface GroupMetadataRecord {
  autoGroupCreated?: boolean;
  autoGroupEnabled: boolean;
  autoGroupConfigId?: string | null;
  autoGroupPresetIds: string[];
  autoGroupRules: AutoGroupRule[];
  lastInteractedAt?: number | null;
}

interface PersistedGroupMetadataState {
  groups: Record<string, GroupMetadataRecord>;
}

interface AutoGroupExemptionRecord {
  targetKey: string;
  updatedAt: number;
}

interface PersistedAutoGroupExemptionState {
  tabs: Record<string, AutoGroupExemptionRecord>;
}

interface PersistedSessionsState {
  version: 1;
  sessions: Record<string, SessionRecord>;
}

interface PendingRedirectEvent {
  fromUrl: string;
  toUrl: string;
  at: number;
  statusCode: number;
}

type MatchingAutoGroupTarget =
  | {
      kind: 'group';
      targetKey: string;
      group: chrome.tabGroups.TabGroup;
    }
  | {
      kind: 'config';
      targetKey: string;
      config: AutoGroupConfig;
      configTitle: string;
      existingConfiguredGroup?: chrome.tabGroups.TabGroup;
    };

const runtimeTabs = new Map<number, RuntimeTabState>();
const activeWindowSessions = new Map<number, ActiveWindowSession>();
const tabHistoryRecords = new Map<number, TabHistoryRecord>();
const recentClosedTabHistory: ClosedTabHistoryRecord[] = [];
const groupMetadataRecords = new Map<number, GroupMetadataRecord>();
const groupInteractionRecords = new Map<number, number>();
const observedGroupTitles = new Map<number, string>();
const autoGroupExemptionRecords = new Map<number, AutoGroupExemptionRecord>();
const programmaticAutoGroupTabIds = new Set<number>();
const programmaticAutoGroupUngroupTabIds = new Set<number>();
const sessionRecords = new Map<string, SessionRecord>();
const pendingRedirectEvents = new Map<number, PendingRedirectEvent[]>();
const COMMAND_PALETTE_COMMAND_NAME = 'toggle-command-palette';
const TAB_HISTORY_STORAGE_KEY = 'tab-manager/tab-history';
const GROUP_METADATA_STORAGE_KEY = 'tab-manager/group-metadata';
const AUTO_GROUP_EXEMPTIONS_STORAGE_KEY = 'tab-manager/auto-group-exemptions';
const SESSIONS_STORAGE_KEY = 'tab-manager/sessions';
const AUTO_COLLAPSE_INACTIVE_GROUPS_ALARM = 'tab-manager/auto-collapse-inactive-groups';
const ACTION_BADGE_DUPLICATE_COLOR = '#8B735D';
const ACTION_BADGE_TEXT_COLOR = '#FFFFFF';
const RUNTIME_MESSAGE_TIMEOUT_MS = 25_000;
const RUNTIME_MUTATION_MESSAGE_TIMEOUT_MS = 60_000;
const MAX_TAB_HISTORY_EVENTS = 120;
const MAX_RECENT_CLOSED_TABS = 10;
const OVERVIEW_INVALIDATION_DEBOUNCE_MS = 80;
const AUTO_SESSION_DEBOUNCE_MS = 10_000;
const MAX_MANUAL_SESSIONS = 10;
const MAX_AUTO_SESSIONS = 10;
const AUTO_SESSION_FINE_WINDOW_MS = 60 * 60_000;
const AUTO_SESSION_SPARSE_INTERVAL_MS = 30 * 60_000;
const MAX_FINE_AUTO_SESSIONS = 3;

let tabHistoryLoadPromise: Promise<void> | null = null;
let groupMetadataLoadPromise: Promise<void> | null = null;
let autoGroupExemptionLoadPromise: Promise<void> | null = null;
let sessionsLoadPromise: Promise<void> | null = null;
let persistTabHistoryTimer: ReturnType<typeof setTimeout> | null = null;
let persistGroupMetadataTimer: ReturnType<typeof setTimeout> | null = null;
let persistAutoGroupExemptionTimer: ReturnType<typeof setTimeout> | null = null;
let persistSessionsTimer: ReturnType<typeof setTimeout> | null = null;
let overviewInvalidationTimer: ReturnType<typeof setTimeout> | null = null;
let actionBadgeUpdateTimer: ReturnType<typeof setTimeout> | null = null;
let pendingOverviewInvalidationReason: OverviewChangeReason = 'updated';
let autoCollapseInactiveGroupsInFlight = false;
let autoSleepInactiveTabsInFlight = false;
let autoCloseInactiveTabsInFlight = false;
let redirectTrackingEnabled = false;
let redirectBeforeRequestListenerInstalled = false;
let redirectBeforeNavigateListenerInstalled = false;
let redirectCommittedListenerInstalled = false;
let redirectHistoryStateListenerInstalled = false;
let autoSessionTimer: ReturnType<typeof setTimeout> | null = null;
let autoSessionCaptureInFlight = false;

function ensureRuntimeTab(
  tabId: number,
  observedAt = Date.now(),
  lastAccessed?: number | null
): RuntimeTabState {
  const existing = runtimeTabs.get(tabId);
  if (existing) {
    // When called during seed, prefer the Chrome-reported lastAccessed if it is
    // more recent than the stored observedAt.  This keeps the value accurate
    // across service-worker restarts without resetting it to Date.now().
    if (typeof lastAccessed === 'number' && lastAccessed > existing.observedAt) {
      existing.observedAt = lastAccessed;
    }
    return existing;
  }

  // For pre-existing tabs (seed), prefer Chrome's lastAccessed so that tabs
  // that have been idle for a long time are not falsely marked as "just active".
  // For newly created tabs (no lastAccessed), fall back to Date.now().
  const effectiveObservedAt =
    typeof lastAccessed === 'number' && lastAccessed > 0 ? lastAccessed : observedAt;

  const created: RuntimeTabState = {
    observedAt: effectiveObservedAt,
    openedAt: null,
    lastActivatedAt: null,
    lastAudibleAt: null,
    autoDeduplicationPendingFromCreate: false,
    totalActiveMs: 0
  };

  runtimeTabs.set(tabId, created);
  return created;
}

function sortHistoryEvents(history: TabHistoryEvent[] | undefined): TabHistoryEvent[] {
  return [...(history ?? [])]
    .map((event) =>
      event.kind === 'navigated'
        ? { ...event, fromTitle: undefined, fromUrl: undefined }
        : event
    )
    .sort((first, second) => first.at - second.at);
}

function stopActiveSession(windowId: number, at = Date.now()): void {
  const session = activeWindowSessions.get(windowId);
  if (!session) return;

  const state = runtimeTabs.get(session.tabId);
  if (state) {
    state.totalActiveMs += Math.max(0, at - session.startedAt);
  }

  activeWindowSessions.delete(windowId);
}

function startActiveSession(windowId: number, tabId: number, at = Date.now()): void {
  stopActiveSession(windowId, at);

  const state = ensureRuntimeTab(tabId, at);
  state.lastActivatedAt = at;
  activeWindowSessions.set(windowId, { tabId, startedAt: at });
}

async function seedRuntimeState(): Promise<void> {
  await ensureTabHistoryLoaded();
  await ensureAutoGroupExemptionsLoaded();

  const tabs = await chrome.tabs.query({});
  const groups = await chrome.tabGroups.query({});
  const now = Date.now();
  const liveIds = new Set<number>();

  observedGroupTitles.clear();
  const liveGroupIds = new Set<number>();
  for (const group of groups) {
    observedGroupTitles.set(group.id, group.title ?? '');
    liveGroupIds.add(group.id);
  }

  // Clean up interaction records for groups that no longer exist.
  for (const groupId of [...groupInteractionRecords.keys()]) {
    if (!liveGroupIds.has(groupId)) {
      groupInteractionRecords.delete(groupId);
    }
  }

  for (const tab of tabs) {
    if (tab.id == null) continue;
    liveIds.add(tab.id);
    // Use Chrome's lastAccessed (when available) so that pre-existing tabs
    // that have been idle for a long time keep an accurate observedAt instead
    // of being reset to Date.now() on every service-worker restart.
    const tabLastAccessed = typeof tab.lastAccessed === 'number' ? tab.lastAccessed : null;
    const state = ensureRuntimeTab(tab.id, now, tabLastAccessed);

    // Restore totalActiveMs from persisted tab history so the running total
    // survives service-worker restarts instead of resetting to 0.
    const persistedRecord = tabHistoryRecords.get(tab.id);
    if (persistedRecord?.telemetry?.totalActiveMs) {
      state.totalActiveMs = persistedRecord.telemetry.totalActiveMs;
    }

    await trackTabHistory(tab, 'seed');
  }

  for (const tabId of [...tabHistoryRecords.keys()]) {
    if (liveIds.has(tabId)) continue;
    archiveClosedTabHistory(tabId, now);
  }

  let removedExemption = false;
  for (const tabId of [...autoGroupExemptionRecords.keys()]) {
    if (liveIds.has(tabId)) continue;
    autoGroupExemptionRecords.delete(tabId);
    removedExemption = true;
  }
  if (removedExemption) {
    scheduleAutoGroupExemptionsPersist();
  }

  const windows = await chrome.windows.getAll({
    populate: true,
    windowTypes: ['normal']
  });
  const focusedWindow = windows.find((window) => window.focused);

  if (!focusedWindow?.id || !focusedWindow.tabs) return;

  const activeTab = focusedWindow.tabs.find((tab) => tab.active && tab.id != null);

  if (activeTab?.id != null) {
    startActiveSession(focusedWindow.id, activeTab.id, now);
  }
}

let tabHistoryLoadFailedAt = 0;
const LOAD_RETRY_COOLDOWN_MS = 5_000;

async function ensureTabHistoryLoaded(): Promise<void> {
  if (tabHistoryLoadPromise) return tabHistoryLoadPromise;

  // After a failure, wait before retrying to avoid a thundering herd when
  // multiple callers retry simultaneously.
  if (tabHistoryLoadFailedAt && Date.now() - tabHistoryLoadFailedAt < LOAD_RETRY_COOLDOWN_MS) {
    throw new Error('Tab history load is in cooldown period after previous failure.');
  }

  tabHistoryLoadPromise = (async () => {
    try {
      const stored = await chrome.storage.local.get(TAB_HISTORY_STORAGE_KEY);
      const raw = stored[TAB_HISTORY_STORAGE_KEY];
      if (!raw || typeof raw !== 'object') return;

      const state = raw as Partial<PersistedTabHistoryState> | Record<string, TabHistoryRecord>;
      const activeRecords =
        'active' in state && state.active && typeof state.active === 'object'
          ? state.active
          : (state as Record<string, TabHistoryRecord>);
      const recentClosed =
        'recentClosed' in state && Array.isArray(state.recentClosed) ? state.recentClosed : [];

      for (const [tabId, record] of Object.entries(activeRecords)) {
        const numericTabId = Number(tabId);
        if (!Number.isInteger(numericTabId) || !record?.snapshot || !record?.telemetry) continue;
        record.history = sortHistoryEvents(record.history);
        tabHistoryRecords.set(numericTabId, record);
      }

      recentClosedTabHistory.splice(
        0,
        recentClosedTabHistory.length,
        ...recentClosed.slice(0, MAX_RECENT_CLOSED_TABS).filter((record) => {
          if (!record?.snapshot) return false;
          record.history = sortHistoryEvents(record.history);
          return true;
        })
      );

      tabHistoryLoadFailedAt = 0;
    } catch (error) {
      tabHistoryLoadFailedAt = Date.now();
      tabHistoryLoadPromise = null;
      throw error;
    }
  })();

  return tabHistoryLoadPromise;
}

function hydrateGroupMetadataRecords(
  raw: Partial<PersistedGroupMetadataState> | Record<string, GroupMetadataRecord> | null | undefined
): void {
  groupMetadataRecords.clear();
  if (!raw || typeof raw !== 'object') return;

  const state = raw as Partial<PersistedGroupMetadataState> | Record<string, GroupMetadataRecord>;
  const records =
    'groups' in state && state.groups && typeof state.groups === 'object'
      ? state.groups
      : (state as Record<string, GroupMetadataRecord>);

  for (const [groupId, record] of Object.entries(records)) {
    const numericGroupId = Number(groupId);
    if (!Number.isInteger(numericGroupId) || !record) continue;
    groupMetadataRecords.set(numericGroupId, {
      autoGroupCreated: record.autoGroupCreated === true,
      autoGroupEnabled: record.autoGroupEnabled ?? true,
      autoGroupConfigId: typeof record.autoGroupConfigId === 'string' ? record.autoGroupConfigId : null,
      autoGroupPresetIds: Array.isArray(record.autoGroupPresetIds) ? record.autoGroupPresetIds : [],
      autoGroupRules: Array.isArray(record.autoGroupRules) ? record.autoGroupRules : [],
      lastInteractedAt:
        typeof record.lastInteractedAt === 'number' && Number.isFinite(record.lastInteractedAt)
          ? record.lastInteractedAt
          : null
    });
  }
}

let groupMetadataLoadFailedAt = 0;

async function ensureGroupMetadataLoaded(): Promise<void> {
  if (groupMetadataLoadPromise) return groupMetadataLoadPromise;

  if (groupMetadataLoadFailedAt && Date.now() - groupMetadataLoadFailedAt < LOAD_RETRY_COOLDOWN_MS) {
    throw new Error('Group metadata load is in cooldown period after previous failure.');
  }

  groupMetadataLoadPromise = (async () => {
    try {
      const stored = await chrome.storage.local.get(GROUP_METADATA_STORAGE_KEY);
      hydrateGroupMetadataRecords(
        stored[GROUP_METADATA_STORAGE_KEY] as
          | Partial<PersistedGroupMetadataState>
          | Record<string, GroupMetadataRecord>
          | null
          | undefined
      );
      groupMetadataLoadFailedAt = 0;
    } catch (error) {
      groupMetadataLoadFailedAt = Date.now();
      groupMetadataLoadPromise = null;
      throw error;
    }
  })();

  return groupMetadataLoadPromise;
}

function hydrateAutoGroupExemptionRecords(
  raw:
    | Partial<PersistedAutoGroupExemptionState>
    | Record<string, AutoGroupExemptionRecord>
    | null
    | undefined
): void {
  autoGroupExemptionRecords.clear();
  if (!raw || typeof raw !== 'object') return;

  const state =
    raw as Partial<PersistedAutoGroupExemptionState> | Record<string, AutoGroupExemptionRecord>;
  const records =
    'tabs' in state && state.tabs && typeof state.tabs === 'object'
      ? state.tabs
      : (state as Record<string, AutoGroupExemptionRecord>);

  for (const [tabId, record] of Object.entries(records)) {
    const numericTabId = Number(tabId);
    if (!Number.isInteger(numericTabId) || !record?.targetKey) continue;
    autoGroupExemptionRecords.set(numericTabId, {
      targetKey: record.targetKey,
      updatedAt: record.updatedAt ?? Date.now()
    });
  }
}

let autoGroupExemptionLoadFailedAt = 0;

async function ensureAutoGroupExemptionsLoaded(): Promise<void> {
  if (autoGroupExemptionLoadPromise) return autoGroupExemptionLoadPromise;

  if (autoGroupExemptionLoadFailedAt && Date.now() - autoGroupExemptionLoadFailedAt < LOAD_RETRY_COOLDOWN_MS) {
    throw new Error('Auto group exemptions load is in cooldown period after previous failure.');
  }

  autoGroupExemptionLoadPromise = (async () => {
    try {
      const stored = await chrome.storage.local.get(AUTO_GROUP_EXEMPTIONS_STORAGE_KEY);
      hydrateAutoGroupExemptionRecords(
        stored[AUTO_GROUP_EXEMPTIONS_STORAGE_KEY] as
          | Partial<PersistedAutoGroupExemptionState>
          | Record<string, AutoGroupExemptionRecord>
          | null
          | undefined
      );
      autoGroupExemptionLoadFailedAt = 0;
    } catch (error) {
      autoGroupExemptionLoadFailedAt = Date.now();
      autoGroupExemptionLoadPromise = null;
      throw error;
    }
  })();

  return autoGroupExemptionLoadPromise;
}

function hydrateSessionRecords(raw: Partial<PersistedSessionsState> | Record<string, SessionRecord> | null | undefined): void {
  sessionRecords.clear();
  const records =
    raw && 'sessions' in raw && raw.sessions && typeof raw.sessions === 'object'
      ? raw.sessions
      : raw && typeof raw === 'object'
        ? raw as Record<string, SessionRecord>
        : {};

  for (const [sessionId, record] of Object.entries(records)) {
    if (!record || typeof record !== 'object') continue;
    if (!record.id || !Array.isArray(record.windows)) continue;
    const source = record.source === 'auto' ? 'auto' : 'manual';
    sessionRecords.set(sessionId, {
      ...record,
      title: source === 'auto' ? formatSessionTimeTitle(record.updatedAt ?? record.createdAt) : record.title,
      note: record.note ?? '',
      tags: Array.isArray(record.tags) ? record.tags : [],
      pinned: record.pinned ?? false,
      source,
      windows: record.windows.map((window: SessionWindowRecord, windowIndex: number) => ({
        ...window,
        tabs: window.tabs.map((tab: SessionTabRecord, tabIndex: number) => ({
          ...tab,
          group: tab.group
            ? {
                key:
                  typeof tab.group.key === 'string' && tab.group.key
                    ? tab.group.key
                    : `legacy:${windowIndex}:${tab.group.title}:${tab.group.color}:${tabIndex}`,
                title: tab.group.title,
                color: tab.group.color
              }
            : null
        }))
      }))
    });
  }

  trimAutoSessions();
}

let sessionsLoadFailedAt = 0;

async function ensureSessionsLoaded(): Promise<void> {
  if (sessionsLoadPromise) return sessionsLoadPromise;

  if (sessionsLoadFailedAt && Date.now() - sessionsLoadFailedAt < LOAD_RETRY_COOLDOWN_MS) {
    throw new Error('Sessions load is in cooldown period after previous failure.');
  }

  sessionsLoadPromise = (async () => {
    try {
      const stored = await chrome.storage.local.get(SESSIONS_STORAGE_KEY);
      hydrateSessionRecords(
        stored[SESSIONS_STORAGE_KEY] as
          | Partial<PersistedSessionsState>
          | Record<string, SessionRecord>
          | null
          | undefined
      );
      sessionsLoadFailedAt = 0;
    } catch (error) {
      sessionsLoadFailedAt = Date.now();
      sessionsLoadPromise = null;
      throw error;
    }
  })();

  return sessionsLoadPromise;
}

function serializeTabHistoryRecords(): PersistedTabHistoryState {
  return {
    active: Object.fromEntries(
      Array.from(tabHistoryRecords.entries()).map(([tabId, record]) => [String(tabId), record])
    ),
    recentClosed: recentClosedTabHistory
  };
}

function serializeGroupMetadataRecords(): PersistedGroupMetadataState {
  return {
    groups: Object.fromEntries(
      Array.from(groupMetadataRecords.entries()).map(([groupId, record]) => [String(groupId), record])
    )
  };
}

function serializeAutoGroupExemptionRecords(): PersistedAutoGroupExemptionState {
  return {
    tabs: Object.fromEntries(
      Array.from(autoGroupExemptionRecords.entries()).map(([tabId, record]) => [
        String(tabId),
        record
      ])
    )
  };
}

function serializeSessionRecords(): PersistedSessionsState {
  return {
    version: 1,
    sessions: Object.fromEntries(sessionRecords.entries())
  };
}

function scheduleTabHistoryPersist(): void {
  if (persistTabHistoryTimer != null) return;

  persistTabHistoryTimer = setTimeout(() => {
    persistTabHistoryTimer = null;
    void chrome.storage.local
      .set({ [TAB_HISTORY_STORAGE_KEY]: serializeTabHistoryRecords() })
      .catch((error) => {
        console.warn('Failed to persist tab history.', error);
      });
  }, 120);
}

let groupMetadataPersistInFlight = false;

function scheduleGroupMetadataPersist(): void {
  if (persistGroupMetadataTimer != null) return;

  persistGroupMetadataTimer = setTimeout(() => {
    persistGroupMetadataTimer = null;
    groupMetadataPersistInFlight = true;
    void chrome.storage.local
      .set({ [GROUP_METADATA_STORAGE_KEY]: serializeGroupMetadataRecords() })
      .catch((error) => {
        console.warn('Failed to persist group metadata.', error);
      })
      .finally(() => {
        groupMetadataPersistInFlight = false;
      });
  }, 120);
}

function scheduleAutoGroupExemptionsPersist(): void {
  if (persistAutoGroupExemptionTimer != null) return;

  persistAutoGroupExemptionTimer = setTimeout(() => {
    persistAutoGroupExemptionTimer = null;
    void chrome.storage.local
      .set({ [AUTO_GROUP_EXEMPTIONS_STORAGE_KEY]: serializeAutoGroupExemptionRecords() })
      .catch((error) => {
        console.warn('Failed to persist auto group exemptions.', error);
      });
  }, 120);
}

function scheduleSessionsPersist(): void {
  if (persistSessionsTimer != null) return;

  persistSessionsTimer = setTimeout(() => {
    persistSessionsTimer = null;
    void chrome.storage.local
      .set({ [SESSIONS_STORAGE_KEY]: serializeSessionRecords() })
      .catch((error) => {
        console.warn('Failed to persist sessions.', error);
      });
  }, 120);
}

async function persistSessionsNow(): Promise<void> {
  if (persistSessionsTimer != null) {
    clearTimeout(persistSessionsTimer);
    persistSessionsTimer = null;
  }

  await chrome.storage.local.set({ [SESSIONS_STORAGE_KEY]: serializeSessionRecords() });
}

function scheduleOverviewInvalidation(reason: OverviewChangeReason): void {
  pendingOverviewInvalidationReason = reason;
  if (overviewInvalidationTimer != null) return;

  overviewInvalidationTimer = setTimeout(() => {
    overviewInvalidationTimer = null;

    const message: OverviewInvalidatedMessage = {
      type: 'tab-manager/overview-invalidated',
      at: Date.now(),
      reason: pendingOverviewInvalidationReason
    };

    void chrome.runtime.sendMessage(message).catch(() => {});
  }, OVERVIEW_INVALIDATION_DEBOUNCE_MS);
}

function scheduleBookmarksInvalidation(): void {
  const message: BookmarksInvalidatedMessage = {
    type: 'tab-manager/bookmarks-invalidated',
    at: Date.now()
  };

  void chrome.runtime.sendMessage(message).catch(() => {});
}

function scheduleSessionsInvalidation(): void {
  const message: SessionsInvalidatedMessage = {
    type: 'tab-manager/sessions-invalidated',
    at: Date.now()
  };

  void chrome.runtime.sendMessage(message).catch(() => {});
}

function getGroupMetadata(groupId: number): GroupMetadataRecord {
  return groupMetadataRecords.get(groupId) ?? {
    autoGroupCreated: false,
    autoGroupEnabled: true,
    autoGroupConfigId: null,
    autoGroupPresetIds: [],
    autoGroupRules: [],
    lastInteractedAt: null
  };
}

function setGroupMetadata(groupId: number, patch: Partial<GroupMetadataRecord>): void {
  const next: GroupMetadataRecord = {
    ...getGroupMetadata(groupId),
    ...patch
  };

  groupMetadataRecords.set(groupId, next);
  scheduleGroupMetadataPersist();
}

function deleteGroupMetadata(groupId: number): void {
  if (!groupMetadataRecords.delete(groupId)) return;
  scheduleGroupMetadataPersist();
}

function setAutoGroupExemption(tabId: number, targetKey: string): void {
  autoGroupExemptionRecords.set(tabId, {
    targetKey,
    updatedAt: Date.now()
  });
  scheduleAutoGroupExemptionsPersist();
}

function deleteAutoGroupExemption(tabId: number): void {
  if (!autoGroupExemptionRecords.delete(tabId)) return;
  scheduleAutoGroupExemptionsPersist();
}

function isTabAutoGroupExempt(tabId: number, targetKey: string): boolean {
  return autoGroupExemptionRecords.get(tabId)?.targetKey === targetKey;
}

function matchesAnyAutoGroupRule(
  tab: chrome.tabs.Tab,
  rules: AutoGroupRule[]
): boolean {
  const effectiveRules = rules.filter((rule) => normalizeAutoGroupRuleValue(rule.field, rule.value));
  if (effectiveRules.length === 0) return false;

  return effectiveRules.some((rule) => matchesAutoGroupRule(tab, rule));
}

function matchesSelectedAutoGroupPresets(
  tab: chrome.tabs.Tab,
  presetIds: string[]
): boolean {
  if (presetIds.length === 0) return false;
  return presetIds.some((presetId) => matchesDefaultAutoGroupPresetById(tab, presetId));
}

function getEffectiveAutoGroupConfigs(settings: ManagerSettings): AutoGroupConfig[] {
  return settings.autoGroupConfigs.filter(
    (config) =>
      config.enabled &&
      (Boolean(config.presetId) ||
        config.websites.some((website) => Boolean(normalizeWebsitePattern(website))) ||
        config.rules.some((rule) =>
          Boolean(normalizeAutoGroupRuleValue(rule.field, rule.value))
        ))
  );
}

function resolveAutoGroupConfigTitle(
  config: AutoGroupConfig,
  locale: LocaleMode
): string {
  if (!config.presetId) return config.title;

  const preset = defaultAutoGroupPresets.find((entry) => entry.id === config.presetId);
  if (!preset) return config.title;

  return !config.title || isDefaultAutoGroupPresetTitle(preset, config.title)
    ? getDefaultAutoGroupPresetTitle(preset, locale)
    : config.title;
}

function resolvePresetForGroupTitleSync(
  group: chrome.tabGroups.TabGroup,
  settings: ManagerSettings
) {
  const metadata = getGroupMetadata(group.id);
  const config = metadata.autoGroupConfigId
    ? settings.autoGroupConfigs.find((entry) => entry.id === metadata.autoGroupConfigId)
    : null;
  const preset = config?.presetId
    ? defaultAutoGroupPresets.find((entry) => entry.id === config.presetId) ?? null
    : null;

  if (preset) {
    return isDefaultAutoGroupPresetTitle(preset, group.title) ? preset : null;
  }

  return null;
}

function getBoundAutoGroupConfigId(groupId: number, settings: ManagerSettings): string | null {
  const configId = getGroupMetadata(groupId).autoGroupConfigId;
  if (!configId) return null;

  return settings.autoGroupConfigs.some((config) => config.id === configId) ? configId : null;
}

function resolveDefaultPresetForConfig(config: AutoGroupConfig) {
  return config.presetId
    ? defaultAutoGroupPresets.find((preset) => preset.id === config.presetId) ?? null
    : null;
}

async function syncDefaultAutoGroupTitles(): Promise<void> {
  await ensureGroupMetadataLoaded();

  const [settings, groups] = await Promise.all([getSettings(), chrome.tabGroups.query({})]);
  let didUpdate = false;

  for (const group of groups) {
    const preset = resolvePresetForGroupTitleSync(group, settings);
    if (!preset) continue;

    const title = getDefaultAutoGroupPresetTitle(preset, settings.locale);
    if (group.title === title) continue;

    await chrome.tabGroups.update(group.id, { title });
    observedGroupTitles.set(group.id, title);
    didUpdate = true;
  }

  if (!didUpdate) return;

  scheduleOverviewInvalidation('updated');
  scheduleAutoSessionSnapshot();
}

async function syncAutoGroupConfigTitleFromGroup(
  group: chrome.tabGroups.TabGroup
): Promise<void> {
  await ensureGroupMetadataLoaded();

  const settings = await getSettings();
  const configId = getBoundAutoGroupConfigId(group.id, settings);
  if (!configId) return;

  const nextConfigs = updateAutoGroupConfigTitleFromGroup(
    settings.autoGroupConfigs,
    configId,
    group.title
  );
  if (!nextConfigs) return;

  await updateSettings({ autoGroupConfigs: nextConfigs });
}

async function cleanupRestoredAutoGroups(): Promise<void> {
  await ensureGroupMetadataLoaded();

  const settings = await getSettings();
  if (!settings.autoGroupEnabled) return;

  const [groups, tabs] = await Promise.all([chrome.tabGroups.query({}), chrome.tabs.query({})]);
  const tabsByGroup = new Map<number, chrome.tabs.Tab[]>();

  for (const tab of tabs) {
    const groupId = tab.groupId ?? -1;
    if (groupId < 0) continue;

    const list = tabsByGroup.get(groupId) ?? [];
    list.push(tab);
    tabsByGroup.set(groupId, list);
  }

  const tabsToUngroup: number[] = [];
  const groupsToCleanup: number[] = [];

  for (const group of groups) {
    const groupTabs = tabsByGroup.get(group.id) ?? [];
    if (groupTabs.length === 0) continue;

    const boundConfigId = getGroupMetadata(group.id).autoGroupConfigId;
    const boundConfig = boundConfigId
      ? settings.autoGroupConfigs.find((config) => config.id === boundConfigId)
      : null;
    const titleMatchedConfig =
      boundConfig ??
      settings.autoGroupConfigs.find((config) => {
        const preset = resolveDefaultPresetForConfig(config);
        return Boolean(
          config.enabled &&
            preset &&
            isDefaultAutoGroupPresetTitle(preset, config.title) &&
            isDefaultAutoGroupPresetTitle(preset, group.title) &&
            groupTabs.every((tab) => matchesAutoGroupConfig(tab, config))
        );
      }) ??
      null;

    if (!titleMatchedConfig?.enabled) continue;
    if (!groupTabs.every((tab) => matchesAutoGroupConfig(tab, titleMatchedConfig))) continue;

    tabsToUngroup.push(...groupTabs.map((tab) => tab.id).filter((tabId): tabId is number => tabId != null));
    groupsToCleanup.push(group.id);
  }

  const nonEmptyTabIds = asNonEmptyTabIds(uniqueTabIds(tabsToUngroup));
  if (!nonEmptyTabIds) return;

  // Ungroup tabs first, then delete metadata.  If ungrouping partially fails,
  // the metadata is preserved so the group can still be recognized as an
  // auto-group on the next matching tab.
  await chrome.tabs.ungroup(nonEmptyTabIds);
  for (const groupId of groupsToCleanup) {
    deleteGroupMetadata(groupId);
  }
  scheduleOverviewInvalidation('updated');
  scheduleAutoSessionSnapshot();
}

async function cleanupSingleTabAutoGroups(): Promise<void> {
  await ensureGroupMetadataLoaded();

  const settings = await getSettings();
  if (!settings.autoGroupEnabled) return;

  const [groups, tabs] = await Promise.all([chrome.tabGroups.query({}), chrome.tabs.query({})]);
  const tabsByGroup = new Map<number, chrome.tabs.Tab[]>();

  for (const tab of tabs) {
    const groupId = tab.groupId ?? -1;
    if (groupId < 0) continue;

    const list = tabsByGroup.get(groupId) ?? [];
    list.push(tab);
    tabsByGroup.set(groupId, list);
  }

  const tabsToUngroup: number[] = [];
  const groupsToCleanup: number[] = [];

  for (const group of groups) {
    const groupTabs = tabsByGroup.get(group.id) ?? [];
    if (!shouldCleanupSingleTabAutoGroup(groupTabs.length)) continue;
    const metadata = getGroupMetadata(group.id);
    if (!metadata.autoGroupCreated) continue;
    if (!getBoundAutoGroupConfigId(group.id, settings)) continue;

    const tabId = groupTabs[0]?.id;
    if (tabId == null) continue;

    tabsToUngroup.push(tabId);
    groupsToCleanup.push(group.id);
  }

  const nonEmptyTabIds = asNonEmptyTabIds(uniqueTabIds(tabsToUngroup));
  if (!nonEmptyTabIds) return;

  for (const tabId of nonEmptyTabIds) {
    programmaticAutoGroupUngroupTabIds.add(tabId);
  }

  try {
    await chrome.tabs.ungroup(nonEmptyTabIds);
  } finally {
    setTimeout(() => {
      for (const tabId of nonEmptyTabIds) {
        programmaticAutoGroupUngroupTabIds.delete(tabId);
      }
    }, 5_000);
  }

  for (const groupId of groupsToCleanup) {
    deleteGroupMetadata(groupId);
  }
  scheduleOverviewInvalidation('updated');
  scheduleAutoSessionSnapshot();
}

function matchesGroupAutoGrouping(
  tab: chrome.tabs.Tab,
  metadata: GroupMetadataRecord
): boolean {
  if (!metadata.autoGroupEnabled) return false;

  return (
    matchesSelectedAutoGroupPresets(tab, metadata.autoGroupPresetIds) ||
    matchesAnyAutoGroupRule(tab, metadata.autoGroupRules)
  );
}

function getEffectiveAutoGroupGroups(
  groups: chrome.tabGroups.TabGroup[]
): chrome.tabGroups.TabGroup[] {
  return groups.filter((group) => {
    const metadata = getGroupMetadata(group.id);
    return (
      metadata.autoGroupEnabled &&
      (metadata.autoGroupPresetIds.length > 0 ||
        metadata.autoGroupRules.some((rule) =>
          Boolean(normalizeAutoGroupRuleValue(rule.field, rule.value))
        ))
    );
  });
}

function resolveMatchingAutoGroupTarget(
  tab: chrome.tabs.Tab,
  groups: chrome.tabGroups.TabGroup[],
  effectiveGroups: chrome.tabGroups.TabGroup[],
  effectiveConfigs: AutoGroupConfig[],
  locale: LocaleMode
): MatchingAutoGroupTarget | null {
  const matchingGroup = findSameWindowGroup(effectiveGroups, tab.windowId, (group) =>
    matchesGroupAutoGrouping(tab, getGroupMetadata(group.id))
  );

  if (matchingGroup) {
    return {
      kind: 'group',
      targetKey: `group:${matchingGroup.id}`,
      group: matchingGroup
    };
  }

  const matchingConfig = effectiveConfigs.find((config) => matchesAutoGroupConfig(tab, config));
  if (!matchingConfig) return null;

  const configTitle = resolveAutoGroupConfigTitle(matchingConfig, locale);
  const existingConfiguredGroup = findSameWindowGroup(
    groups,
    tab.windowId,
    (group) =>
      getGroupMetadata(group.id).autoGroupConfigId === matchingConfig.id ||
      group.title === configTitle
  );

  return {
    kind: 'config',
    targetKey: `config:${matchingConfig.id}`,
    config: matchingConfig,
    configTitle,
    existingConfiguredGroup: existingConfiguredGroup ?? undefined
  };
}

async function rememberManualAutoGroupExit(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id == null) return;
  if (tab.pinned) return;

  const settings = await getSettings();
  if (!settings.autoGroupEnabled) return;

  await Promise.all([ensureGroupMetadataLoaded(), ensureAutoGroupExemptionsLoaded()]);

  const groups = await chrome.tabGroups.query({});
  const target = resolveMatchingAutoGroupTarget(
    tab,
    groups,
    getEffectiveAutoGroupGroups(groups),
    getEffectiveAutoGroupConfigs(settings),
    settings.locale
  );

  if (!target) return;
  setAutoGroupExemption(tab.id, target.targetKey);
}

async function maybeAutoGroupTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id == null) return;
  await maybeAutoGroupTabs([tab.id]);
}

function getLearnableWebsitesFromTabs(tabs: chrome.tabs.Tab[]): string[] {
  return Array.from(
    new Set(
      tabs
        .map((tab) => normalizeHostname(tab.url ?? tab.pendingUrl ?? ''))
        .map(normalizeWebsitePattern)
        .filter(Boolean)
    )
  );
}

function normalizeLearnedGroupTitle(title: string | undefined): string {
  return (title ?? '').trim() || 'Custom group';
}

function findLearnableAutoGroupConfig(
  configs: AutoGroupConfig[],
  groupId: number,
  title: string,
  tabs: chrome.tabs.Tab[]
): AutoGroupConfig | null {
  const boundConfigId = getGroupMetadata(groupId).autoGroupConfigId;
  const boundConfig = boundConfigId
    ? configs.find((config) => config.id === boundConfigId) ?? null
    : null;
  if (boundConfig) return boundConfig;

  const normalizedTitle = title.trim().toLowerCase();
  const matchingPreset = defaultAutoGroupPresets.find((preset) =>
    isDefaultAutoGroupPresetTitle(preset, title)
  );
  const presetConfig = matchingPreset
    ? configs.find((config) => config.presetId === matchingPreset.id) ?? null
    : null;
  if (presetConfig) return presetConfig;

  const matchingTabPresetId = resolveSingleDefaultPresetIdForTabs(tabs);
  const tabPresetConfig = matchingTabPresetId
    ? configs.find((config) => config.presetId === matchingTabPresetId) ?? null
    : null;
  if (tabPresetConfig) return tabPresetConfig;

  return (
    configs.find(
      (config) => !config.presetId && config.title.trim().toLowerCase() === normalizedTitle
    ) ?? null
  );
}

function resolveSingleDefaultPresetIdForTabs(tabs: chrome.tabs.Tab[]): string | null {
  const presetIds = new Set<string>();

  for (const tab of tabs) {
    const presetId = matchDefaultAutoGroupPreset(tab)?.id ?? null;
    if (!presetId) return null;
    presetIds.add(presetId);
    if (presetIds.size > 1) return null;
  }

  return presetIds.values().next().value ?? null;
}

function resolveLearnedConfigTitle(config: AutoGroupConfig, groupTitle: string): string {
  if (!config.presetId) return groupTitle;

  const preset = defaultAutoGroupPresets.find((entry) => entry.id === config.presetId);
  if (!preset) return config.title;

  return isDefaultAutoGroupPresetTitle(preset, groupTitle) ? groupTitle : config.title;
}

function shouldPreservePresetStyleFromLearnedGroup(
  config: AutoGroupConfig,
  groupId: number,
  groupTitle: string
): boolean {
  if (!config.presetId) return false;
  if (getGroupMetadata(groupId).autoGroupConfigId) return false;

  const preset = defaultAutoGroupPresets.find((entry) => entry.id === config.presetId);
  if (!preset) return false;

  return !isDefaultAutoGroupPresetTitle(preset, groupTitle);
}

async function learnAutoGroupRuleFromGroup(groupId: number): Promise<void> {
  const settings = await getSettings();
  if (settings.autoGroupLearningSensitivity === 'off') return;

  await ensureGroupMetadataLoaded();

  const [group, tabs] = await Promise.all([
    chrome.tabGroups.get(groupId),
    chrome.tabs.query({ groupId })
  ]);
  if (tabs.length < AUTO_GROUP_MIN_TAB_COUNT) return;

  const websites = getLearnableWebsitesFromTabs(tabs);
  if (websites.length === 0) return;

  const title = normalizeLearnedGroupTitle(group.title);
  const existingConfig = findLearnableAutoGroupConfig(settings.autoGroupConfigs, groupId, title, tabs);
  const configTitle = existingConfig ? resolveLearnedConfigTitle(existingConfig, title) : title;
  const configColor =
    existingConfig && shouldPreservePresetStyleFromLearnedGroup(existingConfig, groupId, title)
      ? existingConfig.color
      : (group.color as TabGroupColor);
  const nextConfig = existingConfig
    ? {
        ...existingConfig,
        title: configTitle,
        color: configColor,
        enabled: true,
        websites: Array.from(new Set([...existingConfig.websites, ...websites]))
      }
    : {
        ...createAutoGroupConfig(title, { color: group.color as TabGroupColor }),
        websites
      };

  const nextConfigs = existingConfig
    ? settings.autoGroupConfigs.map((config) =>
        config.id === existingConfig.id ? nextConfig : config
      )
    : [nextConfig, ...settings.autoGroupConfigs];

  await updateSettings({
    autoGroupEnabled: true,
    autoGroupConfigs: nextConfigs
  });
  setGroupMetadata(groupId, { autoGroupConfigId: nextConfig.id });
}

async function forgetAutoGroupRuleFromManualGroupExit(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id == null) return;

  const settings = await getSettings();
  if (settings.autoGroupLearningSensitivity === 'off') return;

  await Promise.all([ensureTabHistoryLoaded(), ensureGroupMetadataLoaded()]);

  const previousSnapshot = tabHistoryRecords.get(tab.id)?.snapshot;
  const previousGroupId = previousSnapshot?.groupId ?? -1;
  if (previousGroupId < 0) return;

  const website = normalizeWebsitePattern(normalizeHostname(tab.url ?? tab.pendingUrl ?? ''));
  if (!website) return;

  const remainingGroupTabs = await chrome.tabs.query({ groupId: previousGroupId }).catch(() => []);
  const remainingWebsites = new Set(getLearnableWebsitesFromTabs(remainingGroupTabs));
  if (remainingWebsites.has(website)) return;

  const boundConfigId = getGroupMetadata(previousGroupId).autoGroupConfigId;
  const previousTitle = previousSnapshot?.groupTitle?.trim().toLowerCase() ?? '';
  const boundConfig = boundConfigId
    ? settings.autoGroupConfigs.find((entry) => entry.id === boundConfigId) ?? null
    : null;
  const config = boundConfig ??
    settings.autoGroupConfigs.find(
      (entry) => !entry.presetId && entry.title.trim().toLowerCase() === previousTitle
    ) ??
    null;
  if (!config || config.presetId) return;

  const nextWebsites = config.websites.filter(
    (entry) => normalizeWebsitePattern(entry) !== website
  );
  if (nextWebsites.length === config.websites.length) return;

  await updateSettings({
    autoGroupConfigs: settings.autoGroupConfigs.map((entry) =>
      entry.id === config.id ? { ...entry, websites: nextWebsites } : entry
    )
  });
}

async function maybeAutoGroupTabs(tabIds?: number[]): Promise<void> {
  const settings = await getSettings();
  if (!settings.autoGroupEnabled) return;

  await Promise.all([ensureGroupMetadataLoaded(), ensureAutoGroupExemptionsLoaded()]);

  const requestedTabIds = tabIds ? uniqueTabIds(tabIds) : null;
  const [allOpenTabs, loadedCandidateTabs, initialGroups] = await Promise.all([
    chrome.tabs.query({}),
    requestedTabIds ? loadTabsById(requestedTabIds) : Promise.resolve(null),
    chrome.tabGroups.query({})
  ]);
  const candidateTabs = loadedCandidateTabs ?? allOpenTabs;
  const allTabsById = new Map<number, chrome.tabs.Tab>();

  for (const tab of allOpenTabs) {
    if (tab.id != null) allTabsById.set(tab.id, tab);
  }
  for (const tab of candidateTabs) {
    if (tab.id != null) allTabsById.set(tab.id, tab);
  }

  const allTabs = Array.from(allTabsById.values());
  const groups = [...initialGroups];
  const effectiveConfigs = getEffectiveAutoGroupConfigs(settings);
  const effectiveGroups = getEffectiveAutoGroupGroups(groups);

  if (effectiveGroups.length === 0 && effectiveConfigs.length === 0) return;

  let groupedAny = false;
  const processedTabIds = new Set<number>();

  for (const tab of candidateTabs) {
    if (tab.id == null) continue;
    if (processedTabIds.has(tab.id)) continue;
    if (tab.pinned) continue;
    if ((tab.groupId ?? -1) >= 0) continue;

    const target = resolveMatchingAutoGroupTarget(
      tab,
      groups,
      effectiveGroups,
      effectiveConfigs,
      settings.locale
    );
    if (!target) continue;
    if (isTabAutoGroupExempt(tab.id, target.targetKey)) continue;

    const targetTabIds =
      target.kind === 'config' && !target.existingConfiguredGroup
        ? collectCreateableAutoGroupTabIds(tab, allTabs, {
            isTabExempt: (candidateTab) =>
              candidateTab.id != null && isTabAutoGroupExempt(candidateTab.id, target.targetKey),
            matchesTab: (candidateTab) => matchesAutoGroupConfig(candidateTab, target.config)
          })
        : [tab.id];
    if (targetTabIds.length === 0) continue;

    const result =
      target.kind === 'group'
        ? await createGroups(targetTabIds, { groupId: target.group.id, learn: false })
        : target.existingConfiguredGroup
          ? await createGroups(targetTabIds, { groupId: target.existingConfiguredGroup.id, learn: false })
          : await createGroups(targetTabIds, {
              title: target.configTitle,
              color: target.config.color,
              autoGroupConfigId: target.config.id,
              learn: false
            });

    if (result.affectedCount > 0) {
      groupedAny = true;
      for (const tabId of result.affectedTabIds) {
        processedTabIds.add(tabId);
        deleteAutoGroupExemption(tabId);
      }

      if (target.kind === 'config' && target.existingConfiguredGroup) {
        setGroupMetadata(target.existingConfiguredGroup.id, {
          autoGroupConfigId: target.config.id
        });
      }

      if (target.kind === 'config' && !target.existingConfiguredGroup) {
        const createdGroupId = (await chrome.tabs.get(tab.id)).groupId;

        if (createdGroupId >= 0 && !groups.some((group) => group.id === createdGroupId)) {
          try {
            groups.push(await chrome.tabGroups.get(createdGroupId));
          } catch {
            // The group may have been removed by the user before we could cache it.
          }
        }
      }
    }
  }

  if (groupedAny) {
    scheduleOverviewInvalidation('updated');
  }
}

async function resolveGroupTitle(groupId: number | undefined | null): Promise<string | null> {
  if (groupId == null || groupId < 0) return null;

  try {
    const group = await chrome.tabGroups.get(groupId);
    return group.title || 'Untitled group';
  } catch {
    return null;
  }
}

async function toStoredTabState(tab: chrome.tabs.Tab): Promise<StoredTabState | null> {
  if (tab.id == null) return null;

  const url = tab.url ?? tab.pendingUrl ?? '';

  return {
    tabId: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    title: tab.title ?? 'Untitled tab',
    url,
    hostname: normalizeHostname(url),
    favIconUrl: resolveFavIconUrl(tab.favIconUrl ?? null, url),
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    muted: Boolean(tab.mutedInfo?.muted),
    discarded: Boolean(tab.discarded),
    frozen: Boolean((tab as chrome.tabs.Tab & { frozen?: boolean }).frozen),
    status: tab.status ?? 'unknown',
    groupId: tab.groupId ?? -1,
    groupTitle: await resolveGroupTitle(tab.groupId),
    lastAccessed: tab.lastAccessed ?? null
  };
}

function createHistoryEvent(
  kind: TabHistoryEventKind,
  snapshot: StoredTabState,
  patch: Partial<TabHistoryEvent> = {}
): TabHistoryEvent {
  return {
    id: `${snapshot.tabId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    kind,
    title: snapshot.title,
    url: snapshot.url,
    hostname: snapshot.hostname,
    ...patch
  };
}

function createUrlHistoryEvent(
  tabId: number,
  kind: TabHistoryEventKind,
  url: string,
  patch: Partial<TabHistoryEvent> = {}
): TabHistoryEvent {
  return {
    id: `${tabId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    kind,
    title: patch.title ?? (normalizeHostname(url) || 'Navigation'),
    url,
    hostname: normalizeHostname(url),
    ...patch
  };
}

function isTrackableUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function normalizeAutoDeduplicationUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}

function countDuplicateTabCopies(tabs: chrome.tabs.Tab[]): number {
  const counts = new Map<string, number>();

  for (const tab of tabs) {
    const normalizedUrl = normalizeAutoDeduplicationUrl(tab.url ?? tab.pendingUrl ?? '');
    if (!normalizedUrl) continue;
    counts.set(normalizedUrl, (counts.get(normalizedUrl) ?? 0) + 1);
  }

  let duplicateCopies = 0;
  for (const count of counts.values()) {
    if (count > 1) {
      duplicateCopies += count - 1;
    }
  }

  return duplicateCopies;
}

async function updateActionDuplicateBadge(): Promise<void> {
  if (!chrome.action?.setBadgeText) return;

  const duplicateCopies = countDuplicateTabCopies(await chrome.tabs.query({}));
  await chrome.action.setBadgeBackgroundColor({ color: ACTION_BADGE_DUPLICATE_COLOR });
  await chrome.action.setBadgeTextColor?.({ color: ACTION_BADGE_TEXT_COLOR });
  await chrome.action.setBadgeText({
    text: duplicateCopies > 0 ? (duplicateCopies > 99 ? '99+' : String(duplicateCopies)) : ''
  });
  await chrome.action.setTitle({
    title:
      duplicateCopies > 0
        ? `TabFriday - ${duplicateCopies} duplicate tab${duplicateCopies === 1 ? '' : 's'}`
        : 'TabFriday'
  });
}

function scheduleActionDuplicateBadgeUpdate(delay = 80): void {
  if (actionBadgeUpdateTimer != null) {
    clearTimeout(actionBadgeUpdateTimer);
  }

  actionBadgeUpdateTimer = setTimeout(() => {
    actionBadgeUpdateTimer = null;
    void updateActionDuplicateBadge().catch((error) => {
      console.warn('Failed to update duplicate tab action badge.', error);
    });
  }, delay);
}

function pushHistoryEvent(record: TabHistoryRecord, event: TabHistoryEvent): void {
  const duplicateEvent = record.history.find(
    (existingEvent) =>
      existingEvent.kind === event.kind &&
      existingEvent.url === event.url &&
      existingEvent.fromUrl === event.fromUrl &&
      Math.abs(existingEvent.at - event.at) < 1000
  );
  if (duplicateEvent) return;

  const insertionIndex = record.history.findIndex(
    (existingEvent) => existingEvent.at > event.at
  );
  const previousEvent =
    insertionIndex > 0
      ? record.history[insertionIndex - 1]
      : insertionIndex === -1
        ? record.history.at(-1)
        : null;

  if (
    previousEvent &&
    previousEvent.kind === event.kind &&
    previousEvent.url === event.url &&
    previousEvent.fromUrl === event.fromUrl
  ) {
    return;
  }

  if (insertionIndex === -1) {
    record.history.push(event);
  } else {
    record.history.splice(insertionIndex, 0, event);
  }

  if (record.history.length > MAX_TAB_HISTORY_EVENTS) {
    record.history.splice(0, record.history.length - MAX_TAB_HISTORY_EVENTS);
  }
}

async function ensureTabHistoryRecord(tabId: number): Promise<TabHistoryRecord | null> {
  await ensureTabHistoryLoaded();

  const existing = tabHistoryRecords.get(tabId);
  if (existing) return existing;

  try {
    const tab = await chrome.tabs.get(tabId);
    await trackTabHistory(tab, 'updated');
    return tabHistoryRecords.get(tabId) ?? null;
  } catch {
    return null;
  }
}

async function recordUrlHistoryEvent(
  tabId: number,
  kind: 'navigated' | 'redirected' | 'history-state',
  url: string,
  patch: Partial<TabHistoryEvent> = {},
  options: { inferFromUrl?: boolean; skipIfLastUrl?: boolean } = {}
): Promise<void> {
  if (tabId < 0 || !url || !isTrackableUrl(url)) return;

  const record = await ensureTabHistoryRecord(tabId);
  if (!record) return;

  const lastEvent = record.history.at(-1);
  if (options.skipIfLastUrl && lastEvent?.url === url) return;

  const inferredFromUrl =
    options.inferFromUrl && lastEvent?.url && lastEvent.url !== url ? lastEvent.url : null;
  const eventPatch: Partial<TabHistoryEvent> = {
    ...patch,
    fromUrl: patch.fromUrl === undefined ? inferredFromUrl : patch.fromUrl
  };
  if (eventPatch.fromTitle === undefined && eventPatch.fromUrl) {
    eventPatch.fromTitle = record.snapshot.title;
  }

  pushHistoryEvent(
    record,
    createUrlHistoryEvent(tabId, kind, url, eventPatch)
  );
  record.updatedAt = Date.now();
  scheduleTabHistoryPersist();
  scheduleOverviewInvalidation('updated');
}

async function recordNavigationStart(
  details: chrome.webNavigation.WebNavigationBaseCallbackDetails
): Promise<void> {
  await recordUrlHistoryEvent(
    details.tabId,
    'navigated',
    details.url,
    {
      at: Math.round(details.timeStamp),
      title: normalizeHostname(details.url) || 'Navigation started'
    },
    { skipIfLastUrl: true }
  );
}

async function recordCommittedNavigation(
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
): Promise<void> {
  const pending = pendingRedirectEvents.get(details.tabId);
  if (pending && pending.length > 0) {
    await flushRedirectEvents(details.tabId);
  }

  const hasServerRedirect = details.transitionQualifiers.includes('server_redirect');
  await recordUrlHistoryEvent(
    details.tabId,
    hasServerRedirect ? 'redirected' : 'navigated',
    details.url,
    {
      at: Math.round(details.timeStamp),
      title: hasServerRedirect ? 'Server redirect' : 'Navigation committed'
    },
    { skipIfLastUrl: true }
  );
}

function queueRedirectEvent(details: chrome.webRequest.OnBeforeRedirectDetails): void {
  if (!redirectTrackingEnabled) return;
  if (details.tabId < 0 || details.frameId !== 0 || details.type !== 'main_frame') return;
  if (
    !details.url ||
    !details.redirectUrl ||
    details.url === details.redirectUrl ||
    !isTrackableUrl(details.redirectUrl)
  ) {
    return;
  }

  const events = pendingRedirectEvents.get(details.tabId) ?? [];
  events.push({
    fromUrl: details.url,
    toUrl: details.redirectUrl,
    at: Math.round(details.timeStamp),
    statusCode: details.statusCode
  });
  pendingRedirectEvents.set(details.tabId, events.slice(-24));
}

async function flushRedirectEvents(tabId: number): Promise<void> {
  const events = pendingRedirectEvents.get(tabId);
  if (!events || events.length === 0) return;

  pendingRedirectEvents.delete(tabId);

  for (const event of events) {
    await recordUrlHistoryEvent(tabId, 'redirected', event.toUrl, {
      at: event.at,
      fromUrl: event.fromUrl,
      title: `${event.statusCode} redirect`
    });
  }
}

async function getRedirectTrackingPermissionState(): Promise<RedirectTrackingPermissionState> {
  if (!chrome.permissions?.contains) {
    return { granted: false };
  }

  const granted = await chrome.permissions.contains(redirectTrackingPermissions);
  return { granted };
}

async function refreshRedirectTrackingEnabled(): Promise<boolean> {
  const [settings, permissionState] = await Promise.all([
    getSettings(),
    getRedirectTrackingPermissionState()
  ]);

  redirectTrackingEnabled = settings.redirectTrackingEnabled && permissionState.granted;
  if (permissionState.granted) {
    ensureRedirectTrackingListeners();
  }
  if (!redirectTrackingEnabled) {
    pendingRedirectEvents.clear();
  }

  return redirectTrackingEnabled;
}

function shouldHandleWebNavigation(
  details:
    | chrome.webNavigation.WebNavigationBaseCallbackDetails
    | chrome.webNavigation.WebNavigationTransitionCallbackDetails
): boolean {
  return (
    redirectTrackingEnabled &&
    details.tabId >= 0 &&
    details.frameId === 0 &&
    isTrackableUrl(details.url)
  );
}

function ensureRedirectTrackingListeners(): void {
  if (!redirectBeforeRequestListenerInstalled && chrome.webRequest?.onBeforeRedirect) {
    chrome.webRequest.onBeforeRedirect.addListener(queueRedirectEvent, {
      urls: ['http://*/*', 'https://*/*'],
      types: ['main_frame']
    });
    redirectBeforeRequestListenerInstalled = true;
  }

  if (!redirectBeforeNavigateListenerInstalled && chrome.webNavigation?.onBeforeNavigate) {
    chrome.webNavigation.onBeforeNavigate.addListener((details) => {
      if (!shouldHandleWebNavigation(details)) return;

      void recordNavigationStart(details).catch((error) => {
        console.warn('Failed to record navigation start.', error);
      });
    });
    redirectBeforeNavigateListenerInstalled = true;
  }

  if (!redirectCommittedListenerInstalled && chrome.webNavigation?.onCommitted) {
    chrome.webNavigation.onCommitted.addListener((details) => {
      if (!shouldHandleWebNavigation(details)) return;

      void recordCommittedNavigation(details).catch((error) => {
        console.warn('Failed to record committed navigation.', error);
      });
    });
    redirectCommittedListenerInstalled = true;
  }

  if (!redirectHistoryStateListenerInstalled && chrome.webNavigation?.onHistoryStateUpdated) {
    chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
      if (!shouldHandleWebNavigation(details)) return;

      void recordUrlHistoryEvent(details.tabId, 'history-state', details.url, {
        at: Math.round(details.timeStamp),
        title: 'History state update'
      }, { inferFromUrl: true }).catch((error) => {
        console.warn('Failed to record history state navigation.', error);
      });
    });
    redirectHistoryStateListenerInstalled = true;
  }
}

function hasRedirectTrackingPermissionDelta(permissions: chrome.permissions.Permissions): boolean {
  const requestedPermissions = new Set(permissions.permissions ?? []);
  const requestedOrigins = new Set(permissions.origins ?? []);

  return (
    requestedPermissions.has('webNavigation') ||
    requestedPermissions.has('webRequest') ||
    requestedOrigins.has('http://*/*') ||
    requestedOrigins.has('https://*/*')
  );
}

function pushRecentClosedRecord(record: ClosedTabHistoryRecord): void {
  recentClosedTabHistory.unshift(record);
  if (recentClosedTabHistory.length > MAX_RECENT_CLOSED_TABS) {
    recentClosedTabHistory.splice(MAX_RECENT_CLOSED_TABS);
  }
}

async function trackTabHistory(
  tab: chrome.tabs.Tab,
  reason: 'seed' | 'created' | 'updated' | 'activated'
): Promise<void> {
  if (tab.id == null) return;

  await ensureTabHistoryLoaded();
  const snapshot = await toStoredTabState(tab);
  if (!snapshot) return;

  const existing = tabHistoryRecords.get(tab.id);
  const now = Date.now();

  if (!existing) {
    const record: TabHistoryRecord = {
      snapshot,
      telemetry: getTelemetry(tab.id),
      history:
        snapshot.url
          ? [
              createHistoryEvent(reason === 'created' ? 'created' : 'observed', snapshot, {
                at: reason === 'created' ? now : snapshot.lastAccessed ?? now
              })
            ]
          : [],
      updatedAt: now
    };

    tabHistoryRecords.set(tab.id, record);
    scheduleTabHistoryPersist();
    return;
  }

  if (snapshot.url !== existing.snapshot.url) {
    pushHistoryEvent(
      existing,
      createHistoryEvent(
        existing.history.length === 0 ? 'observed' : 'navigated',
        snapshot,
        {
          fromTitle: existing.snapshot.title,
          fromUrl: existing.snapshot.url
        }
      )
    );
  } else if (snapshot.title !== existing.snapshot.title) {
    const lastEvent = existing.history.at(-1);
    if (lastEvent && lastEvent.url === snapshot.url) {
      lastEvent.title = snapshot.title;
      lastEvent.hostname = snapshot.hostname;
    }
  }

  if (
    !snapshot.favIconUrl &&
    snapshot.url === existing.snapshot.url &&
    existing.snapshot.favIconUrl
  ) {
    snapshot.favIconUrl = existing.snapshot.favIconUrl;
  }

  existing.snapshot = snapshot;
  existing.telemetry = getTelemetry(tab.id);
  existing.updatedAt = now;
  scheduleTabHistoryPersist();
}

function setStoredTabActive(tabId: number, active: boolean): void {
  const record = tabHistoryRecords.get(tabId);
  if (!record || record.snapshot.active === active) return;
  record.snapshot.active = active;
  record.telemetry = getTelemetry(tabId);
  record.updatedAt = Date.now();
  scheduleTabHistoryPersist();
}

function archiveClosedTabHistory(tabId: number, closedAt = Date.now()): void {
  const record = tabHistoryRecords.get(tabId);
  if (!record) return;

  const telemetry = getTelemetry(tabId);

  pushRecentClosedRecord({
    id: `${tabId}:${closedAt}`,
    closedAt,
    snapshot: {
      ...record.snapshot,
      active: false
    },
    telemetry,
    history: [...record.history]
  });

  tabHistoryRecords.delete(tabId);
  scheduleTabHistoryPersist();
}

function getTelemetry(tabId: number): RuntimeTabTelemetry {
  const state = ensureRuntimeTab(tabId);
  const activeEntry = Array.from(activeWindowSessions.values()).find(
    (session) => session.tabId === tabId
  );

  return {
    observedAt: state.observedAt,
    openedAt: state.openedAt,
    lastActivatedAt: state.lastActivatedAt,
    totalActiveMs:
      state.totalActiveMs +
      (activeEntry ? Math.max(0, Date.now() - activeEntry.startedAt) : 0)
  };
}

function getTabLastActivityAt(tab: chrome.tabs.Tab): number | null {
  const tabLastAccessed = typeof tab.lastAccessed === 'number' ? tab.lastAccessed : null;
  if (tab.id == null) return tabLastAccessed;

  const state = runtimeTabs.get(tab.id);
  return Math.max(
    tabLastAccessed ?? 0,
    state?.lastActivatedAt ?? 0,
    state?.openedAt ?? 0,
    state?.observedAt ?? 0
  ) || null;
}

function getGroupLastActivityAt(groupId: number, tabs: chrome.tabs.Tab[]): number | null {
  return Math.max(
    groupInteractionRecords.get(groupId) ?? 0,
    getGroupMetadata(groupId).lastInteractedAt ?? 0,
    ...tabs.map((tab) => getTabLastActivityAt(tab) ?? 0)
  ) || null;
}

function markGroupInteracted(groupId: number, at = Date.now()): void {
  groupInteractionRecords.set(groupId, at);
  setGroupMetadata(groupId, { lastInteractedAt: at });
}

function markProgrammaticAutoGroupedTabs(tabIds: number[]): void {
  for (const tabId of tabIds) {
    programmaticAutoGroupTabIds.add(tabId);
  }

  setTimeout(() => {
    for (const tabId of tabIds) {
      programmaticAutoGroupTabIds.delete(tabId);
    }
  }, 5_000);
}

function getRuntimeMessageTimeoutMs(request: ExtensionRequest): number {
  switch (request.type) {
    case 'tab-manager/get-overview':
    case 'tab-manager/get-tab-detail':
    case 'tab-manager/get-bookmarks':
    case 'tab-manager/get-sessions':
    case 'tab-manager/get-redirect-tracking-permission':
    case 'tab-manager/refresh-redirect-tracking':
    case 'tab-manager/open-dashboard':
      return RUNTIME_MESSAGE_TIMEOUT_MS;
    default:
      return RUNTIME_MUTATION_MESSAGE_TIMEOUT_MS;
  }
}

async function getBrowserCommandShortcutState(): Promise<BrowserCommandShortcutState> {
  const commands = await chrome.commands.getAll();
  const command = commands.find((item) => item.name === COMMAND_PALETTE_COMMAND_NAME);
  const shortcut = command?.shortcut?.trim() || null;

  return {
    commandName: COMMAND_PALETTE_COMMAND_NAME,
    description: command?.description ?? 'Open command palette',
    shortcut,
    active: shortcut != null
  };
}

function wasRecentlyAudible(tab: chrome.tabs.Tab, windowMs = 30 * 60_000): boolean {
  if (tab.id == null) return false;
  if (tab.audible) return true;

  const state = runtimeTabs.get(tab.id);
  return state?.lastAudibleAt != null && Date.now() - state.lastAudibleAt < windowMs;
}

function isAutoCleanupEligible(tab: chrome.tabs.Tab): boolean {
  if (tab.id == null) return false;
  if (tab.active) return false;
  if (tab.pinned) return false;
  if (wasRecentlyAudible(tab)) return false;

  const url = tab.url ?? tab.pendingUrl ?? '';
  if (!url) return false;
  if (/^(chrome:|chrome-extension:|edge:|about:|brave:|vivaldi:|opera:)/.test(url)) {
    return false;
  }

  return /^(https?:|file:)/.test(url);
}

function matchesUrlList(url: string, entries: string[]): boolean {
  if (entries.length === 0) return false;

  const normalizedUrl = url.trim().toLowerCase();
  if (!normalizedUrl) return false;

  let hostname = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    hostname = '';
  }

  return entries.some((entry) => {
    const candidate = entry.trim().toLowerCase();
    if (!candidate) return false;
    if (/^[a-z]+:\/\//.test(candidate)) return normalizedUrl.startsWith(candidate);
    if (!hostname) return false;
    return hostname === candidate || hostname.endsWith(`.${candidate}`);
  });
}

function matchesAutoCleanupWhitelist(tab: chrome.tabs.Tab, whitelist: string[]): boolean {
  const url = (tab.url ?? tab.pendingUrl ?? '').trim();
  return matchesUrlList(url, whitelist);
}

async function maybeAutoDeduplicateTab(tab: chrome.tabs.Tab): Promise<boolean> {
  if (tab.id == null || !tab.active) return false;

  const state = ensureRuntimeTab(tab.id);
  if (!state.autoDeduplicationPendingFromCreate) return false;

  const url = tab.url ?? tab.pendingUrl ?? '';
  const normalizedUrl = normalizeAutoDeduplicationUrl(url);
  if (!normalizedUrl) return false;

  const settings = await getSettings();
  if (!settings.autoDeduplicateTabs) return false;

  const siteMatched = matchesUrlList(url, settings.autoDeduplicationSites);
  if (settings.autoDeduplicationScope === 'global-except-listed' && siteMatched) return false;
  if (settings.autoDeduplicationScope === 'listed-only' && !siteMatched) return false;

  const candidates = filterSameWindowTabs(await chrome.tabs.query({ windowId: tab.windowId }), tab.windowId)
    .filter((candidate) => {
      if (candidate.id == null || candidate.id === tab.id) return false;
      const candidateUrl = candidate.url ?? candidate.pendingUrl ?? '';
      return normalizeAutoDeduplicationUrl(candidateUrl) === normalizedUrl;
    })
    .map((candidate) => ({
      id: candidate.id!,
      active: candidate.active,
      pinned: candidate.pinned,
      lastActivityAt: getTabLastActivityAt(candidate)
    }));

  if (candidates.length === 0) return false;

  state.autoDeduplicationPendingFromCreate = false;

  const plan = planAutoDeduplication(
    { id: tab.id, active: tab.active, pinned: tab.pinned },
    candidates,
    settings.autoDeduplicationKeep
  );

  if (plan.kind === 'none') return false;

  if (plan.kind === 'keepExisting') {
    await chrome.tabs.update(plan.targetTabId, { active: true });
    await chrome.tabs.remove(plan.closeTabIds);
    return plan.closeTabIds.includes(tab.id);
  }

  if (plan.closeTabIds.length > 0) {
    await chrome.tabs.remove(plan.closeTabIds);
  }
  return false;
}

async function autoCollapseInactiveGroups(): Promise<void> {
  if (autoCollapseInactiveGroupsInFlight) return;
  autoCollapseInactiveGroupsInFlight = true;

  try {
    const settings = await getSettings();
    if (settings.autoCollapseInactiveGroupsMinutes <= 0) return;
    await ensureGroupMetadataLoaded();

    const thresholdAt = Date.now() - settings.autoCollapseInactiveGroupsMinutes * 60_000;
    const [tabs, groups] = await Promise.all([
      chrome.tabs.query({}),
      chrome.tabGroups.query({})
    ]);
    const groupsById = new Map(groups.map((group) => [group.id, group]));
    const tabsByGroup = new Map<number, chrome.tabs.Tab[]>();

    for (const tab of tabs) {
      const groupId = tab.groupId ?? -1;
      if (groupId < 0) continue;

      const groupTabs = tabsByGroup.get(groupId);
      if (groupTabs) groupTabs.push(tab);
      else tabsByGroup.set(groupId, [tab]);
    }

    const collapsedGroupIds: number[] = [];

    for (const [groupId, groupTabs] of tabsByGroup) {
      const group = groupsById.get(groupId);
      if (!group || group.collapsed) continue;
      if (groupTabs.some((tab) => tab.active)) continue;

      const latestActivityAt = getGroupLastActivityAt(groupId, groupTabs);
      if (latestActivityAt == null || latestActivityAt > thresholdAt) continue;

      try {
        await chrome.tabGroups.update(groupId, { collapsed: true });
        collapsedGroupIds.push(groupId);
      } catch (error) {
        console.warn('Failed to auto-collapse inactive tab group.', error);
      }
    }

    if (collapsedGroupIds.length > 0) {
      scheduleOverviewInvalidation('updated');
    }
  } finally {
    autoCollapseInactiveGroupsInFlight = false;
  }
}

async function autoSleepInactiveTabs(): Promise<void> {
  if (autoSleepInactiveTabsInFlight) return;
  autoSleepInactiveTabsInFlight = true;

  try {
    const settings = await getSettings();
    if (settings.autoSleepInactiveTabsMinutes <= 0) return;

    const thresholdAt = Date.now() - settings.autoSleepInactiveTabsMinutes * 60_000;
    const tabs = await chrome.tabs.query({});
    const discardedTabIds: number[] = [];

    for (const tab of tabs) {
      if (!isAutoCleanupEligible(tab)) continue;
      const tabId = tab.id;
      if (tabId == null) continue;
      if (tab.discarded) continue;
      if (matchesAutoCleanupWhitelist(tab, settings.autoCleanupWhitelist)) continue;

      const lastActivityAt = getTabLastActivityAt(tab);
      if (lastActivityAt == null || lastActivityAt > thresholdAt) continue;

      try {
        await chrome.tabs.discard(tabId);
        discardedTabIds.push(tabId);
      } catch (error) {
        console.warn('Failed to auto-sleep inactive tab.', error);
      }
    }

    if (discardedTabIds.length > 0) {
      scheduleOverviewInvalidation('updated');
    }
  } finally {
    autoSleepInactiveTabsInFlight = false;
  }
}

async function autoCloseInactiveTabs(): Promise<void> {
  if (autoCloseInactiveTabsInFlight) return;
  autoCloseInactiveTabsInFlight = true;

  try {
    const settings = await getSettings();
    if (settings.autoCloseInactiveTabsMinutes <= 0) return;

    const thresholdAt = Date.now() - settings.autoCloseInactiveTabsMinutes * 60_000;
    const tabs = await chrome.tabs.query({});
    const closableTabIds: number[] = [];

    for (const tab of tabs) {
      if (!isAutoCleanupEligible(tab)) continue;
      const tabId = tab.id;
      if (tabId == null) continue;

      // 根据域名模式过滤（include 模式下空列表等同于 all）
      const hasDomainList = settings.autoCleanupWhitelist.length > 0;
      if (hasDomainList) {
        if (settings.autoCloseDomainMode === 'exclude') {
          // 排除模式：列表中的域名跳过关闭
          if (matchesAutoCleanupWhitelist(tab, settings.autoCleanupWhitelist)) continue;
        } else if (settings.autoCloseDomainMode === 'include') {
          // 仅限模式：只对列表中的域名启用关闭
          if (!matchesAutoCleanupWhitelist(tab, settings.autoCleanupWhitelist)) continue;
        }
      }

      const lastActivityAt = getTabLastActivityAt(tab);
      if (lastActivityAt == null || lastActivityAt > thresholdAt) continue;

      closableTabIds.push(tabId);
    }

    if (closableTabIds.length === 0) return;

    const result = await closeTabs(closableTabIds);
    if (result.affectedCount > 0) {
      scheduleOverviewInvalidation('updated');
    }
  } finally {
    autoCloseInactiveTabsInFlight = false;
  }
}

async function syncAutoCollapseInactiveGroupsAlarm(): Promise<void> {
  if (!chrome.alarms?.create || !chrome.alarms?.clear) return;

  const settings = await getSettings();
  if (
    settings.autoCollapseInactiveGroupsMinutes <= 0 &&
    settings.autoSleepInactiveTabsMinutes <= 0 &&
    settings.autoCloseInactiveTabsMinutes <= 0
  ) {
    await chrome.alarms.clear(AUTO_COLLAPSE_INACTIVE_GROUPS_ALARM);
    return;
  }

  await chrome.alarms.create(AUTO_COLLAPSE_INACTIVE_GROUPS_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: 1
  });
}

function scheduleAutoCollapseInactiveGroupsCheck(): void {
  void (async () => {
    try {
      await autoCollapseInactiveGroups();
      await autoSleepInactiveTabs();
      await autoCloseInactiveTabs();
    } catch (error) {
      console.warn('Failed to run inactive tab cleanup.', error);
    }
  })();
}

async function getSystemMemory(): Promise<SystemMemorySnapshot | null> {
  if (!chrome.system?.memory?.getInfo) return null;

  const info = await chrome.system.memory.getInfo();
  return {
    totalBytes: info.capacity,
    availableBytes: info.availableCapacity,
    usedBytes: info.capacity - info.availableCapacity
  };
}

function toGroupSnapshot(group: chrome.tabGroups.TabGroup): TabGroupSnapshot {
  const metadata = getGroupMetadata(group.id);

  return {
    id: group.id,
    title: group.title || 'Untitled group',
    color: group.color,
    collapsed: group.collapsed,
    autoGroupEnabled: metadata.autoGroupEnabled,
    autoGroupConfigId: metadata.autoGroupConfigId,
    autoGroupPresetIds: metadata.autoGroupPresetIds,
    autoGroupRules: metadata.autoGroupRules
  };
}

function toTabSnapshot(
  tab: chrome.tabs.Tab,
  groups: Map<number, TabGroupSnapshot>
): TabSnapshot | null {
  if (tab.id == null) return null;

  const url = tab.url ?? tab.pendingUrl ?? '';
  const group =
    typeof tab.groupId === 'number' && tab.groupId >= 0
      ? groups.get(tab.groupId) ?? null
      : null;

  return {
    id: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    groupId: tab.groupId ?? -1,
    title: tab.title ?? 'Untitled tab',
    url,
    hostname: normalizeHostname(url),
    favIconUrl: resolveFavIconUrl(tab.favIconUrl ?? null, url),
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    audible: Boolean(tab.audible),
    muted: Boolean(tab.mutedInfo?.muted),
    discarded: Boolean(tab.discarded),
    frozen: Boolean((tab as chrome.tabs.Tab & { frozen?: boolean }).frozen),
    status: tab.status ?? 'unknown',
    incognito: Boolean(tab.incognito),
    openerTabId: tab.openerTabId ?? null,
    lastAccessed: tab.lastAccessed ?? null,
    telemetry: getTelemetry(tab.id),
    group
  };
}

function toArchivedTabSnapshot(snapshot: StoredTabState, telemetry: RuntimeTabTelemetry): TabSnapshot {
  return {
    id: snapshot.tabId,
    windowId: snapshot.windowId,
    index: snapshot.index,
    groupId: snapshot.groupId,
    title: snapshot.title,
    url: snapshot.url,
    hostname: snapshot.hostname,
    favIconUrl: snapshot.favIconUrl,
    active: false,
    pinned: snapshot.pinned,
    audible: false,
    muted: snapshot.muted,
    discarded: snapshot.discarded,
    frozen: snapshot.frozen,
    status: snapshot.status,
    incognito: false,
    openerTabId: null,
    lastAccessed: snapshot.lastAccessed,
    telemetry,
    group:
      snapshot.groupTitle && snapshot.groupId >= 0
        ? {
            id: snapshot.groupId,
            title: snapshot.groupTitle,
            color: 'grey',
            collapsed: false,
            autoGroupEnabled: true,
            autoGroupConfigId: null,
            autoGroupPresetIds: [],
            autoGroupRules: []
          }
        : null
  };
}

export async function buildOverview(): Promise<OverviewSnapshot> {
  await Promise.all([ensureGroupMetadataLoaded(), ensureTabHistoryLoaded()]);

  const [tabs, groups, systemMemory] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabGroups.query({}),
    getSystemMemory()
  ]);

  const groupMap = new Map(groups.map((group) => [group.id, toGroupSnapshot(group)]));

  const normalizedTabs = tabs
    .map((tab) => {
      const snapshot = toTabSnapshot(tab, groupMap);
      if (!snapshot) return null;

      if (!snapshot.favIconUrl) {
        const historyRecord = tabHistoryRecords.get(snapshot.id);
        if (
          historyRecord?.snapshot.favIconUrl &&
          historyRecord.snapshot.url === snapshot.url
        ) {
          snapshot.favIconUrl = historyRecord.snapshot.favIconUrl;
        }
      }

      return snapshot;
    })
    .filter((tab): tab is TabSnapshot => tab !== null)
    .sort((left, right) => {
      if (left.windowId !== right.windowId) return left.windowId - right.windowId;
      return left.index - right.index;
    });

  return {
    generatedAt: Date.now(),
    systemMemory,
    stats: {
      totalTabs: normalizedTabs.length,
      windowCount: new Set(normalizedTabs.map((tab) => tab.windowId)).size,
      groupedTabs: normalizedTabs.filter((tab) => tab.group !== null).length,
      sleepingTabs: normalizedTabs.filter((tab) => tab.discarded || tab.frozen).length,
      audibleTabs: normalizedTabs.filter((tab) => tab.audible).length
    },
    tabs: normalizedTabs,
    historyTabs: recentClosedTabHistory.map((record) => ({
      id: record.id,
      originalTabId: record.snapshot.tabId,
      title: record.snapshot.title,
      url: record.snapshot.url,
      hostname: record.snapshot.hostname,
      favIconUrl: record.snapshot.favIconUrl,
      groupTitle: record.snapshot.groupTitle,
      closedAt: record.closedAt,
      telemetry: record.telemetry
    }))
  };
}

export async function getTabDetail(tabId: number): Promise<TabDetailSnapshot> {
  await ensureTabHistoryLoaded();

  const [tab, groups] = await Promise.all([
    chrome.tabs.get(tabId).catch(() => null),
    chrome.tabGroups.query({}).catch(() => [])
  ]);

  if (tab?.id != null) {
    await trackTabHistory(tab, 'updated');
  }

  const groupMap = new Map(groups.map((group) => [group.id, toGroupSnapshot(group)]));
  const record = tabHistoryRecords.get(tabId);
  const closedRecord = recentClosedTabHistory.find((entry) => entry.snapshot.tabId === tabId);
  const detailTab =
    tab != null
      ? toTabSnapshot(tab, groupMap)
      : closedRecord
        ? toArchivedTabSnapshot(closedRecord.snapshot, closedRecord.telemetry)
        : null;

  return {
    tab: detailTab,
    history: sortHistoryEvents(record?.history ?? closedRecord?.history)
  };
}

async function openDashboardTab(): Promise<void> {
  await openOrRefreshDashboardTab();
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sessionDefaultTitle(scope: 'current-window' | 'all-windows' | 'auto', at = Date.now()): string {
  if (scope === 'auto') return formatSessionTimeTitle(at);

  const date = new Date(at);
  const stamp = new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
  return scope === 'current-window' ? `Snapshot ${stamp}` : `All snapshots ${stamp}`;
}

function formatSessionTimeTitle(at = Date.now()): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, '0');

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  ].join(' ');
}

function isRestorableUrl(url: string | undefined): url is string {
  if (!url) return false;
  return /^(https?:|file:|chrome:|chrome-extension:)/.test(url);
}

function toSessionTabRecord(tab: chrome.tabs.Tab, groupMap: Map<number, TabGroupSnapshot>): SessionTabRecord | null {
  const url = tab.url ?? tab.pendingUrl;
  if (!isRestorableUrl(url)) return null;

  const hostname = normalizeHostname(url);
  const group = tab.groupId != null && tab.groupId >= 0 ? groupMap.get(tab.groupId) : null;

  return {
    url,
    title: tab.title || hostname || url,
    hostname,
    favIconUrl: tab.favIconUrl ?? null,
    pinned: Boolean(tab.pinned),
    muted: Boolean(tab.mutedInfo?.muted),
    group: group
      ? {
          key: `group:${group.id}`,
          title: group.title || hostname || 'Group',
          color: (group.color as TabGroupColor) || 'grey'
        }
      : null
  };
}

function buildSessionStats(windows: SessionWindowRecord[]): SessionStats {
  const groupKeys = new Set<string>();
  const tabCount = windows.reduce((total, window) => {
    window.tabs.forEach((tab) => {
      if (tab.group) {
        groupKeys.add(`${window.id}:${tab.group.key}`);
      }
    });
    return total + window.tabs.length;
  }, 0);

  return {
    windowCount: windows.length,
    tabCount,
    groupCount: groupKeys.size
  };
}

function trimManualSessions(): void {
  const manualSessions = Array.from(sessionRecords.values())
    .filter((session) => session.source === 'manual')
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const pinnedSessions = manualSessions.filter((session) => session.pinned);
  const removableSessions = manualSessions.filter((session) => !session.pinned);
  const removableLimit = Math.max(0, MAX_MANUAL_SESSIONS - pinnedSessions.length);

  removableSessions.slice(removableLimit).forEach((session) => {
    sessionRecords.delete(session.id);
  });
}

function trimAutoSessions(): void {
  const autoSessions = Array.from(sessionRecords.values())
    .filter((session) => session.source === 'auto')
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const now = Date.now();
  const fineSessions = autoSessions
    .filter((session) => now - session.updatedAt <= AUTO_SESSION_FINE_WINDOW_MS)
    .slice(0, MAX_FINE_AUTO_SESSIONS);
  const keptSessions = [...fineSessions];
  const keptIds = new Set(fineSessions.map((session) => session.id));
  let lastSparseSessionAt = fineSessions[fineSessions.length - 1]?.updatedAt ?? Number.POSITIVE_INFINITY;

  for (const session of autoSessions) {
    if (keptSessions.length >= MAX_AUTO_SESSIONS) break;
    if (keptIds.has(session.id)) continue;
    if (lastSparseSessionAt - session.updatedAt < AUTO_SESSION_SPARSE_INTERVAL_MS) continue;

    keptSessions.push(session);
    keptIds.add(session.id);
    lastSparseSessionAt = session.updatedAt;
  }

  for (const session of autoSessions) {
    if (keptSessions.length >= MAX_AUTO_SESSIONS) break;
    if (keptIds.has(session.id)) continue;

    keptSessions.push(session);
    keptIds.add(session.id);
  }

  autoSessions.forEach((session) => {
    if (!keptIds.has(session.id)) {
      sessionRecords.delete(session.id);
    }
  });
}

function createAutoSessionSignature(windows: SessionWindowRecord[]): string {
  return windows
    .map((window) =>
      window.tabs
        .map((tab) =>
          [
            tab.url,
            tab.pinned ? 'pinned' : '',
            tab.muted ? 'muted' : '',
            tab.group ? `${tab.group.key}:${tab.group.title}:${tab.group.color}` : ''
          ].join('\u001f')
        )
        .join('\u001e')
    )
    .join('\u001d');
}

function getLatestAutoSession(): SessionRecord | null {
  return Array.from(sessionRecords.values())
    .filter((session) => session.source === 'auto')
    .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
}

async function captureSession(
  scope: 'current-window' | 'all-windows',
  title?: string,
  options?: { id?: string; source?: SessionRecord['source'] }
): Promise<SessionRecord> {
  await ensureSessionsLoaded();

  const now = Date.now();
  const [tabs, groups] = await Promise.all([
    chrome.tabs.query(scope === 'current-window' ? { currentWindow: true } : {}),
    chrome.tabGroups.query({})
  ]);
  const groupMap = new Map(groups.map((group) => [group.id, toGroupSnapshot(group)]));
  const windowsById = new Map<number, SessionTabRecord[]>();

  tabs
    .sort((left, right) => {
      if (left.windowId !== right.windowId) return left.windowId - right.windowId;
      return left.index - right.index;
    })
    .forEach((tab) => {
      const sessionTab = toSessionTabRecord(tab, groupMap);
      if (!sessionTab || tab.windowId == null) return;
      const list = windowsById.get(tab.windowId) ?? [];
      list.push(sessionTab);
      windowsById.set(tab.windowId, list);
    });

  const windows: SessionWindowRecord[] = Array.from(windowsById.entries())
    .filter(([, windowTabs]) => windowTabs.length > 0)
    .map(([windowId, windowTabs], index) => ({
      id: `window-${windowId}-${index}`,
      title: windowTabs[0]?.title ?? `Window ${index + 1}`,
      tabs: windowTabs
    }));

  if (windows.length === 0) {
    throw new Error('No restorable tabs found in this session.');
  }

  if (options?.source === 'auto') {
    const latestAutoSession = getLatestAutoSession();
    if (
      latestAutoSession &&
      createAutoSessionSignature(latestAutoSession.windows) === createAutoSessionSignature(windows)
    ) {
      return latestAutoSession;
    }
  }

  const session: SessionRecord = {
    id: options?.id ?? createId('session'),
    title: title?.trim() || sessionDefaultTitle(options?.source === 'auto' ? 'auto' : scope, now),
    note: '',
    tags: [],
    pinned: false,
    source: options?.source ?? 'manual',
    createdAt: now,
    updatedAt: now,
    windows,
    stats: buildSessionStats(windows)
  };

  sessionRecords.set(session.id, session);
  if (session.source === 'manual') {
    trimManualSessions();
  } else {
    trimAutoSessions();
  }
  if (session.source === 'manual') {
    await persistSessionsNow();
  } else {
    scheduleSessionsPersist();
  }
  scheduleSessionsInvalidation();
  return session;
}

async function captureAutoSessionSnapshot(): Promise<void> {
  if (autoSessionCaptureInFlight) return;
  autoSessionCaptureInFlight = true;

  try {
    const settings = await getSettings();
    if (!settings.autoSnapshotsEnabled) return;

    await captureSession('all-windows', undefined, {
      source: 'auto'
    });
  } catch (error) {
    console.warn('Failed to capture auto session snapshot.', error);
  } finally {
    autoSessionCaptureInFlight = false;
  }
}

function scheduleAutoSessionSnapshot(delay = AUTO_SESSION_DEBOUNCE_MS): void {
  if (autoSessionTimer != null) {
    clearTimeout(autoSessionTimer);
    autoSessionTimer = null;
  }

  void getSettings().then((settings) => {
    if (!settings.autoSnapshotsEnabled) return;

    autoSessionTimer = setTimeout(() => {
      autoSessionTimer = null;
      void captureAutoSessionSnapshot();
    }, delay);
  }).catch((error) => {
    autoSessionTimer = null;
    console.warn('Failed to check auto snapshots setting.', error);
  });
}

function startAutoSessionSnapshots(): void {
  scheduleAutoSessionSnapshot(0);
}

async function getSessions(): Promise<SessionsSnapshot> {
  await ensureSessionsLoaded();
  const sessions = Array.from(sessionRecords.values()).sort((left, right) => right.updatedAt - left.updatedAt);
  return {
    generatedAt: Date.now(),
    sessions,
    totalSessions: sessions.length
  };
}

async function restoreSession(sessionId: string, mode: SessionRestoreMode = 'new-window'): Promise<SessionRestoreResult> {
  await ensureSessionsLoaded();
  const session = sessionRecords.get(sessionId);
  if (!session) throw new Error('Session not found.');

  const affectedTabIds: number[] = [];
  let failedCount = 0;

  const applyRestoredTabState = async (tabId: number, source: SessionTabRecord): Promise<void> => {
    if (!source.muted) return;
    await chrome.tabs.update(tabId, { muted: true });
  };

  const restoreTabIntoWindow = async (
    windowId: number,
    source: SessionTabRecord,
    options?: { active?: boolean; index?: number; pinned?: boolean }
  ): Promise<number | null> => {
    try {
      const tab = await chrome.tabs.create({
        windowId,
        index: options?.index,
        url: source.url,
        active: options?.active ?? false,
        pinned: options?.pinned ?? source.pinned
      });
      if (tab.id == null) return null;
      affectedTabIds.push(tab.id);
      await applyRestoredTabState(tab.id, source).catch(() => {});
      return tab.id;
    } catch (error) {
      failedCount += 1;
      console.warn('Failed to restore session tab.', source.url, error);
      return null;
    }
  };

  const restoreGroups = async (
    restoredTabIds: Array<number | null>,
    sourceTabs: SessionTabRecord[],
    keyPrefix = ''
  ): Promise<void> => {
    const groupBuckets = new Map<string, { group: NonNullable<SessionTabRecord['group']>; tabIds: number[] }>();

    sourceTabs.forEach((sourceTab, index) => {
      if (!sourceTab.group) return;
      const restoredTabId = restoredTabIds[index];
      if (!restoredTabId) return;
      const key = `${keyPrefix}${sourceTab.group.key}`;
      const bucket = groupBuckets.get(key) ?? { group: sourceTab.group, tabIds: [] };
      bucket.tabIds.push(restoredTabId);
      groupBuckets.set(key, bucket);
    });

    for (const bucket of groupBuckets.values()) {
      const tabIds = asNonEmptyTabIds(bucket.tabIds);
      if (!tabIds) continue;
      try {
        const groupId = await chrome.tabs.group({ tabIds });
        await chrome.tabGroups.update(groupId, {
          title: bucket.group.title,
          color: bucket.group.color
        });
      } catch (error) {
        console.warn('Failed to restore session group.', error);
      }
    }
  };

  if (mode === 'current-window') {
    const currentWindow = await chrome.windows.getCurrent();
    const currentWindowId = currentWindow.id;
    if (currentWindowId == null) throw new Error('Current window not found.');

    for (const [windowIndex, sessionWindow] of session.windows.entries()) {
      let nextIndex = (await chrome.tabs.query({ windowId: currentWindowId })).length;
      const restoredTabIds: Array<number | null> = [];
      for (const tab of sessionWindow.tabs) {
        const restoredTabId = await restoreTabIntoWindow(currentWindowId, tab, {
          active: false,
          index: nextIndex
        });
        if (restoredTabId != null) {
          nextIndex += 1;
        }
        restoredTabIds.push(restoredTabId);
      }

      await restoreGroups(restoredTabIds, sessionWindow.tabs, `${windowIndex}:`);
    }

    return {
      ...collectMutationOutcome(affectedTabIds),
      failedCount
    };
  }

  for (const [windowIndex, sessionWindow] of session.windows.entries()) {
    const [firstTab, ...remainingTabs] = sessionWindow.tabs;
    if (!firstTab) continue;

    let createdWindow: chrome.windows.Window | undefined;
    try {
      createdWindow = await chrome.windows.create({
        focused: windowIndex === 0,
        url: firstTab.url
      });
    } catch (error) {
      failedCount += 1;
      console.warn('Failed to restore session window.', firstTab.url, error);
      continue;
    }
    if (!createdWindow) continue;
    const windowId = createdWindow.id;
    if (windowId == null) continue;

    const restoredTabIds: Array<number | null> = [];
    const createdTabs = (createdWindow.tabs ?? []).filter((tab): tab is chrome.tabs.Tab => tab.id != null);
    const firstCreatedTab = createdTabs[0];
    if (firstCreatedTab?.id != null) {
      affectedTabIds.push(firstCreatedTab.id);
      restoredTabIds.push(firstCreatedTab.id);
      if (firstTab.pinned || firstTab.muted) {
        await chrome.tabs.update(firstCreatedTab.id, {
          pinned: firstTab.pinned,
          muted: firstTab.muted
        }).catch(() => {});
      }
    } else {
      restoredTabIds.push(null);
    }

    let nextIndex = 1;
    for (const tab of remainingTabs) {
      const restoredTabId = await restoreTabIntoWindow(windowId, tab, {
        index: nextIndex
      });
      if (restoredTabId != null) {
        nextIndex += 1;
      }
      restoredTabIds.push(restoredTabId);
    }

    await restoreGroups(restoredTabIds, sessionWindow.tabs);
  }

  return {
    ...collectMutationOutcome(affectedTabIds),
    failedCount
  };
}

async function updateSession(sessionId: string, patch: SessionUpdatePatch): Promise<SessionRecord> {
  await ensureSessionsLoaded();
  const current = sessionRecords.get(sessionId);
  if (!current) throw new Error('Session not found.');

  const next: SessionRecord = {
    ...current,
    title: patch.title !== undefined ? patch.title.trim() || current.title : current.title,
    note: patch.note !== undefined ? patch.note.trim() : current.note,
    tags: patch.tags !== undefined ? patch.tags.map((tag) => tag.trim()).filter(Boolean) : current.tags,
    pinned: patch.pinned !== undefined ? patch.pinned : current.pinned,
    updatedAt: Date.now()
  };

  sessionRecords.set(sessionId, next);
  await persistSessionsNow();
  scheduleSessionsInvalidation();
  return next;
}

async function deleteSession(sessionId: string): Promise<TabMutationResult> {
  await ensureSessionsLoaded();
  sessionRecords.delete(sessionId);
  await persistSessionsNow();
  scheduleSessionsInvalidation();
  return collectMutationOutcome([]);
}

function toBookmarkNodeSnapshot(
  node: chrome.bookmarks.BookmarkTreeNode
): BookmarkNodeSnapshot {
  return {
    id: node.id,
    parentId: node.parentId ?? null,
    index: node.index ?? 0,
    title: node.title || node.url || '',
    url: node.url ?? null,
    dateAdded: node.dateAdded ?? null,
    dateGroupModified: node.dateGroupModified ?? null,
    folderType: node.folderType ?? null,
    syncing: Boolean(node.syncing),
    unmodifiable: node.unmodifiable ?? null,
    children: (node.children ?? []).map((child) => toBookmarkNodeSnapshot(child))
  };
}

function countBookmarks(node: BookmarkNodeSnapshot): { bookmarks: number; folders: number } {
  const ownCounts =
    node.url == null
      ? { bookmarks: 0, folders: 1 }
      : { bookmarks: 1, folders: 0 };

  return node.children.reduce(
    (totals, child) => {
      const childCounts = countBookmarks(child);
      return {
        bookmarks: totals.bookmarks + childCounts.bookmarks,
        folders: totals.folders + childCounts.folders
      };
    },
    ownCounts
  );
}

async function getBookmarks(): Promise<BookmarkTreeSnapshot> {
  const tree = await chrome.bookmarks.getTree();
  const rawRoots =
    tree.length === 1 && tree[0]?.id === '0' && Array.isArray(tree[0].children)
      ? tree[0].children
      : tree;
  const roots = rawRoots.map((node) => toBookmarkNodeSnapshot(node));
  const totals = roots.reduce(
    (accumulator, root) => {
      const counts = countBookmarks(root);
      return {
        totalBookmarks: accumulator.totalBookmarks + counts.bookmarks,
        totalFolders: accumulator.totalFolders + counts.folders
      };
    },
    { totalBookmarks: 0, totalFolders: 0 }
  );

  return {
    roots,
    totalBookmarks: totals.totalBookmarks,
    totalFolders: totals.totalFolders
  };
}

async function createBookmarkFolder(
  parentId: string,
  title: string,
  index?: number
): Promise<BookmarkNodeSnapshot | null> {
  const created = await chrome.bookmarks.create({
    parentId,
    title: title.trim() || 'Untitled folder',
    index
  });
  scheduleBookmarksInvalidation();
  return toBookmarkNodeSnapshot(created);
}

async function createBookmarkFromActiveTab(
  parentId: string,
  index?: number
): Promise<BookmarkNodeSnapshot | null> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = activeTab?.url ?? activeTab?.pendingUrl ?? '';
  if (!url) return null;

  const created = await chrome.bookmarks.create({
    parentId,
    title: activeTab?.title || url,
    url,
    index
  });
  scheduleBookmarksInvalidation();
  return toBookmarkNodeSnapshot(created);
}

async function updateBookmark(
  bookmarkId: string,
  patch: BookmarkUpdatePatch
): Promise<BookmarkNodeSnapshot | null> {
  const nextPatch: { title?: string; url?: string } = {};
  if (patch.title !== undefined) {
    nextPatch.title = patch.title.trim();
  }
  if (patch.url !== undefined) {
    nextPatch.url = patch.url.trim();
  }

  const updated = await chrome.bookmarks.update(bookmarkId, nextPatch);
  scheduleBookmarksInvalidation();
  return toBookmarkNodeSnapshot(updated);
}

async function deleteBookmark(bookmarkId: string): Promise<TabMutationResult> {
  const [node] = await chrome.bookmarks.get(bookmarkId);
  if (node?.url) {
    await chrome.bookmarks.remove(bookmarkId);
  } else {
    await chrome.bookmarks.removeTree(bookmarkId);
  }
  scheduleBookmarksInvalidation();
  return collectMutationOutcome([]);
}

async function moveBookmark(
  bookmarkId: string,
  parentId: string,
  index?: number
): Promise<TabMutationResult> {
  await chrome.bookmarks.move(bookmarkId, {
    parentId,
    index
  });
  scheduleBookmarksInvalidation();
  return collectMutationOutcome([]);
}

function uniqueTabIds(tabIds: number[]): number[] {
  return [...new Set(tabIds)].filter((tabId) => Number.isInteger(tabId) && tabId > 0);
}

function asNonEmptyTabIds(tabIds: number[]): [number, ...number[]] | null {
  return tabIds.length > 0 ? [tabIds[0], ...tabIds.slice(1)] : null;
}

async function loadTabsById(tabIds: number[]): Promise<chrome.tabs.Tab[]> {
  const results = await Promise.allSettled(tabIds.map((tabId) => chrome.tabs.get(tabId)));
  return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}

function collectMutationOutcome(tabIds: number[]): TabMutationResult {
  return {
    affectedTabIds: tabIds,
    affectedCount: tabIds.length
  };
}

async function applyTabUpdates(
  tabIds: number[],
  update: (tabId: number) => Promise<unknown>
): Promise<TabMutationResult> {
  const uniqueIds = uniqueTabIds(tabIds);
  const results = await Promise.allSettled(uniqueIds.map((tabId) => update(tabId)));
  const affectedTabIds = uniqueIds.filter((_, index) => results[index]?.status === 'fulfilled');
  return collectMutationOutcome(affectedTabIds);
}

async function closeTabs(tabIds: number[]): Promise<TabMutationResult> {
  const uniqueIds = uniqueTabIds(tabIds);
  const results = await Promise.allSettled(uniqueIds.map((tabId) => chrome.tabs.remove(tabId)));
  const affectedTabIds = uniqueIds.filter((_, index) => results[index]?.status === 'fulfilled');
  return collectMutationOutcome(affectedTabIds);
}

async function discardTabs(tabIds: number[]): Promise<TabMutationResult> {
  const tabs = await loadTabsById(uniqueTabIds(tabIds));
  const mutableTabs = tabs.filter((tab) => !tab.active && tab.id != null);
  const results = await Promise.allSettled(
    mutableTabs.map((tab) => chrome.tabs.discard(tab.id!))
  );
  const affectedTabIds = mutableTabs
    .map((tab, index) => (results[index]?.status === 'fulfilled' ? tab.id! : null))
    .filter((tabId): tabId is number => tabId !== null);
  return collectMutationOutcome(affectedTabIds);
}

async function assignTabsToGroup(
  tabIds: number[],
  groupId: number,
  learn = true
): Promise<TabMutationResult> {
  const uniqueIds = uniqueTabIds(tabIds);
  if (uniqueIds.length === 0) return collectMutationOutcome([]);

  const [targetGroup, targetGroupTabs, tabs] = await Promise.all([
    chrome.tabGroups.get(groupId),
    chrome.tabs.query({ groupId }),
    loadTabsById(uniqueIds)
  ]);

  const insertIndex =
    targetGroupTabs.length > 0
      ? Math.max(...targetGroupTabs.map((tab) => tab.index)) + 1
      : 0;

  const movedTabIds: number[] = [];

  for (const [index, tab] of tabs.entries()) {
    if (tab.id == null) continue;

    if (tab.windowId !== targetGroup.windowId) {
      await chrome.tabs.move(tab.id, {
        windowId: targetGroup.windowId,
        index: insertIndex + index
      });
    }

    movedTabIds.push(tab.id);
  }

  const nonEmptyTabIds = asNonEmptyTabIds(movedTabIds);
  if (!nonEmptyTabIds) return collectMutationOutcome([]);

  if (!learn) {
    markProgrammaticAutoGroupedTabs(nonEmptyTabIds);
  }

  await chrome.tabs.group({
    groupId,
    tabIds: nonEmptyTabIds
  });

  for (const tabId of movedTabIds) {
    deleteAutoGroupExemption(tabId);
  }

  if (learn) {
    await learnAutoGroupRuleFromGroup(groupId);
  }

  return collectMutationOutcome(movedTabIds);
}

async function createGroups(
  tabIds: number[],
  options: GroupTabsOptions
): Promise<TabMutationResult> {
  if (options.groupId != null) {
    return assignTabsToGroup(tabIds, options.groupId, options.learn !== false);
  }

  const tabs = await loadTabsById(uniqueTabIds(tabIds));
  const byWindow = new Map<number, number[]>();

  for (const tab of tabs) {
    if (tab.id == null) continue;

    const list = byWindow.get(tab.windowId) ?? [];
    list.push(tab.id);
    byWindow.set(tab.windowId, list);
  }

  const affected: number[] = [];

  for (const [windowId, windowTabIds] of byWindow) {
    const nonEmptyTabIds = asNonEmptyTabIds(windowTabIds);
    if (!nonEmptyTabIds) continue;

    if (options.learn === false) {
      markProgrammaticAutoGroupedTabs(nonEmptyTabIds);
    }

    const groupId = await chrome.tabs.group({
      tabIds: nonEmptyTabIds,
      createProperties: { windowId }
    });

    if (typeof groupId === 'number') {
      await chrome.tabGroups.update(groupId, {
        title: options.title,
        color: options.color
      });
      observedGroupTitles.set(groupId, options.title ?? '');
      if (options.autoGroupConfigId) {
        setGroupMetadata(groupId, {
          autoGroupCreated: true,
          autoGroupConfigId: options.autoGroupConfigId
        });
      }
      if (options.learn !== false && !options.autoGroupConfigId) {
        await learnAutoGroupRuleFromGroup(groupId);
      }
      affected.push(...windowTabIds);
    }
  }

  const affectedTabIds = uniqueTabIds(affected);
  for (const tabId of affectedTabIds) {
    deleteAutoGroupExemption(tabId);
  }

  return collectMutationOutcome(affectedTabIds);
}

async function ungroupTabs(tabIds: number[]): Promise<TabMutationResult> {
  const tabs = await loadTabsById(uniqueTabIds(tabIds));
  const byWindow = new Map<number, number[]>();

  for (const tab of tabs) {
    if (tab.id == null) continue;

    const list = byWindow.get(tab.windowId) ?? [];
    list.push(tab.id);
    byWindow.set(tab.windowId, list);
  }

  const affected: number[] = [];

  for (const [, windowTabIds] of byWindow) {
    const nonEmptyTabIds = asNonEmptyTabIds(windowTabIds);
    if (!nonEmptyTabIds) continue;
    await chrome.tabs.ungroup(nonEmptyTabIds);
    affected.push(...windowTabIds);
  }

  return collectMutationOutcome(uniqueTabIds(affected));
}

async function moveTabBefore(tabId: number, beforeTabId: number): Promise<TabMutationResult> {
  if (tabId === beforeTabId) return collectMutationOutcome([]);

  const [tab, beforeTab] = await Promise.all([
    chrome.tabs.get(tabId),
    chrome.tabs.get(beforeTabId)
  ]);

  if (!tab.id || !beforeTab.id) return collectMutationOutcome([]);

  const sameWindow = tab.windowId === beforeTab.windowId;
  const targetIndex =
    sameWindow && tab.index < beforeTab.index ? beforeTab.index - 1 : beforeTab.index;

  await chrome.tabs.move(tab.id, {
    windowId: beforeTab.windowId,
    index: Math.max(0, targetIndex)
  });

  return collectMutationOutcome([tab.id]);
}

async function moveTabAfter(tabId: number, afterTabId: number): Promise<TabMutationResult> {
  if (tabId === afterTabId) return collectMutationOutcome([]);

  const [tab, afterTab] = await Promise.all([
    chrome.tabs.get(tabId),
    chrome.tabs.get(afterTabId)
  ]);

  if (!tab.id || !afterTab.id) return collectMutationOutcome([]);

  const sameWindow = tab.windowId === afterTab.windowId;
  const targetIndex =
    sameWindow && tab.index < afterTab.index ? afterTab.index : afterTab.index + 1;

  await chrome.tabs.move(tab.id, {
    windowId: afterTab.windowId,
    index: Math.max(0, targetIndex)
  });

  return collectMutationOutcome([tab.id]);
}

async function moveTabsBefore(
  tabIds: number[],
  beforeTabId: number
): Promise<TabMutationResult> {
  const uniqueIds = uniqueTabIds(tabIds);
  if (uniqueIds.length === 0) return collectMutationOutcome([]);

  const [beforeTab, tabs] = await Promise.all([
    chrome.tabs.get(beforeTabId),
    loadTabsById(uniqueIds)
  ]);

  if (!beforeTab.id) return collectMutationOutcome([]);

  const orderedTabs = tabs
    .filter((tab) => tab.id != null)
    .sort((left, right) => left.index - right.index);

  if (orderedTabs.length === 0) return collectMutationOutcome([]);

  const currentWindowId = orderedTabs[0]!.windowId;
  const movingWithinWindow = currentWindowId === beforeTab.windowId;
  const sameSetContainsTarget = uniqueIds.includes(beforeTab.id);

  if (sameSetContainsTarget) return collectMutationOutcome([]);

  let targetIndex = beforeTab.index;

  if (movingWithinWindow) {
    const movingBeforeTarget = orderedTabs.filter((tab) => tab.index < beforeTab.index).length;
    targetIndex -= movingBeforeTarget;
  }

  await chrome.tabs.move(
    orderedTabs.map((tab) => tab.id!),
    {
      windowId: beforeTab.windowId,
      index: Math.max(0, targetIndex)
    }
  );

  return collectMutationOutcome(orderedTabs.map((tab) => tab.id!));
}

async function moveTabsAfter(
  tabIds: number[],
  afterTabId: number
): Promise<TabMutationResult> {
  const uniqueIds = uniqueTabIds(tabIds);
  if (uniqueIds.length === 0) return collectMutationOutcome([]);

  const [afterTab, tabs] = await Promise.all([
    chrome.tabs.get(afterTabId),
    loadTabsById(uniqueIds)
  ]);

  if (!afterTab.id) return collectMutationOutcome([]);

  const orderedTabs = tabs
    .filter((tab) => tab.id != null)
    .sort((left, right) => left.index - right.index);

  if (orderedTabs.length === 0) return collectMutationOutcome([]);

  const currentWindowId = orderedTabs[0]!.windowId;
  const movingWithinWindow = currentWindowId === afterTab.windowId;
  const sameSetContainsTarget = uniqueIds.includes(afterTab.id);

  if (sameSetContainsTarget) return collectMutationOutcome([]);

  let targetIndex = afterTab.index + 1;

  if (movingWithinWindow) {
    const movingBeforeTarget = orderedTabs.filter((tab) => tab.index < afterTab.index).length;
    targetIndex -= movingBeforeTarget;
  }

  await chrome.tabs.move(
    orderedTabs.map((tab) => tab.id!),
    {
      windowId: afterTab.windowId,
      index: Math.max(0, targetIndex)
    }
  );

  return collectMutationOutcome(orderedTabs.map((tab) => tab.id!));
}

async function moveGroup(
  groupId: number,
  target: { kind: 'group' | 'tab'; id: number },
  position: 'before' | 'after'
): Promise<TabMutationResult> {
  const movingTabs = await chrome.tabs.query({ groupId });
  if (movingTabs.length === 0) return collectMutationOutcome([]);

  const orderedMovingTabs = movingTabs
    .filter((tab) => tab.id != null)
    .sort((left, right) => left.index - right.index);
  const movingTabIds = orderedMovingTabs.map((tab) => tab.id!);
  if (orderedMovingTabs.length === 0) return collectMutationOutcome([]);

  const movingWindowId = orderedMovingTabs[0]!.windowId;
  const getAdjustedTargetIndex = (
    targetWindowId: number,
    rawTargetIndex: number,
    compareIndex: number
  ): number => {
    if (movingWindowId !== targetWindowId) return Math.max(0, rawTargetIndex);

    const movingBeforeTarget = orderedMovingTabs.filter((tab) => tab.index < compareIndex).length;
    return Math.max(0, rawTargetIndex - movingBeforeTarget);
  };

  if (target.kind === 'group') {
    const targetGroup = await chrome.tabGroups.get(target.id);
    const targetTabs = await chrome.tabs.query({ groupId: target.id });
    if (targetTabs.length === 0) {
      return collectMutationOutcome(movingTabIds);
    }

    const targetStartIndex = Math.min(...targetTabs.map((tab) => tab.index));
    const targetEndIndex = Math.max(...targetTabs.map((tab) => tab.index));
    await chrome.tabGroups.move(groupId, {
      windowId: targetGroup.windowId,
      index: getAdjustedTargetIndex(
        targetGroup.windowId,
        position === 'before' ? targetStartIndex : targetEndIndex + 1,
        position === 'before' ? targetStartIndex : targetEndIndex
      )
    });
    return collectMutationOutcome(movingTabIds);
  } else {
    const targetTab = await chrome.tabs.get(target.id);
    await chrome.tabGroups.move(groupId, {
      windowId: targetTab.windowId,
      index: getAdjustedTargetIndex(
        targetTab.windowId,
        position === 'before' ? targetTab.index : targetTab.index + 1,
        targetTab.index
      )
    });
    return collectMutationOutcome(movingTabIds);
  }
}

async function updateGroup(
  groupId: number,
  patch: TabGroupUpdatePatch
): Promise<TabMutationResult> {
  if (patch.title !== undefined || patch.color !== undefined || patch.collapsed !== undefined) {
    await chrome.tabGroups.update(groupId, {
      title: patch.title,
      color: patch.color,
      collapsed: patch.collapsed
    });
    if (patch.collapsed === false) {
      markGroupInteracted(groupId);
    }
    if (patch.title !== undefined || patch.color !== undefined) {
      await learnAutoGroupRuleFromGroup(groupId);
    }
  }

  if (
    patch.autoGroupEnabled !== undefined ||
    patch.autoGroupConfigId !== undefined ||
    patch.autoGroupPresetIds !== undefined ||
    patch.autoGroupRules !== undefined
  ) {
    setGroupMetadata(groupId, {
      autoGroupEnabled: patch.autoGroupEnabled,
      autoGroupConfigId: patch.autoGroupConfigId,
      autoGroupPresetIds: patch.autoGroupPresetIds,
      autoGroupRules: patch.autoGroupRules
    });
    scheduleOverviewInvalidation('updated');
    await maybeAutoGroupTabs();
  }

  const tabs = await chrome.tabs.query({ groupId });
  const affectedTabIds = tabs
    .map((tab) => tab.id)
    .filter((tabId): tabId is number => tabId != null);

  return collectMutationOutcome(affectedTabIds);
}

function getDomainLabel(tab: chrome.tabs.Tab): string {
  const url = tab.url ?? tab.pendingUrl ?? '';

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname || 'Website';
  } catch {
    return 'Website';
  }
}

function colorFromLabel(label: string): TabGroupColor {
  let hash = 0;

  for (const character of label) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return allGroupColors[hash % allGroupColors.length] ?? 'blue';
}

async function smartGroupTabs(
  tabIds: number[],
  strategy: SmartGroupStrategy
): Promise<TabMutationResult> {
  const settings = await getSettings();
  const tabs = await loadTabsById(uniqueTabIds(tabIds));
  const buckets = new Map<string, { title: string; color: TabGroupColor; tabIds: number[] }>();

  for (const tab of tabs) {
    if (tab.id == null) continue;

    const baseTitle =
      strategy === 'domain'
        ? getDomainLabel(tab)
        : (() => {
            const preset = matchDefaultAutoGroupPreset(tab);
            if (preset) return getDefaultAutoGroupPresetTitle(preset, settings.locale);
            return null;
          })();
    if (!baseTitle) continue;
    const key = `${tab.windowId}:${baseTitle}`;
    const existing = buckets.get(key);

    if (existing) {
      existing.tabIds.push(tab.id);
    } else {
      buckets.set(key, {
        title: baseTitle,
        color: colorFromLabel(baseTitle),
        tabIds: [tab.id]
      });
    }
  }

  const affected: number[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.tabIds.length < 2) continue;

    const result = await createGroups(bucket.tabIds, {
      title: bucket.title,
      color: bucket.color
    });

    affected.push(...result.affectedTabIds);
  }

  return collectMutationOutcome(uniqueTabIds(affected));
}

export function installBackgroundService(): void {
  // seedRuntimeState must complete before the first auto-cleanup check,
  // otherwise runtimeTabs is empty and tabs could be prematurely auto-closed.
  const seedPromise = seedRuntimeState();
  startAutoSessionSnapshots();
  void (async () => {
    await syncDefaultAutoGroupTitles();
  })().catch((error) => {
    console.warn('Failed to initialize auto grouping during startup.', error);
  });
  chrome.runtime.onStartup.addListener(() => {
    void cleanupRestoredAutoGroups().catch((error) => {
      console.warn('Failed to cleanup restored auto groups during startup.', error);
    });
  });
  void syncAutoCollapseInactiveGroupsAlarm().catch((error) => {
    console.warn('Failed to schedule inactive group auto-collapse.', error);
  });
  // Delay the initial auto-cleanup until seedRuntimeState has populated
  // runtimeTabs so that activity timestamps are accurate.
  void seedPromise.then(() => scheduleAutoCollapseInactiveGroupsCheck()).catch((error) => {
    console.warn('Failed to run initial inactive tab cleanup after seed.', error);
  });
  void refreshRedirectTrackingEnabled().catch((error) => {
    console.warn('Failed to initialize redirect tracking permission state.', error);
  });
  scheduleActionDuplicateBadgeUpdate(0);

  ensureRedirectTrackingListeners();

  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id == null) return;

    const state = ensureRuntimeTab(tab.id);
    state.openedAt = Date.now();
    state.autoDeduplicationPendingFromCreate = true;

    if (tab.active) {
      startActiveSession(tab.windowId, tab.id);
    }

    scheduleOverviewInvalidation('created');
    scheduleActionDuplicateBadgeUpdate();
    scheduleAutoSessionSnapshot();
    scheduleAutoCollapseInactiveGroupsCheck();
    void trackTabHistory(tab, 'created');

    // When blockChromeAutoGroup is enabled, remove Chrome's automatic group
    // assignment so the tab starts ungrouped.  The extension's own auto-group
    // rules (maybeAutoGroupTab) can still re-group it afterward.
    // Must complete before maybeAutoGroupTab to avoid race condition.
    void (async () => {
      if (normalizeAutoDeduplicationUrl(tab.url ?? tab.pendingUrl ?? '') != null) {
        const deduplicated = await maybeAutoDeduplicateTab(tab);
        if (deduplicated) {
          return;
        }
      }

      try {
        if ((tab.groupId ?? -1) >= 0) {
          const settings = await getSettings();
          if (settings.blockChromeAutoGroup && tab.id != null) {
            await chrome.tabs.ungroup(tab.id);
          }
        }
      } catch (error) {
        console.warn('Failed to ungroup tab from Chrome auto-group.', error);
      }

      // Run auto-group after blockChromeAutoGroup to ensure correct ordering.
      void maybeAutoGroupTab(tab).catch((error) => {
        console.warn('Failed to auto group created tab.', error);
      });
    })();
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab.id == null) return;
    if (changeInfo.audible === true) {
      ensureRuntimeTab(tab.id).lastAudibleAt = Date.now();
    }

    const groupIdChanged = 'groupId' in changeInfo;
    const relevantUpdate =
      changeInfo.url !== undefined ||
      changeInfo.title !== undefined ||
      changeInfo.favIconUrl !== undefined ||
      changeInfo.status !== undefined ||
      changeInfo.pinned !== undefined ||
      changeInfo.mutedInfo !== undefined ||
      changeInfo.discarded !== undefined ||
      groupIdChanged;
    const snapshotRelevantUpdate =
      changeInfo.url !== undefined ||
      changeInfo.pinned !== undefined ||
      changeInfo.mutedInfo !== undefined ||
      groupIdChanged;

    if (!relevantUpdate) return;
    scheduleOverviewInvalidation('updated');
    if (changeInfo.url !== undefined || changeInfo.status !== undefined) {
      scheduleActionDuplicateBadgeUpdate();
    }
    if (snapshotRelevantUpdate) {
      scheduleAutoSessionSnapshot();
    }
    scheduleAutoCollapseInactiveGroupsCheck();
    void (async () => {
      if (changeInfo.url !== undefined || changeInfo.status === 'complete') {
        const deduplicated = await maybeAutoDeduplicateTab(tab);
        if (deduplicated) {
          return;
        }
      }

      if (changeInfo.url !== undefined) {
        await ensureAutoGroupExemptionsLoaded();
        deleteAutoGroupExemption(tab.id!);
      }

      if (groupIdChanged) {
        if ((tab.groupId ?? -1) >= 0) {
          await ensureAutoGroupExemptionsLoaded();
          deleteAutoGroupExemption(tab.id!);
          if (!programmaticAutoGroupTabIds.delete(tab.id!)) {
            await learnAutoGroupRuleFromGroup(tab.groupId!);
          }
        } else if (programmaticAutoGroupUngroupTabIds.delete(tab.id!)) {
          await ensureAutoGroupExemptionsLoaded();
          deleteAutoGroupExemption(tab.id!);
        } else {
          await rememberManualAutoGroupExit(tab);
          await forgetAutoGroupRuleFromManualGroupExit(tab);
        }
        await cleanupSingleTabAutoGroups();
      }

      await trackTabHistory(tab, 'updated');

      if (changeInfo.url !== undefined || changeInfo.status === 'complete' || groupIdChanged) {
        if (groupIdChanged && (tab.groupId ?? -1) < 0) {
          return;
        }

        await maybeAutoGroupTab(tab);
      }
    })().catch((error) => {
      console.warn('Failed to process updated tab.', error);
    });
  });

  chrome.tabs.onMoved.addListener(() => {
    scheduleOverviewInvalidation('updated');
    scheduleActionDuplicateBadgeUpdate();
    scheduleAutoSessionSnapshot();
    scheduleAutoCollapseInactiveGroupsCheck();
  });

  chrome.tabs.onAttached.addListener(() => {
    scheduleOverviewInvalidation('updated');
    scheduleActionDuplicateBadgeUpdate();
    scheduleAutoSessionSnapshot();
    scheduleAutoCollapseInactiveGroupsCheck();
  });

  chrome.tabs.onDetached.addListener(() => {
    scheduleOverviewInvalidation('updated');
    scheduleActionDuplicateBadgeUpdate();
    scheduleAutoSessionSnapshot();
    scheduleAutoCollapseInactiveGroupsCheck();
  });

  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    const previousSession = activeWindowSessions.get(windowId);
    if (previousSession?.tabId != null && previousSession.tabId !== tabId) {
      setStoredTabActive(previousSession.tabId, false);
    }

    startActiveSession(windowId, tabId);
    scheduleOverviewInvalidation('activated');
    scheduleAutoCollapseInactiveGroupsCheck();
    void chrome.tabs.get(tabId).then((tab) => trackTabHistory(tab, 'activated')).catch(() => {});
  });

  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    const activeSession = activeWindowSessions.get(removeInfo.windowId);
    if (activeSession?.tabId === tabId) {
      stopActiveSession(removeInfo.windowId);
    }

    archiveClosedTabHistory(tabId);
    pendingRedirectEvents.delete(tabId);
    runtimeTabs.delete(tabId);
    deleteAutoGroupExemption(tabId);
    scheduleOverviewInvalidation('removed');
    scheduleActionDuplicateBadgeUpdate();
    scheduleAutoSessionSnapshot();
    scheduleAutoCollapseInactiveGroupsCheck();
    void cleanupSingleTabAutoGroups().catch((error) => {
      console.warn('Failed to cleanup single-tab auto group after tab removal.', error);
    });
  });

  chrome.tabGroups.onUpdated.addListener((group) => {
    if (group.collapsed === false) {
      markGroupInteracted(group.id);
    }
    const previousTitle = observedGroupTitles.get(group.id);
    const nextTitle = group.title ?? '';
    const titleChanged = previousTitle !== undefined && previousTitle !== nextTitle;
    observedGroupTitles.set(group.id, nextTitle);
    if (titleChanged) {
      void syncAutoGroupConfigTitleFromGroup(group).catch((error) => {
        console.warn('Failed to sync auto group config title from group rename.', error);
      });
      void learnAutoGroupRuleFromGroup(group.id).catch((error) => {
        console.warn('Failed to learn auto group rule from group rename.', error);
      });
    }
    scheduleOverviewInvalidation('updated');
    scheduleAutoSessionSnapshot();
  });

  chrome.tabGroups.onRemoved.addListener((group) => {
    observedGroupTitles.delete(group.id);
    deleteGroupMetadata(group.id);
    groupInteractionRecords.delete(group.id);
    scheduleOverviewInvalidation('updated');
    scheduleAutoSessionSnapshot();
    scheduleAutoCollapseInactiveGroupsCheck();
  });

  chrome.windows.onFocusChanged.addListener((windowId) => {
    void (async () => {
      const now = Date.now();

      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        for (const activeWindowId of activeWindowSessions.keys()) {
          stopActiveSession(activeWindowId, now);
        }
        scheduleOverviewInvalidation('focused');
        scheduleAutoCollapseInactiveGroupsCheck();
        return;
      }

      const [activeTab] = await chrome.tabs.query({ windowId, active: true });
      if (activeTab?.id != null) {
        startActiveSession(windowId, activeTab.id, now);
      }
      scheduleOverviewInvalidation('focused');
      scheduleAutoCollapseInactiveGroupsCheck();
    })().catch((error) => {
      console.warn('Failed to process focused window change.', error);
    });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    const settingsChanged =
      (areaName === 'sync' && changes[SETTINGS_KEY]) ||
      (areaName === 'local' && changes['tab-manager/settings-fallback']);

    if (settingsChanged) {
      const oldSettings = changes[SETTINGS_KEY]?.oldValue as Partial<ManagerSettings> | undefined;
      const newSettings = changes[SETTINGS_KEY]?.newValue as Partial<ManagerSettings> | undefined;
      const localeChanged = oldSettings?.locale !== newSettings?.locale;

      void syncAutoCollapseInactiveGroupsAlarm().catch((error) => {
        console.warn('Failed to reschedule inactive group auto-collapse.', error);
      });
      scheduleAutoCollapseInactiveGroupsCheck();
      void refreshRedirectTrackingEnabled().catch((error) => {
        console.warn('Failed to refresh redirect tracking permission state.', error);
      });
      void (async () => {
        if (localeChanged) {
          await syncDefaultAutoGroupTitles();
        }
        await maybeAutoGroupTabs();
      })().catch((error) => {
        console.warn('Failed to auto group tabs after settings change.', error);
      });
    }

    if (areaName === 'local' && changes[GROUP_METADATA_STORAGE_KEY]) {
      // Skip hydration when the change was triggered by our own persist cycle
      // to avoid clearing and reloading the same data unnecessarily.
      if (groupMetadataPersistInFlight) return;
      try {
        hydrateGroupMetadataRecords(
          changes[GROUP_METADATA_STORAGE_KEY].newValue as
            | Partial<PersistedGroupMetadataState>
            | Record<string, GroupMetadataRecord>
            | null
            | undefined
        );
        void maybeAutoGroupTabs().catch((error) => {
          console.warn('Failed to auto group tabs after rule change.', error);
        });
      } catch (error) {
        console.warn('Failed to hydrate group metadata after storage change.', error);
      }
    }
  });

  chrome.alarms?.onAlarm?.addListener((alarm) => {
    if (alarm.name !== AUTO_COLLAPSE_INACTIVE_GROUPS_ALARM) return;
    scheduleAutoCollapseInactiveGroupsCheck();
  });

  chrome.permissions?.onAdded?.addListener((permissions) => {
    if (!hasRedirectTrackingPermissionDelta(permissions)) return;
    void refreshRedirectTrackingEnabled().catch((error) => {
      console.warn('Failed to refresh redirect tracking after permission grant.', error);
    });
  });

  chrome.permissions?.onRemoved?.addListener((permissions) => {
    if (!hasRedirectTrackingPermissionDelta(permissions)) return;
    void refreshRedirectTrackingEnabled().catch((error) => {
      console.warn('Failed to refresh redirect tracking after permission removal.', error);
    });
  });

  chrome.bookmarks?.onCreated?.addListener(() => {
    scheduleBookmarksInvalidation();
  });

  chrome.bookmarks?.onRemoved?.addListener(() => {
    scheduleBookmarksInvalidation();
  });

  chrome.bookmarks?.onChanged?.addListener(() => {
    scheduleBookmarksInvalidation();
  });

  chrome.bookmarks?.onMoved?.addListener(() => {
    scheduleBookmarksInvalidation();
  });

  chrome.bookmarks?.onChildrenReordered?.addListener(() => {
    scheduleBookmarksInvalidation();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const request = message as ExtensionRequest;
    let responded = false;
    const timeout = setTimeout(() => {
      if (responded) return;
      responded = true;
      sendResponse({
        ok: false,
        error: `Timed out handling request: ${request.type}`
      } satisfies ExtensionResult<null>);
    }, getRuntimeMessageTimeoutMs(request));

    const respond = (response: ExtensionResult<unknown>) => {
      if (responded) return;
      responded = true;
      clearTimeout(timeout);
      sendResponse(response);
    };

    void (async () => {
      try {
        let response: ExtensionResult<
          | OverviewSnapshot
          | RedirectTrackingPermissionState
          | TabDetailSnapshot
          | BookmarkTreeSnapshot
          | BookmarkNodeSnapshot
          | SessionsSnapshot
          | SessionRecord
          | TabMutationResult
          | RuntimeTabListItem[]
          | BrowserCommandShortcutState
          | KeyboardShortcutsConfig
          | ShortcutConfig
          | boolean
          | null
        >;

        switch (request.type) {
          case 'tab-manager/get-overview':
            response = { ok: true, data: await buildOverview() };
            break;
          case 'tab-manager/get-tab-detail':
            response = { ok: true, data: await getTabDetail(request.tabId) };
            break;
          case 'tab-manager/get-bookmarks':
            response = { ok: true, data: await getBookmarks() };
            break;
          case 'tab-manager/get-sessions':
            response = { ok: true, data: await getSessions() };
            break;
          case 'tab-manager/save-current-window-session':
            response = {
              ok: true,
              data: await captureSession('current-window', request.title)
            };
            break;
          case 'tab-manager/save-all-windows-session':
            response = {
              ok: true,
              data: await captureSession('all-windows', request.title)
            };
            break;
          case 'tab-manager/restore-session':
            response = { ok: true, data: await restoreSession(request.sessionId, request.mode) };
            break;
          case 'tab-manager/update-session':
            response = {
              ok: true,
              data: await updateSession(request.sessionId, request.patch)
            };
            break;
          case 'tab-manager/delete-session':
            response = { ok: true, data: await deleteSession(request.sessionId) };
            break;
          case 'tab-manager/create-bookmark-folder':
            response = {
              ok: true,
              data: await createBookmarkFolder(request.parentId, request.title, request.index)
            };
            break;
          case 'tab-manager/create-bookmark-from-active-tab':
            response = {
              ok: true,
              data: await createBookmarkFromActiveTab(request.parentId, request.index)
            };
            break;
          case 'tab-manager/update-bookmark':
            response = {
              ok: true,
              data: await updateBookmark(request.bookmarkId, request.patch)
            };
            break;
          case 'tab-manager/delete-bookmark':
            response = { ok: true, data: await deleteBookmark(request.bookmarkId) };
            break;
          case 'tab-manager/move-bookmark':
            response = {
              ok: true,
              data: await moveBookmark(request.bookmarkId, request.parentId, request.index)
            };
            break;
          case 'tab-manager/get-redirect-tracking-permission':
            response = { ok: true, data: await getRedirectTrackingPermissionState() };
            break;
          case 'tab-manager/request-redirect-tracking-permission':
            response = { ok: true, data: await chrome.permissions.request(redirectTrackingPermissions) };
            break;
          case 'tab-manager/remove-redirect-tracking-permission':
            response = { ok: true, data: await chrome.permissions.remove(redirectTrackingPermissions) };
            break;
          case 'tab-manager/refresh-redirect-tracking':
            await refreshRedirectTrackingEnabled();
            response = { ok: true, data: await getRedirectTrackingPermissionState() };
            break;
          case 'tab-manager/get-shortcut-config':
            response = { ok: true, data: await getShortcutConfig() };
            break;
          case 'tab-manager/get-browser-command-shortcut':
            response = { ok: true, data: await getBrowserCommandShortcutState() };
            break;
          case 'tab-manager/update-shortcut-config':
            response = { ok: true, data: await updateShortcutConfig(request.patch) };
            break;
          case 'tab-manager/update-single-shortcut':
            response = {
              ok: true,
              data: await updateSingleShortcut(request.shortcutId, request.patch)
            };
            break;
          case 'tab-manager/execute-action': {
            const { executeAction } = await import('../lib/keyboard-shortcuts/actions');
            await executeAction(request.action);
            response = { ok: true, data: null };
            break;
          }
          case 'tab-manager/get-tabs': {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            response = {
              ok: true,
              data: tabs
                .filter((t): t is chrome.tabs.Tab & { id: number } => t.id != null)
                .map((t) => ({
                  id: t.id,
                  title: t.title ?? '',
                  url: t.url ?? '',
                  favIconUrl: t.favIconUrl ?? '',
                  active: t.active,
                  pinned: t.pinned,
                  index: t.index,
                }))
            };
            break;
          }
          case 'tab-manager/focus-tab': {
            await chrome.tabs.update(request.tabId, { active: true });
            const tab = await chrome.tabs.get(request.tabId);
            if (tab.windowId != null) {
              await chrome.windows.update(tab.windowId, { focused: true });
            }
            response = { ok: true, data: null };
            break;
          }
          case 'tab-manager/open-dashboard':
            await openDashboardTab();
            response = { ok: true, data: null };
            break;
          case 'tab-manager/close-tabs':
            response = { ok: true, data: await closeTabs(request.tabIds) };
            break;
          case 'tab-manager/pin-tabs':
            response = {
              ok: true,
              data: await applyTabUpdates(request.tabIds, (tabId) =>
                chrome.tabs.update(tabId, { pinned: request.pinned })
              )
            };
            break;
          case 'tab-manager/mute-tabs':
            response = {
              ok: true,
              data: await applyTabUpdates(request.tabIds, (tabId) =>
                chrome.tabs.update(tabId, { muted: request.muted })
              )
            };
            break;
          case 'tab-manager/discard-tabs':
            response = { ok: true, data: await discardTabs(request.tabIds) };
            break;
          case 'tab-manager/group-tabs':
            response = {
              ok: true,
              data: await createGroups(request.tabIds, request.options ?? {})
            };
            break;
          case 'tab-manager/ungroup-tabs':
            response = { ok: true, data: await ungroupTabs(request.tabIds) };
            break;
          case 'tab-manager/move-tab-before':
            response = {
              ok: true,
              data: await moveTabBefore(request.tabId, request.beforeTabId)
            };
            break;
          case 'tab-manager/move-tab-after':
            response = {
              ok: true,
              data: await moveTabAfter(request.tabId, request.afterTabId)
            };
            break;
          case 'tab-manager/move-tabs-before':
            response = {
              ok: true,
              data: await moveTabsBefore(request.tabIds, request.beforeTabId)
            };
            break;
          case 'tab-manager/move-tabs-after':
            response = {
              ok: true,
              data: await moveTabsAfter(request.tabIds, request.afterTabId)
            };
            break;
          case 'tab-manager/move-group':
            response = {
              ok: true,
              data: await moveGroup(request.groupId, request.target, request.position)
            };
            break;
          case 'tab-manager/update-group':
            response = {
              ok: true,
              data: await updateGroup(request.groupId, request.patch)
            };
            break;
          case 'tab-manager/smart-group-tabs':
            response = {
              ok: true,
              data: await smartGroupTabs(request.tabIds, request.strategy)
            };
            break;
          default:
            response = { ok: false, error: 'Unknown message.' };
        }

        respond(response);
      } catch (error) {
        respond({
          ok: false,
          error: getErrorMessage(error)
        } satisfies ExtensionResult<null>);
      }
    })();

    return true;
  });
}
