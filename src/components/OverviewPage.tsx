import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DragEndEvent,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  SortableContext,
  defaultAnimateLayoutChanges,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import {
  FloatingArrow,
  FloatingPortal,
  arrow,
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
  useClick,
  useDismiss,
  useFocus,
  useFloating,
  useHover,
  useInteractions,
  useRole
} from '@floating-ui/react';
import { CSS } from '@dnd-kit/utilities';
import {
  RiAddCircleLine,
  RiArticleLine,
  RiArrowDownSLine,
  RiArrowRightUpLine,
  RiBrushLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiFileCopyLine,
  RiFilter3Line,
  RiDragMove2Line,
  RiFolderLine,
  RiGlobalLine,
  RiLayoutGridLine,
  RiMore2Line,
  RiMoonFill,
  RiMoonLine,
  RiPaletteLine,
  RiPriceTag3Line,
  RiPushpin2Fill,
  RiPushpin2Line,
  RiRefreshLine,
  RiSearchLine,
  RiScissorsCutLine,
  RiSettings3Line,
  RiShining2Line,
  RiSoundModuleLine,
  RiUnpinLine,
  RiSunLine,
  RiTimeLine,
  RiVolumeMuteFill,
  RiVolumeMuteLine,
  RiVolumeUpLine,
  type RemixiconComponentType
} from '@remixicon/react';
import { AnimatePresence, motion } from 'motion/react';
import {
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';

import { Tooltip } from './Tooltip';
import type {
  AutoGroupRule,
  HistoryTabSnapshot,
  ManagerSettings,
  OverviewSnapshot,
  SmartGroupStrategy,
  TabDetailSnapshot,
  TabGroupColor,
  TabGroupSnapshot,
  TabHistoryEvent,
  TabSnapshot
} from '../lib/contracts';
import {
  defaultAutoGroupPresets,
  getDefaultAutoGroupPresetTitle
} from '../lib/auto-group-defaults';
import { formatDuration, formatRelativeTime, getErrorMessage } from '../lib/format';
import { getMessages, resolveLocale, type Messages } from '../lib/i18n';
import {
  closeTabs,
  discardTabs,
  focusTab,
  getTabDetail,
  getOverview,
  groupTabs,
  moveTabAfter,
  moveTabBefore,
  moveTabsAfter,
  moveTabsBefore,
  muteTabs,
  openDashboardPage,
  openSidePanel,
  pinTabs,
  smartGroupTabs,
  subscribeToOverviewUpdates,
  ungroupTabs,
  updateGroup
} from '../lib/runtime-client';
import { defaultSettings, getSettings, updateSettings } from '../lib/settings';
import { allGroupColors, applyTheme, groupColorTokens, resolveTheme } from '../lib/theme';

type SurfaceMode = 'popup' | 'sidepanel' | 'dashboard';
type SmartView = 'all' | 'ungrouped' | 'grouped' | 'sleeping' | 'audible' | 'pinned' | 'stale';
type TabSort = 'manual' | 'recent' | 'opened-time' | 'title' | 'active-time';
type DropPosition = 'before' | 'after' | 'inside';
type GroupFilter = 'all' | 'ungrouped' | `${number}`;
type ListEntry =
  | { type: 'ungrouped'; tabs: TabSnapshot[] }
  | { type: 'group'; group: TabGroupSnapshot; tabs: TabSnapshot[] };

const primaryViews: SmartView[] = ['all', 'ungrouped', 'grouped'];
const secondaryViews: SmartView[] = ['audible', 'pinned', 'stale'];

interface OverviewPageProps {
  mode: SurfaceMode;
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
const collisionDetectionStrategy: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

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

function blockDrag(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

function createAutoGroupRule(): AutoGroupRule {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    field: 'url',
    operator: 'contains',
    value: ''
  };
}

function groupChipStyle(color: TabGroupColor): {
  backgroundColor: string;
  borderColor: string;
  color: string;
} {
  return {
    backgroundColor: groupColorTokens[color].soft,
    borderColor: groupColorTokens[color].ring,
    color: groupColorTokens[color].solid
  };
}

function parseDropId(id: string | number | undefined): { kind: 'tab' | 'group' | 'group-sort' | 'new'; id?: number } | null {
  if (typeof id !== 'string') return null;
  if (id === 'new-group-drop') return { kind: 'new' };
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

function formatAbsoluteDateTime(timestamp: number | null | undefined, locale: string): string {
  if (timestamp == null) return 'Unknown';

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp);
}

function formatTimelineTime(timestamp: number | null | undefined, locale: string): string {
  if (timestamp == null) return 'Unknown';

  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false
  }).format(timestamp);
}

