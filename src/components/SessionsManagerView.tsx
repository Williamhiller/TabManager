import {
  RiAddLine,
  RiAddBoxLine,
  RiArrowDownSLine,
  RiDeleteBinLine,
  RiEdit2Line,
  RiExternalLinkLine,
  RiFolderHistoryLine,
  RiSave3Line,
  RiShieldCheckLine,
  RiWindow2Line,
  RiWindowLine
} from '@remixicon/react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type Dispatch, type MouseEvent, type Ref, type SetStateAction } from 'react';

import type { SessionRecord, SessionRestoreMode, SessionTabRecord, SessionWindowRecord, TabGroupColor } from '../lib/contracts';
import type { ResolvedLocale } from '../lib/i18n';
import { formatRelativeTime, getErrorMessage } from '../lib/format';
import { groupColorTokens } from '../lib/theme';
import {
  deleteSession,
  restoreSession,
  saveAllWindowsSession,
  saveCurrentWindowSession,
  updateSession
} from '../lib/runtime-client';
import { IconButton } from './IconButton';
import { blockDrag, groupChipStyle } from './tab-tree-helpers';
import { Tooltip } from './Tooltip';

interface SessionsManagerViewProps {
  isSidepanel: boolean;
  locale: string;
  mode?: 'dashboard' | 'default';
  openUrls: string[];
  query: string;
  refreshSessions: () => Promise<void>;
  scrollRef?: Ref<HTMLElement>;
  sessions: SessionRecord[];
}

type SessionTreeTab = {
  tab: SessionTabRecord;
  tabIndex: number;
};

type SessionGroupNode = {
  color: TabGroupColor;
  id: string;
  kind: 'group';
  tabs: SessionTreeTab[];
  title: string;
};

type SessionTreeNode = SessionGroupNode | (SessionTreeTab & { kind: 'tab' });

