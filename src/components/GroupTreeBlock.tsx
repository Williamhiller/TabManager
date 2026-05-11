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
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  RiAddCircleLine,
  RiArrowDownSLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiDragMove2Line,
  RiFolderLine,
  RiScissorsCutLine,
  RiSettings3Line
} from '@remixicon/react';
import { AnimatePresence, motion } from 'motion/react';
import type { MouseEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { DefaultAutoGroupPreset } from '../lib/auto-group-defaults';
import { defaultAutoGroupPresets, getDefaultAutoGroupPresetTitle } from '../lib/auto-group-defaults';
import type { AutoGroupRule, TabGroupColor, TabGroupSnapshot, TabSnapshot } from '../lib/contracts';
import type { Messages } from '../lib/i18n';
import { allGroupColors, groupColorTokens } from '../lib/theme';
import { SortableTabRow } from './SortableTabRow';
import { Tooltip } from './Tooltip';
import {
  blockDrag,
  createAutoGroupRule,
  groupChipStyle,
  normalizeDraftRule
} from './tab-tree-helpers';

export function GroupTreeBlock({
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
  overDropPosition: 'before' | 'after' | 'inside' | null;
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
    setRulesDraft(group.autoGroupRules.map(normalizeDraftRule));
    lastSubmittedAutoConfigRef.current = JSON.stringify({
      autoGroupEnabled: group.autoGroupEnabled,
      autoGroupPresetIds: group.autoGroupPresetIds,
      autoGroupRules: group.autoGroupRules.map(normalizeDraftRule)
    });
  }, [editMenuFocusWithin, group.autoGroupEnabled, group.autoGroupPresetIds, group.autoGroupRules]);

  const normalizedRules = useMemo<AutoGroupRule[]>(
    () => rulesDraft.map(normalizeDraftRule),
    [rulesDraft]
  );

  const presetLabels = useMemo(
    () =>
      defaultAutoGroupPresets.map((preset: DefaultAutoGroupPreset) => ({
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
    const normalizedNextRules: AutoGroupRule[] = nextRules.map(normalizeDraftRule);
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
    setRulesDraft(group.autoGroupRules.map(normalizeDraftRule));
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
