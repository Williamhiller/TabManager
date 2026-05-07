import type {
  AutoGroupConfig,
  AutoGroupRule,
  AutoGroupRuleField,
  ExtensionRequest,
  ExtensionResult,
  GroupTabsOptions,
  OverviewChangeReason,
  OverviewInvalidatedMessage,
  OverviewSnapshot,
  RedirectTrackingPermissionState,
  RuntimeTabTelemetry,
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
  matchesDefaultAutoGroupPresetById,
  matchDefaultAutoGroupPreset
} from './auto-group-defaults';
import { getErrorMessage } from './format';
import { getSettings, SETTINGS_KEY } from './settings';

interface RuntimeTabState {
  observedAt: number;
  openedAt: number | null;
  lastActivatedAt: number | null;
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
  autoGroupEnabled: boolean;
  autoGroupPresetIds: string[];
  autoGroupRules: AutoGroupRule[];
}

interface PersistedGroupMetadataState {
  groups: Record<string, GroupMetadataRecord>;
}

interface PendingRedirectEvent {
  fromUrl: string;
  toUrl: string;
  at: number;
  statusCode: number;
}

const runtimeTabs = new Map<number, RuntimeTabState>();
const activeWindowSessions = new Map<number, ActiveWindowSession>();
const tabHistoryRecords = new Map<number, TabHistoryRecord>();
const recentClosedTabHistory: ClosedTabHistoryRecord[] = [];
const groupMetadataRecords = new Map<number, GroupMetadataRecord>();
const pendingRedirectEvents = new Map<number, PendingRedirectEvent[]>();
const groupColors: TabGroupColor[] = [
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange'
];
const TAB_HISTORY_STORAGE_KEY = 'tab-manager/tab-history';
const GROUP_METADATA_STORAGE_KEY = 'tab-manager/group-metadata';
const MAX_TAB_HISTORY_EVENTS = 120;
const MAX_RECENT_CLOSED_TABS = 10;
const OVERVIEW_INVALIDATION_DEBOUNCE_MS = 80;

let tabHistoryLoadPromise: Promise<void> | null = null;
let groupMetadataLoadPromise: Promise<void> | null = null;
let persistTabHistoryTimer: ReturnType<typeof setTimeout> | null = null;
let persistGroupMetadataTimer: ReturnType<typeof setTimeout> | null = null;
let overviewInvalidationTimer: ReturnType<typeof setTimeout> | null = null;
let pendingOverviewInvalidationReason: OverviewChangeReason = 'updated';
let redirectTrackingEnabled = false;

function ensureRuntimeTab(tabId: number, observedAt = Date.now()): RuntimeTabState {
  const existing = runtimeTabs.get(tabId);
  if (existing) return existing;

  const created: RuntimeTabState = {
    observedAt,
    openedAt: null,
    lastActivatedAt: null,
    totalActiveMs: 0
  };

  runtimeTabs.set(tabId, created);
  return created;
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

  const tabs = await chrome.tabs.query({});
  const now = Date.now();
  const liveIds = new Set<number>();

  for (const tab of tabs) {
    if (tab.id == null) continue;
    liveIds.add(tab.id);
    ensureRuntimeTab(tab.id, now);
    await trackTabHistory(tab, 'seed');
  }

  for (const tabId of [...tabHistoryRecords.keys()]) {
    if (liveIds.has(tabId)) continue;
    archiveClosedTabHistory(tabId, now);
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

async function ensureTabHistoryLoaded(): Promise<void> {
  if (tabHistoryLoadPromise) return tabHistoryLoadPromise;

  tabHistoryLoadPromise = (async () => {
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
      tabHistoryRecords.set(numericTabId, record);
    }

    recentClosedTabHistory.splice(
      0,
      recentClosedTabHistory.length,
      ...recentClosed.slice(0, MAX_RECENT_CLOSED_TABS).filter((record) => record?.snapshot)
    );
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
      autoGroupEnabled: record.autoGroupEnabled ?? true,
      autoGroupPresetIds: Array.isArray(record.autoGroupPresetIds) ? record.autoGroupPresetIds : [],
      autoGroupRules: Array.isArray(record.autoGroupRules) ? record.autoGroupRules : []
    });
  }
}