const sessionLabelMap = {
  en: {
    allWindows: 'Save all windows',
    appendCurrent: 'Append to current window',
    cancel: 'Cancel',
    currentWindow: 'Save current window',
    deleteLabel: 'Delete snapshot',
    deleting: 'Deleting snapshot…',
    duplicateConfirm: 'Most tabs in this snapshot are already open. Restore anyway?',
    edit: 'Edit snapshot',
    empty: 'No saved snapshots yet.',
    emptyHint: 'Save the current window or all windows to restore them later.',
    collapse: 'Collapse',
    expand: 'Expand',
    latestSnapshot: 'Auto snapshot',
    manual: 'Manual',
    openTab: 'Open this tab',
    pinned: 'Pinned',
    muted: 'Muted',
    recoverLatest: 'Recover latest snapshot',
    restore: 'Restore in new window',
    restorePartial: 'Restored with some failed tabs',
    restoring: 'Restoring snapshot…',
    save: 'Save',
    saveAll: 'Save all',
    saveCurrent: 'Save current',
    saved: 'Saved snapshots',
    saving: 'Saving snapshot…',
    titlePrompt: 'Snapshot name',
    tabs: 'tabs',
    windows: 'windows',
    updating: 'Updating snapshot…'
  },
  'zh-CN': {
        allWindows: '保存全部窗口',
        appendCurrent: '追加到当前窗口',
        cancel: '取消',
        currentWindow: '保存当前窗口',
        deleteLabel: '删除快照',
        deleting: '删除快照…',
        duplicateConfirm: '这个快照的大部分标签已经打开，仍然继续恢复吗？',
        edit: '编辑快照',
        empty: '还没有保存的快照。',
        emptyHint: '保存当前窗口或全部窗口，稍后可一键恢复。',
        collapse: '收起',
        expand: '展开',
        latestSnapshot: '自动备份',
        manual: '手动',
        openTab: '打开这个标签',
        pinned: '已固定',
        muted: '已静音',
        recoverLatest: '恢复最新自动备份',
        restore: '恢复到新窗口',
        restorePartial: '已恢复，部分标签失败',
        restoring: '恢复快照…',
        save: '保存',
        saveAll: '保存全部',
        saveCurrent: '保存当前',
        saved: '已保存快照',
        saving: '保存快照…',
        titlePrompt: '快照名称',
        tabs: '个标签',
        windows: '个窗口',
        updating: '更新快照…'
  },
  ja: {
    allWindows: 'すべてのウィンドウを保存',
    appendCurrent: '現在のウィンドウに追加',
    cancel: 'キャンセル',
    currentWindow: '現在のウィンドウを保存',
    deleteLabel: 'スナップショットを削除',
    deleting: 'スナップショットを削除中…',
    duplicateConfirm: 'このスナップショットの多くのタブは既に開いています。復元しますか？',
    edit: 'スナップショットを編集',
    empty: '保存済みスナップショットはまだありません。',
    emptyHint: '現在のウィンドウまたはすべてのウィンドウを保存すると、あとで復元できます。',
    collapse: '折りたたむ',
    expand: '展開',
    latestSnapshot: '自動バックアップ',
    manual: '手動',
    openTab: 'このタブを開く',
    pinned: '固定済み',
    muted: 'ミュート中',
    recoverLatest: '最新の自動バックアップを復元',
    restore: '新しいウィンドウに復元',
    restorePartial: '一部のタブを復元できませんでした',
    restoring: 'スナップショットを復元中…',
    save: '保存',
    saveAll: 'すべて保存',
    saveCurrent: '現在を保存',
    saved: '保存済みスナップショット',
    saving: 'スナップショットを保存中…',
    titlePrompt: 'スナップショット名',
    tabs: 'タブ',
    windows: 'ウィンドウ',
    updating: 'スナップショットを更新中…'
  },
  fr: {
    allWindows: 'Enregistrer toutes les fenêtres',
    appendCurrent: 'Ajouter à la fenêtre actuelle',
    cancel: 'Annuler',
    currentWindow: 'Enregistrer la fenêtre actuelle',
    deleteLabel: 'Supprimer l’instantané',
    deleting: 'Suppression de l’instantané…',
    duplicateConfirm: 'La plupart des onglets de cet instantané sont déjà ouverts. Restaurer quand même ?',
    edit: 'Modifier l’instantané',
    empty: 'Aucun instantané enregistré.',
    emptyHint: 'Enregistrez la fenêtre actuelle ou toutes les fenêtres pour les restaurer plus tard.',
    collapse: 'Réduire',
    expand: 'Développer',
    latestSnapshot: 'Sauvegarde auto',
    manual: 'Manuel',
    openTab: 'Ouvrir cet onglet',
    pinned: 'Épinglé',
    muted: 'Muet',
    recoverLatest: 'Restaurer la dernière sauvegarde',
    restore: 'Restaurer dans une nouvelle fenêtre',
    restorePartial: 'Restauré avec certains onglets en échec',
    restoring: 'Restauration de l’instantané…',
    save: 'Enregistrer',
    saveAll: 'Tout enregistrer',
    saveCurrent: 'Enregistrer',
    saved: 'Instantanés enregistrés',
    saving: 'Enregistrement de l’instantané…',
    titlePrompt: 'Nom de l’instantané',
    tabs: 'onglets',
    windows: 'fenêtres',
    updating: 'Mise à jour de l’instantané…'
  },
  es: {
    allWindows: 'Guardar todas las ventanas',
    appendCurrent: 'Añadir a la ventana actual',
    cancel: 'Cancelar',
    currentWindow: 'Guardar ventana actual',
    deleteLabel: 'Eliminar instantánea',
    deleting: 'Eliminando instantánea…',
    duplicateConfirm: 'La mayoría de pestañas de esta instantánea ya están abiertas. ¿Restaurar igualmente?',
    edit: 'Editar instantánea',
    empty: 'No hay instantáneas guardadas.',
    emptyHint: 'Guarda la ventana actual o todas las ventanas para restaurarlas después.',
    collapse: 'Contraer',
    expand: 'Expandir',
    latestSnapshot: 'Copia automática',
    manual: 'Manual',
    openTab: 'Abrir esta pestaña',
    pinned: 'Fijada',
    muted: 'Silenciada',
    recoverLatest: 'Restaurar la última copia',
    restore: 'Restaurar en ventana nueva',
    restorePartial: 'Restaurado con algunas pestañas fallidas',
    restoring: 'Restaurando instantánea…',
    save: 'Guardar',
    saveAll: 'Guardar todo',
    saveCurrent: 'Guardar actual',
    saved: 'Instantáneas guardadas',
    saving: 'Guardando instantánea…',
    titlePrompt: 'Nombre de instantánea',
    tabs: 'pestañas',
    windows: 'ventanas',
    updating: 'Actualizando instantánea…'
  },
  ar: {
    allWindows: 'حفظ كل النوافذ',
    appendCurrent: 'إضافة إلى النافذة الحالية',
    cancel: 'إلغاء',
    currentWindow: 'حفظ النافذة الحالية',
    deleteLabel: 'حذف اللقطة',
    deleting: 'جار حذف اللقطة…',
    duplicateConfirm: 'معظم تبويبات هذه اللقطة مفتوحة بالفعل. هل تريد الاستعادة؟',
    edit: 'تعديل اللقطة',
    empty: 'لا توجد لقطات محفوظة بعد.',
    emptyHint: 'احفظ النافذة الحالية أو كل النوافذ لاستعادتها لاحقا.',
    collapse: 'طي',
    expand: 'توسيع',
    latestSnapshot: 'نسخة تلقائية',
    manual: 'يدوي',
    openTab: 'فتح هذا التبويب',
    pinned: 'مثبت',
    muted: 'صامت',
    recoverLatest: 'استعادة أحدث نسخة تلقائية',
    restore: 'استعادة في نافذة جديدة',
    restorePartial: 'تمت الاستعادة مع فشل بعض التبويبات',
    restoring: 'جار استعادة اللقطة…',
    save: 'حفظ',
    saveAll: 'حفظ الكل',
    saveCurrent: 'حفظ الحالي',
    saved: 'اللقطات المحفوظة',
    saving: 'جار حفظ اللقطة…',
    titlePrompt: 'اسم اللقطة',
    tabs: 'تبويبات',
    windows: 'نوافذ',
    updating: 'جار تحديث اللقطة…'
  }
} satisfies Record<ResolvedLocale, Record<string, string>>;

