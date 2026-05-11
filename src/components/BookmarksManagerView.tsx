import { CSS } from '@dnd-kit/utilities';
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
  useFloating,
  useHover,
  useInteractions,
  useRole
} from '@floating-ui/react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { defaultAnimateLayoutChanges, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  RiArrowDownSLine,
  RiArrowRightUpLine,
  RiBookmarkLine,
  RiDeleteBinLine,
  RiDragMove2Line,
  RiEdit2Line,
  RiFolderAddLine,
  RiFolderLine,
  RiLinksLine,
  RiMore2Line,
  RiStarLine
} from '@remixicon/react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';

import type { BookmarkNodeSnapshot } from '../lib/contracts';
import {
  createBookmarkFolder,
  createBookmarkFromActiveTab,
  deleteBookmark,
  moveBookmark,
  updateBookmark
} from '../lib/runtime-client';
import { formatRelativeTime, getErrorMessage } from '../lib/format';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';
import { blockDrag } from './tab-tree-helpers';

interface BookmarksManagerViewProps {
  bookmarks: BookmarkNodeSnapshot[];
  isSidepanel: boolean;
  locale: string;
  query: string;
  refreshBookmarks: () => Promise<void>;
  scrollRef?: Ref<HTMLElement>;
}

type BookmarkDialogState =
  | {
      kind: 'edit';
      node: BookmarkNodeSnapshot;
      title: string;
      url: string;
    };

type BookmarkDropPosition = 'before' | 'after' | 'inside';

type ParsedBookmarkDropId =
  | { kind: 'root'; id: string }
  | { kind: 'node'; id: string }
  | null;

interface TreeNodeMeta {
  node: BookmarkNodeSnapshot;
  depth: number;
  parentId: string | null;
  rootId: string;
}

interface FilterResult {
  nodes: BookmarkNodeSnapshot[];
  matchedCount: number;
}

const ROOT_ORDER = ['1', '2', '3'];
const collisionDetectionStrategy: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

function buildBookmarkFaviconUrl(url: string | null): string | null {
  const trimmedUrl = url?.trim();
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
): Exclude<BookmarkDropPosition, 'inside'> {
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

  return (
    document.querySelector<HTMLElement>(`[data-drop-id="${escapedId}"]`)?.getBoundingClientRect() ??
    null
  );
}

function parseDropId(value: string | null | undefined): ParsedBookmarkDropId {
  if (!value) return null;
  if (value.startsWith('bookmark-root:')) {
    return { kind: 'root', id: value.slice('bookmark-root:'.length) };
  }
  if (value.startsWith('bookmark-node:')) {
    return { kind: 'node', id: value.slice('bookmark-node:'.length) };
  }
  return null;
}

function collectNodeIds(nodes: BookmarkNodeSnapshot[]): string[] {
  return nodes.flatMap((node) => [
    `bookmark-node:${node.id}`,
    ...collectNodeIds(node.children)
  ]);
}

function countBookmarksOnly(node: BookmarkNodeSnapshot): number {
  return node.children.reduce(
    (total, child) => total + (child.url ? 1 : 0) + countBookmarksOnly(child),
    0
  );
}

function nodeContainsDescendant(node: BookmarkNodeSnapshot, targetId: string): boolean {
  return node.children.some(
    (child) => child.id === targetId || nodeContainsDescendant(child, targetId)
  );
}

