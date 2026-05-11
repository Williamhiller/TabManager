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
  useFocus,
  useFloating,
  useHover,
  useInteractions,
  useRole
} from '@floating-ui/react';
import {
  RiArticleLine,
  RiCloseLine,
  RiDragMove2Line,
  RiMoonFill,
  RiMoonLine,
  RiMore2Line,
  RiPushpin2Fill,
  RiPushpin2Line,
  RiScissorsCutLine,
  RiUnpinLine,
  RiVolumeMuteFill,
  RiVolumeMuteLine,
  RiVolumeUpLine
} from '@remixicon/react';
import { AnimatePresence, motion } from 'motion/react';
import type { MouseEvent } from 'react';
import { useRef } from 'react';
import { defaultAnimateLayoutChanges, useSortable } from '@dnd-kit/sortable';

import type { Messages } from '../lib/i18n';
import type { TabSnapshot } from '../lib/contracts';
import { formatDuration, formatRelativeTime } from '../lib/format';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';
import { blockDrag } from './tab-tree-helpers';

export function SortableTabRow({
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
  overDropPosition: 'before' | 'after' | 'inside' | null;
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