function getSessionLabels(locale: string) {
  return sessionLabelMap[locale as ResolvedLocale] ?? sessionLabelMap.en;
}

function toggleExpandedValue(
  setter: Dispatch<SetStateAction<Set<string>>>,
  value: string
): void {
  setter((current) => {
    const next = new Set(current);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    return next;
  });
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function matchesSession(session: SessionRecord, query: string): boolean {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return true;
  const haystacks = [
    session.title,
    session.note,
    session.tags.join(' '),
    session.source,
    ...session.windows.flatMap((window) =>
      window.tabs.flatMap((tab) => [tab.title, tab.url, tab.hostname, tab.group?.title ?? ''])
    )
  ];

  return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
}

function getDuplicateRatio(session: SessionRecord, openUrls: Set<string>): number {
  const urls = session.windows.flatMap((window) => window.tabs.map((tab) => tab.url));
  if (urls.length === 0) return 0;
  return urls.filter((url) => openUrls.has(url)).length / urls.length;
}

function getSessionWindowTree(window: SessionWindowRecord): SessionTreeNode[] {
  const nodes: SessionTreeNode[] = [];
  let activeGroup: SessionGroupNode | null = null;
  let activeGroupKey = '';
  let groupIndex = 0;

  window.tabs.forEach((tab, tabIndex) => {
    if (!tab.group) {
      activeGroup = null;
      activeGroupKey = '';
      nodes.push({ kind: 'tab', tab, tabIndex });
      return;
    }

    const groupKey = `${tab.group.title}:${tab.group.color}`;
    if (!activeGroup || activeGroupKey !== groupKey) {
      activeGroup = {
        color: tab.group.color,
        id: `${groupKey}:${groupIndex}`,
        kind: 'group',
        tabs: [],
        title: tab.group.title
      };
      activeGroupKey = groupKey;
      groupIndex += 1;
      nodes.push(activeGroup);
    }

    activeGroup.tabs.push({ tab, tabIndex });
  });

  return nodes;
}

function handleTreeHeaderClick(event: MouseEvent<HTMLDivElement>, onToggle: () => void): void {
  if (!(event.target instanceof HTMLElement)) return;
  if (event.target.closest('button, input, select, a, [data-tab-action-root="true"]')) return;
  onToggle();
}

function SessionExpandToggle({
  expanded,
  label,
  onToggle
}: {
  expanded: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      className="tm-group-toggle"
      onClick={(event) => {
        blockDrag(event);
        onToggle();
      }}
      title={label}
      type="button"
    >
      <motion.span
        animate={{ rotate: expanded ? 0 : -90 }}
        className="tm-group-toggle-icon"
        transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.7 }}
      >
        <RiArrowDownSLine size={14} />
      </motion.span>
    </button>
  );
}