function getDomainLabel(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getBookmarkPrimaryLabel(node: BookmarkNodeSnapshot): string {
  return node.title || (node.url ? getDomainLabel(node.url) || node.url : 'Untitled');
}

function getRootLabel(node: BookmarkNodeSnapshot, locale: string): string {
  if (node.folderType === 'bookmarks-bar') {
    return locale === 'zh-CN' ? '书签栏' : 'Bookmarks bar';
  }
  if (node.folderType === 'other') {
    return locale === 'zh-CN' ? '其他书签' : 'Other bookmarks';
  }
  if (node.folderType === 'mobile') {
    return locale === 'zh-CN' ? '移动设备书签' : 'Mobile bookmarks';
  }
  return getBookmarkPrimaryLabel(node);
}

function getBookmarkLabels(locale: string) {
  return locale === 'zh-CN'
    ? {
        addCurrentTab: '添加当前标签页',
        bookmarksWorkspace: '书签空间',
        creatingFolder: '创建文件夹…',
        deleteLabel: '删除',
        deleting: '删除中…',
        drag: '拖拽排序',
        edit: '编辑',
        editNamePrompt: '修改名称',
        editUrlPrompt: '修改链接',
        items: '项',
        matchedSuffix: '项匹配',
        more: '更多操作',
        move: '移动书签…',
        newFolder: '新建文件夹',
        open: '打开',
        openInNewTab: '在新标签打开',
        refresh: '刷新书签',
        rename: '重命名',
        rootLocal: '本地',
        rootMetaLocal: '本地',
        rootMetaSync: '账号',
        rootSync: '账号',
        rootMobile: '移动设备书签',
        rootOther: '其他书签',
        rootToolbar: '书签栏',
        savingCurrentTab: '添加当前标签页…',
        updatingBookmark: '更新书签…',
        updatingFolder: '更新文件夹…'
      }
    : {
        addCurrentTab: 'Add current tab',
        bookmarksWorkspace: 'Bookmarks workspace',
        creatingFolder: 'Creating folder…',
        deleteLabel: 'Delete',
        deleting: 'Deleting…',
        drag: 'Drag to reorder',
        edit: 'Edit',
        editNamePrompt: 'Rename',
        editUrlPrompt: 'Edit URL',
        items: 'items',
        matchedSuffix: 'matched',
        more: 'More actions',
        move: 'Moving bookmark…',
        newFolder: 'New folder',
        open: 'Open',
        openInNewTab: 'Open in new tab',
        refresh: 'Refresh bookmarks',
        rename: 'Rename',
        rootLocal: 'Local',
        rootMetaLocal: 'Local',
        rootMetaSync: 'Account',
        rootSync: 'Account',
        rootMobile: 'Mobile bookmarks',
        rootOther: 'Other bookmarks',
        rootToolbar: 'Bookmarks bar',
        savingCurrentTab: 'Saving current tab…',
        updatingBookmark: 'Updating bookmark…',
        updatingFolder: 'Updating folder…'
      };
}

function getRootDisplay(node: BookmarkNodeSnapshot, labels: ReturnType<typeof getBookmarkLabels>, locale: string): { title: string; meta: string } {
  const baseTitle =
    node.folderType === 'bookmarks-bar'
      ? labels.rootToolbar
      : node.folderType === 'other'
        ? labels.rootOther
        : node.folderType === 'mobile'
          ? labels.rootMobile
          : getRootLabel(node, locale);
  const sourceLabel = node.syncing ? labels.rootSync : labels.rootLocal;

  return {
    title: locale === 'zh-CN' ? `${sourceLabel}·${baseTitle}` : `${sourceLabel} · ${baseTitle}`,
    meta: node.syncing ? labels.rootMetaSync : labels.rootMetaLocal
  };
}

function filterBookmarkNodes(nodes: BookmarkNodeSnapshot[], query: string): FilterResult {
  if (!query) {
    return {
      nodes,
      matchedCount: nodes.reduce(
        (total, node) => total + (node.url ? 1 : 0) + countBookmarksOnly(node),
        0
      )
    };
  }

  let matchedCount = 0;
  const nextNodes = nodes.flatMap((node) => {
    const childrenResult = filterBookmarkNodes(node.children, query);
    const haystacks = [node.title, node.url ?? '', getDomainLabel(node.url)];
    const selfMatches = haystacks.some((value) => value.toLowerCase().includes(query));

    if (!selfMatches && childrenResult.nodes.length === 0) {
      return [];
    }

    matchedCount += (selfMatches && node.url ? 1 : 0) + childrenResult.matchedCount;
    return [{ ...node, children: childrenResult.nodes }];
  });

  return { nodes: nextNodes, matchedCount };
}

function flattenTree(nodes: BookmarkNodeSnapshot[], rootId: string, depth = 0, parentId: string | null = null): TreeNodeMeta[] {
  return nodes.flatMap((node) => [
    { node, depth, parentId, rootId },
    ...flattenTree(node.children, rootId, depth + 1, node.id)
  ]);
}

function getBookmarkMoveTarget(
  nodes: BookmarkNodeSnapshot[],
  bookmarkId: string,
  over: ParsedBookmarkDropId,
  dropPosition: BookmarkDropPosition
): { parentId: string; index: number } | null {
  if (!over) return null;

  const rootsById = new Map(nodes.map((node) => [node.id, node]));
  const metas = nodes.flatMap((root) => flattenTree(root.children, root.id, 0, root.id));
  const metaById = new Map(metas.map((meta) => [meta.node.id, meta]));
  const draggedMeta = metaById.get(bookmarkId);
  if (!draggedMeta) return null;

  const siblingsOf = (parentId: string | null, rootId: string): BookmarkNodeSnapshot[] => {
    if (parentId == null) return [];
    if (parentId === rootId) {
      return rootsById.get(rootId)?.children ?? [];
    }
    return metaById.get(parentId)?.node.children ?? [];
  };

  if (over.kind === 'root') {
    if (dropPosition === 'inside') {
      const root = rootsById.get(over.id);
      if (!root) return null;
      return { parentId: root.id, index: root.children.length };
    }

    const siblings = rootsById.get(over.id)?.children ?? [];
    return { parentId: over.id, index: dropPosition === 'before' ? 0 : siblings.length };
  }

  const targetMeta = metaById.get(over.id);
  if (!targetMeta || targetMeta.node.id === bookmarkId) return null;
  if (nodeContainsDescendant(draggedMeta.node, targetMeta.node.id)) return null;

  if (dropPosition === 'inside' && targetMeta.node.url == null) {
    return {
      parentId: targetMeta.node.id,
      index: targetMeta.node.children.length
    };
  }

  const targetParentId = targetMeta.parentId;
  if (!targetParentId) return null;
  const siblings = siblingsOf(targetParentId, targetMeta.rootId);
  const targetIndex = siblings.findIndex((entry) => entry.id === targetMeta.node.id);
  if (targetIndex < 0) return null;

  let index = dropPosition === 'before' ? targetIndex : targetIndex + 1;
  if (targetParentId === draggedMeta.parentId) {
    const currentIndex = siblings.findIndex((entry) => entry.id === bookmarkId);
    if (currentIndex >= 0 && currentIndex < index) {
      index -= 1;
    }
  }

  return {
    parentId: targetParentId,
    index
  };
}

function BookmarkRow({
  active,
  children,
  compact,
  depth,
  dragSortingLocked,
  dragPreview,
  menuOpen,
  over,
  overPosition,
  rowId,
  sortable
}: {
  active?: boolean;
  children: ReactNode;
  compact?: boolean;
  depth: number;
  dragSortingLocked: boolean;
  dragPreview: boolean;
  menuOpen: boolean;
  over: boolean;
  overPosition: BookmarkDropPosition | null;
  rowId: string;
  sortable: ReturnType<typeof useSortable>;
}) {
  const style = dragSortingLocked
    ? undefined
    : {
        transform: sortable.isDragging ? undefined : CSS.Transform.toString(sortable.transform),
        transition: sortable.isDragging ? undefined : sortable.transition
      };

  return (
    <div
      ref={sortable.setNodeRef}
      {...sortable.attributes}
      {...sortable.listeners}
      className="tm-tab-row tm-bookmark-row"
      data-active={active}
      data-bookmark-kind="item"
      data-compact={compact}
      data-depth={depth}
      data-dragging={dragPreview}
      data-drop-id={rowId}
      data-menu-open={menuOpen}
      data-over={over}
      data-over-position={overPosition ?? undefined}
      data-selected={false}
      style={style}
    >
      {children}
    </div>
  );
}

function BookmarkLeafRow({
  dragSortingLocked,
  dragPreview,
  labels,
  locale,
  menuOpen,
  node,
  onDelete,
  onEdit,
  onOpen,
  onOpenNewTab,
  onSetMoreOpen,
  overDropId,
  overDropPosition
}: {
  dragSortingLocked: boolean;
  dragPreview: boolean;
  labels: ReturnType<typeof getBookmarkLabels>;
  locale: string;
  menuOpen: boolean;
  node: BookmarkNodeSnapshot;
  onDelete: () => void;
  onEdit: () => void;
  onOpen: () => void;
  onOpenNewTab: () => void;
  onSetMoreOpen: (open: boolean) => void;
  overDropId: string | null;
  overDropPosition: BookmarkDropPosition | null;
}) {
  const sortable = useSortable({
    id: `bookmark-node:${node.id}`,
    transition: null,
    animateLayoutChanges: (args) => (args.isSorting ? defaultAnimateLayoutChanges(args) : false)
  });
  const [openByHover, setOpenByHover] = useState(false);
  const arrowRef = useRef<SVGSVGElement | null>(null);
  const { refs, floatingStyles, context, placement } = useFloating({
    open: menuOpen || openByHover,
    onOpenChange: (nextOpen) => {
      setOpenByHover(nextOpen);
      onSetMoreOpen(nextOpen);
    },
    placement: 'bottom-end',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: arrowRef, padding: 10 })]
  });
  const hover = useHover(context, {
    move: false,
    delay: { open: 70, close: 90 },
    handleClose: safePolygon()
  });
  const click = useClick(context, { event: 'click', toggle: false });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, click, dismiss, role]);

  const rowId = `bookmark-node:${node.id}`;
  const domain = getDomainLabel(node.url);
  const timeLabel = formatRelativeTime(node.dateAdded, locale);
  const faviconUrl = buildBookmarkFaviconUrl(node.url);

  return (
    <BookmarkRow
      active={false}
      compact={false}
      depth={0}
      dragSortingLocked={dragSortingLocked}
      dragPreview={dragPreview}
      menuOpen={menuOpen}
      over={overDropId === rowId}
      overPosition={overDropId === rowId ? overDropPosition : null}
      rowId={rowId}
      sortable={sortable}
    >
      <div className="tm-tab-leading">
        <div className="tm-tab-handle" title={labels.drag}>
          <RiDragMove2Line size={14} />
        </div>
      </div>
      {faviconUrl ? (
        <img alt="" className="tm-favicon tm-favicon-small" src={faviconUrl} />
      ) : (
        <div className="tm-favicon tm-favicon-small">
          {domain ? domain.slice(0, 1).toUpperCase() : <RiBookmarkLine size={14} />}
        </div>
      )}
      <div className="tm-tab-main">
        <button className="tm-bookmark-open-button" onClick={onOpen} type="button">
          <div className="tm-tab-line">
            <strong className="tm-tab-title">{getBookmarkPrimaryLabel(node)}</strong>
          </div>
          <div className="tm-tab-subline">
            <span className="tm-tab-subline-primary">{domain || node.url || ''}</span>
            <span aria-hidden="true">·</span>
            <span>{timeLabel}</span>
          </div>
        </button>
      </div>
      <div className="tm-row-actions-overlay" data-tab-action-root="true">
        <div className="tm-row-actions">
          <Tooltip content={labels.open}>
            <IconButton icon={RiArrowRightUpLine} label={labels.open} nativeTitle={false} onClick={onOpen} />
          </Tooltip>
          <Tooltip content={labels.edit}>
            <IconButton icon={RiEdit2Line} label={labels.edit} nativeTitle={false} onClick={onEdit} />
          </Tooltip>
          <button
            ref={refs.setReference}
            aria-label={labels.more}
            className="tm-icon-button tm-row-menu-trigger"
            data-open={menuOpen}
            type="button"
            {...getReferenceProps({ onPointerDown: blockDrag })}
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
                <button className="tm-row-menu-button" onClick={onOpen} onPointerDown={blockDrag} type="button">
                  <RiArrowRightUpLine size={13} />
                  <span>{labels.open}</span>
                </button>
                <button className="tm-row-menu-button" onClick={onOpenNewTab} onPointerDown={blockDrag} type="button">
                  <RiLinksLine size={13} />
                  <span>{labels.openInNewTab}</span>
                </button>
                <button className="tm-row-menu-button" onClick={onEdit} onPointerDown={blockDrag} type="button">
                  <RiEdit2Line size={13} />
                  <span>{labels.edit}</span>
                </button>
                <button className="tm-row-menu-button tm-row-menu-button-danger" onClick={onDelete} onPointerDown={blockDrag} type="button">
                  <RiDeleteBinLine size={13} />
                  <span>{labels.deleteLabel}</span>
                </button>
                <FloatingArrow ref={arrowRef} className="tm-row-menu-arrow" context={context} />
              </motion.div>
            </FloatingPortal>
          ) : null}
        </AnimatePresence>
      </div>
    </BookmarkRow>
  );
}