async function ensureGroupMetadataLoaded(): Promise<void> {
  if (groupMetadataLoadPromise) return groupMetadataLoadPromise;

  groupMetadataLoadPromise = (async () => {
    const stored = await chrome.storage.local.get(GROUP_METADATA_STORAGE_KEY);
    hydrateGroupMetadataRecords(
      stored[GROUP_METADATA_STORAGE_KEY] as
        | Partial<PersistedGroupMetadataState>
        | Record<string, GroupMetadataRecord>
        | null
        | undefined
    );
  })();

  return groupMetadataLoadPromise;
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

function scheduleGroupMetadataPersist(): void {
  if (persistGroupMetadataTimer != null) return;

  persistGroupMetadataTimer = setTimeout(() => {
    persistGroupMetadataTimer = null;
    void chrome.storage.local
      .set({ [GROUP_METADATA_STORAGE_KEY]: serializeGroupMetadataRecords() })
      .catch((error) => {
        console.warn('Failed to persist group metadata.', error);
      });
  }, 120);
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

function getGroupMetadata(groupId: number): GroupMetadataRecord {
  return groupMetadataRecords.get(groupId) ?? {
    autoGroupEnabled: true,
    autoGroupPresetIds: [],
    autoGroupRules: []
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

function normalizeAutoGroupRuleValue(field: AutoGroupRuleField, value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';

  if (field === 'hostname') {
    return trimmed.replace(/^www\./, '');
  }

  return trimmed;
}

function resolveAutoGroupTargetValue(tab: chrome.tabs.Tab, field: AutoGroupRuleField): string {
  const rawUrl = `${tab.url ?? tab.pendingUrl ?? ''}`.trim();
  if (field === 'title') return `${tab.title ?? ''}`.trim().toLowerCase();
  if (!rawUrl) return '';

  if (field === 'url') return rawUrl.toLowerCase();

  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function matchesAutoGroupRule(
  tab: chrome.tabs.Tab,
  rule: AutoGroupRule
): boolean {
  const expected = normalizeAutoGroupRuleValue(rule.field, rule.value);
  if (!expected) return false;

  const actual = resolveAutoGroupTargetValue(tab, rule.field);
  if (!actual) return false;

  if (rule.operator === 'equals') {
    return actual === expected;
  }

  return actual.includes(expected);
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

function normalizeWebsitePattern(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function matchesWebsitePattern(tab: chrome.tabs.Tab, value: string): boolean {
  const expected = normalizeWebsitePattern(value);
  if (!expected) return false;

  const hostname = resolveAutoGroupTargetValue(tab, 'hostname');
  if (!hostname) return false;

  return hostname === expected || hostname.endsWith(`.${expected}`);
}

function matchesAutoGroupConfig(tab: chrome.tabs.Tab, config: AutoGroupConfig): boolean {
  if (!config.enabled) return false;

  return (
    Boolean(config.presetId && matchesDefaultAutoGroupPresetById(tab, config.presetId)) ||
    config.websites.some((website) => matchesWebsitePattern(tab, website)) ||
    matchesAnyAutoGroupRule(tab, config.rules)
  );
}

function resolveAutoGroupConfigTitle(
  config: AutoGroupConfig,
  locale: 'system' | 'en' | 'zh-CN'
): string {
  if (!config.presetId) return config.title;

  const preset = defaultAutoGroupPresets.find((entry) => entry.id === config.presetId);
  if (!preset) return config.title;

  const defaultTitles = Object.values(preset.titles);
  return !config.title || defaultTitles.includes(config.title)
    ? getDefaultAutoGroupPresetTitle(preset, locale)
    : config.title;
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

async function maybeAutoGroupTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id == null) return;
  await maybeAutoGroupTabs([tab.id]);
}

async function maybeAutoGroupTabs(tabIds?: number[]): Promise<void> {
  const settings = await getSettings();
  if (!settings.autoGroupEnabled) return;

  await ensureGroupMetadataLoaded();

  const [candidateTabs, initialGroups] = await Promise.all([
    tabIds ? loadTabsById(uniqueTabIds(tabIds)) : chrome.tabs.query({}),
    chrome.tabGroups.query({})
  ]);
  const groups = [...initialGroups];
  const effectiveConfigs = settings.autoGroupConfigs.filter(
    (config) =>
      config.enabled &&
      (Boolean(config.presetId) ||
        config.websites.some((website) => Boolean(normalizeWebsitePattern(website))) ||
        config.rules.some((rule) =>
          Boolean(normalizeAutoGroupRuleValue(rule.field, rule.value))
        ))
  );

  const effectiveGroups = groups.filter((group) => {
    const metadata = getGroupMetadata(group.id);
    return (
      metadata.autoGroupEnabled &&
      (metadata.autoGroupPresetIds.length > 0 ||
        metadata.autoGroupRules.some((rule) =>
          Boolean(normalizeAutoGroupRuleValue(rule.field, rule.value))
        ))
    );
  });

  if (effectiveGroups.length === 0 && effectiveConfigs.length === 0) return;

  let groupedAny = false;

  for (const tab of candidateTabs) {
    if (tab.id == null) continue;
    if ((tab.groupId ?? -1) >= 0) continue;

    const sameWindowGroups = effectiveGroups.filter((group) => group.windowId === tab.windowId);
    const matchingGroup =
      sameWindowGroups.find((group) =>
        matchesGroupAutoGrouping(tab, getGroupMetadata(group.id))
      ) ??
      effectiveGroups.find((group) =>
        matchesGroupAutoGrouping(tab, getGroupMetadata(group.id))
      );

    if (matchingGroup) {
      const result = await createGroups([tab.id], { groupId: matchingGroup.id });
      if (result.affectedCount > 0) {
        groupedAny = true;
      }
      continue;
    }

    const matchingConfig = effectiveConfigs.find((config) => matchesAutoGroupConfig(tab, config));
    if (!matchingConfig) continue;
    const matchingConfigTitle = resolveAutoGroupConfigTitle(matchingConfig, settings.locale);

    const existingConfiguredGroup =
      groups.find((group) => group.windowId === tab.windowId && group.title === matchingConfigTitle) ??
      groups.find((group) => group.title === matchingConfigTitle);

    const result = existingConfiguredGroup
      ? await createGroups([tab.id], { groupId: existingConfiguredGroup.id })
      : await createGroups([tab.id], { title: matchingConfigTitle, color: matchingConfig.color });

    if (result.affectedCount > 0) {
      groupedAny = true;

      if (!existingConfiguredGroup) {
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
    title: patch.title ?? normalizeHostname(url) ?? 'Navigation',
    url,
    hostname: normalizeHostname(url),
    ...patch
  };
}

function pushHistoryEvent(record: TabHistoryRecord, event: TabHistoryEvent): void {
  const lastEvent = record.history.at(-1);
  if (
    lastEvent &&
    lastEvent.kind === event.kind &&
    lastEvent.url === event.url &&
    lastEvent.fromUrl === event.fromUrl &&
    Math.abs(lastEvent.at - event.at) < 1000
  ) {
    return;
  }

  record.history.push(event);
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
  kind: 'redirected' | 'history-state',
  url: string,
  patch: Partial<TabHistoryEvent> = {}
): Promise<void> {
  if (tabId < 0 || !url) return;

  const record = await ensureTabHistoryRecord(tabId);
  if (!record) return;

  pushHistoryEvent(record, createUrlHistoryEvent(tabId, kind, url, patch));
  record.updatedAt = Date.now();
  scheduleTabHistoryPersist();
  scheduleOverviewInvalidation('updated');
}

function queueRedirectEvent(details: chrome.webRequest.OnBeforeRedirectDetails): void {
  if (!redirectTrackingEnabled) return;
  if (details.tabId < 0 || details.frameId !== 0 || details.type !== 'main_frame') return;
  if (!details.url || !details.redirectUrl || details.url === details.redirectUrl) return;

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

const redirectTrackingPermissions: chrome.permissions.Permissions = {
  permissions: ['webNavigation', 'webRequest'],
  origins: ['http://*/*', 'https://*/*']
};

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
  if (!redirectTrackingEnabled) {
    pendingRedirectEvents.clear();
  }

  return redirectTrackingEnabled;
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

function normalizeHostname(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function buildFaviconFallbackUrl(url: string): string | null {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return null;

  try {
    const parsedUrl = new URL(trimmedUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }

    const encodedPageUrl = encodeURIComponent(parsedUrl.href);
    return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodedPageUrl}&size=32`);
  } catch {
    return null;
  }
}

function resolveFavIconUrl(
  favIconUrl: string | null | undefined,
  url: string,
  preservedFallback: string | null = null
): string | null {
  const normalizedFavIconUrl = favIconUrl?.trim();
  if (normalizedFavIconUrl) return normalizedFavIconUrl;

  return buildFaviconFallbackUrl(url) ?? preservedFallback;
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
    history: record?.history ?? closedRecord?.history ?? []
  };
}

async function openDashboardTab(): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL('/dashboard.html') });
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
  groupId: number
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

  await chrome.tabs.group({
    groupId,
    tabIds: nonEmptyTabIds
  });

  return collectMutationOutcome(movedTabIds);
}

async function createGroups(
  tabIds: number[],
  options: GroupTabsOptions
): Promise<TabMutationResult> {
  if (options.groupId != null) {
    return assignTabsToGroup(tabIds, options.groupId);
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

    const groupId = await chrome.tabs.group({
      tabIds: nonEmptyTabIds,
      createProperties: { windowId }
    });

    if (typeof groupId === 'number') {
      await chrome.tabGroups.update(groupId, {
        title: options.title,
        color: options.color
      });
      affected.push(...windowTabIds);
    }
  }

  return collectMutationOutcome(uniqueTabIds(affected));
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
  }

  if (
    patch.autoGroupEnabled !== undefined ||
    patch.autoGroupPresetIds !== undefined ||
    patch.autoGroupRules !== undefined
  ) {
    setGroupMetadata(groupId, {
      autoGroupEnabled: patch.autoGroupEnabled,
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

  return groupColors[hash % groupColors.length] ?? 'blue';
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
            return settings.locale === 'en' ? 'Reference' : '参考';
          })();
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
  void seedRuntimeState();
  void maybeAutoGroupTabs().catch((error) => {
    console.warn('Failed to auto group tabs during startup.', error);
  });
  void refreshRedirectTrackingEnabled().catch((error) => {
    console.warn('Failed to initialize redirect tracking permission state.', error);
  });

  if (chrome.webRequest?.onBeforeRedirect) {
    chrome.webRequest.onBeforeRedirect.addListener(queueRedirectEvent, {
      urls: ['http://*/*', 'https://*/*'],
      types: ['main_frame']
    });
  }

  if (chrome.webNavigation?.onCommitted) {
    chrome.webNavigation.onCommitted.addListener((details) => {
      if (!redirectTrackingEnabled) return;
      if (details.tabId < 0 || details.frameId !== 0) return;

      const hasServerRedirect = details.transitionQualifiers.includes('server_redirect');
      void (async () => {
        const pending = pendingRedirectEvents.get(details.tabId);
        if (pending && pending.length > 0) {
          await flushRedirectEvents(details.tabId);
          return;
        }

        if (hasServerRedirect) {
          await recordUrlHistoryEvent(details.tabId, 'redirected', details.url, {
            at: Math.round(details.timeStamp),
            title: 'Server redirect'
          });
        }
      })().catch((error) => {
        console.warn('Failed to record redirect navigation.', error);
      });
    });
  }

  if (chrome.webNavigation?.onHistoryStateUpdated) {
    chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
      if (!redirectTrackingEnabled) return;
      if (details.tabId < 0 || details.frameId !== 0) return;

      void recordUrlHistoryEvent(details.tabId, 'history-state', details.url, {
        at: Math.round(details.timeStamp),
        title: 'History state update'
      }).catch((error) => {
        console.warn('Failed to record history state navigation.', error);
      });
    });
  }

  chrome.tabs.onCreated.addListener((tab) => {
    if (tab.id == null) return;

    const state = ensureRuntimeTab(tab.id);
    state.openedAt = Date.now();

    if (tab.active) {
      startActiveSession(tab.windowId, tab.id);
    }

    scheduleOverviewInvalidation('created');
    void trackTabHistory(tab, 'created');
    void maybeAutoGroupTab(tab).catch((error) => {
      console.warn('Failed to auto group created tab.', error);
    });
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (tab.id == null) return;

    const relevantUpdate =
      changeInfo.url !== undefined ||
      changeInfo.title !== undefined ||
      changeInfo.favIconUrl !== undefined ||
      changeInfo.status !== undefined ||
      changeInfo.pinned !== undefined ||
      changeInfo.mutedInfo !== undefined ||
      changeInfo.discarded !== undefined ||
      'groupId' in changeInfo;

    if (!relevantUpdate) return;
    scheduleOverviewInvalidation('updated');
    void trackTabHistory(tab, 'updated');
    if (changeInfo.url !== undefined || changeInfo.status === 'complete' || 'groupId' in changeInfo) {
      void maybeAutoGroupTab(tab).catch((error) => {
        console.warn('Failed to auto group updated tab.', error);
      });
    }
  });

  chrome.tabs.onMoved.addListener(() => {
    scheduleOverviewInvalidation('updated');
  });

  chrome.tabs.onAttached.addListener(() => {
    scheduleOverviewInvalidation('updated');
  });

  chrome.tabs.onDetached.addListener(() => {
    scheduleOverviewInvalidation('updated');
  });

  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    const previousSession = activeWindowSessions.get(windowId);
    if (previousSession?.tabId != null && previousSession.tabId !== tabId) {
      setStoredTabActive(previousSession.tabId, false);
    }

    startActiveSession(windowId, tabId);
    scheduleOverviewInvalidation('activated');
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
    scheduleOverviewInvalidation('removed');
  });

  chrome.tabGroups.onUpdated.addListener(() => {
    scheduleOverviewInvalidation('updated');
  });

  chrome.tabGroups.onRemoved.addListener((group) => {
    deleteGroupMetadata(group.id);
    scheduleOverviewInvalidation('updated');
  });

  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    const now = Date.now();

    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      for (const activeWindowId of activeWindowSessions.keys()) {
        stopActiveSession(activeWindowId, now);
      }
      scheduleOverviewInvalidation('focused');
      return;
    }

    const [activeTab] = await chrome.tabs.query({ windowId, active: true });
    if (activeTab?.id != null) {
      startActiveSession(windowId, activeTab.id, now);
    }
    scheduleOverviewInvalidation('focused');
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes[SETTINGS_KEY]) {
      void refreshRedirectTrackingEnabled().catch((error) => {
        console.warn('Failed to refresh redirect tracking permission state.', error);
      });
      void maybeAutoGroupTabs().catch((error) => {
        console.warn('Failed to auto group tabs after settings change.', error);
      });
    }

    if (areaName === 'local' && changes[GROUP_METADATA_STORAGE_KEY]) {
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

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const request = message as ExtensionRequest;

    void (async () => {
      try {
        let response: ExtensionResult<
          OverviewSnapshot | RedirectTrackingPermissionState | TabDetailSnapshot | TabMutationResult | null
        >;

        switch (request.type) {
          case 'tab-manager/get-overview':
            response = { ok: true, data: await buildOverview() };
            break;
          case 'tab-manager/get-tab-detail':
            response = { ok: true, data: await getTabDetail(request.tabId) };
            break;
          case 'tab-manager/get-redirect-tracking-permission':
            response = { ok: true, data: await getRedirectTrackingPermissionState() };
            break;
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

        sendResponse(response);
      } catch (error) {
        sendResponse({
          ok: false,
          error: getErrorMessage(error)
        } satisfies ExtensionResult<null>);
      }
    })();

    return true;
  });
}