function SessionTabRow({
  labels,
  mode = 'default',
  onOpen,
  tab,
  tabIndex
}: {
  labels: ReturnType<typeof getSessionLabels>;
  mode?: 'dashboard' | 'default';
  onOpen: (url: string) => void;
  tab: SessionTabRecord;
  tabIndex: number;
}) {
  return (
    <button
      className={`tm-tab-row tm-session-tab-row${mode === 'dashboard' ? ' tm-session-tab-row-dashboard' : ''}`}
      data-compact="true"
      data-depth="1"
      onClick={() => onOpen(tab.url)}
      type="button"
    >
      <div className="tm-tab-leading">
        <span aria-hidden="true" className="tm-tab-sequence">
          {String(tabIndex + 1).padStart(2, '0')}
        </span>
      </div>
      {tab.favIconUrl ? (
        <img alt="" className="tm-favicon tm-favicon-small" src={tab.favIconUrl} />
      ) : (
        <div className="tm-favicon tm-favicon-small">{(tab.hostname || tab.title).slice(0, 1).toUpperCase()}</div>
      )}
      <div className="tm-tab-main">
        <div className="tm-tab-line">
          <strong className="tm-tab-title">{tab.title}</strong>
          {mode === 'dashboard' ? (
            <span className="tm-tab-subline tm-tab-subline-inline">
              <span className="tm-tab-subline-primary">{tab.hostname || tab.url}</span>
            </span>
          ) : null}
        </div>
        {mode === 'dashboard' ? null : (
          <div className="tm-tab-subline">
            <span className="tm-tab-subline-primary">{tab.hostname || tab.url}</span>
            {tab.pinned ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{labels.pinned}</span>
              </>
            ) : null}
            {tab.muted ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{labels.muted}</span>
              </>
            ) : null}
          </div>
        )}
      </div>
      <RiExternalLinkLine className="tm-session-tab-open-icon" size={12} />
    </button>
  );
}