function BookmarkFolderRow({
  children,
  dragSortingLocked,
  dragPreview,
  labels,
  expanded,
  menuOpen,
  node,
  onAddBookmark,
  onAddFolder,
  onDelete,
  onEdit,
  onSetExpanded,
  onSetMoreOpen,
  overDropId,
  overDropPosition
}: {
  children?: ReactNode;
  dragSortingLocked: boolean;
  dragPreview: boolean;
  labels: ReturnType<typeof getBookmarkLabels>;
  expanded: boolean;
  menuOpen: boolean;
  node: BookmarkNodeSnapshot;
  onAddBookmark: () => void;
  onAddFolder: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSetExpanded: (expanded: boolean) => void;
  onSetMoreOpen: (open: boolean) => void;
  overDropId: string | null;
  overDropPosition: BookmarkDropPosition | null;
}) {
  const sortable = useSortable({
    id: `bookmark-node:${node.id}`,
    transition: null,
    animateLayoutChanges: (args) => (args.isSorting ? defaultAnimateLayoutChanges(args) : false)
  });
  const rowId = `bookmark-node:${node.id}`;
  const [openByHover, setOpenByHover] = useState(false);
  const arrowRef = useRef<SVGSVGElement | null>(null);
  const { refs, floatingStyles, context, placement } = useFloating({
    open: menuOpen || openByHover,
    onOpenChange: (nextOpen) => {
      setOpenByHover(nextOpen);
      onSetMoreOpen(nextOpen);
    },
    placement: 'bottom-end',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: arrowRef, padding: 10 })]
  });
  const hover = useHover(context, {
    move: false,
    delay: { open: 70, close: 90 },
    handleClose: safePolygon()
  });
  const click = useClick(context, { event: 'click', toggle: false });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, click, dismiss, role]);
  const dropOnSelf = overDropId === rowId;
  const activeDrop = dropOnSelf && overDropPosition === 'inside';
  const insertPosition = dropOnSelf && overDropPosition !== 'inside' ? overDropPosition : null;
  const dragStyle = dragSortingLocked
    ? { opacity: dragPreview ? 0.12 : 1 }
    : {
        transform: sortable.isDragging ? undefined : CSS.Transform.toString(sortable.transform),
        transition: sortable.isDragging ? undefined : sortable.transition,
        opacity: dragPreview ? 0.12 : 1
      };
  const handleFolderHeaderClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest('button, input, select, a, [data-tab-action-root="true"]')) return;
    onSetExpanded(!expanded);
  };

  return (
    <section
      className="tm-section-block tm-bookmark-folder-section"
      data-active={activeDrop}
      data-menu-open={menuOpen}
      ref={sortable.setNodeRef}
      style={dragStyle}
    >
      <div
        className="tm-group-header tm-bookmark-folder-header"
        data-active={activeDrop}
        data-drop-id={rowId}
        data-over-position={insertPosition ?? undefined}
        onClick={handleFolderHeaderClick}
        ref={sortable.setActivatorNodeRef}
      >
        <div className="tm-group-header-leading">
          <div className="tm-tab-handle tm-group-drag-handle" title={labels.drag}>
            <button
              aria-label={labels.drag}
              className="tm-group-drag-button"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={blockDrag}
              type="button"
              {...sortable.attributes}
              {...sortable.listeners}
            >
              <RiDragMove2Line size={14} />
            </button>
          </div>
          <button className="tm-group-toggle" onClick={() => onSetExpanded(!expanded)} onPointerDown={blockDrag} type="button">
            <RiArrowDownSLine className="tm-group-toggle-icon tm-bookmark-folder-arrow" data-expanded={expanded} size={16} />
          </button>
        </div>
        <span className="tm-bookmark-folder-badge tm-bookmark-folder-badge-group">
          <RiFolderLine size={14} />
        </span>
        <div className="tm-group-title">
          <span className="tm-group-title-label">{getBookmarkPrimaryLabel(node)}</span>
          <span className="tm-group-count">{countBookmarksOnly(node)}</span>
        </div>
        <div className="tm-group-actions" data-tab-action-root="true">
          <Tooltip content={labels.newFolder}>
            <IconButton icon={RiFolderAddLine} label={labels.newFolder} nativeTitle={false} onClick={onAddFolder} />
          </Tooltip>
          <Tooltip content={labels.addCurrentTab}>
            <IconButton icon={RiStarLine} label={labels.addCurrentTab} nativeTitle={false} onClick={onAddBookmark} />
          </Tooltip>
          <button
            ref={refs.setReference}
            aria-label={labels.more}
            className="tm-icon-button tm-group-edit-trigger"
            data-open={menuOpen}
            type="button"
            {...getReferenceProps({
              onPointerDown: blockDrag
            })}
          >
            <RiMore2Line size={14} />
          </button>
        </div>
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
              <button className="tm-row-menu-button" onClick={onAddBookmark} onPointerDown={blockDrag} type="button">
                <RiStarLine size={13} />
                <span>{labels.addCurrentTab}</span>
              </button>
              <button className="tm-row-menu-button" onClick={onAddFolder} onPointerDown={blockDrag} type="button">
                <RiFolderAddLine size={13} />
                <span>{labels.newFolder}</span>
              </button>
              <button className="tm-row-menu-button" onClick={onEdit} onPointerDown={blockDrag} type="button">
                <RiEdit2Line size={13} />
                <span>{labels.rename}</span>
              </button>
              {node.unmodifiable ? null : (
                <button className="tm-row-menu-button tm-row-menu-button-danger" onClick={onDelete} onPointerDown={blockDrag} type="button">
                  <RiDeleteBinLine size={13} />
                  <span>{labels.deleteLabel}</span>
                </button>
              )}
              <FloatingArrow ref={arrowRef} className="tm-row-menu-arrow" context={context} />
            </motion.div>
          </FloatingPortal>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {expanded && node.children.length > 0 ? (
          <motion.div
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0, y: -6 }}
            initial={{ height: 0, opacity: 0, y: -10 }}
            transition={{
              height: {
                type: 'spring',
                stiffness: 360,
                damping: 30,
                mass: 0.82
              },
              opacity: { duration: 0.16, ease: 'easeOut' },
              y: {
                type: 'spring',
                stiffness: 420,
                damping: 32,
                mass: 0.72
              }
            }}
          >
            <div className="tm-section-children tm-section-children-group tm-bookmark-children">
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function BookmarksTree({
  activeMenuId,
  activeDragNodeId,
  expandedIds,
  labels,
  locale,
  nodes,
  onAddBookmark,
  onAddFolder,
  onDeleteNode,
  onEditNode,
  onOpenNode,
  onOpenNodeNewTab,
  onSetExpanded,
  onSetMenuId,
  overDropId,
  overDropPosition
}: {
  activeMenuId: string | null;
  activeDragNodeId: string | null;
  expandedIds: Set<string>;
  labels: ReturnType<typeof getBookmarkLabels>;
  locale: string;
  nodes: BookmarkNodeSnapshot[];
  onAddBookmark: (folderId: string) => void;
  onAddFolder: (folderId: string) => void;
  onDeleteNode: (node: BookmarkNodeSnapshot) => void;
  onEditNode: (node: BookmarkNodeSnapshot) => void;
  onOpenNode: (node: BookmarkNodeSnapshot) => void;
  onOpenNodeNewTab: (node: BookmarkNodeSnapshot) => void;
  onSetExpanded: (folderId: string, expanded: boolean) => void;
  onSetMenuId: (id: string | null) => void;
  overDropId: string | null;
  overDropPosition: BookmarkDropPosition | null;
}) {
  return (
    <div className="tm-bookmark-tree">
      {nodes.map((node) => {
        const expanded = expandedIds.has(node.id);
        const menuOpen = activeMenuId === node.id;
        const isFolder = node.url == null;
        const dragSortingLocked = activeDragNodeId !== null;
        const dragPreview = activeDragNodeId === node.id;

        return (
          <div key={node.id} className="tm-bookmark-node">
            {isFolder ? (
              <BookmarkFolderRow
                dragSortingLocked={dragSortingLocked}
                dragPreview={dragPreview}
                expanded={expanded}
                labels={labels}
                menuOpen={menuOpen}
                node={node}
                onAddBookmark={() => onAddBookmark(node.id)}
                onAddFolder={() => onAddFolder(node.id)}
                onDelete={() => onDeleteNode(node)}
                onEdit={() => onEditNode(node)}
                onSetExpanded={(nextExpanded) => onSetExpanded(node.id, nextExpanded)}
                onSetMoreOpen={(open) => onSetMenuId(open ? node.id : null)}
                overDropId={overDropId}
                overDropPosition={overDropPosition}
              >
                <BookmarksTree
                  activeMenuId={activeMenuId}
                  activeDragNodeId={activeDragNodeId}
                  expandedIds={expandedIds}
                  labels={labels}
                  locale={locale}
                  nodes={node.children}
                  onAddBookmark={onAddBookmark}
                  onAddFolder={onAddFolder}
                  onDeleteNode={onDeleteNode}
                  onEditNode={onEditNode}
                  onOpenNode={onOpenNode}
                  onOpenNodeNewTab={onOpenNodeNewTab}
                  onSetExpanded={onSetExpanded}
                  onSetMenuId={onSetMenuId}
                  overDropId={overDropId}
                  overDropPosition={overDropPosition}
                />
              </BookmarkFolderRow>
            ) : (
              <BookmarkLeafRow
                dragSortingLocked={dragSortingLocked}
                dragPreview={dragPreview}
                labels={labels}
                locale={locale}
                menuOpen={menuOpen}
                node={node}
                onDelete={() => onDeleteNode(node)}
                onEdit={() => onEditNode(node)}
                onOpen={() => onOpenNode(node)}
                onOpenNewTab={() => onOpenNodeNewTab(node)}
                onSetMoreOpen={(open) => onSetMenuId(open ? node.id : null)}
                overDropId={overDropId}
                overDropPosition={overDropPosition}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BookmarkRootSection({
  active,
  children,
  count,
  expanded,
  label,
  locale,
  onAddBookmark,
  onAddFolder,
  onToggleExpand,
  rootId
}: {
  active: boolean;
  children: ReactNode;
  count: number;
  expanded: boolean;
  label: string;
  locale: string;
  onAddBookmark: () => void;
  onAddFolder: () => void;
  onToggleExpand: () => void;
  rootId: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `bookmark-root:${rootId}` });
  return (
    <section className="tm-section-block tm-bookmark-root-section" data-active={active || isOver}>
      <div
        ref={setNodeRef}
        className="tm-group-header tm-bookmark-root-header"
        data-active={active || isOver}
        onClick={(event) => {
          if (!(event.target instanceof HTMLElement)) return;
          if (event.target.closest('button, input, select, a, [data-tab-action-root="true"]')) return;
          onToggleExpand();
        }}
      >
        <div className="tm-group-header-leading">
          <button className="tm-group-toggle" onClick={onToggleExpand} onPointerDown={blockDrag} type="button">
            <RiArrowDownSLine className="tm-group-toggle-icon tm-bookmark-folder-arrow" data-expanded={expanded} size={16} />
          </button>
        </div>
        <span className="tm-bookmark-root-pill">
          <RiFolderLine size={13} />
        </span>
        <div className="tm-group-title">
          <span className="tm-group-title-label">{label}</span>
          <span className="tm-group-count">{count}</span>
        </div>
        <div className="tm-group-actions" data-tab-action-root="true">
          <Tooltip content={locale === 'zh-CN' ? '新建文件夹' : 'New folder'}>
            <IconButton
              icon={RiFolderAddLine}
              label={locale === 'zh-CN' ? '新建文件夹' : 'New folder'}
              nativeTitle={false}
              onClick={onAddFolder}
            />
          </Tooltip>
          <Tooltip content={locale === 'zh-CN' ? '添加当前标签页' : 'Add current tab'}>
            <IconButton
              icon={RiStarLine}
              label={locale === 'zh-CN' ? '添加当前标签页' : 'Add current tab'}
              nativeTitle={false}
              onClick={onAddBookmark}
            />
          </Tooltip>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0, y: -6 }}
            initial={{ height: 0, opacity: 0, y: -10 }}
            transition={{
              height: {
                type: 'spring',
                stiffness: 360,
                damping: 30,
                mass: 0.82
              },
              opacity: { duration: 0.16, ease: 'easeOut' },
              y: {
                type: 'spring',
                stiffness: 420,
                damping: 32,
                mass: 0.72
              }
            }}
          >
            <div className="tm-section-children tm-section-children-root tm-bookmark-root-body">
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export function BookmarksManagerView({
  bookmarks,
  isSidepanel,
  locale,
  query,
  refreshBookmarks,
  scrollRef
}: BookmarksManagerViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(ROOT_ORDER));
  const [expandedRootIds, setExpandedRootIds] = useState<Set<string>>(new Set(ROOT_ORDER));
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [activeDragNodeId, setActiveDragNodeId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<BookmarkDialogState | null>(null);
  const [overDropId, setOverDropId] = useState<string | null>(null);
  const [overDropPosition, setOverDropPosition] = useState<BookmarkDropPosition | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dragPointerYRef = useRef<number | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const labels = useMemo(() => getBookmarkLabels(locale), [locale]);
  const filtered = useMemo(() => filterBookmarkNodes(bookmarks, normalizedQuery), [bookmarks, normalizedQuery]);
  const orderedRoots = useMemo(() => {
    const priority = new Map(ROOT_ORDER.map((id, index) => [id, index]));
    return [...filtered.nodes].sort(
      (left, right) => {
        const typeOrder = (priority.get(left.id) ?? 99) - (priority.get(right.id) ?? 99);
        if (typeOrder !== 0) return typeOrder;
        if (left.syncing !== right.syncing) return left.syncing ? -1 : 1;
        return left.id.localeCompare(right.id);
      }
    );
  }, [filtered.nodes]);
  useEffect(() => {
    if (!normalizedQuery) return;

    setExpandedIds((current) => {
      const next = new Set(current);
      const nextRoots = new Set(expandedRootIds);
      const visit = (nodes: BookmarkNodeSnapshot[]) => {
        for (const node of nodes) {
          if (node.children.length > 0) {
            next.add(node.id);
            visit(node.children);
          }
        }
      };
      orderedRoots.forEach((root) => nextRoots.add(root.id));
      visit(orderedRoots);
      setExpandedRootIds(nextRoots);
      return next;
    });
  }, [expandedRootIds, normalizedQuery, orderedRoots]);

  const rootItemIds = useMemo(
    () => orderedRoots.flatMap((root) => collectNodeIds(root.children)),
    [orderedRoots]
  );

  const execute = async (message: string, task: () => Promise<void>) => {
    try {
      setStatus(message);
      await task();
      setStatus(null);
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  };

  const openNode = (node: BookmarkNodeSnapshot, active = true) => {
    if (!node.url) return;
    void chrome.tabs.create({ url: node.url, active });
  };

  const handleEdit = (node: BookmarkNodeSnapshot) => {
    setDialogState({
      kind: 'edit',
      node,
      title: node.title || getBookmarkPrimaryLabel(node),
      url: node.url ?? ''
    });
  };

  const handleDelete = (node: BookmarkNodeSnapshot) => {
    void execute(labels.deleting, async () => {
      await deleteBookmark(node.id);
      await refreshBookmarks();
    });
  };

  const handleAddFolder = (parentId: string) => {
    const title = window.prompt(locale === 'zh-CN' ? '新建文件夹名称' : 'New folder name');
    if (title == null) return;
    const trimmed = title.trim();
    if (!trimmed) return;

    void execute(labels.creatingFolder, async () => {
      await createBookmarkFolder(parentId, trimmed);
      setExpandedIds((current) => new Set(current).add(parentId));
      await refreshBookmarks();
    });
  };

  const handleAddBookmark = (parentId: string) => {
    void execute(labels.savingCurrentTab, async () => {
      await createBookmarkFromActiveTab(parentId);
      setExpandedIds((current) => new Set(current).add(parentId));
      await refreshBookmarks();
    });
  };

  const handleDialogSubmit = () => {
    if (!dialogState) return;

    const trimmedTitle = dialogState.title.trim();
    if (!trimmedTitle) return;

    if (dialogState.node.url) {
      const trimmedUrl = dialogState.url.trim();
      if (!trimmedUrl) return;

      void execute(labels.updatingBookmark, async () => {
        await updateBookmark(dialogState.node.id, {
          title: trimmedTitle,
          url: trimmedUrl
        });
        setDialogState(null);
        await refreshBookmarks();
      });
      return;
    }

    void execute(labels.updatingFolder, async () => {
      await updateBookmark(dialogState.node.id, { title: trimmedTitle });
      setDialogState(null);
      await refreshBookmarks();
    });
  };

  const resolveDragDropPosition = (
    active: ParsedBookmarkDropId,
    over: ParsedBookmarkDropId,
    overId: string | null,
    overRect: { top: number; height: number } | null | undefined,
    fallbackRect: { top: number; height: number } | null | undefined
  ): BookmarkDropPosition | null => {
    if (!active || !over || !overId) return null;

    if (
      active.kind === 'node' &&
      over.kind === 'node' &&
      active.id !== over.id
    ) {
      const targetMeta = orderedRoots
        .flatMap((root) => flattenTree(root.children, root.id, 0, root.id))
        .find((meta) => meta.node.id === over.id);
      if (targetMeta?.node.url == null) {
        const liveRect = getLiveDropRect(overId) ?? overRect;
        if (!liveRect) return 'inside';
        const referenceY =
          dragPointerYRef.current ??
          (fallbackRect
            ? fallbackRect.top + fallbackRect.height / 2
            : liveRect.top + liveRect.height / 2);
        const topThreshold = liveRect.top + liveRect.height * 0.26;
        const bottomThreshold = liveRect.top + liveRect.height * 0.74;
        if (referenceY <= topThreshold) return 'before';
        if (referenceY >= bottomThreshold) return 'after';
        return 'inside';
      }

      return resolveVerticalDropPosition(
        getLiveDropRect(overId) ?? overRect,
        dragPointerYRef.current,
        fallbackRect
      );
    }

    if (active.kind === 'node' && over.kind === 'root') {
      const liveRect = getLiveDropRect(overId) ?? overRect;
      if (!liveRect) return 'inside';
      const referenceY =
        dragPointerYRef.current ??
        (fallbackRect
          ? fallbackRect.top + fallbackRect.height / 2
          : liveRect.top + liveRect.height / 2);
      const topThreshold = liveRect.top + liveRect.height * 0.38;
      const bottomThreshold = liveRect.top + liveRect.height * 0.62;
      if (referenceY <= topThreshold) return 'before';
      if (referenceY >= bottomThreshold) return 'after';
      return 'inside';
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

    if (active.kind === 'node' && over.kind === 'node' && active.id === over.id) {
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

  const handleDragStart = (event: DragStartEvent) => {
    dragPointerYRef.current = extractClientY(event.activatorEvent);
    setActiveMenuId(null);
    const active = parseDropId(event.active.id as string);
    setActiveDragNodeId(active?.kind === 'node' ? active.id : null);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    updateDragTarget(event);
  };

  const handleDragOver = (event: DragOverEvent) => {
    updateDragTarget(event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    dragPointerYRef.current = null;
    setActiveDragNodeId(null);
    updateDragTarget(event);
    const activeId = typeof event.active.id === 'string' ? event.active.id : null;
    const overId = typeof event.over?.id === 'string' ? event.over.id : null;
    const position = overDropPosition;
    setOverDropId(null);
    setOverDropPosition(null);
    if (!activeId || !overId || !position) return;

    const active = parseDropId(activeId);
    const over = parseDropId(overId);
    if (!active || !over) return;
    if (active.kind !== 'node') return;

    const target = getBookmarkMoveTarget(orderedRoots, active.id, over, position);
    if (!target) return;

    void execute(labels.move, async () => {
      await moveBookmark(active.id, target.parentId, target.index);
      if (position === 'inside') {
        setExpandedIds((current) => new Set(current).add(target.parentId));
      }
      await refreshBookmarks();
    });
  };

  return (
    <section className="tm-panel tm-tree-shell" ref={isSidepanel ? scrollRef : undefined}>
      <DndContext
        collisionDetection={collisionDetectionStrategy}
        onDragCancel={() => {
          dragPointerYRef.current = null;
          setActiveDragNodeId(null);
          setOverDropId(null);
          setOverDropPosition(null);
        }}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <SortableContext items={rootItemIds} strategy={verticalListSortingStrategy}>
          <div className={`tm-tree-list${isSidepanel ? ' tm-tree-list-sidepanel' : ' tm-scrollbar'}`}>
            {status ? <div className="tm-bookmark-status">{status}</div> : null}

            {orderedRoots.length === 0 ? (
              <div className="tm-empty">
                <RiBookmarkLine size={16} />
                <div>
                  <div className="font-medium">
                    {locale === 'zh-CN' ? '当前没有匹配的书签。' : 'No matching bookmarks.'}
                  </div>
                  <div className="tm-subtle">
                    {locale === 'zh-CN' ? '清空搜索或切换位置。' : 'Clear the search or switch location.'}
                  </div>
                </div>
              </div>
            ) : (
              orderedRoots.map((root) => (
                (() => {
                  const display = getRootDisplay(root, labels, locale);
                  return (
                    <BookmarkRootSection
                      key={root.id}
                      active={overDropId === `bookmark-root:${root.id}`}
                      count={countBookmarksOnly(root)}
                      expanded={expandedRootIds.has(root.id)}
                      label={display.title}
                      locale={locale}
                      onAddBookmark={() => handleAddBookmark(root.id)}
                      onAddFolder={() => handleAddFolder(root.id)}
                      onToggleExpand={() =>
                        setExpandedRootIds((current) => {
                          const next = new Set(current);
                          if (next.has(root.id)) next.delete(root.id);
                          else next.add(root.id);
                          return next;
                        })
                      }
                      rootId={root.id}
                    >
                      <BookmarksTree
                        activeMenuId={activeMenuId}
                        activeDragNodeId={activeDragNodeId}
                        expandedIds={expandedIds}
                        labels={labels}
                        locale={locale}
                        nodes={root.children}
                        onAddBookmark={handleAddBookmark}
                        onAddFolder={handleAddFolder}
                        onDeleteNode={handleDelete}
                        onEditNode={handleEdit}
                        onOpenNode={(node) => openNode(node, true)}
                        onOpenNodeNewTab={(node) => openNode(node, false)}
                        onSetExpanded={(folderId, expanded) =>
                          setExpandedIds((current) => {
                            const next = new Set(current);
                            if (expanded) {
                              next.add(folderId);
                            } else {
                              next.delete(folderId);
                            }
                            return next;
                          })
                        }
                        onSetMenuId={setActiveMenuId}
                        overDropId={overDropId}
                        overDropPosition={overDropPosition}
                      />
                    </BookmarkRootSection>
                  );
                })()
              ))
            )}
          </div>
        </SortableContext>

        {createPortal(
          <>
            <DragOverlay dropAnimation={null}>
              {activeDragNodeId != null ? <div className={`tm-drag-frame ${isSidepanel ? 'tm-drag-frame-tab-compact' : 'tm-drag-frame-tab'}`} /> : null}
            </DragOverlay>

            <AnimatePresence initial={false}>
              {dialogState ? (
                <div className="tm-bookmark-dialog-backdrop" onClick={() => setDialogState(null)}>
                  <motion.div
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="tm-group-edit-menu tm-bookmark-dialog"
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    initial={{ opacity: 0, y: 12, scale: 0.96 }}
                    onClick={(event) => event.stopPropagation()}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                  >
                    <div className="tm-group-edit-section">
                      <div className="tm-bookmark-dialog-title">
                        {dialogState.node.url
                          ? locale === 'zh-CN'
                            ? '编辑书签'
                            : 'Edit bookmark'
                          : locale === 'zh-CN'
                            ? '重命名文件夹'
                            : 'Rename folder'}
                      </div>

                      <label className="tm-bookmark-dialog-field">
                        <span>{locale === 'zh-CN' ? '名称' : 'Name'}</span>
                        <input
                          className="tm-group-edit-input"
                          onChange={(event) =>
                            setDialogState((current) =>
                              current ? { ...current, title: event.target.value } : current
                            )
                          }
                          value={dialogState.title}
                        />
                      </label>
                      {dialogState.node.url ? (
                        <label className="tm-bookmark-dialog-field">
                          <span>{locale === 'zh-CN' ? '网址' : 'URL'}</span>
                          <input
                            className="tm-group-edit-input"
                            onChange={(event) =>
                              setDialogState((current) =>
                                current ? { ...current, url: event.target.value } : current
                              )
                            }
                            value={dialogState.url}
                          />
                        </label>
                      ) : null}
                    </div>

                    <div className="tm-group-edit-actions tm-bookmark-dialog-actions">
                      <button className="tm-button" onClick={() => setDialogState(null)} type="button">
                        {locale === 'zh-CN' ? '取消' : 'Cancel'}
                      </button>
                      <button className="tm-button-primary" onClick={handleDialogSubmit} type="button">
                        {locale === 'zh-CN' ? '保存' : 'Save'}
                      </button>
                    </div>
                  </motion.div>
                </div>
              ) : null}
            </AnimatePresence>
          </>,
          document.body
        )}
      </DndContext>
    </section>
  );
}
