import {
  PointerSensor,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DragEndEvent,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { FloatingArrow, FloatingPortal, arrow, autoUpdate, flip, offset, safePolygon, shift, useClick, useDismiss, useFloating, useHover, useInteractions, useRole } from '@floating-ui/react';
import {
  RiAddCircleLine,
  RiArrowDownSLine,
  RiArrowRightUpLine,
  RiBrushLine,
  RiCloseLine,
  RiFilterOffLine,
  RiFilter3Line,
  RiFileCopyLine,
  RiFolderLine,
  RiGlobalLine,
  RiDashboardLine,
  RiLayoutRightLine,
  RiLayoutGridLine,
  RiPriceTag3Line,
  RiPushpin2Line,
  RiRefreshLine,
  RiSearchLine,
  RiSettings3Line,
  RiShining2Line,
  RiSoundModuleLine,
  RiTimeLine,
  RiNodeTree,
  RiVolumeMuteLine,
  type RemixiconComponentType
} from '@remixicon/react';
import { AnimatePresence, motion } from 'motion/react';
import {
  type PointerEvent as ReactPointerEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { Tooltip } from './Tooltip';
import { BookmarksManagerView } from './BookmarksManagerView';
import { GroupTreeBlock } from './GroupTreeBlock';
import { HistoryTabsSection } from './HistoryTabsSection';
import { IconButton } from './IconButton';
import { SidepanelViewTabs } from './SidepanelViewTabs';
import { SessionsManagerView } from './SessionsManagerView';
import { SegmentedSwitch } from './SegmentedSwitch';
import { SortableTabRow } from './SortableTabRow';
import { TabDetailModal } from './TabDetailModal';
import { TabsWorkspaceView } from './TabsWorkspaceView';
import {
  GroupedTabsSection,
  UngroupedTabsSection,
  renderTabsEntry,
  type GroupedEntry,
  type UngroupedEntry
} from './TabsEntrySections';
import type {
  HistoryTabSnapshot,
  BookmarkNodeSnapshot,
  BookmarkTreeSnapshot,
  ManagerSettings,
  OverviewSnapshot,
  SessionsSnapshot,
  SmartGroupStrategy,
  TabDetailSnapshot,
  TabGroupColor,
  TabGroupSnapshot,
  TabSnapshot
} from '../lib/contracts';
import { createAutoGroupConfig, findAutoGroupConfigForGroup } from '../lib/auto-group-config';
import { getErrorMessage } from '../lib/format';
import { getMessages, resolveLocale } from '../lib/i18n';
import {
  closeTabs,
  discardTabs,
  focusTab,
  getBookmarks,
  getSessions,
  getTabDetail,
  getOverview,
  groupTabs,
  moveTabAfter,
  moveTabBefore,
  moveGroup,
  muteTabs,
  openDashboardPage,
  openPreferredLaunchSurface,
  openSidePanel,
  pinTabs,
  smartGroupTabs,
  subscribeToBookmarksUpdates,
  subscribeToOverviewUpdates,
  subscribeToSessionsUpdates,
  ungroupTabs,
  updateGroup
} from '../lib/runtime-client';
import { SETTINGS_KEY, defaultSettings, getSettings, updateSettings } from '../lib/settings';
import { allGroupColors, applyTheme } from '../lib/theme';

type SurfaceMode = 'popup' | 'sidepanel' | 'dashboard';
type SmartView = 'all' | 'ungrouped' | 'grouped' | 'sleeping' | 'audible' | 'pinned' | 'stale';
type TabSort = 'manual' | 'recent' | 'opened-time' | 'title' | 'active-time';
type DropPosition = 'before' | 'after' | 'inside';
type ParsedDropTarget = {
  kind: 'tab' | 'group' | 'group-sort' | 'group-tail' | 'group-after' | 'new';
  id?: number;
};
type GroupFilter = 'all' | 'ungrouped' | `${number}`;
type SidepanelView = 'tabs' | 'sessions' | 'bookmarks';
type DashboardTabsSubView = 'current' | 'history';
type DuplicateTabGroup = {
  duplicateCount: number;
  hostname: string;
  keepTab: TabSnapshot;
  tabs: TabSnapshot[];
  title: string;
  url: string;
};
type ListEntry =
  | { type: 'ungrouped'; tabs: TabSnapshot[] }
  | { type: 'group'; group: TabGroupSnapshot; tabs: TabSnapshot[] };

const primaryViews: SmartView[] = ['all', 'ungrouped', 'grouped'];

interface OverviewPageProps {
  embedded?: boolean;
  errorMessage?: string | null;
  mode: SurfaceMode;
  onRefreshOverview?: () => Promise<void>;
  overview?: OverviewSnapshot | null;
  settings?: ManagerSettings;
}

interface SmartViewDefinition {
  id: SmartView;
  icon: RemixiconComponentType;
  label: string;
}

const surfaceConfig: Record<SurfaceMode, { listLimit: number }> = {
  popup: { listLimit: 12 },
  sidepanel: { listLimit: 500 },
  dashboard: { listLimit: 1000 }
};

const STALE_MS = 1000 * 60 * 60 * 24 * 7;
const EMPTY_DRAG_OVERLAY_STATE = {
  activeId: null as string | null,
  height: 0,
  left: 0,
  maxTop: 0,
  minTop: 0,
  originTop: 0,
  top: 0,
  width: 0
};

const collisionDetectionStrategy: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isTabStale(tab: TabSnapshot): boolean {
  const anchor = tab.lastAccessed ?? tab.telemetry.lastActivatedAt ?? tab.telemetry.observedAt;
  return Date.now() - anchor >= STALE_MS;
}

function matchesSmartView(tab: TabSnapshot, smartView: SmartView): boolean {
  switch (smartView) {
    case 'ungrouped':
      return tab.group == null;
    case 'grouped':
      return tab.group != null;
    case 'sleeping':
      return tab.discarded || tab.frozen;
    case 'audible':
      return tab.audible;
    case 'pinned':
      return tab.pinned;
    case 'stale':
      return isTabStale(tab);
    default:
      return true;
  }
}

function matchesGroupFilter(tab: TabSnapshot, groupFilter: GroupFilter): boolean {
  switch (groupFilter) {
    case 'all':
      return true;
    case 'ungrouped':
      return tab.group == null;
    default:
      return tab.group?.id === Number(groupFilter);
  }
}

function sortTabs(tabs: TabSnapshot[], sortMode: TabSort): TabSnapshot[] {
  const next = [...tabs];

  next.sort((left, right) => {
    switch (sortMode) {
      case 'title':
        return left.title.localeCompare(right.title);
      case 'active-time':
        return right.telemetry.totalActiveMs - left.telemetry.totalActiveMs;
      case 'opened-time':
        return (
          (right.telemetry.openedAt ?? right.telemetry.observedAt) -
          (left.telemetry.openedAt ?? left.telemetry.observedAt)
        );
      case 'recent':
        return (
          (right.lastAccessed ?? right.telemetry.lastActivatedAt ?? right.telemetry.observedAt) -
          (left.lastAccessed ?? left.telemetry.lastActivatedAt ?? left.telemetry.observedAt)
        );
      default:
        if (left.windowId !== right.windowId) return left.windowId - right.windowId;
        return left.index - right.index;
    }
  });

  return next;
}

function getDomainLabel(tab: TabSnapshot): string {
  return tab.hostname.replace(/^www\./, '') || tab.title || 'group';
}

function colorFromSeed(seed: string | number): TabGroupColor {
  const text = String(seed);
  let hash = 0;

  for (const character of text) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return allGroupColors[hash % allGroupColors.length] ?? 'blue';
}

function normalizeDuplicateTabUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

function getTabRecency(tab: TabSnapshot): number {
  return tab.lastAccessed ?? tab.telemetry.lastActivatedAt ?? tab.telemetry.openedAt ?? tab.telemetry.observedAt;
}

function compareDuplicateKeepCandidate(left: TabSnapshot, right: TabSnapshot): number {
  if (left.active !== right.active) return left.active ? -1 : 1;
  if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
  return getTabRecency(right) - getTabRecency(left);
}

function parseDropId(id: string | number | undefined): ParsedDropTarget | null {
  if (typeof id !== 'string') return null;
  if (id === 'new-group-drop') return { kind: 'new' };
  if (id.startsWith('group-tail:')) return { kind: 'group-tail', id: Number(id.slice(11)) };
  if (id.startsWith('group-after:')) return { kind: 'group-after', id: Number(id.slice(12)) };
  if (id.startsWith('tab:')) return { kind: 'tab', id: Number(id.slice(4)) };
  if (id.startsWith('group-sort:')) return { kind: 'group-sort', id: Number(id.slice(11)) };
  if (id.startsWith('group:')) return { kind: 'group', id: Number(id.slice(6)) };
  return null;
}

function extractClientY(event: Event | null | undefined): number | null {
  if (!event) return null;
  if (event instanceof PointerEvent || event instanceof MouseEvent) return event.clientY;
  if (event instanceof TouchEvent) {
    return event.touches[0]?.clientY ?? event.changedTouches[0]?.clientY ?? null;
  }
  return null;
}

function resolveVerticalDropPosition(
  overRect: { top: number; height: number } | null | undefined,
  pointerY: number | null,
  fallbackRect: { top: number; height: number } | null | undefined
): Exclude<DropPosition, 'inside'> {
  if (!overRect) return 'before';

  const referenceY =
    pointerY ??
    (fallbackRect
      ? fallbackRect.top + fallbackRect.height / 2
      : overRect.top + overRect.height / 2);

  return referenceY < overRect.top + overRect.height / 2 ? 'before' : 'after';
}

function getLiveDropRect(dropId: string): DOMRect | null {
  if (typeof document === 'undefined') return null;

  const cssApi = globalThis.CSS;
  const escapedId =
    cssApi && typeof cssApi.escape === 'function'
      ? cssApi.escape(dropId)
      : dropId.replace(/["\\]/g, '\\$&');

  return document
    .querySelector<HTMLElement>(`[data-drop-id="${escapedId}"]`)
    ?.getBoundingClientRect() ?? null;
}

function buildEntries(
  overview: OverviewSnapshot | null,
  filteredTabs: TabSnapshot[],
  sortMode: TabSort
): ListEntry[] {
  if (!overview) return [];

  if (sortMode === 'manual') {
    const entries: ListEntry[] = [];

    for (let index = 0; index < filteredTabs.length;) {
      const tab = filteredTabs[index];

      if (!tab.group) {
        const tabs: TabSnapshot[] = [];

        while (index < filteredTabs.length && filteredTabs[index] && filteredTabs[index].group == null) {
          tabs.push(filteredTabs[index]!);
          index += 1;
        }

        if (tabs.length > 0) {
          entries.push({
            type: 'ungrouped',
            tabs
          });
        }

        continue;
      }

      const groupId = tab.group.id;
      const tabs: TabSnapshot[] = [];

      while (index < filteredTabs.length && filteredTabs[index]?.group?.id === groupId) {
        tabs.push(filteredTabs[index]!);
        index += 1;
      }

      if (tabs.length > 0) {
        entries.push({
          type: 'group',
          group: tab.group,
          tabs
        });
      }
    }

    return entries;
  }

  const filteredGroups = new Map<number, { group: TabGroupSnapshot; tabs: TabSnapshot[] }>();
  const filteredUngrouped: TabSnapshot[] = [];

  for (const tab of filteredTabs) {
    if (tab.group) {
      const existing = filteredGroups.get(tab.group.id);
      if (existing) {
        existing.tabs.push(tab);
      } else {
        filteredGroups.set(tab.group.id, {
          group: tab.group,
          tabs: [tab]
        });
      }
    } else {
      filteredUngrouped.push(tab);
    }
  }

  const entries: ListEntry[] = [];
  const seenGroups = new Set<number>();
  let ungroupedInserted = false;

  for (const tab of filteredTabs) {
    if (!tab.group) {
      if (ungroupedInserted || filteredUngrouped.length === 0) continue;
      ungroupedInserted = true;
      entries.push({
        type: 'ungrouped',
        tabs: filteredUngrouped
      });
      continue;
    }

    if (seenGroups.has(tab.group.id)) continue;

    const matchedGroup = filteredGroups.get(tab.group.id);
    if (!matchedGroup || matchedGroup.tabs.length === 0) continue;

    seenGroups.add(tab.group.id);
    entries.push({
      type: 'group',
      group: matchedGroup.group,
      tabs: matchedGroup.tabs
    });
  }

  return entries;
}

function getViewCount(tabs: TabSnapshot[], smartView: SmartView): number {
  return tabs.filter((tab) => matchesSmartView(tab, smartView)).length;
}

export function OverviewPage({
  mode,
  embedded = false,
  errorMessage: controlledError = null,
  onRefreshOverview,
  overview: controlledOverview,
  settings: controlledSettings
}: OverviewPageProps) {
  const isExternallyBacked = controlledOverview !== undefined && controlledSettings !== undefined;
  const [settings, setSettings] = useState<ManagerSettings>(controlledSettings ?? defaultSettings);
  const [overview, setOverview] = useState<OverviewSnapshot | null>(controlledOverview ?? null);
  const [smartView, setSmartView] = useState<SmartView>('all');
  const [sortMode, setSortMode] = useState<TabSort>('manual');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [detailTabId, setDetailTabId] = useState<number | null>(null);
  const [tabDetail, setTabDetail] = useState<TabDetailSnapshot | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showTools, setShowTools] = useState(false);
  const [dashboardTabsSubView, setDashboardTabsSubView] = useState<DashboardTabsSubView>('current');
  const [sidepanelView, setSidepanelView] = useState<SidepanelView>('tabs');
  const [bookmarks, setBookmarks] = useState<BookmarkTreeSnapshot>({
    roots: [],
    totalBookmarks: 0,
    totalFolders: 0
  });
  const [sessions, setSessions] = useState<SessionsSnapshot>({
    generatedAt: 0,
    sessions: [],
    totalSessions: 0
  });
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [showDashboardOrganizeMenu, setShowDashboardOrganizeMenu] = useState(false);
  const [showDuplicateTabsMenu, setShowDuplicateTabsMenu] = useState(false);
  const [moveGroupPickerOpen, setMoveGroupPickerOpen] = useState(false);
  const [pendingAutoOpenGroupEditorId, setPendingAutoOpenGroupEditorId] = useState<number | null>(null);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [openActionMenuTabId, setOpenActionMenuTabId] = useState<number | null>(null);
  const [activeDragTabId, setActiveDragTabId] = useState<number | null>(null);
  const [activeDragGroupId, setActiveDragGroupId] = useState<number | null>(null);
  const [dragOverlayState, setDragOverlayState] = useState(EMPTY_DRAG_OVERLAY_STATE);
  const [overDropId, setOverDropId] = useState<string | null>(null);
  const [overDropPosition, setOverDropPosition] = useState<DropPosition | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragPointerYRef = useRef<number | null>(null);
  const selectVisibleCheckboxRef = useRef<HTMLInputElement | null>(null);
  const filterPickerArrowRef = useRef<SVGSVGElement | null>(null);
  const dashboardOrganizeMenuArrowRef = useRef<SVGSVGElement | null>(null);
  const duplicateTabsMenuArrowRef = useRef<SVGSVGElement | null>(null);
  const moveGroupPickerArrowRef = useRef<SVGSVGElement | null>(null);
  const sidepanelScrollRef = useRef<HTMLDivElement | null>(null);
  const sidepanelHeaderRef = useRef<HTMLElement | null>(null);
  const sidepanelTreeShellRef = useRef<HTMLElement | null>(null);
  const sidepanelScrollbarTrackRef = useRef<HTMLDivElement | null>(null);
  const sidepanelScrollbarDragRef = useRef<{ startY: number; startScrollTop: number } | null>(null);
  const sidepanelScrollbarMetricsRef = useRef<{ maxScrollTop: number; trackTravel: number }>({
    maxScrollTop: 0,
    trackTravel: 0
  });
  const treeListScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollbarActivityTimersRef = useRef(new Map<HTMLElement, number>());
  const refreshOverviewRef = useRef<() => Promise<void>>(async () => {});
  const refreshBookmarksRef = useRef<() => Promise<void>>(async () => {});
  const refreshSessionsRef = useRef<() => Promise<void>>(async () => {});
  const [sidepanelScrollbarUi, setSidepanelScrollbarUi] = useState({
    dragging: false,
    enabled: false,
    headerHeight: 0,
    thumbHeight: 0,
    thumbOffset: 0
  });

  const config = surfaceConfig[mode];
  const isSidepanel = mode === 'sidepanel';
  const isCompactWorkspace = mode === 'sidepanel' || mode === 'popup';
  const hasCompactViewTabs = mode === 'sidepanel';
  const isEmbeddedDashboard = mode === 'dashboard' && embedded;
  const showingBookmarksManager = hasCompactViewTabs && sidepanelView === 'bookmarks';
  const showingSessionsManager = hasCompactViewTabs && sidepanelView === 'sessions';
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const locale = resolveLocale(settings.locale);
  const t = getMessages(settings.locale);
  const showHistory = settings.showHistory;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    })
  );

  useEffect(() => {
    if (!isExternallyBacked) return;
    setOverview(controlledOverview);
  }, [controlledOverview, isExternallyBacked]);

  useEffect(() => {
    if (!isExternallyBacked) return;
    setSettings(controlledSettings);
  }, [controlledSettings, isExternallyBacked]);

  useEffect(() => {
    if (!isExternallyBacked) return;
    setError(controlledError);
  }, [controlledError, isExternallyBacked]);

  const smartViews: SmartViewDefinition[] = useMemo(
    () => [
      { id: 'all', icon: RiLayoutGridLine, label: t.allTabs },
      { id: 'ungrouped', icon: RiPriceTag3Line, label: t.ungrouped },
      { id: 'grouped', icon: RiFolderLine, label: t.grouped },
      { id: 'audible', icon: RiSoundModuleLine, label: t.audible },
      { id: 'pinned', icon: RiPushpin2Line, label: t.pinned },
      { id: 'stale', icon: RiTimeLine, label: t.stale }
    ],
    [t]
  );

  const sortChoices = useMemo(
    () => [
      { id: 'manual' as const, label: t.browserOrder },
      { id: 'recent' as const, label: t.recentActivity },
      { id: 'opened-time' as const, label: t.openedTimeSort },
      { id: 'active-time' as const, label: t.runningTimeSort },
      { id: 'title' as const, label: t.titleSort }
    ],
    [t]
  );

  const load = async () => {
    try {
      const [nextOverview, nextSettings, nextBookmarks, nextSessions] = await Promise.all([
        getOverview(),
        getSettings(),
        getBookmarks(),
        getSessions()
      ]);
      setOverview(nextOverview);
      setSettings(nextSettings);
      setBookmarks(nextBookmarks);
      setSessions(nextSessions);
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  };

  const refreshOverview = async () => {
    if (onRefreshOverview) {
      await onRefreshOverview();
      return;
    }

    try {
      const nextOverview = await getOverview();
      setOverview(nextOverview);
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  };

  const refreshBookmarks = async () => {
    try {
      const nextBookmarks = await getBookmarks();
      setBookmarks(nextBookmarks);
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  };

  const refreshSessions = async () => {
    try {
      const nextSessions = await getSessions();
      setSessions(nextSessions);
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  };

  const scheduleOverviewRefresh = () => {
    void refreshOverviewRef.current();
  };

  refreshOverviewRef.current = refreshOverview;
  refreshBookmarksRef.current = refreshBookmarks;
  refreshSessionsRef.current = refreshSessions;

  useEffect(() => {
    if (isExternallyBacked) return;
    void load();
  }, [isExternallyBacked]);

  useEffect(() => {
    if (isExternallyBacked) return;

    const handleStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'sync' || !changes[SETTINGS_KEY]) return;

      void (async () => {
        try {
          const nextSettings = await getSettings();
          setSettings(nextSettings);
          setError(null);
        } catch (nextError) {
          setError(getErrorMessage(nextError));
        }
      })();
    };

    chrome.storage.onChanged.addListener(handleStorageChanged);
    return () => chrome.storage.onChanged.removeListener(handleStorageChanged);
  }, [isExternallyBacked]);

  useEffect(() => {
    if (isExternallyBacked) return;

    let refreshTimer: number | null = null;

    const unsubscribe = subscribeToOverviewUpdates(() => {
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        scheduleOverviewRefresh();
      }, 48);
    });

    return () => {
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
      }

      unsubscribe();
    };
  }, [isExternallyBacked]);

  useEffect(() => {
    if (isExternallyBacked) return;

    let refreshTimer: number | null = null;

    const unsubscribe = subscribeToSessionsUpdates(() => {
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refreshSessionsRef.current();
      }, 48);
    });

    return () => {
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
      }

      unsubscribe();
    };
  }, [isExternallyBacked]);

  useEffect(() => {
    if (isExternallyBacked) return;

    let refreshTimer: number | null = null;

    const unsubscribe = subscribeToBookmarksUpdates(() => {
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refreshBookmarksRef.current();
      }, 48);
    });

    return () => {
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
      }

      unsubscribe();
    };
  }, [isExternallyBacked]);

  useEffect(() => {
    if (settings.autoRefreshSeconds <= 0) return;
    if (mode === 'popup') return;

    const intervalId = window.setInterval(() => {
      scheduleOverviewRefresh();
    }, settings.autoRefreshSeconds * 1000);

    return () => window.clearInterval(intervalId);
  }, [mode, settings.autoRefreshSeconds]);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    if (showHistory || dashboardTabsSubView !== 'history') return;
    setDashboardTabsSubView('current');
  }, [dashboardTabsSubView, showHistory]);

  useEffect(() => {
    if (!isSidepanel) return;

    document.documentElement.dataset.surface = 'sidepanel';
    document.body.dataset.surface = 'sidepanel';

    return () => {
      delete document.documentElement.dataset.surface;
      delete document.body.dataset.surface;
    };
  }, [isSidepanel]);

  useEffect(() => {
    if (settings.theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncTheme = () => applyTheme('system');

    syncTheme();
    media.addEventListener('change', syncTheme);
    return () => media.removeEventListener('change', syncTheme);
  }, [settings.theme]);

  useEffect(() => {
    if (sidepanelView === 'sessions' && !settings.sidepanelShowSnapshots) {
      setSidepanelView('tabs');
    }
    if (sidepanelView === 'bookmarks' && !settings.sidepanelShowBookmarks) {
      setSidepanelView('tabs');
    }
  }, [sidepanelView, settings.sidepanelShowSnapshots, settings.sidepanelShowBookmarks]);

  useEffect(() => {
    if (!status) return;

    const timer = window.setTimeout(() => setStatus(null), 2600);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(
    () => () => {
      for (const timer of scrollbarActivityTimersRef.current.values()) {
        window.clearTimeout(timer);
      }

      scrollbarActivityTimersRef.current.clear();
    },
    []
  );

  useEffect(() => {
    if (!isSidepanel) return;

    const scroller = sidepanelScrollRef.current;
    const header = sidepanelHeaderRef.current;
    const content = sidepanelTreeShellRef.current;
    if (!scroller || !header || !content) return;

    let frameId = 0;
    const queueUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const currentScroller = sidepanelScrollRef.current;
        const currentHeader = sidepanelHeaderRef.current;
        const currentContent = sidepanelTreeShellRef.current;
        if (!currentScroller || !currentHeader || !currentContent) return;

        const headerHeight = Math.round(currentHeader.getBoundingClientRect().height);
        const viewportHeight = Math.max(currentScroller.clientHeight - headerHeight, 0);
        const contentHeight = Math.max(currentContent.scrollHeight - headerHeight, viewportHeight);
        const maxScrollTop = Math.max(currentScroller.scrollHeight - currentScroller.clientHeight, 0);
        const trackHeight = Math.max(currentScroller.clientHeight - headerHeight - 14, 0);
        const thumbHeight =
          maxScrollTop > 0 && trackHeight > 0
            ? Math.max(28, Math.min(trackHeight, (viewportHeight / contentHeight) * trackHeight))
            : trackHeight;
        const trackTravel = Math.max(trackHeight - thumbHeight, 0);
        const thumbOffset =
          maxScrollTop > 0 && trackTravel > 0
            ? (currentScroller.scrollTop / maxScrollTop) * trackTravel
            : 0;

        sidepanelScrollbarMetricsRef.current = { maxScrollTop, trackTravel };
        setSidepanelScrollbarUi((current) => {
          const next = {
            dragging: current.dragging,
            enabled: maxScrollTop > 0,
            headerHeight,
            thumbHeight,
            thumbOffset
          };

          return current.dragging === next.dragging &&
            current.enabled === next.enabled &&
            current.headerHeight === next.headerHeight &&
            Math.abs(current.thumbHeight - next.thumbHeight) < 1 &&
            Math.abs(current.thumbOffset - next.thumbOffset) < 1
            ? current
            : next;
        });
      });
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => queueUpdate()) : null;

    resizeObserver?.observe(scroller);
    resizeObserver?.observe(header);
    resizeObserver?.observe(content);
    scroller.addEventListener('scroll', queueUpdate, { passive: true });
    window.addEventListener('resize', queueUpdate);
    queueUpdate();

    return () => {
      resizeObserver?.disconnect();
      scroller.removeEventListener('scroll', queueUpdate);
      window.removeEventListener('resize', queueUpdate);
      window.cancelAnimationFrame(frameId);
    };
  }, [
    isSidepanel,
    overview,
    smartView,
    sortMode,
    query,
    groupFilter,
    selectedIds,
    showFilterPicker,
    showDashboardOrganizeMenu,
    showDuplicateTabsMenu,
    moveGroupPickerOpen,
    expandedGroups,
    showTools
  ]);

  useEffect(() => {
    if (!sidepanelScrollbarUi.dragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = sidepanelScrollbarDragRef.current;
      const scroller = sidepanelScrollRef.current;
      const { maxScrollTop, trackTravel } = sidepanelScrollbarMetricsRef.current;
      if (!dragState || !scroller || maxScrollTop <= 0 || trackTravel <= 0) return;

      const deltaY = event.clientY - dragState.startY;
      const scrollDelta = (deltaY / trackTravel) * maxScrollTop;
      scroller.scrollTop = dragState.startScrollTop + scrollDelta;
    };

    const handlePointerEnd = () => {
      sidepanelScrollbarDragRef.current = null;
      setSidepanelScrollbarUi((current) => ({ ...current, dragging: false }));
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [sidepanelScrollbarUi.dragging]);

  const {
    refs: filterPickerRefs,
    floatingStyles: filterPickerStyles,
    context: filterPickerContext,
    placement: filterPickerPlacement
  } = useFloating({
    open: showFilterPicker,
    onOpenChange: setShowFilterPicker,
    placement: 'bottom-end',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: filterPickerArrowRef, padding: 10 })]
  });
  const filterPickerHover = useHover(filterPickerContext, {
    enabled: !isEmbeddedDashboard,
    move: false,
    delay: { open: 70, close: 80 },
    handleClose: safePolygon({ blockPointerEvents: true })
  });
  const filterPickerClick = useClick(filterPickerContext, {
    event: 'click'
  });
  const filterPickerDismiss = useDismiss(filterPickerContext, {
    outsidePress: true,
    escapeKey: true
  });
  const filterPickerRole = useRole(filterPickerContext, { role: 'menu' });
  const {
    getReferenceProps: getFilterPickerReferenceProps,
    getFloatingProps: getFilterPickerFloatingProps
  } = useInteractions([filterPickerClick, filterPickerHover, filterPickerDismiss, filterPickerRole]);

  const {
    refs: dashboardOrganizeMenuRefs,
    floatingStyles: dashboardOrganizeMenuStyles,
    context: dashboardOrganizeMenuContext,
    placement: dashboardOrganizeMenuPlacement
  } = useFloating({
    open: showDashboardOrganizeMenu,
    onOpenChange: setShowDashboardOrganizeMenu,
    placement: 'bottom-end',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      arrow({ element: dashboardOrganizeMenuArrowRef, padding: 10 })
    ]
  });
  const dashboardOrganizeMenuClick = useClick(dashboardOrganizeMenuContext, {
    event: 'click'
  });
  const dashboardOrganizeMenuDismiss = useDismiss(dashboardOrganizeMenuContext, {
    outsidePress: true,
    escapeKey: true
  });
  const dashboardOrganizeMenuRole = useRole(dashboardOrganizeMenuContext, { role: 'menu' });
  const {
    getReferenceProps: getDashboardOrganizeMenuReferenceProps,
    getFloatingProps: getDashboardOrganizeMenuFloatingProps
  } = useInteractions([dashboardOrganizeMenuClick, dashboardOrganizeMenuDismiss, dashboardOrganizeMenuRole]);

  const {
    refs: duplicateTabsMenuRefs,
    floatingStyles: duplicateTabsMenuStyles,
    context: duplicateTabsMenuContext,
    placement: duplicateTabsMenuPlacement
  } = useFloating({
    open: showDuplicateTabsMenu,
    onOpenChange: setShowDuplicateTabsMenu,
    placement: 'bottom-end',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(10),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      arrow({ element: duplicateTabsMenuArrowRef, padding: 10 })
    ]
  });
  const duplicateTabsMenuClick = useClick(duplicateTabsMenuContext, {
    event: 'click'
  });
  const duplicateTabsMenuDismiss = useDismiss(duplicateTabsMenuContext, {
    outsidePress: true,
    escapeKey: true
  });
  const duplicateTabsMenuRole = useRole(duplicateTabsMenuContext, { role: 'menu' });
  const {
    getReferenceProps: getDuplicateTabsMenuReferenceProps,
    getFloatingProps: getDuplicateTabsMenuFloatingProps
  } = useInteractions([duplicateTabsMenuClick, duplicateTabsMenuDismiss, duplicateTabsMenuRole]);

  const {
    refs: moveGroupPickerRefs,
    floatingStyles: moveGroupPickerStyles,
    context: moveGroupPickerContext,
    placement: moveGroupPickerPlacement
  } = useFloating({
    open: moveGroupPickerOpen,
    onOpenChange: setMoveGroupPickerOpen,
    placement: isSidepanel ? 'bottom-end' : 'bottom-start',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: moveGroupPickerArrowRef, padding: 10 })]
  });
  const moveGroupPickerClick = useClick(moveGroupPickerContext, {
    event: 'click'
  });
  const moveGroupPickerHover = useHover(moveGroupPickerContext, {
    move: false,
    delay: { open: 70, close: 80 },
    handleClose: safePolygon({ blockPointerEvents: true })
  });
  const moveGroupPickerDismiss = useDismiss(moveGroupPickerContext, {
    outsidePress: true,
    escapeKey: true
  });
  const moveGroupPickerRole = useRole(moveGroupPickerContext, { role: 'menu' });
  const {
    getReferenceProps: getMoveGroupPickerReferenceProps,
    getFloatingProps: getMoveGroupPickerFloatingProps
  } = useInteractions([moveGroupPickerClick, moveGroupPickerHover, moveGroupPickerDismiss, moveGroupPickerRole]);

  useEffect(() => {
    if (openActionMenuTabId == null) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest('[data-tab-action-root="true"]')) return;
      setOpenActionMenuTabId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenActionMenuTabId(null);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openActionMenuTabId]);

  useEffect(() => {
    if (selectedIds.size > 0) return;
    setMoveGroupPickerOpen(false);
  }, [selectedIds]);

  const allTabs = overview?.tabs ?? [];

  const duplicateTabGroups = useMemo<DuplicateTabGroup[]>(() => {
    const buckets = new Map<string, TabSnapshot[]>();

    for (const tab of allTabs) {
      const normalizedUrl = normalizeDuplicateTabUrl(tab.url);
      if (!normalizedUrl) continue;

      const bucket = buckets.get(normalizedUrl);
      if (bucket) bucket.push(tab);
      else buckets.set(normalizedUrl, [tab]);
    }

    return Array.from(buckets.entries())
      .map(([url, tabs]) => {
        if (tabs.length <= 1) return null;

        const sortedTabs = [...tabs].sort(compareDuplicateKeepCandidate);
        const keepTab = sortedTabs[0];
        if (!keepTab) return null;

        return {
          duplicateCount: sortedTabs.length - 1,
          hostname: keepTab.hostname || new URL(url).hostname,
          keepTab,
          tabs: sortedTabs,
          title: keepTab.title || keepTab.hostname || url,
          url
        };
      })
      .filter((group): group is DuplicateTabGroup => group !== null)
      .sort((left, right) => right.duplicateCount - left.duplicateCount || left.title.localeCompare(right.title));
  }, [allTabs]);

  const duplicateTabCount = useMemo(
    () => duplicateTabGroups.reduce((total, group) => total + group.duplicateCount, 0),
    [duplicateTabGroups]
  );

  const groups = useMemo(() => {
    const map = new Map<number, { group: TabGroupSnapshot; tabs: TabSnapshot[] }>();

    for (const tab of allTabs) {
      if (!tab.group) continue;

      const existing = map.get(tab.group.id);
      if (existing) existing.tabs.push(tab);
      else map.set(tab.group.id, { group: tab.group, tabs: [tab] });
    }

    return [...map.values()];
  }, [allTabs]);

  const groupById = useMemo(() => {
    const map = new Map<number, { group: TabGroupSnapshot; tabs: TabSnapshot[] }>();
    for (const entry of groups) {
      map.set(entry.group.id, entry);
    }
    return map;
  }, [groups]);
  const tabById = useMemo(() => {
    const map = new Map<number, TabSnapshot>();
    for (const tab of allTabs) {
      map.set(tab.id, tab);
    }
    return map;
  }, [allTabs]);

  useEffect(() => {
    if (groups.length === 0) return;

    setExpandedGroups((current) => {
      const next = new Set(
        groups.filter((entry) => !entry.group.collapsed).map((entry) => entry.group.id)
      );

      if (current.size === next.size && [...current].every((groupId) => next.has(groupId))) {
        return current;
      }

      return next;
    });
  }, [groups]);

  useEffect(() => {
    if (!overview) return;

    setSelectedIds((current) => {
      const liveIds = new Set(overview.tabs.map((tab) => tab.id));
      return new Set([...current].filter((id) => liveIds.has(id)));
    });
  }, [overview]);

  useEffect(() => {
    if (groupFilter === 'all' || groupFilter === 'ungrouped') return;
    if (groups.some((entry) => String(entry.group.id) === groupFilter)) return;
    setGroupFilter('all');
  }, [groupFilter, groups]);

  const filteredTabs = useMemo(() => {
    const scoped = allTabs.filter((tab) => {
      return (
        matchesSmartView(tab, smartView) &&
        matchesGroupFilter(tab, groupFilter)
      );
    });
    const searched = scoped.filter((tab) => {
      if (!deferredQuery) return true;

      return [tab.title, tab.url, tab.hostname, tab.group?.title ?? '']
        .some((value) => value.toLowerCase().includes(deferredQuery));
    });

    return sortTabs(searched, sortMode);
  }, [allTabs, deferredQuery, groupFilter, smartView, sortMode]);

  const visibleBookmarks = useMemo<BookmarkNodeSnapshot[]>(
    () => bookmarks.roots,
    [bookmarks]
  );
  const visibleBookmarkMatchCount = useMemo(() => {
    const countBookmarksOnly = (node: BookmarkNodeSnapshot): number =>
      node.children.reduce(
        (total, child) => total + (child.url ? 1 : 0) + countBookmarksOnly(child),
        0
      );

    return visibleBookmarks.reduce(
      (total, root) => total + (root.url ? 1 : 0) + countBookmarksOnly(root),
      0
    );
  }, [visibleBookmarks]);
  const bookmarksSearchMeta =
    showingBookmarksManager && deferredQuery
      ? `${visibleBookmarkMatchCount} ${t.matched}`
      : null;

  const visibleTabs = useMemo(
    () => filteredTabs.slice(0, config.listLimit),
    [config.listLimit, filteredTabs]
  );

  const entries = useMemo(
    () => buildEntries(overview, visibleTabs, sortMode),
    [overview, visibleTabs, sortMode]
  );
  const visibleOrderDisplayIndexByTabId = useMemo(() => {
    const lookup = new Map<number, number>();
    visibleTabs.forEach((tab, index) => {
      lookup.set(tab.id, index + 1);
    });
    return lookup;
  }, [visibleTabs]);
  const displayIndexByTabId = useMemo(() => {
    const lookup = new Map<number, number>();
    let nextDisplayIndex = 1;

    for (const entry of entries) {
      for (const tab of entry.tabs) {
        if (lookup.has(tab.id)) continue;
        lookup.set(tab.id, nextDisplayIndex);
        nextDisplayIndex += 1;
      }
    }

    return lookup;
  }, [entries]);
  const getDisplayIndex = (tabId: number): number => {
    return displayIndexByTabId.get(tabId) ?? visibleOrderDisplayIndexByTabId.get(tabId) ?? 0;
  };
  const historyTabs = overview?.historyTabs ?? [];
  const visibleHistoryTabs = useMemo(() => {
    if (!deferredQuery) return historyTabs;
    return historyTabs.filter((tab) => {
      const haystack = `${tab.title} ${tab.hostname} ${tab.url}`.toLowerCase();
      return haystack.includes(deferredQuery);
    });
  }, [deferredQuery, historyTabs]);

  const visibleSelectedCount = useMemo(
    () => visibleTabs.filter((tab) => selectedIds.has(tab.id)).length,
    [selectedIds, visibleTabs]
  );

  const selectedTabs = useMemo(
    () => allTabs.filter((tab) => selectedIds.has(tab.id)),
    [allTabs, selectedIds]
  );

  const selectedCount = selectedTabs.length;
  const allVisibleSelected = visibleTabs.length > 0 && visibleSelectedCount === visibleTabs.length;
  const partiallyVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;
  const selectedPinned = selectedCount > 0 && selectedTabs.every((tab) => tab.pinned);
  const selectedMuted = selectedCount > 0 && selectedTabs.every((tab) => tab.muted);
  const selectedGrouped = selectedTabs.some((tab) => tab.group != null);
  const groupFilterLabel =
    groupFilter === 'all'
      ? t.allTabs
      : groupFilter === 'ungrouped'
        ? t.ungrouped
        : groups.find((entry) => String(entry.group.id) === groupFilter)?.group.title ?? t.filter;
  const activeDragGroup = useMemo(
    () => groups.find((entry) => entry.group.id === activeDragGroupId) ?? null,
    [activeDragGroupId, groups]
  );

  useEffect(() => {
    if (activeDragTabId == null && activeDragGroupId == null) {
      dragPointerYRef.current = null;
      return;
    }

    const syncPointer = (event: PointerEvent) => {
      dragPointerYRef.current = event.clientY;
    };

    window.addEventListener('pointermove', syncPointer, true);
    return () => {
      window.removeEventListener('pointermove', syncPointer, true);
    };
  }, [activeDragGroupId, activeDragTabId]);

  useEffect(() => {
    if (!selectVisibleCheckboxRef.current) return;
    selectVisibleCheckboxRef.current.indeterminate = partiallyVisibleSelected;
  }, [partiallyVisibleSelected]);

  useEffect(() => {
    if (selectedCount > 0) return;
    setMoveGroupPickerOpen(false);
    setPendingAutoOpenGroupEditorId(null);
  }, [selectedCount]);

  useEffect(() => {
    if (pendingAutoOpenGroupEditorId == null || !overview) return;

    const nextGroupId = overview.tabs.find((tab) => tab.id === pendingAutoOpenGroupEditorId)?.group?.id ?? null;
    if (nextGroupId == null) return;

    setExpandedGroups((current) => {
      const next = new Set(current);
      next.add(nextGroupId);
      return next;
    });
    setPendingAutoOpenGroupEditorId(nextGroupId);
  }, [overview, pendingAutoOpenGroupEditorId]);

  useEffect(() => {
    if (detailTabId == null || !tabDetail) return;

    const liveTab = allTabs.find((tab) => tab.id === detailTabId) ?? null;
    if (!liveTab) return;
    setTabDetail((current) => (current ? { ...current, tab: liveTab } : current));
  }, [allTabs, detailTabId, tabDetail]);

  const setStatusMessage = (message: string) => {
    setStatus(message);
    setError(null);
  };

  const execute = async (
    successMessage: string,
    action: () => Promise<void>,
    options?: { clearSelection?: boolean; silentStatus?: boolean; soft?: boolean; refresh?: boolean }
  ) => {
    try {
      await action();
      if (!options?.silentStatus) {
        setStatusMessage(successMessage);
      }
      if (options?.clearSelection) {
        setSelectedIds(new Set());
      }
      if (options?.refresh !== false) {
        await refreshOverview();
      }
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  };

  const markTabActiveLocally = (tabId: number, windowId: number) => {
    const now = Date.now();

    setOverview((current) => {
      if (!current) return current;

      return {
        ...current,
        tabs: current.tabs.map((tab) => {
          if (tab.windowId !== windowId) return tab;

          if (tab.id === tabId) {
            return {
              ...tab,
              active: true,
              lastAccessed: now,
              telemetry: {
                ...tab.telemetry,
                lastActivatedAt: now
              }
            };
          }

          return {
            ...tab,
            active: false
          };
        })
      };
    });
  };

  const handleFocusTab = async (tab: TabSnapshot) => {
    setOpenActionMenuTabId(null);
    markTabActiveLocally(tab.id, tab.windowId);

    try {
      await focusTab(tab.id, tab.windowId);
      if (mode === 'popup') window.close();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
      await load();
    }
  };

  const openTabDetail = async (tab: TabSnapshot) => {
    setOpenActionMenuTabId(null);
    setDetailTabId(tab.id);
    setDetailLoading(true);
    setDetailError(null);
    setTabDetail({ tab, history: [] });

    try {
      const detail = await getTabDetail(tab.id);
      setTabDetail(detail);
    } catch (nextError) {
      setDetailError(getErrorMessage(nextError));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeTabDetail = () => {
    setDetailTabId(null);
    setTabDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  };

  const copyUrl = async (url: string) => {
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setStatusMessage(t.copiedUrl);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  };

  const reopenHistoryTab = async (historyTab: HistoryTabSnapshot) => {
    if (!historyTab.url) return;

    await chrome.tabs.create({
      url: historyTab.url,
      active: true
    });

    if (mode === 'popup') window.close();
  };

  const openHistoryTabDetail = async (historyTab: HistoryTabSnapshot) => {
    setOpenActionMenuTabId(null);
    setDetailTabId(historyTab.originalTabId);
    setDetailLoading(true);
    setDetailError(null);
    setTabDetail(null);

    try {
      const detail = await getTabDetail(historyTab.originalTabId);
      setTabDetail(detail);
    } catch (nextError) {
      setDetailError(getErrorMessage(nextError));
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleVisibleSelection = () => {
    const visibleIds = visibleTabs.map((tab) => tab.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of visibleIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  const suggestGroupKeyword = (tab: TabSnapshot | null, fallback: string) => {
    if (!tab) return fallback;

    const hostname = tab.hostname.replace(/^www\./, '').trim();
    const firstSegment = hostname.split('.')[0] ?? '';
    const token = firstSegment.split(/[^a-zA-Z0-9]+/).find(Boolean)?.trim();

    return token || firstSegment || getDomainLabel(tab) || fallback;
  };

  const suggestGroupTitle = (tabs: TabSnapshot[], fallback: string) => {
    if (tabs.length === 0) return fallback;

    return suggestGroupKeyword(tabs[0] ?? null, fallback);
  };

  const closeMoveGroupPicker = () => {
    setMoveGroupPickerOpen(false);
  };

  const getDuplicateCloseIds = (duplicateGroups: DuplicateTabGroup[]) =>
    duplicateGroups.flatMap((group) => group.tabs.slice(1).map((tab) => tab.id));

  const deduplicateGroups = async (duplicateGroups: DuplicateTabGroup[], successMessage: string) => {
    const tabIds = getDuplicateCloseIds(duplicateGroups);
    if (tabIds.length === 0) return;

    setShowDuplicateTabsMenu(false);
    await execute(successMessage, async () => {
      await closeTabs(tabIds);
    }, { clearSelection: true });
  };

  const deduplicateAllTabs = async () => {
    await deduplicateGroups(duplicateTabGroups, t.deduplicatedTabs);
  };

  const deduplicateTabGroup = async (group: DuplicateTabGroup) => {
    await deduplicateGroups([group], t.deduplicatedTabs);
  };

  const createSelectionGroupAndOpenEditor = async () => {
    if (selectedCount === 0 || selectedTabs.length === 0) return;

    const anchorTab = selectedTabs[0] ?? null;
    const title = suggestGroupKeyword(anchorTab, t.newGroup);
    const color = colorFromSeed(title);

    try {
      await groupTabs(
        selectedTabs.map((tab) => tab.id),
        { title, color }
      );
      setStatusMessage(t.createdGroup);

      if (anchorTab) {
        setPendingAutoOpenGroupEditorId(anchorTab.id);
      }

      closeMoveGroupPicker();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  };

  const openCreatedGroupEditor = (anchorTabId: number | null, successMessage: string) => {
    if (anchorTabId != null) {
      setPendingAutoOpenGroupEditorId(anchorTabId);
    }

    setStatusMessage(successMessage);
  };

  const launchAlternate = async () => {
    if (mode === 'dashboard') {
      const opened = await openSidePanel();
      if (!opened) {
        await openPreferredLaunchSurface();
      }
    } else {
      await openPreferredLaunchSurface();
    }

    if (mode === 'popup') window.close();
  };

  const launchSidePanelFromPopup = async () => {
    try {
      const opened = await openSidePanel();
      if (opened) window.close();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  };

  const handleSmartGrouping = async (strategy: SmartGroupStrategy) => {
    if (visibleTabs.length === 0) return;

    await execute(strategy === 'domain' ? t.groupByDomain : t.groupByType, async () => {
      await smartGroupTabs(
        visibleTabs.map((tab) => tab.id),
        strategy
      );
    });
  };

  const handleCreateSelectionGroup = async () => {
    if (selectedTabs.length === 0) return;

    const title = suggestGroupTitle(selectedTabs, t.newGroup);
    const color = colorFromSeed(title);

    await execute(t.createdGroup, async () => {
      await groupTabs(
        selectedTabs.map((tab) => tab.id),
        {
          title,
          color
        }
      );
    });
  };

  const handleCreateEmptyGroup = async () => {
    const title = t.newGroup;
    const color = colorFromSeed(title);

    try {
      const createdTab = await chrome.tabs.create({
        active: true
      });

      if (createdTab.id == null) return;

      await groupTabs([createdTab.id], {
        title,
        color
      });
      openCreatedGroupEditor(createdTab.id, t.createdGroup);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }

    if (mode === 'popup') {
      window.close();
    }
  };

  const saveGroupAsAutoGroup = async (group: TabGroupSnapshot, tabs: TabSnapshot[]) => {
    const existingConfig =
      settings.autoGroupConfigs.find((config) => config.id === group.autoGroupConfigId) ??
      findAutoGroupConfigForGroup(settings.autoGroupConfigs, group.title, tabs);
    if (existingConfig) {
      await openDashboardPage('automation', { autoGroupConfig: existingConfig.id });
      return;
    }

    await execute(t.savedAsAutoGroup, async () => {
      const latestSettings = await getSettings();
      const latestExistingConfig =
        latestSettings.autoGroupConfigs.find((config) => config.id === group.autoGroupConfigId) ??
        findAutoGroupConfigForGroup(latestSettings.autoGroupConfigs, group.title, tabs);
      if (latestExistingConfig) {
        setSettings(latestSettings);
        await updateGroup(group.id, { autoGroupConfigId: latestExistingConfig.id });
        await openDashboardPage('automation', { autoGroupConfig: latestExistingConfig.id });
        return;
      }

      const config = createAutoGroupConfig(group.title || t.newGroup, {
        color: group.color as TabGroupColor,
        tabs
      });
      const nextSettings = await updateSettings({
        autoGroupEnabled: true,
        autoGroupConfigs: [config, ...latestSettings.autoGroupConfigs]
      });

      setSettings(nextSettings);
      await updateGroup(group.id, { autoGroupConfigId: config.id });
      await openDashboardPage('automation', { autoGroupConfig: config.id });
    }, { silentStatus: true, soft: true });
  };

  const handleMoveSelectionToGroup = async (nextGroupId: number | string) => {
    if (!nextGroupId || selectedCount === 0) return;

    await execute(t.movedToGroup, async () => {
      await groupTabs(
        selectedTabs.map((tab) => tab.id),
        { groupId: Number(nextGroupId) }
      );
    });
    closeMoveGroupPicker();
  };

  const resolveDragDropPosition = (
    active: ParsedDropTarget | null,
    over: ParsedDropTarget | null,
    overId: string | null,
    overRect: { top: number; height: number } | null | undefined,
    fallbackRect: { top: number; height: number } | null | undefined
  ): DropPosition | null => {
    if (!active || !over || !overId) return null;

    if (over.kind === 'group-tail') {
      return active.kind === 'tab' ? 'inside' : 'after';
    }

    if (over.kind === 'group-after') {
      return 'after';
    }

    if (
      (active.kind === 'tab' && over.kind === 'tab') ||
      (active.kind === 'group-sort' && (over.kind === 'tab' || over.kind === 'group'))
    ) {
      return resolveVerticalDropPosition(
        getLiveDropRect(overId) ?? overRect,
        dragPointerYRef.current,
        fallbackRect
      );
    }

    // For collapsed groups, hovering a tab near header edges should default to inserting
    // before/after the group, avoiding accidental "drop into collapsed group" behavior.
    if (active.kind === 'tab' && over.kind === 'group' && over.id != null) {
      const targetGroup = groupById.get(over.id);
      if (targetGroup?.group.collapsed) {
        return resolveVerticalDropPosition(
          getLiveDropRect(overId) ?? overRect,
          dragPointerYRef.current,
          fallbackRect
        );
      }
    }

    return 'inside';
  };

  const normalizeGroupSortDropTarget = (
    active: ParsedDropTarget | null,
    over: ParsedDropTarget | null,
    overId: string | null
  ): { over: ParsedDropTarget | null; overId: string | null } => {
    if (!active || active.kind !== 'group-sort' || !over || over.kind !== 'tab' || over.id == null) {
      return { over, overId };
    }

    const targetTab = tabById.get(over.id);
    if (!targetTab?.group) {
      return { over, overId };
    }

    return {
      over: { kind: 'group', id: targetTab.group.id },
      overId: `group:${targetTab.group.id}`
    };
  };

  const updateDragTarget = (event: DragMoveEvent | DragOverEvent | DragEndEvent) => {
    const active = parseDropId(event.active.id as string);
    const rawOverId = typeof event.over?.id === 'string' ? event.over.id : null;
    const rawOver = parseDropId(rawOverId ?? undefined);
    const { over, overId } = normalizeGroupSortDropTarget(active, rawOver, rawOverId);

    if (!active || !overId || !over) {
      setOverDropId(null);
      setOverDropPosition(null);
      return;
    }

    if (
      (active.kind === 'tab' && over.kind === 'tab' && active.id === over.id) ||
      (active.kind === 'group-sort' &&
        (over.kind === 'group' || over.kind === 'group-tail' || over.kind === 'group-after') &&
        active.id === over.id)
    ) {
      setOverDropId(null);
      setOverDropPosition(null);
      return;
    }

    const position =
      resolveDragDropPosition(
        active,
        over,
        overId,
        event.over?.rect,
        event.active.rect.current.translated
      ) ?? 'inside';

    setOverDropId(overId);
    setOverDropPosition(position);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragTabId(null);
    setActiveDragGroupId(null);
    setDragOverlayState(EMPTY_DRAG_OVERLAY_STATE);
    const active = parseDropId(event.active.id as string);
    const rawOverId = typeof event.over?.id === 'string' ? event.over.id : null;
    const rawOver = parseDropId(rawOverId ?? undefined);
    const { over, overId } = normalizeGroupSortDropTarget(active, rawOver, rawOverId);
    const dropPosition = resolveDragDropPosition(
      active,
      over,
      overId,
      event.over?.rect,
      event.active.rect.current.translated
    );

    setOverDropId(null);
    setOverDropPosition(null);
    dragPointerYRef.current = null;

    if (!active || !over) return;

    if (active.kind === 'group-sort' && active.id != null) {
      const activeGroupId = active.id;
      const movingGroup = groups.find((entry) => entry.group.id === activeGroupId);
      if (!movingGroup) return;

      if ((over.kind === 'group-tail' || over.kind === 'group-after') && over.id != null && over.id !== movingGroup.group.id) {
        const overGroupId = over.id;
        await execute(t.dragToReorder, async () => {
          await moveGroup(activeGroupId, { kind: 'group', id: overGroupId }, 'after');
        }, { silentStatus: true, soft: true });
        return;
      }

      if (over.kind === 'group' && over.id != null && over.id !== movingGroup.group.id) {
        const overGroupId = over.id;
        await execute(t.dragToReorder, async () => {
          await moveGroup(activeGroupId, { kind: 'group', id: overGroupId }, dropPosition === 'after' ? 'after' : 'before');
        }, { silentStatus: true, soft: true });
        return;
      }

      if (over.kind === 'tab' && over.id != null) {
        const overTabId = over.id;
        await execute(t.dragToReorder, async () => {
          await moveGroup(activeGroupId, { kind: 'tab', id: overTabId }, dropPosition === 'after' ? 'after' : 'before');
        }, { silentStatus: true, soft: true });
      }
      return;
    }

    if (active.kind !== 'tab') return;

    const movingTab = allTabs.find((tab) => tab.id === active.id);
    if (!movingTab) return;

    if (over.kind === 'tab' && over.id && over.id !== movingTab.id) {
      const targetTab = allTabs.find((tab) => tab.id === over.id);
      if (!targetTab) return;

      await execute(t.dragToReorder, async () => {
        if (dropPosition === 'after') {
          await moveTabAfter(movingTab.id, targetTab.id);
        } else {
          await moveTabBefore(movingTab.id, targetTab.id);
        }

        if (movingTab.group?.id !== targetTab.group?.id) {
          if (targetTab.group) {
            await groupTabs([movingTab.id], { groupId: targetTab.group.id });
          } else if (movingTab.group) {
            await ungroupTabs([movingTab.id]);
          }
        }
      }, { silentStatus: true, soft: true });
      return;
    }

    if (over.kind === 'group-tail' && over.id) {
      const targetGroup = groupById.get(over.id);
      const anchorTabId = targetGroup?.tabs[targetGroup.tabs.length - 1]?.id;
      if (!anchorTabId) return;

      await execute(t.dragToReorder, async () => {
        await moveTabAfter(movingTab.id, anchorTabId);

        if (movingTab.group?.id !== over.id) {
          await groupTabs([movingTab.id], { groupId: over.id });
        }
      }, { silentStatus: true, soft: true });
      return;
    }

    if (over.kind === 'group-after' && over.id) {
      const targetGroup = groupById.get(over.id);
      const anchorTabId = targetGroup?.tabs[targetGroup.tabs.length - 1]?.id;
      if (!anchorTabId) return;

      await execute(t.dragToReorder, async () => {
        await moveTabAfter(movingTab.id, anchorTabId);

        if (movingTab.group && movingTab.group.id !== over.id) {
          await ungroupTabs([movingTab.id]);
        }
      }, { silentStatus: true, soft: true });
      return;
    }

    if (over.kind === 'group' && over.id && movingTab.group?.id !== over.id) {
      const targetGroup = groupById.get(over.id);
      if (targetGroup && (dropPosition === 'before' || dropPosition === 'after')) {
        const anchorTabId =
          dropPosition === 'after'
            ? targetGroup.tabs[targetGroup.tabs.length - 1]?.id
            : targetGroup.tabs[0]?.id;
        if (!anchorTabId) return;

        await execute(t.dragToReorder, async () => {
          if (dropPosition === 'after') {
            await moveTabAfter(movingTab.id, anchorTabId);
          } else {
            await moveTabBefore(movingTab.id, anchorTabId);
          }

          if (movingTab.group) {
            await ungroupTabs([movingTab.id]);
          }
        }, { silentStatus: true, soft: true });
        return;
      }

      await execute(t.movedToGroup, async () => {
        await groupTabs([movingTab.id], { groupId: over.id });
      }, { silentStatus: true, soft: true });
      return;
    }

    if (over.kind === 'new') {
      const title = suggestGroupTitle([movingTab], t.newGroup);
      const color = colorFromSeed(title);
      await execute(t.createdGroup, async () => {
        await groupTabs([movingTab.id], {
          title,
          color
        });
      });
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    dragPointerYRef.current = extractClientY(event.activatorEvent);
    const active = parseDropId(event.active.id as string);
    const activeId = typeof event.active.id === 'string' ? event.active.id : null;
    const escapedActiveId = activeId
      ? globalThis.CSS?.escape?.(activeId) ?? activeId.replace(/["\\]/g, '\\$&')
      : null;
    const activeElement = escapedActiveId
      ? document.querySelector<HTMLElement>(`[data-drag-overlay-id="${escapedActiveId}"]`)
      : null;
    const listRect = treeListScrollRef.current?.getBoundingClientRect();
    const activeRect = activeElement?.getBoundingClientRect();

    setDragOverlayState(
      activeId && listRect && activeRect
        ? {
            activeId,
            height: activeRect.height,
            left: listRect.left,
            maxTop: Math.max(listRect.bottom - activeRect.height, listRect.top),
            minTop: listRect.top,
            originTop: activeRect.top,
            top: activeRect.top,
            width: listRect.width
          }
        : EMPTY_DRAG_OVERLAY_STATE
    );
    if (active?.kind === 'tab' && active.id) {
      setActiveDragTabId(active.id);
    }
    if (active?.kind === 'group-sort' && active.id) {
      setActiveDragGroupId(active.id);
    }
  };

  const handleDragMove = (event: DragMoveEvent) => {
    setDragOverlayState((current) =>
      current.activeId
        ? {
            ...current,
            top: clamp(current.originTop + event.delta.y, current.minTop, current.maxTop)
          }
        : current
    );
    updateDragTarget(event);
  };

  const handleDragOver = (event: DragOverEvent) => {
    updateDragTarget(event);
  };

  const resetDragState = () => {
    setActiveDragTabId(null);
    setActiveDragGroupId(null);
    setDragOverlayState(EMPTY_DRAG_OVERLAY_STATE);
    setOverDropId(null);
    setOverDropPosition(null);
    dragPointerYRef.current = null;
  };

  const clearSelectionState = () => {
    closeMoveGroupPicker();
    setSelectedIds(new Set());
  };

  const markScrollbarActive = (element: HTMLDivElement | null) => {
    if (!element) return;

    element.dataset.scrolling = 'true';

    const activeTimers = scrollbarActivityTimersRef.current;
    const existingTimer = activeTimers.get(element);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const nextTimer = window.setTimeout(() => {
      element.dataset.scrolling = 'false';
      activeTimers.delete(element);
    }, 560);

    activeTimers.set(element, nextTimer);
  };

  const scrollSidepanelToRatio = (ratio: number) => {
    const scroller = sidepanelScrollRef.current;
    const { maxScrollTop } = sidepanelScrollbarMetricsRef.current;
    if (!scroller || maxScrollTop <= 0) return;

    const clampedRatio = Math.max(0, Math.min(1, ratio));
    scroller.scrollTop = clampedRatio * maxScrollTop;
  };

  const handleSidepanelScrollbarPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const track = sidepanelScrollbarTrackRef.current;
    const scroller = sidepanelScrollRef.current;
    const target = event.target as HTMLElement | null;
    if (!track || !scroller || !sidepanelScrollbarUi.enabled) return;

    const trackRect = track.getBoundingClientRect();
    const isThumb = target?.dataset.scrollbarThumb === 'true';
    const { thumbHeight } = sidepanelScrollbarUi;
    const { maxScrollTop, trackTravel } = sidepanelScrollbarMetricsRef.current;
    if (maxScrollTop <= 0 || trackTravel <= 0) return;

    if (!isThumb) {
      const nextRatio = (event.clientY - trackRect.top - thumbHeight / 2) / trackTravel;
      scrollSidepanelToRatio(nextRatio);
    }

    sidepanelScrollbarDragRef.current = {
      startY: event.clientY,
      startScrollTop: scroller.scrollTop
    };
    setSidepanelScrollbarUi((current) => ({ ...current, dragging: true }));
    event.preventDefault();
  };

  const renderFilterPickerPanel = () => {
    if (!showFilterPicker) return null;

    return (
      <FloatingPortal>
        <motion.div
          ref={filterPickerRefs.setFloating}
          animate={{ opacity: 1, y: 0 }}
          className={
            isEmbeddedDashboard
              ? 'tm-header-group-picker tm-header-group-picker-floating tm-dashboard-compact-menu'
              : 'tm-header-group-picker tm-header-group-picker-floating'
          }
          data-side={filterPickerPlacement.split('-')[0]}
          exit={{ opacity: 0, y: 4 }}
          initial={{ opacity: 0, y: 6 }}
          style={filterPickerStyles}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          {...getFilterPickerFloatingProps()}
        >
          <motion.button
            animate={{ opacity: 1, y: 0 }}
            className="tm-header-group-picker-button"
            data-active={groupFilter === 'all'}
            exit={{ opacity: 0, y: 2 }}
            initial={{ opacity: 0, y: 4 }}
            onClick={() => {
              setGroupFilter('all');
              setShowFilterPicker(false);
            }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            type="button"
          >
            <RiLayoutGridLine size={12} />
            <span>{t.allTabs}</span>
          </motion.button>
          <motion.button
            animate={{ opacity: 1, y: 0 }}
            className="tm-header-group-picker-button"
            data-active={groupFilter === 'ungrouped'}
            exit={{ opacity: 0, y: 2 }}
            initial={{ opacity: 0, y: 4 }}
            onClick={() => {
              setGroupFilter('ungrouped');
              setShowFilterPicker(false);
            }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            type="button"
          >
            <RiPriceTag3Line size={12} />
            <span>{t.ungrouped}</span>
          </motion.button>
          {groups.length > 0
            ? groups.map((entry) => (
                <motion.button
                  animate={{ opacity: 1, y: 0 }}
                  className="tm-header-group-picker-button"
                  data-active={groupFilter === String(entry.group.id)}
                  exit={{ opacity: 0, y: 2 }}
                  key={entry.group.id}
                  initial={{ opacity: 0, y: 4 }}
                  onClick={() => {
                    setGroupFilter(String(entry.group.id) as GroupFilter);
                    setShowFilterPicker(false);
                  }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  type="button"
                >
                  <RiFolderLine size={12} />
                  <span>{entry.group.title}</span>
                </motion.button>
              ))
            : null}
          <FloatingArrow
            ref={filterPickerArrowRef}
            className="tm-header-group-picker-arrow"
            context={filterPickerContext}
            fill="var(--tm-header-group-picker-surface)"
            height={6}
            stroke="var(--tm-header-group-picker-border)"
            strokeWidth={1}
            tipRadius={2}
            width={12}
          />
        </motion.div>
      </FloatingPortal>
    );
  };

  const renderDashboardOrganizeMenu = () => {
    if (!showDashboardOrganizeMenu) return null;

    return (
      <FloatingPortal>
        <motion.div
          ref={dashboardOrganizeMenuRefs.setFloating}
          animate={{ opacity: 1, y: 0 }}
          className="tm-header-group-picker tm-header-group-picker-floating tm-dashboard-compact-menu"
          data-side={dashboardOrganizeMenuPlacement.split('-')[0]}
          exit={{ opacity: 0, y: 4 }}
          initial={{ opacity: 0, y: 6 }}
          style={dashboardOrganizeMenuStyles}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          {...getDashboardOrganizeMenuFloatingProps()}
        >
          <div className="tm-dashboard-compact-menu-title">{t.organize}</div>
          <motion.button
            animate={{ opacity: 1, y: 0 }}
            className="tm-header-group-picker-button"
            disabled={visibleTabs.length === 0}
            exit={{ opacity: 0, y: 2 }}
            initial={{ opacity: 0, y: 4 }}
            onClick={() => {
              setShowDashboardOrganizeMenu(false);
              void handleSmartGrouping('domain');
            }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            type="button"
          >
            <RiGlobalLine size={12} />
            <span>{t.smartByDomain}</span>
          </motion.button>
          <motion.button
            animate={{ opacity: 1, y: 0 }}
            className="tm-header-group-picker-button"
            disabled={visibleTabs.length === 0}
            exit={{ opacity: 0, y: 2 }}
            initial={{ opacity: 0, y: 4 }}
            onClick={() => {
              setShowDashboardOrganizeMenu(false);
              void handleSmartGrouping('site-type');
            }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            type="button"
          >
            <RiShining2Line size={12} />
            <span>{t.smartByType}</span>
          </motion.button>
          <FloatingArrow
            ref={dashboardOrganizeMenuArrowRef}
            className="tm-header-group-picker-arrow"
            context={dashboardOrganizeMenuContext}
            fill="var(--tm-header-group-picker-surface)"
            height={6}
            stroke="var(--tm-header-group-picker-border)"
            strokeWidth={1}
            tipRadius={2}
            width={12}
          />
        </motion.div>
      </FloatingPortal>
    );
  };

  const renderDuplicateTabsMenu = () => {
    if (!showDuplicateTabsMenu) return null;

    return (
      <FloatingPortal>
        <motion.div
          ref={duplicateTabsMenuRefs.setFloating}
          animate={{ opacity: 1, y: 0 }}
          className="tm-header-group-picker tm-header-group-picker-floating tm-dashboard-compact-menu tm-duplicate-tabs-menu"
          data-side={duplicateTabsMenuPlacement.split('-')[0]}
          exit={{ opacity: 0, y: 4 }}
          initial={{ opacity: 0, y: 6 }}
          style={duplicateTabsMenuStyles}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          {...getDuplicateTabsMenuFloatingProps()}
        >
          <div className="tm-dashboard-compact-menu-title">{t.deduplicateTabs}</div>
          {duplicateTabGroups.length > 0 ? (
            <>
              <motion.button
                animate={{ opacity: 1, y: 0 }}
                className="tm-header-group-picker-button tm-duplicate-tabs-menu-action"
                exit={{ opacity: 0, y: 2 }}
                initial={{ opacity: 0, y: 4 }}
                onClick={() => void deduplicateAllTabs()}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                type="button"
              >
                <RiFileCopyLine size={12} />
                <span>{t.deduplicateAll}</span>
                <em>{duplicateTabCount}</em>
              </motion.button>
              <div className="tm-header-group-picker-divider" />
              <div className="tm-duplicate-tabs-list">
                {duplicateTabGroups.map((group) => (
                  <motion.button
                    animate={{ opacity: 1, y: 0 }}
                    className="tm-header-group-picker-button tm-duplicate-tabs-url-button"
                    exit={{ opacity: 0, y: 2 }}
                    initial={{ opacity: 0, y: 4 }}
                    key={group.url}
                    onClick={() => void deduplicateTabGroup(group)}
                    transition={{ duration: 0.12, ease: 'easeOut' }}
                    type="button"
                  >
                    <RiFileCopyLine size={12} />
                    <span>
                      <strong>{group.title}</strong>
                      <small>{group.hostname || group.url}</small>
                    </span>
                    <em>{group.duplicateCount}</em>
                  </motion.button>
                ))}
              </div>
            </>
          ) : (
            <div className="tm-header-group-picker-empty">{t.noDuplicateTabs}</div>
          )}
          <FloatingArrow
            ref={duplicateTabsMenuArrowRef}
            className="tm-header-group-picker-arrow"
            context={duplicateTabsMenuContext}
            fill="var(--tm-header-group-picker-surface)"
            height={6}
            stroke="var(--tm-header-group-picker-border)"
            strokeWidth={1}
            tipRadius={2}
            width={12}
          />
        </motion.div>
      </FloatingPortal>
    );
  };

  const renderMoveGroupPickerPanel = () => {
    if (!moveGroupPickerOpen) return null;

    return (
      <FloatingPortal>
        <motion.div
          ref={moveGroupPickerRefs.setFloating}
          animate={{ opacity: 1, y: 0 }}
          className="tm-header-group-picker tm-header-group-picker-floating"
          data-side={moveGroupPickerPlacement.split('-')[0]}
          exit={{ opacity: 0, y: 4 }}
          initial={{ opacity: 0, y: 6 }}
          style={moveGroupPickerStyles}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          {...getMoveGroupPickerFloatingProps()}
        >
          <motion.button
            animate={{ opacity: 1, y: 0 }}
            className="tm-header-group-picker-button"
            exit={{ opacity: 0, y: 2 }}
            initial={{ opacity: 0, y: 4 }}
            onClick={() => void createSelectionGroupAndOpenEditor()}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            type="button"
          >
            <RiAddCircleLine size={12} />
            <span>{t.createGroup}</span>
          </motion.button>
          {groups.length > 0 ? <div className="tm-header-group-picker-divider" /> : null}
          {groups.length > 0 ? (
            groups.map((entry) => (
              <motion.button
                animate={{ opacity: 1, y: 0 }}
                className="tm-header-group-picker-button"
                exit={{ opacity: 0, y: 2 }}
                initial={{ opacity: 0, y: 4 }}
                disabled={selectedCount === 0}
                key={entry.group.id}
                onClick={() => void handleMoveSelectionToGroup(entry.group.id)}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                type="button"
              >
                <RiFolderLine size={12} />
                <span>{entry.group.title}</span>
              </motion.button>
            ))
          ) : (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="tm-header-group-picker-empty"
              exit={{ opacity: 0, y: 2 }}
              initial={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
            >
              {t.noGroupsYet}
            </motion.div>
          )}
          <FloatingArrow
            ref={moveGroupPickerArrowRef}
            className="tm-header-group-picker-arrow"
            context={moveGroupPickerContext}
            fill="var(--tm-header-group-picker-surface)"
            height={6}
            stroke="var(--tm-header-group-picker-border)"
            strokeWidth={1}
            tipRadius={2}
            width={12}
          />
        </motion.div>
      </FloatingPortal>
    );
  };

  const renderUngroupedTabRow = (tab: TabSnapshot) => (
    <SortableTabRow
      compact={isCompactWorkspace}
      dragSortingLocked={activeDragTabId !== null || activeDragGroupId !== null}
      dragPreview={activeDragTabId === tab.id}
      displayIndex={getDisplayIndex(tab.id)}
      menuOpen={openActionMenuTabId === tab.id}
      key={tab.id}
      labelMap={t}
      overDropId={overDropId}
      overDropPosition={overDropPosition}
      selectable
      selected={selectedIds.has(tab.id)}
      tab={tab}
      onClose={() =>
        void execute(t.close, async () => {
          await closeTabs([tab.id]);
        })
      }
      onFocus={() => handleFocusTab(tab)}
      onMute={() =>
        void execute(tab.muted ? t.unmute : t.mute, async () => {
          await muteTabs([tab.id], !tab.muted);
        })
      }
      onSleep={() =>
        void execute(t.sleep, async () => {
          await discardTabs([tab.id]);
        })
      }
      onPin={() =>
        void execute(tab.pinned ? t.unpin : t.pin, async () => {
          await pinTabs([tab.id], !tab.pinned);
        })
      }
      onOpenDetail={() => void openTabDetail(tab)}
      onSetMoreOpen={(open) =>
        setOpenActionMenuTabId((current) => {
          if (open) return tab.id;
          return current === tab.id ? null : current;
        })
      }
      onToggleSelect={() =>
        setSelectedIds((current) => {
          const next = new Set(current);
          if (next.has(tab.id)) next.delete(tab.id);
          else next.add(tab.id);
          return next;
        })
      }
    />
  );

  const renderGroupedEntry = (entry: GroupedEntry) => {
    const autoGroupConfig =
      settings.autoGroupConfigs.find((config) => config.id === entry.group.autoGroupConfigId) ??
      findAutoGroupConfigForGroup(settings.autoGroupConfigs, entry.group.title, entry.tabs);

    return (
      <GroupTreeBlock
        autoGroupSaved={autoGroupConfig !== null}
        autoOpenEditMenu={pendingAutoOpenGroupEditorId === entry.group.id}
        compact={isCompactWorkspace}
      dragSortingLocked={activeDragTabId !== null || activeDragGroupId !== null}
      key={entry.group.id}
      dragPreviewId={activeDragGroupId}
      getDisplayIndex={getDisplayIndex}
      openActionMenuTabId={openActionMenuTabId}
      expanded={deferredQuery.length > 0 || expandedGroups.has(entry.group.id)}
      group={entry.group}
      labelMap={t}
      overDropId={overDropId}
      overDropPosition={overDropPosition}
      tabs={entry.tabs}
      onCloseTab={(tabId) =>
        void execute(t.close, async () => {
          await closeTabs([tabId]);
        })
      }
      onUngroupTab={(tabId) =>
        void execute(t.ungroup, async () => {
          await ungroupTabs([tabId]);
        })
      }
      onUpdateGroupColor={(color) =>
        void execute(t.allColors, async () => {
          await updateGroup(entry.group.id, {
            color
          });
        }, { silentStatus: true, soft: true })
      }
      onAddTabToGroup={() =>
        void execute(t.addTabToGroup, async () => {
          const anchorTab = entry.tabs.reduce<TabSnapshot | null>((current, tab) => {
            if (!current) return tab;
            return tab.index > current.index ? tab : current;
          }, null);
          if (!anchorTab) return;

          const createdTab = await chrome.tabs.create({
            active: true,
            index: anchorTab.index + 1,
            windowId: anchorTab.windowId
          });

          if (createdTab.id != null) {
            await groupTabs([createdTab.id], { groupId: entry.group.id });
          }
        }, { silentStatus: true, soft: true })
      }
      onSaveAsAutoGroup={() => void saveGroupAsAutoGroup(entry.group, entry.tabs)}
      onUngroupGroup={() =>
        void execute(t.ungroup, async () => {
          await ungroupTabs(entry.tabs.map((tab) => tab.id));
        }, { silentStatus: true, soft: true })
      }
      onDeleteGroup={() =>
        void execute(t.deleteGroup, async () => {
          await closeTabs(entry.tabs.map((tab) => tab.id));
        }, { silentStatus: true, soft: true })
      }
      onAutoOpenEditMenuHandled={() => setPendingAutoOpenGroupEditorId(null)}
      onFocusTab={(tab) => handleFocusTab(tab)}
      onMuteTab={(tab) =>
        void execute(tab.muted ? t.unmute : t.mute, async () => {
          await muteTabs([tab.id], !tab.muted);
        })
      }
      onSleepTab={(tab) =>
        void execute(t.sleep, async () => {
          await discardTabs([tab.id]);
        })
      }
      onPinTab={(tab) =>
        void execute(tab.pinned ? t.unpin : t.pin, async () => {
          await pinTabs([tab.id], !tab.pinned);
        })
      }
      onOpenDetail={(tab) => void openTabDetail(tab)}
      onSetMoreOpen={(tabId, open) =>
        setOpenActionMenuTabId((current) => {
          if (open) return tabId;
          return current === tabId ? null : current;
        })
      }
      onToggleExpand={() =>
        void (async () => {
          const nextExpanded = !expandedGroups.has(entry.group.id);

          setExpandedGroups((current) => {
            const next = new Set(current);
            if (nextExpanded) next.add(entry.group.id);
            else next.delete(entry.group.id);
            return next;
          });

          if (nextExpanded && entry.group.collapsed) {
            await execute(t.expandGroup, async () => {
              await updateGroup(entry.group.id, {
                collapsed: false
              });
            }, { silentStatus: true, soft: true });
          }

          if (!nextExpanded && !entry.group.collapsed) {
            await execute(t.collapseGroup, async () => {
              await updateGroup(entry.group.id, {
                collapsed: true
              });
            }, { silentStatus: true, soft: true });
          }
        })()
      }
      onSaveGroup={(nextTitle) =>
        void execute(t.editGroup, async () => {
          await updateGroup(entry.group.id, {
            title: nextTitle.trim() || entry.group.title
          });
        }, { silentStatus: true, soft: true })
      }
      onToggleSelect={(tabId) =>
        setSelectedIds((current) => {
          const next = new Set(current);
          if (next.has(tabId)) next.delete(tabId);
          else next.add(tabId);
          return next;
        })
      }
      selectedIds={selectedIds}
      />
    );
  };

  const renderUngroupedEntry = (entry: UngroupedEntry) => (
    <UngroupedTabsSection entry={entry} renderTabRow={renderUngroupedTabRow} />
  );

  return (
    <div
      className={
        isEmbeddedDashboard
          ? 'tm-dashboard-tabs-embed-root'
          : mode === 'popup'
            ? 'tm-shell tm-shell-popup'
            : 'tm-shell'
      }
    >
      <div
        className={isEmbeddedDashboard ? 'tm-dashboard-tabs-embed tm-app' : 'tm-app'}
        data-mode={mode}
      >
        <div
          className={
            isSidepanel
              ? 'tm-sidepanel-frame tm-scrollbar'
              : mode === 'popup'
                ? 'tm-popup-frame tm-scrollbar'
                : undefined
          }
          data-scrolling={isSidepanel ? 'false' : undefined}
          onScroll={isSidepanel ? () => markScrollbarActive(sidepanelScrollRef.current) : undefined}
          ref={isSidepanel ? sidepanelScrollRef : undefined}
        >
          <section
            className={`tm-panel tm-searchbar${isCompactWorkspace ? ' tm-searchbar-sidepanel' : ''}`}
            ref={isSidepanel ? sidepanelHeaderRef : undefined}
          >
            {isCompactWorkspace ? (
              <>
                <div className="tm-search-row tm-search-row-sidepanel tm-search-row-sidepanel-primary">
                  <label className="tm-input tm-input-search tm-input-search-sidepanel">
                    <RiSearchLine size={16} />
                    <input
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t.searchPlaceholder}
                      value={query}
                    />
                  </label>
                  <div className="tm-sidepanel-settings-popover-root">
                    {mode === 'popup' ? (
                      <Tooltip content={t.sidePanel}>
                        <button
                          className="tm-button tm-button-sidepanel tm-button-sidepanel-icon"
                          aria-label={t.sidePanel}
                          type="button"
                          onClick={() => void launchSidePanelFromPopup()}
                        >
                          <RiLayoutRightLine size={14} />
                        </button>
                      </Tooltip>
                    ) : null}
                    <Tooltip content={t.dashboard}>
                      <button
                        className="tm-button tm-button-sidepanel tm-button-sidepanel-icon tm-sidepanel-dashboard-launcher"
                        aria-label={t.dashboard}
                        type="button"
                        onClick={() => void openDashboardPage()}
                      >
                        <RiDashboardLine size={14} />
                      </button>
                    </Tooltip>
                  </div>
                </div>

                {hasCompactViewTabs && (settings.sidepanelShowSnapshots || settings.sidepanelShowBookmarks) ? (
                  <SidepanelViewTabs
                    activeView={
                      sidepanelView === 'bookmarks'
                        ? 'bookmarks'
                        : sidepanelView === 'sessions'
                          ? 'sessions'
                          : 'tabs'
                    }
                    bookmarksCount={bookmarks.totalBookmarks}
                    bookmarksLabel={t.navBookmarks}
                    label={t.navViews}
                    meta={bookmarksSearchMeta}
                    onSwitch={(nextView) => setSidepanelView(nextView)}
                    sessionsCount={sessions.totalSessions}
                    sessionsLabel={t.navSnapshots}
                    showBookmarks={settings.sidepanelShowBookmarks}
                    showSnapshots={settings.sidepanelShowSnapshots}
                    tabsCount={allTabs.length}
                    tabsLabel={t.navTabs}
                  />
                ) : null}

                {!hasCompactViewTabs || sidepanelView === 'tabs' ? (
                  <div className="tm-tree-header tm-tree-header-sidepanel tm-tree-header-sidepanel-merged">
                    <div className="tm-action-overview tm-action-overview-compact tm-action-overview-selection">
                    <Tooltip content={t.selectVisible} disabled={visibleTabs.length === 0}>
                      <label className="tm-selection-toggle">
                        <input
                          ref={selectVisibleCheckboxRef}
                          checked={allVisibleSelected}
                          disabled={visibleTabs.length === 0}
                          onChange={toggleVisibleSelection}
                          type="checkbox"
                        />
                      </label>
                    </Tooltip>
                    <strong>{selectedCount}</strong>
                    <span>{t.selected}</span>
                    <Tooltip content={t.clearSelectionHint} disabled={selectedCount === 0}>
                      <button
                        aria-label={t.clearSelection}
                        className="tm-selection-clear-button"
                        disabled={selectedCount === 0}
                        onClick={clearSelectionState}
                        type="button"
                      >
                        <RiBrushLine size={13} />
                      </button>
                  </Tooltip>
                  </div>

                  <div className="tm-action-group tm-action-group-compact">
                    <div className="tm-header-picker" data-filter-picker-root="true" data-open={showFilterPicker}>
                      <button
                        ref={filterPickerRefs.setReference}
                        aria-label={t.filter}
                        className="tm-icon-button tm-header-picker-trigger"
                        data-open={showFilterPicker}
                        type="button"
                        {...getFilterPickerReferenceProps({
                          onMouseEnter: () => closeMoveGroupPicker()
                        })}
                      >
                        <RiFilter3Line size={13} />
                      </button>

                      <AnimatePresence initial={false}>{renderFilterPickerPanel()}</AnimatePresence>
                    </div>

                    <div
                      className="tm-header-picker"
                      data-duplicate-tabs-root="true"
                      data-open={showDuplicateTabsMenu}
                    >
                      <button
                        ref={duplicateTabsMenuRefs.setReference}
                        aria-label={t.deduplicateTabs}
                        className="tm-icon-button tm-header-picker-trigger tm-sidepanel-dedupe-trigger"
                        data-open={showDuplicateTabsMenu}
                        title={t.deduplicateTabs}
                        type="button"
                        {...getDuplicateTabsMenuReferenceProps({
                          onMouseEnter: () => {
                            setShowFilterPicker(false);
                            closeMoveGroupPicker();
                          }
                        })}
                      >
                        <RiFileCopyLine size={13} />
                        {duplicateTabCount > 0 ? <em>{duplicateTabCount}</em> : null}
                      </button>

                      <AnimatePresence initial={false}>{renderDuplicateTabsMenu()}</AnimatePresence>
                    </div>

                    <div
                      className="tm-header-picker"
                      data-group-picker-root="true"
                      data-open={moveGroupPickerOpen}
                    >
                      <button
                        ref={moveGroupPickerRefs.setReference}
                        aria-label={t.moveToGroup}
                        className="tm-icon-button tm-header-picker-trigger"
                        data-open={moveGroupPickerOpen}
                        type="button"
                        {...getMoveGroupPickerReferenceProps({
                          onMouseEnter: () => {
                            setShowFilterPicker(false);
                            setShowDuplicateTabsMenu(false);
                          }
                        })}
                      >
                        <RiFolderLine size={13} />
                      </button>

                      <AnimatePresence initial={false}>{renderMoveGroupPickerPanel()}</AnimatePresence>
                    </div>
                    <Tooltip content={t.close} disabled={selectedCount === 0}>
                      <button
                        aria-label={t.close}
                        className="tm-icon-button-danger"
                        disabled={selectedCount === 0}
                        onClick={() =>
                          void execute(
                            t.close,
                            async () => {
                              await closeTabs(selectedTabs.map((tab) => tab.id));
                            },
                            { clearSelection: true }
                          )
                        }
                        type="button"
                      >
                        <RiCloseLine size={13} />
                      </button>
                      </Tooltip>
                    </div>
                  </div>
                ) : null}
              </>
            ) : isEmbeddedDashboard ? (
              <div className="tm-dashboard-tabs-top-row">
                {showHistory ? (
                  <div className="tm-dashboard-tabs-nav-row">
                    <SegmentedSwitch
                      ariaLabel={t.navTabs}
                      className="tm-dashboard-tabs-view-switch"
                      onChange={setDashboardTabsSubView}
                      optionClassName="tm-dashboard-tabs-view-button"
                      options={[
                        { value: 'current', label: t.navTabs, meta: visibleTabs.length },
                        { value: 'history', label: t.historyTabs, meta: historyTabs.length }
                      ]}
                      value={dashboardTabsSubView}
                    />
                  </div>
                ) : null}
                <div className="tm-search-row tm-search-row-dashboard">
                  <label className="tm-input tm-input-search tm-input-search-dashboard">
                    <RiSearchLine size={15} />
                    <input
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t.searchPlaceholder}
                      value={query}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className={isEmbeddedDashboard ? 'tm-search-row tm-search-row-dashboard' : 'tm-search-row'}>
                <label className={isEmbeddedDashboard ? 'tm-input tm-input-search tm-input-search-dashboard' : 'tm-input tm-input-search'}>
                  <RiSearchLine size={15} />
                  <input
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t.searchPlaceholder}
                    value={query}
                  />
                </label>

                {isEmbeddedDashboard ? null : (
                  <div className="tm-toolbar-controls">
                    <select
                      className="tm-select tm-select-inline"
                      onChange={(event) => setSortMode(event.target.value as TabSort)}
                      title={t.browserOrder}
                      value={sortMode}
                    >
                      {sortChoices.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.label}
                        </option>
                      ))}
                    </select>

                    <IconButton icon={RiRefreshLine} label={t.refreshed} onClick={() => void load()} />
                    <button
                      className={showTools ? 'tm-button-primary' : 'tm-button'}
                      onClick={() => setShowTools((current) => !current)}
                      title={showTools ? t.hideTools : t.showTools}
                      type="button"
                    >
                      <RiFolderLine size={14} />
                      {t.organize}
                    </button>
                    {mode === 'dashboard' ? (
                      <IconButton
                        icon={RiArrowRightUpLine}
                        label={t.sidePanel}
                        onClick={() => void launchAlternate()}
                      />
                    ) : (
                      <button
                        className="tm-button-primary"
                        onClick={() => void launchAlternate()}
                        title={t.openWorkspace}
                        type="button"
                      >
                        {t.openWorkspace}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {!isEmbeddedDashboard && !isCompactWorkspace ? (
              <div>
                <div className="tm-chip-row">
                  {smartViews
                    .filter((view) =>
                      isEmbeddedDashboard ? primaryViews.includes(view.id) : showTools ? true : primaryViews.includes(view.id)
                    )
                    .map((view) => (
                      <button
                        key={view.id}
                        className="tm-chip-button"
                        data-active={smartView === view.id}
                        onClick={() => setSmartView(view.id)}
                        type="button"
                      >
                        <view.icon size={14} />
                        {view.label}
                        <span className="tm-chip-count">{getViewCount(allTabs, view.id)}</span>
                      </button>
                    ))}
                </div>

              </div>
            ) : null}
            </section>

          {isCompactWorkspace || isEmbeddedDashboard ? null : showTools ? (
            <section className="tm-panel tm-action-strip tm-organize-strip">
              <div className="tm-action-primary">
                <div className="tm-action-overview">
                  <strong>{`${visibleTabs.length} ${t.shown}`}</strong>
                  <span>{t.organize}</span>
                </div>

                <div className="tm-action-group">
                  <button
                    className="tm-button"
                    onClick={() => void handleSmartGrouping('domain')}
                    title={t.smartByDomain}
                    type="button"
                  >
                    <RiGlobalLine size={13} />
                    {t.smartByDomain}
                  </button>
                  <button
                    className="tm-button"
                    onClick={() => void handleSmartGrouping('site-type')}
                    title={t.smartByType}
                    type="button"
                  >
                    <RiShining2Line size={13} />
                    {t.smartByType}
                  </button>
                  <Tooltip content={t.createGroup}>
                    <button
                      aria-label={t.createGroup}
                      className="tm-button-primary"
                      onClick={() => void handleCreateEmptyGroup()}
                      type="button"
                    >
                      <RiAddCircleLine size={13} />
                      {t.newGroup}
                    </button>
                  </Tooltip>
                </div>
              </div>
            </section>
          ) : null}

          {isEmbeddedDashboard && dashboardTabsSubView === 'current' ? (
            <div className="tm-dashboard-tabs-filter-row">
              <div className="tm-dashboard-tabs-filter-group">
                <div className="tm-dashboard-zero-selection">
                  <button
                    aria-label={t.selectVisible}
                    className="tm-dashboard-zero-select-toggle"
                    data-state={allVisibleSelected ? 'all' : partiallyVisibleSelected ? 'partial' : 'none'}
                    disabled={visibleTabs.length === 0}
                    onClick={toggleVisibleSelection}
                    title={t.selectVisible}
                    type="button"
                  >
                    <span className="tm-dashboard-zero-count">{selectedCount}</span>
                    <span className="tm-dashboard-zero-checkbox" aria-hidden="true" />
                  </button>
                  <span>{t.selected}</span>
                  {selectedCount > 0 ? (
                    <button
                      className="tm-selection-clear-text"
                      onClick={clearSelectionState}
                      type="button"
                    >
                      <RiCloseLine size={13} />
                      {t.clearSelection}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="tm-action-group tm-dashboard-inline-actions">
                {selectedCount === 0 ? (
                  <>
                    <div className="tm-header-picker" data-filter-picker-root="true" data-open={showFilterPicker}>
                      <button
                        ref={filterPickerRefs.setReference}
                        aria-label={t.filter}
                        className="tm-button tm-dashboard-filter-trigger"
                        data-open={showFilterPicker}
                        title={t.filter}
                        type="button"
                        {...getFilterPickerReferenceProps({
                          onMouseEnter: () => {
                            setShowDashboardOrganizeMenu(false);
                            setShowDuplicateTabsMenu(false);
                          }
                        })}
                      >
                        <RiFilter3Line size={13} />
                        <span>{groupFilterLabel}</span>
                        <RiArrowDownSLine className="tm-dashboard-trigger-chevron" size={14} />
                      </button>

                      <AnimatePresence initial={false}>{renderFilterPickerPanel()}</AnimatePresence>
                    </div>
                    <div
                      className="tm-header-picker"
                      data-duplicate-tabs-root="true"
                      data-open={showDuplicateTabsMenu}
                    >
                      <button
                        ref={duplicateTabsMenuRefs.setReference}
                        aria-label={t.deduplicateTabs}
                        className="tm-button tm-dashboard-dedupe-trigger"
                        data-open={showDuplicateTabsMenu}
                        title={t.deduplicateTabs}
                        type="button"
                        {...getDuplicateTabsMenuReferenceProps({
                          onMouseEnter: () => {
                            setShowFilterPicker(false);
                            setShowDashboardOrganizeMenu(false);
                          }
                        })}
                      >
                        <RiFileCopyLine size={13} />
                        <span>{t.deduplicateTabs}</span>
                        {duplicateTabCount > 0 ? <em>{duplicateTabCount}</em> : null}
                        <RiArrowDownSLine className="tm-dashboard-trigger-chevron" size={14} />
                      </button>

                      <AnimatePresence initial={false}>{renderDuplicateTabsMenu()}</AnimatePresence>
                    </div>
                    <div
                      className="tm-header-picker"
                      data-dashboard-organize-root="true"
                      data-open={showDashboardOrganizeMenu}
                    >
                      <button
                        ref={dashboardOrganizeMenuRefs.setReference}
                        aria-label={t.organize}
                        className="tm-button tm-dashboard-organize-trigger"
                        data-open={showDashboardOrganizeMenu}
                        title={t.organize}
                        type="button"
                        {...getDashboardOrganizeMenuReferenceProps({
                          onMouseEnter: () => {
                            setShowFilterPicker(false);
                            setShowDuplicateTabsMenu(false);
                          }
                        })}
                      >
                        <RiShining2Line size={13} />
                        {t.organize}
                      </button>

                      <AnimatePresence initial={false}>{renderDashboardOrganizeMenu()}</AnimatePresence>
                    </div>
                    <Tooltip content={t.createGroup}>
                      <button
                        aria-label={t.createGroup}
                        className="tm-button-primary"
                        onClick={() => void handleCreateEmptyGroup()}
                        type="button"
                      >
                        <RiAddCircleLine size={13} />
                        {t.newGroup}
                      </button>
                    </Tooltip>
                  </>
                ) : (
                  <>
                    <div
                      className="tm-header-picker tm-header-picker-batch"
                      data-group-picker-root="true"
                      data-open={moveGroupPickerOpen}
                    >
                      <button
                        ref={moveGroupPickerRefs.setReference}
                        aria-label={t.moveToGroup}
                        className="tm-button tm-header-picker-trigger tm-batch-group-trigger"
                        data-open={moveGroupPickerOpen}
                        type="button"
                        {...getMoveGroupPickerReferenceProps()}
                      >
                        <RiFolderLine size={13} />
                        {t.moveToGroup}
                      </button>

                      <AnimatePresence initial={false}>{renderMoveGroupPickerPanel()}</AnimatePresence>
                    </div>
                    <button
                      className="tm-button-primary"
                      onClick={() => void handleCreateSelectionGroup()}
                      title={t.createGroup}
                      type="button"
                    >
                      <RiAddCircleLine size={13} />
                      {t.newGroup}
                    </button>
                    <button
                      className="tm-button tm-button-danger"
                      onClick={() =>
                        void execute(t.close, async () => {
                          await closeTabs(selectedTabs.map((tab) => tab.id));
                        }, { clearSelection: true })
                      }
                      title={t.close}
                      type="button"
                    >
                      <RiCloseLine size={13} />
                      {t.close}
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {isCompactWorkspace || isEmbeddedDashboard || (isEmbeddedDashboard && dashboardTabsSubView !== 'current') ? null : selectedCount > 0 ? (
            <section
              className={
                isEmbeddedDashboard
                  ? 'tm-panel tm-action-strip tm-selection-strip tm-selection-strip-dashboard'
                  : 'tm-panel tm-action-strip tm-selection-strip'
              }
            >
              <div className="tm-action-primary">
                <div className="tm-action-overview tm-selection-status">
                  <strong>{isEmbeddedDashboard ? t.selectedItems : `${selectedCount} ${t.selected}`}</strong>
                  {isEmbeddedDashboard ? <span>{selectedCount}</span> : null}
                  {isEmbeddedDashboard ? (
                    <button
                      className="tm-selection-clear-text"
                      onClick={clearSelectionState}
                      type="button"
                    >
                      <RiCloseLine size={13} />
                      {t.clearSelection}
                    </button>
                  ) : (
                    <span>{t.moveToGroup}</span>
                  )}
                </div>

                <div className="tm-action-group">
                  {isEmbeddedDashboard ? null : (
                    <button
                      className="tm-button"
                      onClick={toggleVisibleSelection}
                      title={t.selectVisible}
                      type="button"
                    >
                      {visibleTabs.every((tab) => selectedIds.has(tab.id)) ? t.clearVisible : t.selectVisible}
                    </button>
                  )}
                  <div
                    className="tm-header-picker tm-header-picker-batch"
                    data-group-picker-root="true"
                    data-open={moveGroupPickerOpen}
                  >
                    <button
                      ref={moveGroupPickerRefs.setReference}
                      aria-label={t.moveToGroup}
                      className="tm-button tm-header-picker-trigger tm-batch-group-trigger"
                      data-open={moveGroupPickerOpen}
                      type="button"
                      {...getMoveGroupPickerReferenceProps()}
                    >
                      <RiFolderLine size={13} />
                      {t.moveToGroup}
                    </button>

                    <AnimatePresence initial={false}>{renderMoveGroupPickerPanel()}</AnimatePresence>
                  </div>
                  <button
                    className={isEmbeddedDashboard ? 'tm-button-primary' : 'tm-button'}
                    onClick={() => void handleCreateSelectionGroup()}
                    title={t.createGroup}
                    type="button"
                  >
                    <RiAddCircleLine size={13} />
                    {isEmbeddedDashboard ? t.newGroup : t.createGroup}
                  </button>
                  {isEmbeddedDashboard ? null : (
                    <>
                      <button
                        className="tm-button"
                        onClick={() =>
                          void execute(selectedPinned ? t.unpin : t.pin, async () => {
                            await pinTabs(
                              selectedTabs.map((tab) => tab.id),
                              !selectedPinned
                            );
                          })
                        }
                        title={selectedPinned ? t.unpin : t.pin}
                        type="button"
                      >
                        <RiPushpin2Line size={13} />
                        {selectedPinned ? t.unpin : t.pin}
                      </button>
                      <button
                        className="tm-button"
                        onClick={() =>
                          void execute(selectedMuted ? t.unmute : t.mute, async () => {
                            await muteTabs(
                              selectedTabs.map((tab) => tab.id),
                              !selectedMuted
                            );
                          })
                        }
                        title={selectedMuted ? t.unmute : t.mute}
                        type="button"
                      >
                        <RiVolumeMuteLine size={13} />
                        {selectedMuted ? t.unmute : t.mute}
                      </button>
                      <button
                        className="tm-button"
                        disabled={!selectedGrouped}
                        onClick={() =>
                          void execute(t.ungroup, async () => {
                            await ungroupTabs(selectedTabs.map((tab) => tab.id));
                          })
                        }
                        title={t.ungroup}
                        type="button"
                      >
                        {t.ungroup}
                      </button>
                    </>
                  )}
                  <button
                    className="tm-button tm-button-danger"
                    onClick={() =>
                      void execute(t.close, async () => {
                        await closeTabs(selectedTabs.map((tab) => tab.id));
                      }, { clearSelection: true })
                    }
                    title={t.close}
                    type="button"
                  >
                    <RiCloseLine size={13} />
                    {t.close}
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {showingSessionsManager ? (
            <SessionsManagerView
              isSidepanel={isCompactWorkspace}
              locale={locale}
              query={deferredQuery}
              refreshSessions={refreshSessions}
              scrollRef={sidepanelTreeShellRef}
              openUrls={allTabs.map((tab) => tab.url)}
              sessions={sessions.sessions}
            />
          ) : showingBookmarksManager ? (
            <BookmarksManagerView
              bookmarks={visibleBookmarks}
              isSidepanel={isCompactWorkspace}
              locale={locale}
              query={deferredQuery}
              refreshBookmarks={refreshBookmarks}
              scrollRef={sidepanelTreeShellRef}
            />
          ) : isEmbeddedDashboard && showHistory && dashboardTabsSubView === 'history' ? (
            <main className="tm-dashboard-tabs-history-view">
              {visibleHistoryTabs.length > 0 ? (
                <HistoryTabsSection
                  collapsible={false}
                  historyTabs={visibleHistoryTabs}
                  locale={locale}
                  onOpenDetail={(historyTab) => void openHistoryTabDetail(historyTab)}
                  onOpenTab={(historyTab) => void reopenHistoryTab(historyTab)}
                  t={t}
                />
              ) : (
                <div className="tm-empty">
                  <RiTimeLine size={16} />
                  <div>
                    <div className="font-medium">{t.noMatch}</div>
                    <div className="tm-subtle">{t.noMatchHint}</div>
                  </div>
                </div>
              )}
            </main>
          ) : (
            <TabsWorkspaceView
              activeDragGroupColor={activeDragGroup?.group.color as TabGroupColor | undefined}
              activeDragGroupId={activeDragGroupId}
              collisionDetection={collisionDetectionStrategy}
              dragOverlayState={dragOverlayState}
              entries={entries}
              historyContent={
                showHistory && !isEmbeddedDashboard && historyTabs.length > 0 ? (
                  <HistoryTabsSection
                    historyTabs={historyTabs}
                    locale={locale}
                    onOpenDetail={(historyTab) => void openHistoryTabDetail(historyTab)}
                    onOpenTab={(historyTab) => void reopenHistoryTab(historyTab)}
                    t={t}
                  />
                ) : null
              }
              isSidepanel={isCompactWorkspace}
              markScrollbarActive={markScrollbarActive}
              onDragCancel={resetDragState}
              onDragEnd={(event) => void handleDragEnd(event)}
              onDragMove={handleDragMove}
              onDragOver={handleDragOver}
              onDragStart={handleDragStart}
              renderEntry={(entry) =>
                renderTabsEntry({
                  entry,
                  renderGroupedEntry: (grouped) => (
                    <GroupedTabsSection entry={grouped} renderGroupBlock={renderGroupedEntry} />
                  ),
                  renderUngroupedEntry
                })
              }
              scrollRef={sidepanelTreeShellRef}
              sensors={sensors}
              showCreateGroupDropZone={showTools && (activeDragTabId !== null || activeDragGroupId !== null)}
              t={t}
              treeListScrollRef={treeListScrollRef}
              visibleTabs={visibleTabs}
            />
          )}

        </div>
        {isCompactWorkspace ? (
          <div
            className={
              isSidepanel
                ? 'tm-sidepanel-footer tm-sidepanel-dashboard-shortcuts'
                : 'tm-popup-footer tm-sidepanel-dashboard-shortcuts'
            }
          >
            <button
              aria-label={t.navAutomation}
              className="tm-sidepanel-dashboard-shortcut"
              onClick={() => void openDashboardPage('automation')}
              title={t.navAutomation}
              type="button"
            >
              <RiNodeTree size={12} />
              <span>{t.navAutomation}</span>
            </button>
            <button
              aria-label={t.autoDeduplicate}
              className="tm-sidepanel-dashboard-shortcut"
              onClick={() => void openDashboardPage('deduplication')}
              title={t.autoDeduplicate}
              type="button"
            >
              <RiFilterOffLine size={12} />
              <span>{t.autoDeduplicate}</span>
            </button>
            <button
              aria-label={t.settings}
              className="tm-sidepanel-dashboard-shortcut tm-sidepanel-dashboard-shortcut-icon"
              onClick={() => void openDashboardPage('settings')}
              title={t.settings}
              type="button"
            >
              <RiSettings3Line size={12} />
            </button>
          </div>
        ) : null}
        {isSidepanel ? (
          <div
            className="tm-sidepanel-scrollbar"
            data-dragging={sidepanelScrollbarUi.dragging}
            data-hidden={!sidepanelScrollbarUi.enabled}
            style={{ top: sidepanelScrollbarUi.headerHeight + 6 }}
          >
            <div
              className="tm-sidepanel-scrollbar-track"
              onPointerDown={handleSidepanelScrollbarPointerDown}
              ref={sidepanelScrollbarTrackRef}
            >
              <div
                className="tm-sidepanel-scrollbar-thumb"
                data-scrollbar-thumb="true"
                style={{
                  height: sidepanelScrollbarUi.thumbHeight,
                  transform: `translateY(${sidepanelScrollbarUi.thumbOffset}px)`
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {detailTabId != null ? (
          <TabDetailModal
            detail={tabDetail}
            error={detailError}
            loading={detailLoading}
            locale={locale}
            onCopyUrl={(url) => void copyUrl(url)}
            onClose={closeTabDetail}
            t={t}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {status ? (
          <div className="tm-toast-slot">
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="tm-toast"
              exit={{ opacity: 0, y: -6 }}
              initial={{ opacity: 0, y: -6 }}
            >
              {status}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {error ? (
          <div className="tm-toast-slot" style={{ top: status ? 56 : 12 }}>
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="tm-toast tm-toast-error"
              exit={{ opacity: 0, y: -6 }}
              initial={{ opacity: 0, y: -6 }}
            >
              {error}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
