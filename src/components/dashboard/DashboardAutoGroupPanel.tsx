import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  RiAddLine,
  RiCloseLine,
  RiDeleteBin6Line,
  RiDragMove2Line,
  RiShieldCheckLine,
  RiTestTubeLine
} from '@remixicon/react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import {
  defaultAutoGroupPresets,
  getDefaultAutoGroupPresetTitle,
  isDefaultAutoGroupPresetTitle
} from '../../lib/auto-group-defaults';
import { getAutoGroupConfigMatchStatus } from '../../lib/auto-group-matcher';
import { normalizeWebsitePattern } from '../../lib/shared-utils';
import { allGroupColors, groupColorTokens } from '../../lib/theme';
import { getPresetPatternLabels } from '../tab-tree-helpers';
import type { DashboardAutoGroupPanelProps } from './types';

export function DashboardAutoGroupPanel({
  autoGroupEnabled,
  autoGroupLearningSensitivity,
  configs,
  locale,
  onAddConfig,
  onDeleteConfig,
  onReorderConfigs,
  onSelectConfig,
  onToggleAutoGroup,
  onToggleAutoGroupLearning,
  onToggleConfig,
  onUpdateConfig,
  selectedConfigId,
  tabs,
  t
}: DashboardAutoGroupPanelProps) {
  const getConfigDisplayTitle = (config: DashboardAutoGroupPanelProps['configs'][number]) => {
    if (!config.presetId) return config.title;

    const preset = defaultAutoGroupPresets.find((entry) => entry.id === config.presetId);
    if (!preset) return config.title;

    return isDefaultAutoGroupPresetTitle(preset, config.title)
      ? getDefaultAutoGroupPresetTitle(preset, locale)
      : config.title;
  };

  const selectedConfig = configs.find((config) => config.id === selectedConfigId) ?? configs[0] ?? null;
  const selectedConfigIndex = selectedConfig
    ? configs.findIndex((config) => config.id === selectedConfig.id)
    : -1;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const listRef = useRef<HTMLElement | null>(null);
  const [dragState, setDragState] = useState<{
    activeId: string | null;
    overId: string | null;
    overPosition: 'before' | 'after' | null;
    height: number;
    left: number;
    originTop: number;
    top: number;
    width: number;
    minTop: number;
    maxTop: number;
  }>({
    activeId: null,
    overId: null,
    overPosition: null,
    height: 0,
    left: 0,
    originTop: 0,
    top: 0,
    width: 0,
    minTop: 0,
    maxTop: 0
  });
  const selectedPreset = selectedConfig?.presetId
    ? defaultAutoGroupPresets.find((preset) => preset.id === selectedConfig.presetId) ?? null
    : null;
  const selectedDomainTags = selectedConfig
    ? Array.from(
        new Set([
          ...(selectedPreset ? getPresetPatternLabels(selectedPreset) : []),
          ...selectedConfig.websites
        ])
      )
    : [];
  const [titleDraft, setTitleDraft] = useState('');
  const [websiteDraft, setWebsiteDraft] = useState('');
  const [excludedWebsiteDraft, setExcludedWebsiteDraft] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const copy = locale === 'zh-CN'
    ? {
        excludedSites: '排除站点',
        excludedSitesSub: '这些站点不会进入此分组，即使匹配其他条件。',
        pinnedProtected: '固定标签受保护，不会被自动移动。',
        preview: '预览已打开的标签',
        previewEmpty: '还没有可预览的打开标签。',
        previewResults: '测试结果',
        previewSummary: (count: number) => `已检查 ${count} 个打开标签，不会移动任何标签。`,
        matched: '会归入',
        excluded: '已排除',
        protected: '已保护',
        noMatches: '没有打开的标签会进入此分组。',
        priority: '匹配优先级',
        priorityHint: '多个分组都匹配时，优先使用列表中更靠前的分组。'
      }
    : {
        excludedSites: 'Exclude sites',
        excludedSitesSub: 'These sites stay out of this group, even when another condition matches.',
        pinnedProtected: 'Pinned tabs are protected and are never moved automatically.',
        preview: 'Preview open tabs',
        previewEmpty: 'No open tabs to preview.',
        previewResults: 'Test results',
        previewSummary: (count: number) => `Checked ${count} open tabs. Nothing will be moved.`,
        matched: 'Would group',
        excluded: 'Excluded',
        protected: 'Protected',
        noMatches: 'No open tabs would enter this group.',
        priority: 'Match priority',
        priorityHint: 'When multiple groups match, the one higher in the list wins.'
      };

  const selectedConfigDisplayTitle = selectedConfig ? getConfigDisplayTitle(selectedConfig) : '';

  useEffect(() => {
    setTitleDraft(selectedConfigDisplayTitle);
    setWebsiteDraft('');
    setExcludedWebsiteDraft('');
    setShowPreview(false);
  }, [selectedConfig?.id, selectedConfigDisplayTitle]);

  const preview = useMemo(() => {
    const counts = {
      excluded: 0,
      match: 0,
      matchedTabs: [] as Array<{ hostname: string; id: number; title: string }>,
      protected: 0
    };
    if (!selectedConfig) return counts;

    for (const tab of tabs) {
      const status = getAutoGroupConfigMatchStatus(tab, selectedConfig);
      if (status === 'excluded' || status === 'match' || status === 'protected') {
        counts[status] += 1;
      }
      if (status === 'match' && counts.matchedTabs.length < 3) {
        counts.matchedTabs.push({
          hostname: tab.hostname,
          id: tab.id,
          title: tab.title || tab.hostname
        });
      }
    }

    return counts;
  }, [selectedConfig, tabs]);

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = typeof event.active.id === 'string' ? event.active.id : null;
    const activeElement = activeId
      ? (document.querySelector(`[data-config-id="${activeId}"]`) as HTMLElement | null)
      : null;
    const listRect = listRef.current?.getBoundingClientRect();
    const activeRect = activeElement?.getBoundingClientRect();

    setDragState({
      activeId,
      overId: null,
      overPosition: null,
      height: activeRect?.height ?? 0,
      left: activeRect?.left ?? 0,
      originTop: activeRect?.top ?? 0,
      top: activeRect?.top ?? 0,
      width: activeRect?.width ?? 0,
      minTop: listRect?.top ?? 0,
      maxTop: Math.max((listRect?.bottom ?? 0) - (activeRect?.height ?? 0), listRect?.top ?? 0)
    });
  };

  const handleDragMove = (event: DragMoveEvent) => {
    setDragState((current) => ({
      ...current,
      top: clamp(current.originTop + event.delta.y, current.minTop, current.maxTop)
    }));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const activeId = typeof event.active.id === 'string' ? event.active.id : null;
    const overId = typeof event.over?.id === 'string' ? event.over.id : null;
    if (!activeId || !overId || activeId === overId) {
      setDragState((current) => ({ ...current, overId: null, overPosition: null }));
      return;
    }

    const overIndex = configs.findIndex((config) => config.id === overId);
    if (overIndex < 0) return;

    const translated = event.activatorEvent instanceof PointerEvent ? event.delta.y : 0;
    setDragState((current) => ({
      ...current,
      activeId,
      overId,
      overPosition: translated >= 0 ? 'after' : 'before'
    }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = typeof event.active.id === 'string' ? event.active.id : null;
    const overId = typeof event.over?.id === 'string' ? event.over.id : null;
    setDragState({
      activeId: null,
      overId: null,
      overPosition: null,
      height: 0,
      left: 0,
      originTop: 0,
      top: 0,
      width: 0,
      minTop: 0,
      maxTop: 0
    });
    if (!activeId || !overId || activeId === overId) return;
    onReorderConfigs(activeId, overId);
  };

  const handleDragCancel = () => {
    setDragState({
      activeId: null,
      overId: null,
      overPosition: null,
      height: 0,
      left: 0,
      originTop: 0,
      top: 0,
      width: 0,
      minTop: 0,
      maxTop: 0
    });
  };

  const commitTitleDraft = () => {
    if (!selectedConfig) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === selectedConfigDisplayTitle) {
      setTitleDraft(selectedConfigDisplayTitle);
      return;
    }

    onUpdateConfig(selectedConfig.id, { title: nextTitle });
  };

  const commitWebsiteDraft = (kind: 'include' | 'exclude') => {
    if (!selectedConfig) return;

    const draft = kind === 'include' ? websiteDraft : excludedWebsiteDraft;
    const nextEntries = draft
      .split(/[\s,|]+/g)
      .map(normalizeWebsitePattern)
      .filter(Boolean);

    if (nextEntries.length === 0) return;

    const currentWebsites = kind === 'include' ? selectedDomainTags : selectedConfig.excludedWebsites;
    const merged = Array.from(new Set([...currentWebsites, ...nextEntries]));
    onUpdateConfig(selectedConfig.id, {
      ...(kind === 'include'
        ? {
            presetId: undefined,
            title:
              selectedPreset && isDefaultAutoGroupPresetTitle(selectedPreset, selectedConfig.title)
                ? getConfigDisplayTitle(selectedConfig)
                : selectedConfig.title,
            websites: merged
          }
        : { excludedWebsites: merged })
    });
    if (kind === 'include') setWebsiteDraft('');
    else setExcludedWebsiteDraft('');
  };

  const handleWebsiteDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>, kind: 'include' | 'exclude') => {
    if (event.key !== 'Enter' && event.key !== ',' && event.key !== '|') return;
    event.preventDefault();
    commitWebsiteDraft(kind);
  };

  const removeWebsiteTag = (website: string, kind: 'include' | 'exclude') => {
    if (!selectedConfig) return;
    if (kind === 'exclude') {
      onUpdateConfig(selectedConfig.id, {
        excludedWebsites: selectedConfig.excludedWebsites.filter((item) => item !== website)
      });
      return;
    }

    onUpdateConfig(selectedConfig.id, {
      presetId: undefined,
      title:
        selectedPreset && isDefaultAutoGroupPresetTitle(selectedPreset, selectedConfig.title)
          ? getConfigDisplayTitle(selectedConfig)
          : selectedConfig.title,
      websites: selectedDomainTags.filter((item) => item !== website)
    });
  };

  return (
    <main className="tm-dashboard-main tm-dashboard-main-automation">
      <section className="tm-dashboard-automation">
        <header className="tm-dashboard-settings-header tm-dashboard-settings-header-inline-switch">
          <div>
            <div className="tm-dashboard-settings-title-with-switch">
              <h1>{t.manageGroupsRules}</h1>
              <button
                aria-pressed={autoGroupEnabled}
                className="tm-dashboard-switch"
                data-active={autoGroupEnabled}
                onClick={onToggleAutoGroup}
                type="button"
              >
                <span className="tm-dashboard-switch-track">
                  <span className="tm-dashboard-switch-thumb" />
                </span>
                <span className="tm-dashboard-switch-label">
                  {autoGroupEnabled ? t.enabled : t.disabled}
                </span>
              </button>
            </div>
            <p>{t.manageGroupsRulesSub}</p>
          </div>
        </header>

        <section className="tm-dashboard-automation-learning-card">
          <div>
            <strong>{t.autoGroupLearning}</strong>
            <p>{t.autoGroupLearningSub}</p>
          </div>
          <button
            aria-pressed={autoGroupLearningSensitivity !== 'off'}
            className="tm-dashboard-switch"
            data-active={autoGroupLearningSensitivity !== 'off'}
            onClick={onToggleAutoGroupLearning}
            type="button"
          >
            <span className="tm-dashboard-switch-track">
              <span className="tm-dashboard-switch-thumb" />
            </span>
            <span className="tm-dashboard-switch-label">
              {autoGroupLearningSensitivity !== 'off' ? t.highSensitivity : t.disabled}
            </span>
          </button>
        </section>

        {autoGroupEnabled ? (
          <div className="tm-dashboard-automation-layout">
          <section
            className="tm-dashboard-automation-list"
            data-dragging={dragState.activeId ? 'true' : 'false'}
            ref={listRef}
          >
            <DndContext
              collisionDetection={closestCenter}
              onDragCancel={handleDragCancel}
              onDragEnd={handleDragEnd}
              onDragMove={handleDragMove}
              onDragOver={handleDragOver}
              onDragStart={handleDragStart}
              sensors={sensors}
            >
              <SortableContext items={configs.map((config) => config.id)} strategy={verticalListSortingStrategy}>
                {configs.map((config) => (
                  <SortableAutoGroupItem
                    config={config}
                    dragPreview={dragState.activeId === config.id}
                    index={configs.findIndex((item) => item.id === config.id)}
                    isActive={selectedConfig?.id === config.id}
                    key={config.id}
                    onDelete={() => onDeleteConfig(config.id)}
                    onSelect={() => onSelectConfig(config.id)}
                    overPosition={dragState.overId === config.id ? dragState.overPosition : null}
                    title={getConfigDisplayTitle(config)}
                    t={t}
                  />
                ))}
              </SortableContext>
            </DndContext>

            <button className="tm-dashboard-automation-add-row" onClick={onAddConfig} type="button">
              <RiAddLine size={14} />
              {t.newGroup}
            </button>
          </section>

          {createPortal(
            dragState.activeId ? (
              <div
                className="tm-dashboard-automation-overlay-frame"
                style={{
                  height: dragState.height,
                  left: dragState.left,
                  position: 'fixed',
                  top: dragState.top,
                  width: dragState.width,
                  zIndex: 2400
                }}
              />
            ) : null,
            document.body
          )}

          <section className="tm-dashboard-automation-detail">
            {selectedConfig ? (
              <>
                <div className="tm-dashboard-automation-detail-head">
                  <div className="tm-dashboard-automation-detail-copy">
                    <h2>
                      {selectedConfigDisplayTitle}
                    </h2>
                    <span className="tm-dashboard-automation-type">
                      {selectedConfig.presetId ? t.defaultGroup : t.customGroup}
                    </span>
                  </div>
                  <button
                    className="tm-dashboard-switch"
                    data-active={selectedConfig.enabled}
                    onClick={() => onToggleConfig(selectedConfig.id)}
                    type="button"
                  >
                    <span className="tm-dashboard-switch-track">
                      <span className="tm-dashboard-switch-thumb" />
                    </span>
                    <span className="tm-dashboard-switch-label">
                      {selectedConfig.enabled ? t.enabled : t.disabled}
                    </span>
                  </button>
                </div>

                <div className="tm-dashboard-automation-form">
                  <section className="tm-dashboard-automation-priority-card">
                    <span>{copy.priority}</span>
                    <strong>#{selectedConfigIndex + 1}</strong>
                    <p>{copy.priorityHint}</p>
                  </section>

                  <label className="tm-dashboard-automation-field">
                    <div className="tm-dashboard-automation-field-head">
                      <strong>{t.groupTitle}</strong>
                    </div>
                    <input
                      className="tm-dashboard-automation-input"
                      onBlur={commitTitleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        commitTitleDraft();
                      }}
                      value={titleDraft}
                    />
                  </label>

                  <div className="tm-dashboard-automation-field">
                    <div className="tm-dashboard-automation-field-head">
                      <strong>{t.allColors}</strong>
                    </div>
                    <div className="tm-dashboard-automation-color-grid">
                      {allGroupColors.map((color) => {
                        const tokens = groupColorTokens[color];
                        const active = selectedConfig.color === color;

                        return (
                          <button
                            aria-label={color}
                            className="tm-dashboard-automation-color-swatch"
                            data-active={active}
                            key={color}
                            onClick={() => onUpdateConfig(selectedConfig.id, { color })}
                            style={{
                              backgroundColor: active ? tokens.soft : 'transparent',
                              borderColor: active ? tokens.ring : 'var(--tm-border)'
                            }}
                            type="button"
                          >
                            <span
                              className="tm-dashboard-automation-color-swatch-inner"
                              style={{ backgroundColor: tokens.solid }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="tm-dashboard-automation-field">
                    <div className="tm-dashboard-automation-field-head">
                      <strong>{`${t.ruleDomain}·${t.ruleContains}`}</strong>
                      <p>{t.domainContainsSub}</p>
                    </div>
                    <div className="tm-dashboard-automation-domain-editor">
                      <div className="tm-dashboard-automation-domain-add-row">
                        <input
                          className="tm-dashboard-automation-input tm-dashboard-automation-domain-input"
                          onChange={(event) => setWebsiteDraft(event.target.value)}
                          onKeyDown={(event) => handleWebsiteDraftKeyDown(event, 'include')}
                          placeholder={t.ruleValuePlaceholder}
                          value={websiteDraft}
                        />
                        <button
                          className="tm-dashboard-automation-inline-button tm-dashboard-automation-domain-add"
                          disabled={!websiteDraft.trim()}
                          onClick={() => commitWebsiteDraft('include')}
                          type="button"
                        >
                          <RiAddLine size={14} />
                          {t.addCondition}
                        </button>
                      </div>
                      <div className="tm-dashboard-automation-domain-list" data-empty={selectedDomainTags.length === 0 ? 'true' : 'false'}>
                        {selectedDomainTags.map((website) => (
                          <div className="tm-dashboard-automation-domain-item" key={website}>
                            <span>{website}</span>
                            <button
                              aria-label={t.removeCondition}
                              className="tm-dashboard-automation-domain-remove"
                              onClick={() => removeWebsiteTag(website, 'include')}
                              type="button"
                            >
                              <RiCloseLine size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="tm-dashboard-automation-field">
                    <div className="tm-dashboard-automation-field-head">
                      <strong>{copy.excludedSites}</strong>
                      <p>{copy.excludedSitesSub}</p>
                    </div>
                    <div className="tm-dashboard-automation-domain-editor">
                      <div className="tm-dashboard-automation-domain-add-row">
                        <input
                          className="tm-dashboard-automation-input tm-dashboard-automation-domain-input"
                          onChange={(event) => setExcludedWebsiteDraft(event.target.value)}
                          onKeyDown={(event) => handleWebsiteDraftKeyDown(event, 'exclude')}
                          placeholder={t.ruleValuePlaceholder}
                          value={excludedWebsiteDraft}
                        />
                        <button
                          className="tm-dashboard-automation-inline-button tm-dashboard-automation-domain-add"
                          disabled={!excludedWebsiteDraft.trim()}
                          onClick={() => commitWebsiteDraft('exclude')}
                          type="button"
                        >
                          <RiAddLine size={14} />
                          {t.addCondition}
                        </button>
                      </div>
                      <div className="tm-dashboard-automation-domain-list" data-empty={selectedConfig.excludedWebsites.length === 0 ? 'true' : 'false'}>
                        {selectedConfig.excludedWebsites.map((website) => (
                          <div className="tm-dashboard-automation-domain-item" key={website}>
                            <span>{website}</span>
                            <button
                              aria-label={t.removeCondition}
                              className="tm-dashboard-automation-domain-remove"
                              onClick={() => removeWebsiteTag(website, 'exclude')}
                              type="button"
                            >
                              <RiCloseLine size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="tm-dashboard-automation-protection-note">
                    <RiShieldCheckLine size={16} />
                    <span>{copy.pinnedProtected}</span>
                  </div>

                  <div className="tm-dashboard-automation-preview">
                    <button
                      className="tm-dashboard-automation-inline-button"
                      onClick={() => setShowPreview((visible) => !visible)}
                      type="button"
                    >
                      <RiTestTubeLine size={15} />
                      {copy.preview}
                    </button>
                    {showPreview ? (
                      tabs.length === 0 ? (
                        <p>{copy.previewEmpty}</p>
                      ) : (
                        <div className="tm-dashboard-automation-preview-results">
                          <span>{copy.previewResults}</span>
                          <strong>{copy.matched} {preview.match}</strong>
                          <strong>{copy.excluded} {preview.excluded}</strong>
                          <strong>{copy.protected} {preview.protected}</strong>
                          <p>{copy.previewSummary(tabs.length)}</p>
                          {preview.matchedTabs.length > 0 ? (
                            <ul className="tm-dashboard-automation-preview-tabs">
                              {preview.matchedTabs.map((tab) => (
                                <li key={tab.id}>
                                  <strong title={tab.title}>{tab.title}</strong>
                                  <span>{tab.hostname}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="tm-dashboard-automation-preview-empty">{copy.noMatches}</p>
                          )}
                        </div>
                      )
                    ) : null}
                  </div>
                </div>
              </>
            ) : (
              <div className="tm-dashboard-empty">{t.noGroupsYet}</div>
            )}
          </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function SortableAutoGroupItem({
  config,
  dragPreview,
  index,
  isActive,
  onDelete,
  onSelect,
  overPosition,
  title,
  t
}: {
  config: DashboardAutoGroupPanelProps['configs'][number];
  dragPreview: boolean;
  index: number;
  isActive: boolean;
  onDelete: () => void;
  onSelect: () => void;
  overPosition: 'before' | 'after' | null;
  title: string;
  t: Record<string, string>;
}) {
  const sortable = useSortable({ id: config.id, transition: null });
  const style = dragPreview
    ? undefined
    : {
        transform: undefined,
        transition: undefined
      };

  return (
    <article
      className="tm-dashboard-automation-item"
      data-active={isActive}
      data-config-id={config.id}
      data-dragging={dragPreview}
      data-enabled={config.enabled}
      data-over-position={overPosition ?? undefined}
      ref={sortable.setNodeRef}
      style={style}
    >
      <button
        className="tm-dashboard-automation-item-main"
        onClick={onSelect}
        ref={sortable.setActivatorNodeRef}
        {...sortable.attributes}
        {...sortable.listeners}
        type="button"
      >
        <span className="tm-dashboard-automation-item-leading">
          <span className="tm-dashboard-automation-item-index">
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className="tm-dashboard-automation-item-handle">
            <RiDragMove2Line size={14} />
          </span>
        </span>
        <span className="tm-dashboard-automation-item-copy">
          <strong style={{ color: groupColorTokens[config.color].solid }}>{title}</strong>
        </span>
      </button>

      <button
        aria-label={t.deleteGroup}
        className="tm-dashboard-automation-icon-button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        type="button"
      >
        <RiDeleteBin6Line size={14} />
      </button>
    </article>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
