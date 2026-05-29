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
  useDismiss,
  useFocus,
  useFloating,
  useHover,
  useInteractions,
  useRole
} from '@floating-ui/react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  RiAddCircleLine,
  RiArrowDownSLine,
  RiDeleteBinLine,
  RiDragMove2Line,
  RiFolderLine,
  RiNodeTree,
  RiScissorsCutLine,
  RiSettings3Line
} from '@remixicon/react';
import { AnimatePresence, motion } from 'motion/react';
import type { MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import type { TabGroupColor, TabGroupSnapshot, TabSnapshot } from '../lib/contracts';
import type { Messages } from '../lib/i18n';
import { allGroupColors, groupColorTokens } from '../lib/theme';
import { SortableTabRow } from './SortableTabRow';
import { Tooltip } from './Tooltip';
import { blockDrag } from './tab-tree-helpers';

export function GroupTreeBlock({
  autoOpenEditMenu,
  autoGroupSaved,
  group,
  tabs,
  compact,
  dragSortingLocked,
  expanded,
  dragPreviewId,
  getDisplayIndex,
  openActionMenuTabId,
  labelMap,
  overDropId,
  overDropPosition,
  selectedIds,
  onToggleExpand,
  onSaveGroup,
  onUpdateGroupColor,
  onAddTabToGroup,
  onSaveAsAutoGroup,
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
  autoGroupSaved: boolean;
  group: TabGroupSnapshot;
  tabs: TabSnapshot[];
  compact: boolean;
  dragSortingLocked: boolean;
  expanded: boolean;
  dragPreviewId: number | null;
  getDisplayIndex: (tabId: number) => number;
  openActionMenuTabId: number | null;
  labelMap: Messages;
  overDropId: string | null;
  overDropPosition: 'before' | 'after' | 'inside' | null;
  selectedIds: Set<number>;
  onToggleExpand: () => void;
  onSaveGroup: (title: string) => void;
  onUpdateGroupColor: (color: TabGroupColor) => void;
  onAddTabToGroup: () => void;
  onSaveAsAutoGroup: () => void;
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
  const {
    isOver: isTailOver,
    setNodeRef: setTailDropRef
  } = useDroppable({ id: `group-tail:${group.id}` });
  const {
    isOver: isAfterOver,
    setNodeRef: setAfterDropRef
  } = useDroppable({ id: `group-after:${group.id}` });
  const draggable = useDraggable({ id: `group-sort:${group.id}` });
  const [editMenuHoverOpen, setEditMenuHoverOpen] = useState(false);
  const [editMenuFocusWithin, setEditMenuFocusWithin] = useState(false);
  const [editMenuAutoOpen, setEditMenuAutoOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(group.title);
  const arrowRef = useRef<SVGSVGElement | null>(null);
  const lastSubmittedTitleRef = useRef(group.title);
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
  const tailDropActive =
    (isTailOver || overDropId === `group-tail:${group.id}`) &&
    overDropPosition === 'inside';
  const afterDropActive =
    (isAfterOver || overDropId === `group-after:${group.id}`) &&
    overDropPosition === 'after';
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

  const handleAddTabToGroup = () => {
    closeEditMenu();
    onAddTabToGroup();
  };

  const handleSaveAsAutoGroup = () => {
    closeEditMenu();
    onSaveAsAutoGroup();
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
    <motion.section
      layout
      transition={{
        layout: {
          type: 'spring',
          stiffness: 420,
          damping: 34,
          mass: 0.82
        }
      }}
      ref={setNodeRef}
      className="tm-section-block"
      data-active={activeDrop}
      data-menu-open={editMenuOpen}
      style={dragStyle}
    >
      <div
        className={`tm-group-header${compact ? ' tm-group-header-dashboard-flat' : ''}`}
        data-compact={compact}
        data-active={activeDrop}
        data-drop-id={`group:${group.id}`}
        data-drag-overlay-id={`group-sort:${group.id}`}
        data-over-position={insertPosition ?? undefined}
        onClick={handleGroupHeaderClick}
        ref={draggable.setNodeRef}
      >
        <div className="tm-group-header-leading">
          <button className="tm-group-toggle" onClick={onToggleExpand} onPointerDown={blockDrag} title={expanded ? labelMap.collapseGroup : labelMap.expandGroup} type="button">
            <motion.span
              animate={{ rotate: expanded ? 0 : -90 }}
              className="tm-group-toggle-icon"
              transition={{ type: 'spring', stiffness: 420, damping: 28, mass: 0.7 }}
            >
              <RiArrowDownSLine size={14} />
            </motion.span>
          </button>
          <div className="tm-group-kind-handle" title={labelMap.dragToReorder}>
            <button
              aria-label={labelMap.dragToReorder}
              className="tm-group-drag-button"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={blockDrag}
              type="button"
              {...draggable.attributes}
              {...draggable.listeners}
            >
              <RiFolderLine aria-hidden="true" className="tm-group-kind-icon" size={14} />
              <RiDragMove2Line aria-hidden="true" className="tm-group-drag-icon" size={14} />
            </button>
          </div>
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
                    setTitleDraft(event.target.value);
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

              <div className="tm-group-edit-actions">
                <button className="tm-group-edit-action" onClick={handleAddTabToGroup} type="button">
                  <RiAddCircleLine size={12} />
                  <span>{labelMap.addTabToGroup}</span>
                </button>
                <button className="tm-group-edit-action" onClick={handleSaveAsAutoGroup} type="button">
                  <RiNodeTree size={12} />
                  <span>{autoGroupSaved ? labelMap.editAutoGroup : labelMap.saveAsAutoGroup}</span>
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
              <div
                ref={setTailDropRef}
                className="tm-group-tail-drop-zone"
                data-active={tailDropActive}
                data-drop-id={`group-tail:${group.id}`}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div
        ref={setAfterDropRef}
        className={`tm-group-after-drop-zone${compact ? ' tm-group-after-drop-zone-compact' : ''}`}
        data-active={afterDropActive}
        data-drop-id={`group-after:${group.id}`}
      />
    </motion.section>
  );
}