export function OverviewPage({ mode }: OverviewPageProps) {
  const [settings, setSettings] = useState<ManagerSettings>(defaultSettings);
  const [overview, setOverview] = useState<OverviewSnapshot | null>(null);
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSettingsAutoGroupPicker, setShowSettingsAutoGroupPicker] = useState(false);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [moveGroupPickerOpen, setMoveGroupPickerOpen] = useState(false);
  const [pendingAutoOpenGroupEditorId, setPendingAutoOpenGroupEditorId] = useState<number | null>(null);
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [openActionMenuTabId, setOpenActionMenuTabId] = useState<number | null>(null);
  const [activeDragTabId, setActiveDragTabId] = useState<number | null>(null);
  const [activeDragGroupId, setActiveDragGroupId] = useState<number | null>(null);
  const [overDropId, setOverDropId] = useState<string | null>(null);
  const [overDropPosition, setOverDropPosition] = useState<DropPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragPointerYRef = useRef<number | null>(null);
  const selectVisibleCheckboxRef = useRef<HTMLInputElement | null>(null);
  const filterPickerArrowRef = useRef<SVGSVGElement | null>(null);
  const moveGroupPickerArrowRef = useRef<SVGSVGElement | null>(null);
  const settingsPopoverArrowRef = useRef<SVGSVGElement | null>(null);
  const settingsAutoGroupPickerArrowRef = useRef<SVGSVGElement | null>(null);
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
  const [sidepanelScrollbarUi, setSidepanelScrollbarUi] = useState({
    dragging: false,
    enabled: false,
    headerHeight: 0,
    thumbHeight: 0,
    thumbOffset: 0
  });

  const config = surfaceConfig[mode];
  const isSidepanel = mode === 'sidepanel';
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const resolvedTheme = resolveTheme(settings.theme);
  const locale = resolveLocale(settings.locale);
  const t = getMessages(settings.locale);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    })
  );

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

  const sidepanelFooterThemeChoices = useMemo(
    () => [
      { id: 'system' as const, label: t.system },
      { id: 'light' as const, label: t.light },
      { id: 'dark' as const, label: t.dark }
    ],
    [t]
  );

  const sidepanelFooterLocaleChoices = useMemo(
    () => [
      { id: 'en' as const, label: t.localeEnglish },
      { id: 'zh-CN' as const, label: t.localeChinese }
    ],
    [t]
  );

  const effectiveLocaleChoice = settings.locale === 'system' ? locale : settings.locale;
  const autoGroupStateCopy = settings.autoGroupEnabled
    ? locale === 'zh-CN'
      ? '按常见网站类型自动归组'
      : 'Group common site types automatically'
    : locale === 'zh-CN'
      ? '仅手动触发分组'
      : 'Group only when triggered manually';
  const settingsAutoGroupPresetLabels = useMemo(
    () =>
      defaultAutoGroupPresets.map((preset) => ({
        id: preset.id,
        label: getDefaultAutoGroupPresetTitle(preset, locale)
      })),
    [locale]
  );
  const settingsAutoGroupSummary = useMemo(() => {
    if (settings.autoGroupPresetIds.length === 0) return t.selectModules;

    const labels = settingsAutoGroupPresetLabels
      .filter((preset) => settings.autoGroupPresetIds.includes(preset.id))
      .map((preset) => preset.label);

    if (labels.length <= 2) return labels.join(' · ');
    return locale === 'zh-CN' ? `已选 ${labels.length} 项` : `${labels.length} selected`;
  }, [locale, settings.autoGroupPresetIds, settingsAutoGroupPresetLabels, t.selectModules]);

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
    setLoading(true);

    try {
      const [nextOverview, nextSettings] = await Promise.all([getOverview(), getSettings()]);
      setOverview(nextOverview);
      setSettings(nextSettings);
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  };

  const refreshOverview = async () => {
    try {
      const nextOverview = await getOverview();
      setOverview(nextOverview);
      setError(null);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    }
  };

  refreshOverviewRef.current = refreshOverview;

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    let refreshTimer: number | null = null;

    const unsubscribe = subscribeToOverviewUpdates(() => {
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
      }

      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void refreshOverviewRef.current();
      }, 48);
    });

    return () => {
      if (refreshTimer != null) {
        window.clearTimeout(refreshTimer);
      }

      unsubscribe();
    };
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

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

  useEffect(() => {
    if (!showSettingsModal) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSettingsModal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      setShowSettingsAutoGroupPicker(false);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSettingsModal]);

  const {
    refs: settingsPopoverRefs,
    floatingStyles: settingsPopoverStyles,
    context: settingsPopoverContext,
    placement: settingsPopoverPlacement
  } = useFloating({
    open: isSidepanel && showSettingsModal,
    onOpenChange: setShowSettingsModal,
    placement: 'bottom-end',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: settingsPopoverArrowRef, padding: 12 })]
  });
  const settingsPopoverClick = useClick(settingsPopoverContext, { event: 'click' });
  const settingsPopoverDismiss = useDismiss(settingsPopoverContext);
  const settingsPopoverRole = useRole(settingsPopoverContext, { role: 'dialog' });
  const {
    getReferenceProps: getSettingsPopoverReferenceProps,
    getFloatingProps: getSettingsPopoverFloatingProps
  } = useInteractions([settingsPopoverClick, settingsPopoverDismiss, settingsPopoverRole]);
  const {
    refs: settingsAutoGroupPickerRefs,
    floatingStyles: settingsAutoGroupPickerStyles,
    context: settingsAutoGroupPickerContext,
    placement: settingsAutoGroupPickerPlacement
  } = useFloating({
    open: showSettingsAutoGroupPicker,
    onOpenChange: setShowSettingsAutoGroupPicker,
    placement: 'bottom-start',
    strategy: 'absolute',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: settingsAutoGroupPickerArrowRef, padding: 8 })]
  });
  const settingsAutoGroupPickerClick = useClick(settingsAutoGroupPickerContext, { event: 'click' });
  const settingsAutoGroupPickerDismiss = useDismiss(settingsAutoGroupPickerContext, {
    outsidePress: true,
    escapeKey: true
  });
  const settingsAutoGroupPickerRole = useRole(settingsAutoGroupPickerContext, { role: 'listbox' });
  const {
    getReferenceProps: getSettingsAutoGroupPickerReferenceProps,
    getFloatingProps: getSettingsAutoGroupPickerFloatingProps
  } = useInteractions([settingsAutoGroupPickerClick, settingsAutoGroupPickerDismiss, settingsAutoGroupPickerRole]);

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
    move: false,
    delay: { open: 70, close: 80 },
    handleClose: safePolygon({ blockPointerEvents: true })
  });
  const filterPickerDismiss = useDismiss(filterPickerContext, {
    outsidePress: true,
    escapeKey: true
  });
  const filterPickerRole = useRole(filterPickerContext, { role: 'menu' });
  const {
    getReferenceProps: getFilterPickerReferenceProps,
    getFloatingProps: getFilterPickerFloatingProps
  } = useInteractions([filterPickerHover, filterPickerDismiss, filterPickerRole]);

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

  useEffect(() => {
    if (groups.length === 0) return;

    setExpandedGroups((current) => {
      if (current.size > 0) {
        return new Set([...current].filter((groupId) => groups.some((entry) => entry.group.id === groupId)));
      }

      return new Set(
        groups.filter((entry) => !entry.group.collapsed).map((entry) => entry.group.id)
      );
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
    const scoped = allTabs.filter(
      (tab) => matchesSmartView(tab, smartView) && matchesGroupFilter(tab, groupFilter)
    );
    const searched = scoped.filter((tab) => {
      if (!deferredQuery) return true;

      return [tab.title, tab.url, tab.hostname, tab.group?.title ?? '']
        .some((value) => value.toLowerCase().includes(deferredQuery));
    });

    return sortTabs(searched, sortMode);
  }, [allTabs, deferredQuery, groupFilter, smartView, sortMode]);

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
  const quickActionTabs = selectedCount > 0 ? selectedTabs : visibleTabs;
  const selectedGrouped = selectedTabs.some((tab) => tab.group != null);
  const activeDragTab = useMemo(
    () => allTabs.find((tab) => tab.id === activeDragTabId) ?? null,
    [activeDragTabId, allTabs]
  );
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
    options?: { clearSelection?: boolean; silentStatus?: boolean; soft?: boolean }
  ) => {
    if (!options?.soft) {
      setLoading(true);
    }

    try {
      await action();
      if (!options?.silentStatus) {
        setStatusMessage(successMessage);
      }
      if (options?.clearSelection) {
        setSelectedIds(new Set());
      }
      await refreshOverview();
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      if (!options?.soft) {
        setLoading(false);
      }
    }
  };

  const saveSetting = async (patch: Partial<ManagerSettings>) => {
    try {
      const next = await updateSettings(patch);
      setSettings(next);
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

  const createSelectionGroupAndOpenEditor = async () => {
    if (selectedCount === 0 || selectedTabs.length === 0) return;

    const anchorTab = selectedTabs[0] ?? null;
    const title = suggestGroupKeyword(anchorTab, t.newGroup);
    const color = colorFromSeed(title);

    setLoading(true);

    try {
      await groupTabs(
        selectedTabs.map((tab) => tab.id),
        { title, color }
      );

      const nextOverview = await getOverview();
      setOverview(nextOverview);
      setError(null);
      setStatusMessage(t.createdGroup);

      const nextGroupId = anchorTab
        ? nextOverview.tabs.find((tab) => tab.id === anchorTab.id)?.group?.id ?? null
        : null;

      if (nextGroupId != null) {
        setExpandedGroups((current) => {
          const next = new Set(current);
          next.add(nextGroupId);
          return next;
        });
        setPendingAutoOpenGroupEditorId(nextGroupId);
        setMoveGroupPickerOpen(false);
      } else {
        closeMoveGroupPicker();
      }
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }
  };

  const openCreatedGroupEditor = async (anchorTabId: number | null, successMessage: string) => {
    const nextOverview = await getOverview();
    setOverview(nextOverview);
    setError(null);
    setStatusMessage(successMessage);

    const nextGroupId = anchorTabId
      ? nextOverview.tabs.find((tab) => tab.id === anchorTabId)?.group?.id ?? null
      : null;

    if (nextGroupId != null) {
      setExpandedGroups((current) => {
        const next = new Set(current);
        next.add(nextGroupId);
        return next;
      });
      setPendingAutoOpenGroupEditorId(nextGroupId);
    }
  };

  const launchAlternate = async () => {
    const opened = await openSidePanel();
    if (!opened) await openDashboardPage();

    if (mode === 'popup') window.close();
  };

  const handleSmartGrouping = async (strategy: SmartGroupStrategy) => {
    if (quickActionTabs.length === 0) return;

    await execute(strategy === 'domain' ? t.groupByDomain : t.groupByType, async () => {
      await smartGroupTabs(
        quickActionTabs.map((tab) => tab.id),
        strategy
      );
    });
  };

  const handleSettingsSmartGrouping = async (strategy: SmartGroupStrategy) => {
    setShowSettingsModal(false);
    await handleSmartGrouping(strategy);
  };

  const handleCreateGroup = async (tabs: TabSnapshot[]) => {
    if (tabs.length === 0) return;

    const title = suggestGroupTitle(tabs, t.newGroup);
    const color = colorFromSeed(title);

    await execute(t.createdGroup, async () => {
      await groupTabs(
        tabs.map((tab) => tab.id),
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

    setLoading(true);

    try {
      const createdTab = await chrome.tabs.create({
        active: true
      });

      if (createdTab.id == null) return;

      await groupTabs([createdTab.id], {
        title,
        color
      });
      await openCreatedGroupEditor(createdTab.id, t.createdGroup);
    } catch (nextError) {
      setError(getErrorMessage(nextError));
    } finally {
      setLoading(false);
    }

    if (mode === 'popup') {
      window.close();
    }
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
    active: { kind: 'tab' | 'group-sort' | 'group' | 'new'; id?: number } | null,
    over: { kind: 'tab' | 'group-sort' | 'group' | 'new'; id?: number } | null,
    overId: string | null,
    overRect: { top: number; height: number } | null | undefined,
    fallbackRect: { top: number; height: number } | null | undefined
  ): DropPosition | null => {
    if (!active || !over || !overId) return null;

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

  const updateDragTarget = (event: DragMoveEvent | DragOverEvent | DragEndEvent) => {
    const active = parseDropId(event.active.id as string);
    const overId = typeof event.over?.id === 'string' ? event.over.id : null;
    const over = parseDropId(overId ?? undefined);

    if (!active || !overId || !over) {
      setOverDropId(null);
      setOverDropPosition(null);
      return;
    }

    if (
      (active.kind === 'tab' && over.kind === 'tab' && active.id === over.id) ||
      (active.kind === 'group-sort' && over.kind === 'group' && active.id === over.id)
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
    const active = parseDropId(event.active.id as string);
    const over = parseDropId(event.over?.id as string | undefined);
    const dropPosition = resolveDragDropPosition(
      active,
      over,
      typeof event.over?.id === 'string' ? event.over.id : null,
      event.over?.rect,
      event.active.rect.current.translated
    );

    setOverDropId(null);
    setOverDropPosition(null);
    dragPointerYRef.current = null;

    if (!active || !over) return;

    if (active.kind === 'group-sort' && active.id) {
      const movingGroup = groups.find((entry) => entry.group.id === active.id);
      if (!movingGroup) return;

      if (over.kind === 'group' && over.id && over.id !== movingGroup.group.id) {
        const targetGroup = groups.find((entry) => entry.group.id === over.id);
        const anchorTabId =
          dropPosition === 'after'
            ? targetGroup?.tabs[targetGroup.tabs.length - 1]?.id
            : targetGroup?.tabs[0]?.id;
        if (!anchorTabId) return;

        await execute(t.dragToReorder, async () => {
          if (dropPosition === 'after') {
            await moveTabsAfter(
              movingGroup.tabs.map((tab) => tab.id),
              anchorTabId
            );
          } else {
            await moveTabsBefore(
              movingGroup.tabs.map((tab) => tab.id),
              anchorTabId
            );
          }
        }, { silentStatus: true, soft: true });
        return;
      }

      if (over.kind === 'tab' && over.id) {
        const targetTabId = over.id;

        await execute(t.dragToReorder, async () => {
          if (dropPosition === 'after') {
            await moveTabsAfter(
              movingGroup.tabs.map((tab) => tab.id),
              targetTabId
            );
          } else {
            await moveTabsBefore(
              movingGroup.tabs.map((tab) => tab.id),
              targetTabId
            );
          }
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
      await handleCreateGroup([movingTab]);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    dragPointerYRef.current = extractClientY(event.activatorEvent);
    const active = parseDropId(event.active.id as string);
    if (active?.kind === 'tab' && active.id) {
      setActiveDragTabId(active.id);
    }
    if (active?.kind === 'group-sort' && active.id) {
      setActiveDragGroupId(active.id);
    }
  };

  const handleDragMove = (event: DragMoveEvent) => {
    updateDragTarget(event);
  };

  const handleDragOver = (event: DragOverEvent) => {
    updateDragTarget(event);
  };

  const resetDragState = () => {
    setActiveDragTabId(null);
    setActiveDragGroupId(null);
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
          className="tm-header-group-picker tm-header-group-picker-floating"
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
            onClick={() => void (selectedCount > 0 ? createSelectionGroupAndOpenEditor() : handleCreateEmptyGroup())}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            type="button"
          >
            <RiAddCircleLine size={12} />
            <span>{t.newGroup}</span>
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

  return (
    <div className="tm-shell">
      <div className="tm-app" data-mode={mode}>
        <div
          className={isSidepanel ? 'tm-sidepanel-frame tm-scrollbar' : undefined}
          data-scrolling={isSidepanel ? 'false' : undefined}
          onScroll={isSidepanel ? () => markScrollbarActive(sidepanelScrollRef.current) : undefined}
          ref={isSidepanel ? sidepanelScrollRef : undefined}
        >
          <section
            className={`tm-panel tm-searchbar${isSidepanel ? ' tm-searchbar-sidepanel' : ''}`}
            ref={isSidepanel ? sidepanelHeaderRef : undefined}
          >
            {mode === 'sidepanel' ? (
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
                    <button
                      ref={settingsPopoverRefs.setReference}
                      className={
                        showSettingsModal
                          ? 'tm-button-primary tm-button-sidepanel tm-button-sidepanel-icon'
                          : 'tm-button tm-button-sidepanel tm-button-sidepanel-icon'
                      }
                      aria-expanded={showSettingsModal}
                      aria-haspopup="dialog"
                      aria-label={t.settings}
                      title={t.settings}
                      type="button"
                      {...getSettingsPopoverReferenceProps()}
                    >
                      <RiSettings3Line size={14} />
                    </button>

                    <AnimatePresence initial={false}>
                      {showSettingsModal ? (
                        <FloatingPortal>
                          <motion.section
                            ref={settingsPopoverRefs.setFloating}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            aria-label={t.workspaceSettings}
                            className="tm-sidepanel-settings-popover"
                            data-side={settingsPopoverPlacement.split('-')[0]}
                            exit={{ opacity: 0, y: 4, scale: 0.98 }}
                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                            role="dialog"
                            style={settingsPopoverStyles}
                            transition={{ duration: 0.14, ease: 'easeOut' }}
                            {...getSettingsPopoverFloatingProps()}
                          >
                            <div className="tm-sidepanel-settings-popover-header">
                              <strong>{t.workspaceSettings}</strong>
                              <span>{locale === 'zh-CN' ? '自动分组、主题和语言' : 'Auto group, theme, and language'}</span>
                            </div>

                            <section className="tm-sidepanel-settings-card">
                              <div className="tm-sidepanel-settings-card-head">
                                <div className="tm-sidepanel-settings-card-icon">
                                  <RiShining2Line size={12} />
                                </div>
                                <div className="tm-sidepanel-settings-card-copy">
                                  <strong>{t.autoGroup}</strong>
                                  <span>{locale === 'zh-CN' ? '全局默认模块' : 'Global default modules'}</span>
                                </div>
                              </div>
                              <div className="tm-sidepanel-settings-auto-toolbar">
                                <button
                                  className="tm-sidepanel-settings-inline-toggle"
                                  data-active={settings.autoGroupEnabled}
                                  onClick={() => void saveSetting({ autoGroupEnabled: !settings.autoGroupEnabled })}
                                  type="button"
                                >
                                  <span className="tm-sidepanel-settings-inline-toggle-label">{t.autoGroup}</span>
                                  <span
                                    aria-hidden="true"
                                    className="tm-sidepanel-settings-switch"
                                    data-active={settings.autoGroupEnabled}
                                  >
                                    <span className="tm-sidepanel-settings-switch-thumb" />
                                  </span>
                                </button>

                                {settings.autoGroupEnabled ? (
                                  <div className="tm-sidepanel-settings-module-picker-root">
                                    <button
                                      ref={settingsAutoGroupPickerRefs.setReference}
                                      className="tm-sidepanel-settings-module-picker-trigger"
                                      data-open={showSettingsAutoGroupPicker}
                                      type="button"
                                      {...getSettingsAutoGroupPickerReferenceProps()}
                                    >
                                      <span className="tm-sidepanel-settings-module-picker-summary">
                                        {settingsAutoGroupSummary}
                                      </span>
                                      <RiArrowDownSLine size={14} />
                                    </button>

                                    <AnimatePresence initial={false}>
                                      {showSettingsAutoGroupPicker ? (
                                        <motion.div
                                          ref={settingsAutoGroupPickerRefs.setFloating}
                                          animate={{ opacity: 1, y: 0, scale: 1 }}
                                          className="tm-sidepanel-settings-module-picker-menu"
                                          data-side={settingsAutoGroupPickerPlacement.split('-')[0]}
                                          exit={{ opacity: 0, y: 4, scale: 0.98 }}
                                          initial={{ opacity: 0, y: 6, scale: 0.96 }}
                                          style={settingsAutoGroupPickerStyles}
                                          transition={{ duration: 0.14, ease: 'easeOut' }}
                                          {...getSettingsAutoGroupPickerFloatingProps()}
                                        >
                                          {settingsAutoGroupPresetLabels.map((preset) => {
                                            const active = settings.autoGroupPresetIds.includes(preset.id);

                                            return (
                                              <button
                                                className="tm-sidepanel-settings-module-picker-option"
                                                data-active={active}
                                                key={preset.id}
                                                onClick={() =>
                                                  void saveSetting({
                                                    autoGroupPresetIds: active
                                                      ? settings.autoGroupPresetIds.filter((id) => id !== preset.id)
                                                      : [...settings.autoGroupPresetIds, preset.id]
                                                  })
                                                }
                                                type="button"
                                              >
                                                <span className="tm-sidepanel-settings-module-picker-check" aria-hidden="true">
                                                  {active ? '✓' : ''}
                                                </span>
                                                <span className="tm-sidepanel-settings-module-picker-label">{preset.label}</span>
                                              </button>
                                            );
                                          })}
                                          <FloatingArrow
                                            ref={settingsAutoGroupPickerArrowRef}
                                            className="tm-sidepanel-settings-module-picker-arrow"
                                            context={settingsAutoGroupPickerContext}
                                            fill="var(--tm-sidepanel-settings-surface-solid)"
                                            height={6}
                                            stroke="var(--tm-sidepanel-settings-border)"
                                            strokeWidth={1}
                                            tipRadius={2}
                                            width={12}
                                          />
                                        </motion.div>
                                      ) : null}
                                    </AnimatePresence>
                                  </div>
                                ) : null}
                              </div>
                              <p className="tm-sidepanel-settings-hint-copy">{autoGroupStateCopy}</p>
                            </section>

                            <section className="tm-sidepanel-settings-card">
                              <div className="tm-sidepanel-settings-card-head">
                                <div className="tm-sidepanel-settings-card-icon">
                                  <RiPaletteLine size={12} />
                                </div>
                                <div className="tm-sidepanel-settings-card-copy">
                                  <strong>{locale === 'zh-CN' ? '界面偏好' : 'Interface'}</strong>
                                  <span>{locale === 'zh-CN' ? '主题与语言' : 'Theme and language'}</span>
                                </div>
                              </div>
                              <div className="tm-sidepanel-settings-field">
                                <span className="tm-sidepanel-settings-field-label">{t.theme}</span>
                                <div className="tm-sidepanel-settings-card-options tm-sidepanel-settings-card-options-3">
                                  {sidepanelFooterThemeChoices.map((choice) => (
                                    <button
                                      key={choice.id}
                                      className="tm-sidepanel-settings-option"
                                      data-active={settings.theme === choice.id}
                                      onClick={() => void saveSetting({ theme: choice.id })}
                                      type="button"
                                    >
                                      {choice.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="tm-sidepanel-settings-field">
                                <span className="tm-sidepanel-settings-field-label">{t.language}</span>
                                <div className="tm-sidepanel-settings-card-options tm-sidepanel-settings-card-options-2">
                                  {sidepanelFooterLocaleChoices.map((choice) => (
                                    <button
                                      key={choice.id}
                                      className="tm-sidepanel-settings-option"
                                      data-active={effectiveLocaleChoice === choice.id}
                                      onClick={() => void saveSetting({ locale: choice.id })}
                                      type="button"
                                    >
                                      {choice.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </section>

                            <FloatingArrow
                              ref={settingsPopoverArrowRef}
                              className="tm-sidepanel-settings-popover-arrow"
                              context={settingsPopoverContext}
                              fill="var(--tm-sidepanel-settings-surface-solid)"
                              height={6}
                              stroke="var(--tm-sidepanel-settings-border)"
                              strokeWidth={1}
                              tipRadius={2}
                              width={12}
                            />
                          </motion.section>
                        </FloatingPortal>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </div>

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
                          onMouseEnter: () => setShowFilterPicker(false)
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
              </>
            ) : (
              <div className="tm-search-row">
                <label className="tm-input tm-input-search">
                  <RiSearchLine size={15} />
                  <input
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t.searchPlaceholder}
                    value={query}
                  />
                </label>

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

                  <IconButton
                    icon={resolvedTheme === 'dark' ? RiSunLine : RiMoonLine}
                    label={t.theme}
                    onClick={() =>
                      void saveSetting({
                        theme: resolvedTheme === 'dark' ? 'light' : 'dark'
                      })
                    }
                  />
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
              </div>
            )}

            {!isSidepanel ? (
              <div className="tm-chip-row">
                {smartViews
                  .filter((view) => (showTools ? true : primaryViews.includes(view.id)))
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
            ) : null}
          </section>

          {isSidepanel ? null : showTools || selectedCount > 0 ? (
            <section className="tm-panel tm-action-strip">
              <div className="tm-action-primary">
                <div className="tm-action-overview">
                  <strong>{selectedCount > 0 ? `${selectedCount} ${t.selected}` : `${visibleTabs.length} ${t.shown}`}</strong>
                  <span>{selectedCount > 0 ? t.moveToGroup : t.organize}</span>
                </div>

                <div className="tm-action-group">
                  {selectedCount > 0 ? (
                    <>
                      <button
                        className="tm-button"
                        onClick={toggleVisibleSelection}
                        title={t.selectVisible}
                        type="button"
                      >
                        {visibleTabs.every((tab) => selectedIds.has(tab.id)) ? t.clearVisible : t.selectVisible}
                      </button>
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
                  ) : (
                    <>
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
                          onClick={() =>
                            void (selectedCount > 0 ? handleCreateGroup(selectedTabs) : handleCreateEmptyGroup())
                          }
                          type="button"
                        >
                          <RiAddCircleLine size={13} />
                          {t.newGroup}
                        </button>
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>

              {showTools ? (
                <div className="tm-action-secondary">
                  <button
                    className="tm-button"
                    onClick={() => void load()}
                    title={t.refreshed}
                    type="button"
                  >
                    <RiRefreshLine size={13} />
                    {t.refreshed}
                  </button>
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
                      className="tm-button"
                      onClick={() =>
                        void (selectedCount > 0 ? handleCreateGroup(selectedTabs) : handleCreateEmptyGroup())
                      }
                      type="button"
                    >
                      <RiAddCircleLine size={13} />
                      {t.newGroup}
                    </button>
                  </Tooltip>
                  <button
                    className="tm-button"
                    disabled={selectedCount === 0}
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
                    disabled={selectedCount === 0}
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
                    disabled={selectedCount === 0 || !selectedGrouped}
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
                </div>
              ) : null}
            </section>
          ) : null}

          <section
            className="tm-panel tm-tree-shell"
            ref={isSidepanel ? sidepanelTreeShellRef : undefined}
          >
            <DndContext
              collisionDetection={collisionDetectionStrategy}
              onDragCancel={resetDragState}
              onDragEnd={(event) => void handleDragEnd(event)}
              onDragMove={handleDragMove}
              onDragOver={handleDragOver}
              onDragStart={handleDragStart}
              sensors={sensors}
            >
              <SortableContext items={visibleTabs.map((tab) => `tab:${tab.id}`)} strategy={verticalListSortingStrategy}>
                <div
                  className={`tm-tree-list${isSidepanel ? ' tm-tree-list-sidepanel' : ' tm-scrollbar'}`}
                  data-scrolling={isSidepanel ? undefined : 'false'}
                  onScroll={isSidepanel ? undefined : () => markScrollbarActive(treeListScrollRef.current)}
                  ref={isSidepanel ? undefined : treeListScrollRef}
                >
                  {showTools ? (
                    <DropZoneRow id="new-group-drop" icon={RiAddCircleLine} label={t.dropToCreateGroup} />
                  ) : null}

                  {entries.length === 0 ? (
                    <div className="tm-empty">
                      <RiSearchLine size={16} />
                      <div>
                        <div className="font-medium">{t.noMatch}</div>
                        <div className="tm-subtle">{t.noMatchHint}</div>
                      </div>
                    </div>
                  ) : null}

                  {entries.map((entry) =>
                    entry.type === 'ungrouped' ? (
                      <section
                        key={`ungrouped:${entry.tabs[0]?.id ?? 'empty'}`}
                        className="tm-section-block"
                      >
                        <div className="tm-section-children tm-section-children-root">
                          {entry.tabs.map((tab) => (
                            <SortableTabRow
                              compact={isSidepanel}
                              dragSortingLocked={activeDragTabId !== null || activeDragGroupId !== null}
                              dragPreview={activeDragTabId === tab.id}
                              displayIndex={getDisplayIndex(tab.id)}
                              menuOpen={openActionMenuTabId === tab.id}
                              key={tab.id}
                              labelMap={t}
                              locale={locale}
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
                          ))}
                        </div>
                      </section>
                    ) : (
                      <GroupTreeBlock
                        autoOpenEditMenu={pendingAutoOpenGroupEditorId === entry.group.id}
                        compact={isSidepanel}
                        dragSortingLocked={activeDragTabId !== null || activeDragGroupId !== null}
                        key={entry.group.id}
                        dragPreviewId={activeDragGroupId}
                        getDisplayIndex={getDisplayIndex}
                        openActionMenuTabId={openActionMenuTabId}
                        expanded={deferredQuery.length > 0 || expandedGroups.has(entry.group.id)}
                        group={entry.group}
                        labelMap={t}
                        locale={locale}
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
                        onUpdateGroupAutoConfig={(patch) =>
                          void execute(t.autoGroupRules, async () => {
                            await updateGroup(entry.group.id, patch);
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
                        onMoveSelectionHere={
                          selectedCount > 0
                            ? () =>
                                void execute(t.movedToGroup, async () => {
                                  await groupTabs(
                                    selectedTabs.map((tab) => tab.id),
                                    { groupId: entry.group.id }
                                  );
                                })
                            : undefined
                        }
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
                    )
                  )}

                  {historyTabs.length > 0 ? (
                    <HistoryTabsSection
                      historyTabs={historyTabs}
                      locale={locale}
                      onOpenDetail={(historyTab) => void openHistoryTabDetail(historyTab)}
                      onOpenTab={(historyTab) => void reopenHistoryTab(historyTab)}
                      t={t}
                    />
                  ) : null}
                </div>
              </SortableContext>

              {createPortal(
                <DragOverlay dropAnimation={null}>
                  {activeDragTab ? (
                    <div className={`tm-drag-frame ${isSidepanel ? 'tm-drag-frame-tab-compact' : 'tm-drag-frame-tab'}`} />
                  ) : activeDragGroup ? (
                    <div
                      className={`tm-drag-frame ${isSidepanel ? 'tm-drag-frame-group-compact' : 'tm-drag-frame-group'}`}
                      style={{
                        borderColor:
                          groupColorTokens[activeDragGroup.group.color as TabGroupColor].ring
                      }}
                    />
                  ) : null}
                </DragOverlay>,
                document.body
              )}
            </DndContext>
          </section>

        </div>
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

function TabDetailModal({
  detail,
  loading,
  error,
  locale,
  t,
  onCopyUrl,
  onClose
}: {
  detail: TabDetailSnapshot | null;
  loading: boolean;
  error: string | null;
  locale: string;
  t: Messages;
  onCopyUrl: (url: string) => void;
  onClose: () => void;
}) {
  const tab = detail?.tab ?? null;
  const history = (detail?.history ?? []).filter((event) =>
    event.kind === 'observed' || event.kind === 'created' || event.kind === 'navigated'
  );
  const detailTitle = tab?.title ?? t.details;
  const detailChips = tab
    ? [tab.group?.title ?? t.ungrouped, tab.status, ...(tab.pinned ? [t.pin] : []), ...(tab.muted ? [t.mute] : [])]
    : [];
  const detailMetrics = tab
    ? [
        {
          label: t.openedLabel,
          value: formatRelativeTime(tab.telemetry.openedAt ?? tab.telemetry.observedAt, locale)
        },
        {
          label: t.lastActiveLabel,
          value: formatRelativeTime(tab.lastAccessed ?? tab.telemetry.lastActivatedAt, locale)
        },
        {
          label: t.activeTimeLabel,
          value: formatDuration(tab.telemetry.totalActiveMs)
        },
        {
          label: t.eventCountLabel,
          value: String(history.length)
        }
      ]
    : [];
  const detailFrameTransition = {
    type: 'spring' as const,
    stiffness: 340,
    damping: 27,
    mass: 0.92
  };
  const detailShellTransition = {
    type: 'spring' as const,
    stiffness: 430,
    damping: 28,
    mass: 0.74
  };
  const detailPanelTransition = {
    type: 'spring' as const,
    stiffness: 480,
    damping: 30,
    mass: 0.8,
    delay: 0.02
  };

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="tm-modal-backdrop tm-detail-modal-backdrop"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <motion.div
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="tm-settings-modal-frame tm-detail-modal-frame"
        exit={{ opacity: 0, y: 28, scale: 0.98 }}
        initial={{ opacity: 0, y: 64, scale: 0.935 }}
        onClick={(event) => event.stopPropagation()}
        transition={detailFrameTransition}
      >
        <motion.div
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="tm-settings-modal-shell tm-detail-modal-shell"
          exit={{ opacity: 0, y: 16, scale: 0.985 }}
          initial={{ opacity: 0.72, y: 18, scale: 0.955 }}
          transition={detailShellTransition}
        />

        <motion.section
          aria-label={t.details}
          aria-modal="true"
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="tm-settings-modal tm-detail-modal"
          exit={{ opacity: 0, y: 10, scale: 0.995 }}
          initial={{ opacity: 0.9, y: 22, scale: 0.988 }}
          role="dialog"
          transition={detailPanelTransition}
        >
          <div className="tm-settings-modal-head tm-detail-modal-head">
            <div className="tm-detail-heading">
              <div className="tm-favicon tm-favicon-detail tm-detail-heading-favicon" aria-hidden="true">
                {tab ? (
                  tab.favIconUrl ? (
                    <img alt="" className="h-full w-full object-cover" src={tab.favIconUrl} />
                  ) : (
                    (tab.hostname || tab.title).slice(0, 1).toUpperCase()
                  )
                ) : (
                  <RiGlobalLine size={16} />
                )}
              </div>
              <div className="tm-settings-modal-title tm-detail-heading-copy">
                <h2 className="tm-detail-heading-title">{detailTitle}</h2>
                {tab?.url ? (
                  <div className="tm-detail-heading-link">
                    <span className="tm-detail-heading-url" title={tab.url}>
                      {tab.url}
                    </span>
                    <Tooltip content={t.copyUrl}>
                      <button
                        aria-label={t.copyUrl}
                        className="tm-detail-copy-button"
                        onClick={() => onCopyUrl(tab.url)}
                        type="button"
                      >
                        <RiFileCopyLine size={12} />
                      </button>
                    </Tooltip>
                  </div>
                ) : (
                  <span className="tm-subtle">{t.detailSummary}</span>
                )}
              </div>
            </div>
            <button className="tm-icon-button" onClick={onClose} title={t.cancel} type="button">
              <RiCloseLine size={13} />
            </button>
          </div>

          <div className="tm-settings-modal-body tm-detail-modal-body tm-scrollbar">
            {loading ? (
              <div className="tm-empty">
                <RiTimeLine size={16} />
                <div>
                  <div className="font-medium">{t.sync}</div>
                </div>
              </div>
            ) : error ? (
              <div className="tm-empty tm-toast-error">
                <RiCloseLine size={16} />
                <div>{error}</div>
              </div>
            ) : !tab ? (
              <div className="tm-empty">
                <RiArticleLine size={16} />
                <div>{t.detailUnavailable}</div>
              </div>
            ) : (
              <>
                <section className="tm-panel-muted tm-detail-summary-card">
                  <div className="tm-detail-chips">
                    {detailChips.map((chip, index) => (
                      <span className="tm-chip" key={`${chip}-${index}`}>
                        {chip}
                      </span>
                    ))}
                  </div>
                  <div className="tm-detail-summary-inline">
                    {detailMetrics.map((metric) => (
                      <span className="tm-detail-summary-item" key={metric.label}>
                        <span className="tm-detail-summary-label">{metric.label}</span>
                        <strong className="tm-detail-summary-value">{metric.value}</strong>
                      </span>
                    ))}
                  </div>
                </section>

                <section className="tm-panel-muted tm-detail-timeline-panel">
                  <div className="tm-detail-section-head">
                    <strong>{t.detailTimeline}</strong>
                    <span className="tm-subtle">
                      {history.length > 0 ? `${history.length} ${t.eventCountLabel}` : t.detailEmptyHistory}
                    </span>
                  </div>

                  {history.length > 0 ? (
                    <div className="tm-detail-timeline">
                      {history.map((event) => (
                        <article className="tm-timeline-item" key={event.id}>
                          <div className="tm-timeline-rail">
                            <span className="tm-timeline-dot" />
                          </div>
                          <div className="tm-timeline-card">
                            <div className="tm-timeline-head">
                              <strong className="tm-timeline-title" title={event.title}>
                                {event.title}
                              </strong>
                              <span className="tm-timeline-time">{formatTimelineTime(event.at, locale)}</span>
                            </div>
                            <div className="tm-timeline-meta">
                              <span className="tm-timeline-url" title={event.url || event.hostname}>
                                {event.url || event.hostname}
                              </span>
                              {event.url ? (
                                <Tooltip content={t.copyUrl}>
                                  <button
                                    aria-label={t.copyUrl}
                                    className="tm-detail-copy-button"
                                    onClick={() => onCopyUrl(event.url)}
                                    type="button"
                                  >
                                    <RiFileCopyLine size={12} />
                                  </button>
                                </Tooltip>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="tm-empty">
                      <RiTimeLine size={16} />
                      <div>{t.detailEmptyHistory}</div>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </motion.section>
      </motion.div>
    </motion.div>
  );
}

function HistoryTabsSection({
  historyTabs,
  locale,
  t,
  onOpenDetail,
  onOpenTab
}: {
  historyTabs: HistoryTabSnapshot[];
  locale: string;
  t: Messages;
  onOpenDetail: (historyTab: HistoryTabSnapshot) => void;
  onOpenTab: (historyTab: HistoryTabSnapshot) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="tm-section-block tm-history-section">
      <button
        className="tm-group-header tm-history-header"
        data-active={expanded}
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <div className="tm-group-title">
          <RiTimeLine size={14} />
          <strong>{t.historyTabs}</strong>
        </div>
        <div className="tm-history-header-meta">
          <span className="tm-subtle">{`${historyTabs.length}`}</span>
          <span className="tm-group-toggle tm-history-toggle" aria-hidden="true">
            <RiArrowDownSLine size={16} style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
          </span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="tm-section-children tm-section-children-root">
              {historyTabs.map((historyTab) => (
                <div className="tm-history-tab-row" key={historyTab.id}>
                  <button className="tm-history-tab-main" onClick={() => onOpenDetail(historyTab)} type="button">
                    <div className="tm-tab-leading">
                      <div className="tm-tab-sequence tm-history-badge">
                        <RiTimeLine size={12} />
                      </div>
                    </div>
                    {historyTab.favIconUrl ? (
                      <img alt="" className="tm-favicon tm-favicon-small" src={historyTab.favIconUrl} />
                    ) : (
                      <div className="tm-favicon tm-favicon-small">
                        {(historyTab.hostname || historyTab.title).slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div className="tm-tab-main">
                      <div className="tm-tab-line">
                        <strong className="tm-tab-title">{historyTab.title}</strong>
                      </div>
                      <div className="tm-tab-subline">
                        <span className="tm-tab-subline-primary">{historyTab.hostname || historyTab.url}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatRelativeTime(historyTab.closedAt, locale)}</span>
                      </div>
                    </div>
                  </button>

                  <div className="tm-history-row-actions-overlay" data-tab-action-root="true">
                    <div className="tm-row-actions">
                      <Tooltip content={t.details}>
                        <IconButton
                          icon={RiArticleLine}
                          label={t.details}
                          nativeTitle={false}
                          onClick={() => onOpenDetail(historyTab)}
                        />
                      </Tooltip>
                      <Tooltip content={t.reopenHistoryTab}>
                        <IconButton
                          icon={RiArrowRightUpLine}
                          label={t.reopenHistoryTab}
                          nativeTitle={false}
                          onClick={() => onOpenTab(historyTab)}
                        />
                      </Tooltip>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function GroupTreeBlock({
  autoOpenEditMenu,
  group,
  tabs,
  compact,
  dragSortingLocked,
  expanded,
  dragPreviewId,
  getDisplayIndex,
  openActionMenuTabId,
  labelMap,
  locale,
  overDropId,
  overDropPosition,
  selectedIds,
  onToggleExpand,
  onSaveGroup,
  onUpdateGroupColor,
  onUpdateGroupAutoConfig,
  onAddTabToGroup,
  onUngroupGroup,
  onDeleteGroup,
  onAutoOpenEditMenuHandled,
  onToggleSelect,
  onFocusTab,
  onPinTab,
  onMuteTab,
  onSleepTab,
  onOpenDetail,
  onCloseTab,
  onUngroupTab,
  onSetMoreOpen,
  onMoveSelectionHere
}: {
  autoOpenEditMenu: boolean;
  group: TabGroupSnapshot;
  tabs: TabSnapshot[];
  compact: boolean;
  dragSortingLocked: boolean;
  expanded: boolean;
  dragPreviewId: number | null;
  getDisplayIndex: (tabId: number) => number;
  openActionMenuTabId: number | null;
  labelMap: Messages;
  locale: string;
  overDropId: string | null;
  overDropPosition: DropPosition | null;
  selectedIds: Set<number>;
  onToggleExpand: () => void;
  onSaveGroup: (title: string) => void;
  onUpdateGroupColor: (color: TabGroupColor) => void;
  onUpdateGroupAutoConfig: (patch: {
    autoGroupEnabled?: boolean;
    autoGroupPresetIds?: string[];
    autoGroupRules?: AutoGroupRule[];
  }) => void;
  onAddTabToGroup: () => void;
  onUngroupGroup: () => void;
  onDeleteGroup: () => void;
  onAutoOpenEditMenuHandled: () => void;
  onToggleSelect: (tabId: number) => void;
  onFocusTab: (tab: TabSnapshot) => Promise<void>;
  onPinTab: (tab: TabSnapshot) => void;
  onMuteTab: (tab: TabSnapshot) => void;
  onSleepTab: (tab: TabSnapshot) => void;
  onOpenDetail: (tab: TabSnapshot) => void;
  onCloseTab: (tabId: number) => void;
  onUngroupTab: (tabId: number) => void;
  onSetMoreOpen: (tabId: number, open: boolean) => void;
  onMoveSelectionHere?: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `group:${group.id}` });
  const draggable = useDraggable({ id: `group-sort:${group.id}` });
  const [editMenuHoverOpen, setEditMenuHoverOpen] = useState(false);
  const [editMenuFocusWithin, setEditMenuFocusWithin] = useState(false);
  const [editMenuAutoOpen, setEditMenuAutoOpen] = useState(false);
  const [modulePickerOpen, setModulePickerOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(group.title);
  const [autoGroupEnabledDraft, setAutoGroupEnabledDraft] = useState(group.autoGroupEnabled);
  const [autoGroupPresetIdsDraft, setAutoGroupPresetIdsDraft] = useState(group.autoGroupPresetIds);
  const [rulesDraft, setRulesDraft] = useState<AutoGroupRule[]>(group.autoGroupRules);
  const arrowRef = useRef<SVGSVGElement | null>(null);
  const modulePickerArrowRef = useRef<SVGSVGElement | null>(null);
  const lastSubmittedTitleRef = useRef(group.title);
  const lastSubmittedAutoConfigRef = useRef(
    JSON.stringify({
      autoGroupEnabled: group.autoGroupEnabled,
      autoGroupPresetIds: group.autoGroupPresetIds,
      autoGroupRules: group.autoGroupRules
    })
  );
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const editMenuOpen = editMenuHoverOpen || editMenuFocusWithin || editMenuAutoOpen;
  const { refs, floatingStyles, context, placement } = useFloating({
    open: editMenuOpen,
    onOpenChange: setEditMenuHoverOpen,
    placement: 'bottom-end',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: arrowRef, padding: 10 })]
  });
  const hover = useHover(context, {
    move: false,
    delay: { open: 90, close: 50 },
    handleClose: safePolygon({ blockPointerEvents: true })
  });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'dialog' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);
  const {
    refs: modulePickerRefs,
    floatingStyles: modulePickerStyles,
    context: modulePickerContext,
    placement: modulePickerPlacement
  } = useFloating({
    open: modulePickerOpen,
    onOpenChange: setModulePickerOpen,
    placement: 'bottom-start',
    strategy: 'absolute',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: modulePickerArrowRef, padding: 8 })]
  });
  const modulePickerClick = useClick(modulePickerContext, { event: 'click' });
  const modulePickerDismiss = useDismiss(modulePickerContext, {
    outsidePress: true,
    escapeKey: true
  });
  const modulePickerRole = useRole(modulePickerContext, { role: 'listbox' });
  const {
    getReferenceProps: getModulePickerReferenceProps,
    getFloatingProps: getModulePickerFloatingProps
  } = useInteractions([modulePickerClick, modulePickerDismiss, modulePickerRole]);
  const expandTransition = {
    height: {
      type: 'spring' as const,
      stiffness: 360,
      damping: 30,
      mass: 0.82
    },
    opacity: { duration: 0.16, ease: 'easeOut' as const },
    y: {
      type: 'spring' as const,
      stiffness: 420,
      damping: 32,
      mass: 0.72
    }
  };
  const activeDrop =
    (isOver || overDropId === `group:${group.id}`) && overDropPosition === 'inside';
  const insertPosition =
    overDropId === `group:${group.id}` && overDropPosition !== 'inside'
      ? overDropPosition
      : null;
  const dragStyle = dragSortingLocked
    ? { opacity: dragPreviewId === group.id ? 0.12 : 1 }
    : {
        transform: draggable.isDragging ? undefined : CSS.Transform.toString(draggable.transform),
        opacity: dragPreviewId === group.id ? 0.12 : 1
      };

  useEffect(() => {
    if (editMenuFocusWithin) return;
    setTitleDraft(group.title);
    lastSubmittedTitleRef.current = group.title;
  }, [editMenuFocusWithin, group.title]);

  useEffect(() => {
    if (editMenuFocusWithin) return;
    setAutoGroupEnabledDraft(group.autoGroupEnabled);
    setAutoGroupPresetIdsDraft(group.autoGroupPresetIds);
    setRulesDraft(group.autoGroupRules);
    lastSubmittedAutoConfigRef.current = JSON.stringify({
      autoGroupEnabled: group.autoGroupEnabled,
      autoGroupPresetIds: group.autoGroupPresetIds,
      autoGroupRules: group.autoGroupRules.map((rule) => ({
        ...rule,
        field: 'url' as const,
        operator: 'contains' as const
      }))
    });
  }, [editMenuFocusWithin, group.autoGroupEnabled, group.autoGroupPresetIds, group.autoGroupRules]);

  const normalizedRules = useMemo<AutoGroupRule[]>(
    () =>
      rulesDraft.map((rule) => ({
        ...rule,
        field: 'url',
        operator: 'contains'
      })),
    [rulesDraft]
  );

  const presetLabels = useMemo(
    () =>
      defaultAutoGroupPresets.map((preset) => ({
        id: preset.id,
        label: getDefaultAutoGroupPresetTitle(preset, locale === 'zh-CN' ? 'zh-CN' : 'en')
      })),
    [locale]
  );
  const modulePickerSummary = useMemo(() => {
    if (autoGroupPresetIdsDraft.length === 0) return labelMap.selectModules;

    const selectedLabels = presetLabels
      .filter((preset) => autoGroupPresetIdsDraft.includes(preset.id))
      .map((preset) => preset.label);

    if (selectedLabels.length <= 2) return selectedLabels.join(' · ');

    return locale === 'zh-CN' ? `已选 ${selectedLabels.length} 项` : `${selectedLabels.length} selected`;
  }, [autoGroupPresetIdsDraft, labelMap.selectModules, locale, presetLabels]);

  const saveGroupAutoConfig = (
    nextEnabled = autoGroupEnabledDraft,
    nextPresetIds = autoGroupPresetIdsDraft,
    nextRules: AutoGroupRule[] = normalizedRules
  ) => {
    const normalizedNextRules: AutoGroupRule[] = nextRules.map((rule) => ({
      ...rule,
      field: 'url',
      operator: 'contains'
    }));
    const nextPayload = {
      autoGroupEnabled: nextEnabled,
      autoGroupPresetIds: nextPresetIds,
      autoGroupRules: normalizedNextRules
    };
    const serializedPayload = JSON.stringify(nextPayload);
    if (serializedPayload === lastSubmittedAutoConfigRef.current) return;

    lastSubmittedAutoConfigRef.current = serializedPayload;
    onUpdateGroupAutoConfig(nextPayload);
  };

  useEffect(() => {
    if (editMenuFocusWithin) return;
    const normalizedGroupRules: AutoGroupRule[] = group.autoGroupRules.map((rule) => ({
      ...rule,
      field: 'url',
      operator: 'contains'
    }));
    setRulesDraft(normalizedGroupRules);
  }, [editMenuFocusWithin, group.autoGroupRules]);

  useEffect(() => {
    if (!autoOpenEditMenu) return;
    setEditMenuAutoOpen(true);
  }, [autoOpenEditMenu]);

  useEffect(() => {
    if (!editMenuOpen) return;
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, [editMenuOpen]);

  useEffect(() => {
    if (!autoOpenEditMenu || !editMenuOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
      setEditMenuFocusWithin(true);
      setEditMenuAutoOpen(false);
      onAutoOpenEditMenuHandled();
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [autoOpenEditMenu, editMenuOpen, onAutoOpenEditMenuHandled]);

  const closeEditMenu = () => {
    setEditMenuHoverOpen(false);
    setEditMenuFocusWithin(false);
    setEditMenuAutoOpen(false);
    setModulePickerOpen(false);
  };

  const saveGroupTitle = (nextValue = titleDraft) => {
    const nextTitle = nextValue.trim();
    if (!nextTitle) {
      setTitleDraft(group.title);
      return;
    }

    if (nextTitle === lastSubmittedTitleRef.current) return;

    lastSubmittedTitleRef.current = nextTitle;
    onSaveGroup(nextTitle);
  };

  const updateRuleAt = (ruleId: string, patch: Partial<Pick<AutoGroupRule, 'value'>>) => {
    setRulesDraft((current) => {
      const nextRules = current.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule));
      saveGroupAutoConfig(autoGroupEnabledDraft, autoGroupPresetIdsDraft, nextRules);
      return nextRules;
    });
  };

  const addRule = () => {
    setRulesDraft((current) => {
      const nextRules = [...current, createAutoGroupRule()];
      saveGroupAutoConfig(autoGroupEnabledDraft, autoGroupPresetIdsDraft, nextRules);
      return nextRules;
    });
  };

  const removeRule = (ruleId: string) => {
    setRulesDraft((current) => {
      const nextRules = current.filter((rule) => rule.id !== ruleId);
      saveGroupAutoConfig(autoGroupEnabledDraft, autoGroupPresetIdsDraft, nextRules);
      return nextRules;
    });
  };

  const toggleAutoGroupEnabled = () => {
    setAutoGroupEnabledDraft((current) => {
      const nextEnabled = !current;
      saveGroupAutoConfig(nextEnabled, autoGroupPresetIdsDraft, rulesDraft);
      return nextEnabled;
    });
    if (autoGroupEnabledDraft) {
      setModulePickerOpen(false);
    }
  };

  const toggleAutoGroupPreset = (presetId: string) => {
    setAutoGroupPresetIdsDraft((current) => {
      const nextPresetIds = current.includes(presetId)
        ? current.filter((id) => id !== presetId)
        : [...current, presetId];
      saveGroupAutoConfig(autoGroupEnabledDraft, nextPresetIds, rulesDraft);
      return nextPresetIds;
    });
  };

  const handleAddTabToGroup = () => {
    closeEditMenu();
    onAddTabToGroup();
  };

  const handleUngroupGroup = () => {
    closeEditMenu();
    onUngroupGroup();
  };

  const handleDeleteGroup = () => {
    closeEditMenu();
    onDeleteGroup();
  };

  const handleGroupHeaderClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest('button, input, select, a, [data-tab-action-root="true"]')) return;
    onToggleExpand();
  };

  return (
    <section
      ref={setNodeRef}
      className="tm-section-block"
      data-active={activeDrop}
      data-menu-open={editMenuOpen}
      style={dragStyle}
    >
      <div
        className="tm-group-header"
        data-compact={compact}
        data-active={activeDrop}
        data-drop-id={`group:${group.id}`}
        data-over-position={insertPosition ?? undefined}
        onClick={handleGroupHeaderClick}
        ref={draggable.setNodeRef}
        style={groupChipStyle(group.color as TabGroupColor)}
      >
        <div className="tm-group-header-leading">
          <div className="tm-tab-handle tm-group-drag-handle" title={labelMap.dragToReorder}>
            <button
              aria-label={labelMap.dragToReorder}
              className="tm-group-drag-button"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={blockDrag}
              type="button"
              {...draggable.attributes}
              {...draggable.listeners}
            >
              <RiDragMove2Line size={14} />
            </button>
          </div>
          <button className="tm-group-toggle" onClick={onToggleExpand} onPointerDown={blockDrag} title={expanded ? labelMap.collapseGroup : labelMap.expandGroup} type="button">
            <motion.span
              animate={{ rotate: expanded ? 0 : -90 }}
              className="tm-group-toggle-icon"
              transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.7 }}
            >
              <RiArrowDownSLine size={14} />
            </motion.span>
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="tm-group-title" title={group.title}>
            <span
              className="tm-group-dot"
              style={{ backgroundColor: groupColorTokens[group.color as TabGroupColor].solid }}
            />
            <span className="tm-group-title-label">{group.title}</span>
            <span className="tm-group-count">{tabs.length}</span>
          </div>
        </div>

        <div className="tm-group-actions">
          {onMoveSelectionHere ? (
            <Tooltip content={labelMap.moveSelectedHere} placement="bottom-end" arrowPadding={4}>
              <button
                aria-label={labelMap.moveSelectedHere}
                className="tm-icon-button"
                onClick={onMoveSelectionHere}
                onPointerDown={blockDrag}
                type="button"
              >
                <RiFolderLine size={14} />
              </button>
            </Tooltip>
          ) : null}
          <button
            ref={refs.setReference}
            aria-label={labelMap.editGroup}
            className="tm-icon-button tm-group-edit-trigger"
            data-open={editMenuOpen}
            type="button"
            {...getReferenceProps({
              onPointerDown: blockDrag
            })}
          >
            <RiSettings3Line size={14} />
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {editMenuOpen ? (
          <FloatingPortal>
            <motion.div
              ref={refs.setFloating}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="tm-group-edit-menu"
              data-side={placement.split('-')[0]}
              data-tab-action-root="true"
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              onBlurCapture={(event) => {
                const nextTarget = event.relatedTarget;
                if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
                setEditMenuFocusWithin(false);
              }}
              onFocusCapture={() => setEditMenuFocusWithin(true)}
              style={floatingStyles}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              {...getFloatingProps()}
            >
              <div className="tm-group-edit-section">
                <input
                  ref={titleInputRef}
                  className="tm-group-edit-input"
                  onBlur={() => saveGroupTitle(titleDraft)}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setTitleDraft(nextValue);
                    saveGroupTitle(nextValue);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      saveGroupTitle(titleDraft);
                      closeEditMenu();
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setTitleDraft(group.title);
                      closeEditMenu();
                    }
                  }}
                  onPointerDown={blockDrag}
                  value={titleDraft}
                />
              </div>

              <div className="tm-group-edit-section">
                <div className="tm-group-color-row">
                  {allGroupColors.map((color) => {
                    const active = color === group.color;
                    const tokens = groupColorTokens[color];

                    return (
                      <button
                        aria-label={color}
                        className="tm-group-color-swatch"
                        data-active={active}
                        key={color}
                        onClick={() => onUpdateGroupColor(color)}
                        onPointerDown={blockDrag}
                        style={{
                          backgroundColor: active ? tokens.soft : 'transparent',
                          borderColor: active ? tokens.ring : 'var(--tm-border)'
                        }}
                        type="button"
                      >
                        <span
                          className="tm-group-color-swatch-inner"
                          style={{ backgroundColor: tokens.solid }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="tm-group-edit-section tm-group-auto-section">
                <div className="tm-group-auto-toolbar">
                  <button
                    className="tm-group-auto-inline-toggle"
                    data-active={autoGroupEnabledDraft}
                    onClick={toggleAutoGroupEnabled}
                    type="button"
                  >
                    <span className="tm-group-auto-inline-label">{labelMap.autoGroup}</span>
                    <span className="tm-group-auto-switch" data-active={autoGroupEnabledDraft}>
                      <span className="tm-group-auto-switch-thumb" />
                    </span>
                  </button>

                  {autoGroupEnabledDraft ? (
                    <div className="tm-group-module-picker-root">
                      <button
                        ref={modulePickerRefs.setReference}
                        className="tm-group-module-picker-trigger tm-group-module-picker-trigger-inline"
                        data-open={modulePickerOpen}
                        type="button"
                        {...getModulePickerReferenceProps()}
                      >
                        <span className="tm-group-module-picker-summary">{modulePickerSummary}</span>
                        <RiArrowDownSLine size={13} />
                      </button>

                      <AnimatePresence initial={false}>
                        {modulePickerOpen ? (
                          <motion.div
                            ref={modulePickerRefs.setFloating}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            className="tm-group-module-picker-menu"
                            data-side={modulePickerPlacement.split('-')[0]}
                            exit={{ opacity: 0, y: 4, scale: 0.98 }}
                            initial={{ opacity: 0, y: 6, scale: 0.96 }}
                            style={modulePickerStyles}
                            transition={{ duration: 0.14, ease: 'easeOut' }}
                            {...getModulePickerFloatingProps()}
                          >
                            {presetLabels.map((preset) => {
                              const active = autoGroupPresetIdsDraft.includes(preset.id);

                              return (
                                <button
                                  className="tm-group-module-picker-option"
                                  data-active={active}
                                  key={preset.id}
                                  onClick={() => toggleAutoGroupPreset(preset.id)}
                                  type="button"
                                >
                                  <span className="tm-group-module-picker-check" aria-hidden="true">
                                    {active ? '✓' : ''}
                                  </span>
                                  <span className="tm-group-module-picker-label">{preset.label}</span>
                                </button>
                              );
                            })}
                            <FloatingArrow
                              ref={modulePickerArrowRef}
                              className="tm-group-module-picker-arrow"
                              context={modulePickerContext}
                              fill="var(--tm-group-edit-surface)"
                              height={6}
                              stroke="var(--tm-group-edit-border)"
                              strokeWidth={1}
                              tipRadius={2}
                              width={12}
                            />
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  ) : null}
                </div>
              </div>

              {autoGroupEnabledDraft ? (
                <div className="tm-group-edit-section tm-group-rules-section">
                  <div className="tm-group-rules-head">
                    <strong>{labelMap.autoGroupRules}</strong>
                    <span>{labelMap.matchAllRules}</span>
                  </div>

                  {rulesDraft.length > 0 ? (
                    <div className="tm-group-rules-list">
                      {rulesDraft.map((rule) => (
                        <div className="tm-group-rule-row" key={rule.id}>
                          <span className="tm-group-rule-token">{labelMap.ruleUrl}</span>
                          <span className="tm-group-rule-separator" aria-hidden="true">
                            ·
                          </span>
                          <span className="tm-group-rule-token">{labelMap.ruleContains}</span>
                          <span className="tm-group-rule-separator" aria-hidden="true">
                            ·
                          </span>

                          <input
                            className="tm-group-rule-input"
                            onChange={(event) => updateRuleAt(rule.id, { value: event.target.value })}
                            placeholder={labelMap.ruleValuePlaceholder}
                            value={rule.value}
                          />

                          <button
                            aria-label={labelMap.removeCondition}
                            className="tm-group-rule-remove"
                            onClick={() => removeRule(rule.id)}
                            type="button"
                          >
                            <RiCloseLine size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <button className="tm-group-rule-add" onClick={addRule} type="button">
                    <RiAddCircleLine size={12} />
                    <span>{labelMap.addCondition}</span>
                  </button>
                </div>
              ) : null}

              <div className="tm-group-edit-actions">
                <button className="tm-group-edit-action" onClick={handleAddTabToGroup} type="button">
                  <RiAddCircleLine size={12} />
                  <span>{labelMap.addTabToGroup}</span>
                </button>
                <button className="tm-group-edit-action" onClick={handleUngroupGroup} type="button">
                  <RiScissorsCutLine size={12} />
                  <span>{labelMap.ungroup}</span>
                </button>
                <button className="tm-group-edit-action tm-group-edit-action-danger" onClick={handleDeleteGroup} type="button">
                  <RiDeleteBinLine size={12} />
                  <span>{labelMap.deleteGroup}</span>
                </button>
              </div>
              <FloatingArrow
                ref={arrowRef}
                className="tm-group-edit-arrow"
                context={context}
                fill="var(--tm-group-edit-surface)"
                height={7}
                stroke="var(--tm-group-edit-border)"
                strokeWidth={1}
                tipRadius={2}
                width={14}
              />
            </motion.div>
          </FloatingPortal>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0, y: -6 }}
            initial={{ height: 0, opacity: 0, y: -10 }}
            transition={expandTransition}
          >
            <div className={`tm-section-children tm-section-children-group${compact ? ' tm-section-children-group-compact' : ''}`}>
              {tabs.map((tab) => (
                <SortableTabRow
                  compact={compact}
                  dragSortingLocked={dragSortingLocked}
                  dragPreview={dragPreviewId === tab.id}
                  displayIndex={getDisplayIndex(tab.id)}
                  menuOpen={openActionMenuTabId === tab.id}
                  key={tab.id}
                  depth={1}
                  labelMap={labelMap}
                  locale={locale}
                  overDropId={overDropId}
                  overDropPosition={overDropPosition}
                  selectable
                  selected={selectedIds.has(tab.id)}
                  tab={tab}
                  onClose={() => onCloseTab(tab.id)}
                  onFocus={() => onFocusTab(tab)}
                  onMute={() => onMuteTab(tab)}
                  onSleep={() => onSleepTab(tab)}
                  onPin={() => onPinTab(tab)}
                  onOpenDetail={() => onOpenDetail(tab)}
                  onUngroup={() => onUngroupTab(tab.id)}
                  onSetMoreOpen={(open) => onSetMoreOpen(tab.id, open)}
                  onToggleSelect={() => onToggleSelect(tab.id)}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function SortableTabRow({
  tab,
  labelMap,
  locale,
  displayIndex,
  selected,
  selectable,
  compact,
  dragSortingLocked,
  dragPreview,
  menuOpen,
  overDropId,
  overDropPosition,
  depth = 0,
  onToggleSelect,
  onFocus,
  onPin,
  onMute,
  onSleep,
  onOpenDetail,
  onClose,
  onUngroup,
  onSetMoreOpen
}: {
  tab: TabSnapshot;
  labelMap: Messages;
  locale: string;
  displayIndex: number;
  selected: boolean;
  selectable: boolean;
  compact: boolean;
  dragSortingLocked: boolean;
  dragPreview: boolean;
  menuOpen: boolean;
  overDropId: string | null;
  overDropPosition: DropPosition | null;
  depth?: number;
  onToggleSelect: () => void;
  onFocus: () => Promise<void>;
  onPin: () => void;
  onMute: () => void;
  onSleep: () => void;
  onOpenDetail: () => void;
  onClose: () => void;
  onUngroup?: () => void;
  onSetMoreOpen: (open: boolean) => void;
}) {
  const sortable = useSortable({
    id: `tab:${tab.id}`,
    transition: null,
    animateLayoutChanges: (args) => (args.isSorting ? defaultAnimateLayoutChanges(args) : false)
  });
  const menuArrowRef = useRef<SVGSVGElement | null>(null);
  const style = dragSortingLocked
    ? undefined
    : {
        transform: sortable.isDragging ? undefined : CSS.Transform.toString(sortable.transform),
        transition: sortable.isDragging ? undefined : sortable.transition
      };
  const { refs, floatingStyles, context, placement } = useFloating({
    open: menuOpen,
    onOpenChange: (nextOpen) => {
      if (nextOpen !== menuOpen) onSetMoreOpen(nextOpen);
    },
    placement: 'bottom-end',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: menuArrowRef, padding: 12 })]
  });
  const hover = useHover(context, {
    move: false,
    delay: { open: 60, close: 80 },
    handleClose: safePolygon()
  });
  const focus = useFocus(context);
  const click = useClick(context, { event: 'click', toggle: false });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, click, dismiss, role]);
  const dropOnSelf = overDropId === `tab:${tab.id}`;
  const dropPosition = dropOnSelf ? overDropPosition : null;
  const handlePin = () => {
    onPin();
    onSetMoreOpen(false);
  };
  const handleMute = () => {
    onMute();
    onSetMoreOpen(false);
  };
  const handleSleep = () => {
    onSleep();
    onSetMoreOpen(false);
  };
  const handleUngroup = () => {
    onUngroup?.();
    onSetMoreOpen(false);
  };
  const handleRowClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest('button, input, select, a, [data-tab-action-root="true"]')) return;
    void onFocus();
  };

  return (
    <div
      ref={sortable.setNodeRef}
      {...sortable.attributes}
      {...sortable.listeners}
      className="tm-tab-row"
      onClick={handleRowClick}
      data-compact={compact}
      data-active={tab.active}
      data-drop-id={`tab:${tab.id}`}
      data-depth={depth}
      data-dragging={dragPreview}
      data-menu-open={menuOpen}
      data-over={dropOnSelf}
      data-over-position={dropPosition ?? undefined}
      data-selected={selected}
      style={style}
    >
      <div className="tm-tab-leading">
        <div className="tm-tab-handle" title={labelMap.dragToReorder}>
          <RiDragMove2Line size={14} />
        </div>
        {selectable ? (
          <div className="tm-tab-select-slot">
            <span aria-hidden="true" className="tm-tab-sequence">
              {String(displayIndex).padStart(2, '0')}
            </span>
            <input checked={selected} onChange={onToggleSelect} onPointerDown={blockDrag} type="checkbox" />
          </div>
        ) : null}
      </div>
      {tab.favIconUrl ? (
        <img alt="" className="tm-favicon tm-favicon-small" src={tab.favIconUrl} />
      ) : (
        <div className="tm-favicon tm-favicon-small">{(tab.hostname || tab.title).slice(0, 1).toUpperCase()}</div>
      )}

      <div className="tm-tab-main">
        <div className="tm-tab-line">
          {(tab.pinned || tab.muted || tab.discarded || tab.frozen) ? (
            <span className="tm-tab-state-icons" aria-hidden="true">
              {tab.pinned ? (
                <span className="tm-tab-state-icon" data-kind="pinned">
                  <RiPushpin2Fill size={12} />
                </span>
              ) : null}
              {tab.muted ? (
                <span className="tm-tab-state-icon" data-kind="muted">
                  <RiVolumeMuteFill size={12} />
                </span>
              ) : null}
              {tab.discarded || tab.frozen ? (
                <span className="tm-tab-state-icon" data-kind="sleeping">
                  <RiMoonFill size={12} />
                </span>
              ) : null}
            </span>
          ) : null}
          <strong className="tm-tab-title">{tab.title}</strong>
          {tab.audible ? (
            <span className="tm-chip">
              {tab.muted ? <RiVolumeMuteLine size={12} /> : <RiVolumeUpLine size={12} />}
            </span>
          ) : null}
        </div>
        <div className="tm-tab-subline">
          <span className="tm-tab-subline-primary">{tab.hostname || tab.url}</span>
          <span aria-hidden="true">·</span>
          <span>{formatRelativeTime(tab.lastAccessed, locale)}</span>
          {!compact ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{formatDuration(tab.telemetry.totalActiveMs)}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="tm-row-actions-overlay" data-tab-action-root="true">
        <div className="tm-row-actions">
          <Tooltip content={labelMap.details}>
            <IconButton icon={RiArticleLine} label={labelMap.details} nativeTitle={false} onClick={onOpenDetail} />
          </Tooltip>
          <Tooltip content={labelMap.closeTab}>
            <IconButton icon={RiCloseLine} label={labelMap.closeTab} danger nativeTitle={false} onClick={onClose} />
          </Tooltip>
          <button
            ref={refs.setReference}
            aria-label={labelMap.moreActions}
            className="tm-icon-button tm-row-menu-trigger"
            data-open={menuOpen}
            type="button"
            {...getReferenceProps({
              onPointerDown: blockDrag
            })}
          >
            <RiMore2Line size={14} />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {menuOpen ? (
            <FloatingPortal>
              <motion.div
                ref={refs.setFloating}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="tm-row-menu"
                data-side={placement.split('-')[0]}
                data-tab-action-root="true"
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                style={floatingStyles}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                {...getFloatingProps()}
              >
                <motion.button
                  animate={{ opacity: 1, y: 0 }}
                  className="tm-row-menu-button"
                  exit={{ opacity: 0, y: 2 }}
                  initial={{ opacity: 0, y: 4 }}
                  onClick={handlePin}
                  onPointerDown={blockDrag}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  type="button"
                >
                  {tab.pinned ? <RiUnpinLine size={13} /> : <RiPushpin2Line size={13} />}
                  <span>{tab.pinned ? labelMap.unpin : labelMap.pin}</span>
                </motion.button>
                {onUngroup ? (
                  <motion.button
                    animate={{ opacity: 1, y: 0 }}
                    className="tm-row-menu-button"
                    exit={{ opacity: 0, y: 2 }}
                    initial={{ opacity: 0, y: 4 }}
                    onClick={handleUngroup}
                    onPointerDown={blockDrag}
                    transition={{ duration: 0.12, ease: 'easeOut' }}
                    type="button"
                  >
                    <RiScissorsCutLine size={13} />
                    <span>{labelMap.ungroup}</span>
                  </motion.button>
                ) : null}
                <motion.button
                  animate={{ opacity: 1, y: 0 }}
                  className="tm-row-menu-button"
                  exit={{ opacity: 0, y: 2 }}
                  initial={{ opacity: 0, y: 4 }}
                  onClick={handleMute}
                  onPointerDown={blockDrag}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  type="button"
                >
                  {tab.muted ? <RiVolumeUpLine size={13} /> : <RiVolumeMuteLine size={13} />}
                  <span>{tab.muted ? labelMap.unmute : labelMap.mute}</span>
                </motion.button>
                <motion.button
                  animate={{ opacity: 1, y: 0 }}
                  className="tm-row-menu-button"
                  exit={{ opacity: 0, y: 2 }}
                  initial={{ opacity: 0, y: 4 }}
                  onClick={handleSleep}
                  onPointerDown={blockDrag}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  type="button"
                >
                  <RiMoonLine size={13} />
                  <span>{labelMap.sleep}</span>
                </motion.button>
                <FloatingArrow
                  ref={menuArrowRef}
                  className="tm-row-menu-arrow"
                  context={context}
                  fill="var(--tm-row-menu-surface)"
                  height={6}
                  stroke="var(--tm-row-menu-border)"
                  strokeWidth={1}
                  tipRadius={2}
                  width={12}
                />
              </motion.div>
            </FloatingPortal>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DropZoneRow({
  id,
  icon: Icon,
  label
}: {
  id: string;
  icon: RemixiconComponentType;
  label: string;
}) {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div ref={setNodeRef} className="tm-drop-row" data-active={isOver} data-drop-id={id}>
      <Icon size={14} />
      <span>{label}</span>
    </div>
  );
}

function IconButton({
  icon: Icon,
  label,
  danger,
  nativeTitle = true,
  onClick
}: {
  icon: RemixiconComponentType;
  label: string;
  danger?: boolean;
  nativeTitle?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={danger ? 'tm-icon-button-danger' : 'tm-icon-button'}
      onClick={onClick}
      onPointerDown={blockDrag}
      title={nativeTitle ? label : undefined}
      type="button"
    >
      <Icon size={14} />
    </button>
  );
}