function SessionWindowTree({
  expandedGroupIds,
  expandedWindowIds,
  labels,
  mode = 'default',
  onOpenTab,
  setExpandedGroupIds,
  setExpandedWindowIds,
  session
}: {
  expandedGroupIds: Set<string>;
  expandedWindowIds: Set<string>;
  labels: ReturnType<typeof getSessionLabels>;
  mode?: 'dashboard' | 'default';
  onOpenTab: (url: string) => void;
  setExpandedGroupIds: Dispatch<SetStateAction<Set<string>>>;
  setExpandedWindowIds: Dispatch<SetStateAction<Set<string>>>;
  session: SessionRecord;
}) {
  const renderTreeNodes = (
    treeNodes: SessionTreeNode[],
    parentKey: string,
    compact = false,
    root = false
  ) => (
    <div
      className={`tm-section-children${root ? ' tm-section-children-root' : ` tm-section-children-group${compact ? ' tm-section-children-group-compact' : ''}`}`}
    >
      {treeNodes.map((node) => {
        if (node.kind === 'tab') {
          const key = `${parentKey}:${node.tab.url}-${node.tabIndex}`;
          return (
            <SessionTabRow
              key={key}
              labels={labels}
              mode={mode}
              onOpen={onOpenTab}
              tab={node.tab}
              tabIndex={node.tabIndex}
            />
          );
        }

        const groupKey = `${parentKey}:${node.id}`;
        const groupExpanded = !expandedGroupIds.has(groupKey);

        const content = (
          <section className={`tm-section-block${mode === 'dashboard' ? ' tm-session-tree-node-dashboard' : ''}`}>
            <div
              className="tm-group-header tm-session-group-header"
              data-compact="true"
              onClick={(event) =>
                handleTreeHeaderClick(event, () => toggleExpandedValue(setExpandedGroupIds, groupKey))
              }
              style={groupChipStyle(node.color)}
            >
              <div className="tm-group-header-leading">
                <SessionExpandToggle
                  expanded={groupExpanded}
                  label={groupExpanded ? labels.collapse : labels.expand}
                  onToggle={() => toggleExpandedValue(setExpandedGroupIds, groupKey)}
                />
              </div>
              <div className="tm-group-title" title={node.title}>
                <span
                  className="tm-group-dot"
                  style={{ backgroundColor: groupColorTokens[node.color].solid }}
                />
                <span className="tm-group-title-label">{node.title}</span>
                <span className="tm-group-count">{node.tabs.length}</span>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {groupExpanded ? (
                <motion.div
                  animate={{ height: 'auto', opacity: 1, y: 0 }}
                  className="overflow-hidden"
                  exit={{ height: 0, opacity: 0, y: -4 }}
                  initial={{ height: 0, opacity: 0, y: -6 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                  {renderTreeNodes(node.tabs.map((tab) => ({ ...tab, kind: 'tab' as const })), groupKey, true)}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        );

        return mode === 'dashboard' ? (
          <section className="tm-section-block" key={groupKey}>
            {content}
          </section>
        ) : (
          <section className="tm-section-block" key={groupKey}>
            <div
              className="tm-group-header tm-session-group-header"
              data-compact="true"
              onClick={(event) =>
                handleTreeHeaderClick(event, () => toggleExpandedValue(setExpandedGroupIds, groupKey))
              }
              style={groupChipStyle(node.color)}
            >
              <div className="tm-group-header-leading">
                <SessionExpandToggle
                  expanded={groupExpanded}
                  label={groupExpanded ? labels.collapse : labels.expand}
                  onToggle={() => toggleExpandedValue(setExpandedGroupIds, groupKey)}
                />
              </div>
              <div className="tm-group-title" title={node.title}>
                <span
                  className="tm-group-dot"
                  style={{ backgroundColor: groupColorTokens[node.color].solid }}
                />
                <span className="tm-group-title-label">{node.title}</span>
                <span className="tm-group-count">{node.tabs.length}</span>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {groupExpanded ? (
                <motion.div
                  animate={{ height: 'auto', opacity: 1, y: 0 }}
                  className="overflow-hidden"
                  exit={{ height: 0, opacity: 0, y: -4 }}
                  initial={{ height: 0, opacity: 0, y: -6 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                  {renderTreeNodes(node.tabs.map((tab) => ({ ...tab, kind: 'tab' as const })), groupKey, true)}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );

  return (
    <div className="tm-section-children tm-session-section-children">
      {session.windows.map((window, windowIndex) => {
        const windowKey = `${session.id}:${window.id}`;
        const windowExpanded = !expandedWindowIds.has(windowKey);
        const treeNodes = getSessionWindowTree(window);
        const shouldFlattenWindow = mode === 'dashboard' && session.windows.length === 1;

        if (shouldFlattenWindow) {
          return (
            <section className="tm-section-block tm-session-window-block tm-session-window-block-dashboard-flat" key={window.id}>
              {renderTreeNodes(treeNodes, windowKey, false, true)}
            </section>
          );
        }

        return (
          <section className="tm-section-block tm-session-window-block" key={window.id}>
            <div
              className="tm-group-header tm-session-window-header"
              data-compact="true"
              onClick={(event) =>
                handleTreeHeaderClick(event, () => toggleExpandedValue(setExpandedWindowIds, windowKey))
              }
            >
              <div className="tm-group-header-leading">
                <SessionExpandToggle
                  expanded={windowExpanded}
                  label={windowExpanded ? labels.collapse : labels.expand}
                  onToggle={() => toggleExpandedValue(setExpandedWindowIds, windowKey)}
                />
              </div>
              <div className="tm-group-title">
                <RiWindowLine size={13} />
                <span className="tm-group-title-label">Window {windowIndex + 1}</span>
                <span className="tm-group-count">{window.tabs.length}</span>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {windowExpanded ? (
                <motion.div
                  animate={{ height: 'auto', opacity: 1, y: 0 }}
                  className="overflow-hidden"
                  exit={{ height: 0, opacity: 0, y: -4 }}
                  initial={{ height: 0, opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  <div className={`tm-session-window-children${mode === 'dashboard' ? ' tm-session-window-children-dashboard' : ''}`}>
                    {renderTreeNodes(treeNodes, windowKey)}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}

export function SessionsManagerView({
  isSidepanel,
  locale,
  mode = 'default',
  openUrls,
  query,
  refreshSessions,
  scrollRef,
  sessions
}: SessionsManagerViewProps) {
  const labels = getSessionLabels(locale);
  const autoSessions = useMemo(
    () => sessions.filter((session) => session.source === 'auto'),
    [sessions]
  );
  const manualSessions = useMemo(
    () => sessions.filter((session) => session.source !== 'auto'),
    [sessions]
  );
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(() => new Set());
  const [autoSessionExpanded, setAutoSessionExpanded] = useState(false);
  const [expandedWindowIds, setExpandedWindowIds] = useState<Set<string>>(() => new Set());
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [editingSession, setEditingSession] = useState<SessionRecord | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [restoreConfirmation, setRestoreConfirmation] = useState<{
    mode: SessionRestoreMode;
    session: SessionRecord;
  } | null>(null);
  const openUrlSet = useMemo(() => new Set(openUrls), [openUrls]);
  const filteredSessions = useMemo(
    () => manualSessions.filter((session) => matchesSession(session, query)),
    [manualSessions, query]
  );

  const execute = async (message: string, task: () => Promise<string | null | void>) => {
    try {
      setStatus(message);
      const nextStatus = await task();
      setStatus(nextStatus ?? null);
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  };

  const handleSaveCurrentWindow = () => {
    void execute(labels.saving, async () => {
      await saveCurrentWindowSession();
      await refreshSessions();
    });
  };

  const handleSaveAllWindows = () => {
    void execute(labels.saving, async () => {
      await saveAllWindowsSession();
      await refreshSessions();
    });
  };

  const runRestore = (session: SessionRecord, mode: SessionRestoreMode) => {
    void execute(labels.restoring, async () => {
      const result = await restoreSession(session.id, mode);
      if (result.failedCount > 0) {
        return `${labels.restorePartial}: ${result.failedCount}`;
      }
    });
  };

  const handleRestore = (session: SessionRecord, mode: SessionRestoreMode) => {
    if (getDuplicateRatio(session, openUrlSet) >= 0.8) {
      setRestoreConfirmation({ session, mode });
      return;
    }

    runRestore(session, mode);
  };

  const confirmRestore = () => {
    if (!restoreConfirmation) return;
    const { session, mode } = restoreConfirmation;
    setRestoreConfirmation(null);
    runRestore(session, mode);
  };

  const openSessionTab = (url: string) => {
    void chrome.tabs.create({ url, active: true });
  };

  const openEditor = (session: SessionRecord) => {
    setEditingSession(session);
    setEditTitle(session.title);
  };

  const handleUpdate = () => {
    if (!editingSession) return;
    void execute(labels.updating, async () => {
      await updateSession(editingSession.id, {
        title: editTitle
      });
      setEditingSession(null);
      await refreshSessions();
    });
  };

  const handleDelete = (sessionId: string) => {
    void execute(labels.deleting, async () => {
      await deleteSession(sessionId);
      setExpandedSessionIds((current) => {
        const next = new Set(current);
        next.delete(sessionId);
        return next;
      });
      await refreshSessions();
    });
  };

  const shellClassName =
    mode === 'dashboard' ? 'tm-tree-shell tm-session-shell-dashboard' : 'tm-panel tm-tree-shell';
  const treeListClassName = `tm-tree-list${isSidepanel ? ' tm-tree-list-sidepanel' : ' tm-scrollbar'}${
    mode === 'dashboard' ? ' tm-session-tree-list-dashboard' : ''
  }`;

  return (
    <section className={shellClassName} ref={isSidepanel ? scrollRef : undefined}>
      <div className={treeListClassName}>
        <div className="tm-session-actions">
          <button className="tm-button-primary tm-session-action tm-session-action-primary" onClick={handleSaveCurrentWindow} type="button">
            <RiSave3Line size={13} />
            {labels.saveCurrent}
          </button>
          <button className="tm-button tm-session-action" onClick={handleSaveAllWindows} type="button">
            <RiAddLine size={13} />
            {labels.saveAll}
          </button>
        </div>

        {autoSessions.length > 0 ? (
          <section className="tm-section-block tm-session-recovery-block">
            <div
              className="tm-session-recovery"
              data-active={autoSessionExpanded}
              onClick={(event) =>
                handleTreeHeaderClick(event, () => setAutoSessionExpanded((current) => !current))
              }
            >
              <div className="tm-group-header-leading">
                <SessionExpandToggle
                  expanded={autoSessionExpanded}
                  label={autoSessionExpanded ? labels.collapse : labels.expand}
                  onToggle={() => setAutoSessionExpanded((current) => !current)}
                />
              </div>
              <span className="tm-session-recovery-icon">
                <RiShieldCheckLine size={13} />
              </span>
              <div className="tm-session-recovery-copy">
                <div>
                  <strong>{labels.recoverLatest}</strong>
                  <span>
                    {autoSessions.length} {labels.latestSnapshot} · {autoSessions[0].title}
                  </span>
                </div>
              </div>
            </div>
            <AnimatePresence initial={false}>
              {autoSessionExpanded ? (
                <motion.div
                  animate={{ height: 'auto', opacity: 1, y: 0 }}
                  className="overflow-hidden"
                  exit={{ height: 0, opacity: 0, y: -6 }}
                  initial={{ height: 0, opacity: 0, y: -10 }}
                  transition={{
                    height: { type: 'spring', stiffness: 360, damping: 30, mass: 0.82 },
                    opacity: { duration: 0.16, ease: 'easeOut' },
                    y: { type: 'spring', stiffness: 420, damping: 32, mass: 0.72 }
                  }}
                >
                  <div className="tm-session-tree tm-auto-session-tree">
                    {autoSessions.map((session) => {
                      const sessionExpanded = expandedSessionIds.has(session.id);

                      return (
                        <section className="tm-section-block tm-session-block tm-auto-session-block" key={session.id}>
                          <div
                            className="tm-group-header tm-session-header"
                            data-active={sessionExpanded}
                            data-compact="true"
                            onClick={(event) =>
                              handleTreeHeaderClick(event, () =>
                                toggleExpandedValue(setExpandedSessionIds, session.id)
                              )
                            }
                          >
                            <div className="tm-group-header-leading">
                              <SessionExpandToggle
                                expanded={sessionExpanded}
                                label={sessionExpanded ? labels.collapse : labels.expand}
                                onToggle={() => toggleExpandedValue(setExpandedSessionIds, session.id)}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="tm-session-header-topline">
                                <div className="tm-group-title tm-session-card-title" title={session.title}>
                                  <span className="tm-group-title-label">{session.title}</span>
                                </div>
                              </div>
                              <div className="tm-session-header-meta">
                                <span>
                                  {session.stats.windowCount} {labels.windows}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {session.stats.tabCount} {labels.tabs}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{formatRelativeTime(session.updatedAt, locale)}</span>
                              </div>
                            </div>

                            <div className="tm-group-actions tm-session-actions-inline" data-tab-action-root="true">
                              <Tooltip content={labels.restore}>
                                <IconButton
                                  icon={RiWindow2Line}
                                  label={labels.restore}
                                  nativeTitle={false}
                                  onClick={() => handleRestore(session, 'new-window')}
                                />
                              </Tooltip>
                              <Tooltip content={labels.appendCurrent}>
                                <IconButton
                                  icon={RiAddBoxLine}
                                  label={labels.appendCurrent}
                                  nativeTitle={false}
                                  onClick={() => handleRestore(session, 'current-window')}
                                />
                              </Tooltip>
                            </div>
                          </div>

                          <AnimatePresence initial={false}>
                            {sessionExpanded ? (
                              <motion.div
                                animate={{ height: 'auto', opacity: 1, y: 0 }}
                                className="overflow-hidden"
                                exit={{ height: 0, opacity: 0, y: -6 }}
                                initial={{ height: 0, opacity: 0, y: -10 }}
                                transition={{
                                  height: { type: 'spring', stiffness: 360, damping: 30, mass: 0.82 },
                                  opacity: { duration: 0.16, ease: 'easeOut' },
                                  y: { type: 'spring', stiffness: 420, damping: 32, mass: 0.72 }
                                }}
                              >
                                <SessionWindowTree
                                  expandedGroupIds={expandedGroupIds}
                                  expandedWindowIds={expandedWindowIds}
                                  labels={labels}
                                  mode={mode}
                                  onOpenTab={openSessionTab}
                                  session={session}
                                  setExpandedGroupIds={setExpandedGroupIds}
                                  setExpandedWindowIds={setExpandedWindowIds}
                                />
                              </motion.div>
                            ) : null}
                          </AnimatePresence>
                        </section>
                      );
                    })}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </section>
        ) : null}

        {status ? <div className="tm-bookmark-status">{status}</div> : null}

        {filteredSessions.length === 0 ? (
          <div className="tm-empty">
            <RiFolderHistoryLine size={16} />
            <div>
              <div className="font-medium">{labels.empty}</div>
              <div className="tm-subtle">{labels.emptyHint}</div>
            </div>
          </div>
        ) : (
          <div className="tm-session-tree">
            {filteredSessions.map((session) => {
              const sessionExpanded = expandedSessionIds.has(session.id);

              return (
                <section className="tm-section-block tm-session-block" key={session.id}>
                  <div
                    className="tm-group-header tm-session-header"
                    data-compact="true"
                    data-active={sessionExpanded}
                    onClick={(event) =>
                      handleTreeHeaderClick(event, () =>
                        toggleExpandedValue(setExpandedSessionIds, session.id)
                      )
                    }
                  >
                    <div className="tm-group-header-leading">
                      <SessionExpandToggle
                        expanded={sessionExpanded}
                        label={sessionExpanded ? labels.collapse : labels.expand}
                        onToggle={() => toggleExpandedValue(setExpandedSessionIds, session.id)}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="tm-session-header-topline">
                        <div className="tm-group-title tm-session-card-title" title={session.title}>
                          <span className="tm-group-title-label">{session.title}</span>
                        </div>
                        <span className="tm-session-source-badge">{labels.manual}</span>
                      </div>
                      <div className="tm-session-header-meta">
                        <span>
                          {session.stats.windowCount} {labels.windows}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {session.stats.tabCount} {labels.tabs}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatRelativeTime(session.updatedAt, locale)}</span>
                      </div>
                    </div>

                    <div className="tm-group-actions tm-session-actions-inline" data-tab-action-root="true">
                      <Tooltip content={labels.restore}>
                        <IconButton
                          icon={RiWindow2Line}
                          label={labels.restore}
                          nativeTitle={false}
                          onClick={() => handleRestore(session, 'new-window')}
                        />
                      </Tooltip>
                      <Tooltip content={labels.appendCurrent}>
                        <IconButton
                          icon={RiAddBoxLine}
                          label={labels.appendCurrent}
                          nativeTitle={false}
                          onClick={() => handleRestore(session, 'current-window')}
                        />
                      </Tooltip>
                      <Tooltip content={labels.edit}>
                        <IconButton
                          icon={RiEdit2Line}
                          label={labels.edit}
                          nativeTitle={false}
                          onClick={() => openEditor(session)}
                        />
                      </Tooltip>
                      <Tooltip content={labels.deleteLabel}>
                        <IconButton
                          danger
                          icon={RiDeleteBinLine}
                          label={labels.deleteLabel}
                          nativeTitle={false}
                          onClick={() => handleDelete(session.id)}
                        />
                      </Tooltip>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {sessionExpanded ? (
                      <motion.div
                        animate={{ height: 'auto', opacity: 1, y: 0 }}
                        className="overflow-hidden"
                        exit={{ height: 0, opacity: 0, y: -6 }}
                        initial={{ height: 0, opacity: 0, y: -10 }}
                        transition={{
                          height: { type: 'spring', stiffness: 360, damping: 30, mass: 0.82 },
                          opacity: { duration: 0.16, ease: 'easeOut' },
                          y: { type: 'spring', stiffness: 420, damping: 32, mass: 0.72 }
                        }}
                      >
                        <SessionWindowTree
                          expandedGroupIds={expandedGroupIds}
                          expandedWindowIds={expandedWindowIds}
                          labels={labels}
                          mode={mode}
                          onOpenTab={openSessionTab}
                          session={session}
                          setExpandedGroupIds={setExpandedGroupIds}
                          setExpandedWindowIds={setExpandedWindowIds}
                        />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {editingSession ? (
        <div className="tm-bookmark-dialog-backdrop" onClick={() => setEditingSession(null)}>
          <div className="tm-group-edit-menu tm-bookmark-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="tm-group-edit-section">
              <div className="tm-bookmark-dialog-title">{labels.edit}</div>
              <label className="tm-bookmark-dialog-field">
                <span>{labels.titlePrompt}</span>
                <input className="tm-group-edit-input" onChange={(event) => setEditTitle(event.target.value)} value={editTitle} />
              </label>
            </div>
            <div className="tm-group-edit-actions tm-bookmark-dialog-actions">
              <button className="tm-button" onClick={() => setEditingSession(null)} type="button">
                {labels.cancel}
              </button>
              <button className="tm-button-primary" onClick={handleUpdate} type="button">
                {labels.save}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {restoreConfirmation ? (
        <div className="tm-bookmark-dialog-backdrop" onClick={() => setRestoreConfirmation(null)}>
          <div className="tm-group-edit-menu tm-bookmark-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="tm-group-edit-section">
              <div className="tm-bookmark-dialog-title">{labels.restore}</div>
              <p className="tm-bookmark-dialog-copy">{labels.duplicateConfirm}</p>
            </div>
            <div className="tm-group-edit-actions tm-bookmark-dialog-actions">
              <button className="tm-button" onClick={() => setRestoreConfirmation(null)} type="button">
                {labels.cancel}
              </button>
              <button className="tm-button-primary" onClick={confirmRestore} type="button">
                {labels.restore}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
