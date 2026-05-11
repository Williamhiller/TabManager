import {
  RiAddCircleLine,
  RiArrowDownSLine,
  RiArrowLeftLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiFolderLine,
  RiLinksLine,
  RiShining2Line
} from '@remixicon/react';
import { useEffect, useState, type RefObject } from 'react';

import { defaultAutoGroupPresets, getDefaultAutoGroupPresetTitle } from '../lib/auto-group-defaults';
import type { AutoGroupConfig, AutoGroupRule, AutoGroupRuleField, AutoGroupRuleOperator } from '../lib/contracts';
import type { ResolvedLocale } from '../lib/i18n';
import { allGroupColors, groupColorTokens } from '../lib/theme';
import { createAutoGroupRule, getPresetPatternLabels, normalizeDraftRule } from './tab-tree-helpers';

type SurfaceMode = 'popup' | 'sidepanel' | 'dashboard';

export function AutoGroupsManagerView({
  configs,
  locale,
  scrollRef,
  surfaceMode,
  onAddConfig,
  onBack,
  onDeleteConfig,
  onMoveConfig,
  onToggleConfig,
  onUpdateConfig
}: {
  configs: AutoGroupConfig[];
  locale: ResolvedLocale;
  scrollRef: RefObject<HTMLElement | null>;
  surfaceMode: SurfaceMode;
  onAddConfig: () => Promise<string>;
  onBack: () => void;
  onDeleteConfig: (configId: string) => Promise<void>;
  onMoveConfig: (configId: string, direction: -1 | 1) => Promise<void>;
  onToggleConfig: (configId: string) => void;
  onUpdateConfig: (configId: string, patch: Partial<AutoGroupConfig>) => Promise<void>;
}) {
  const [selectedConfigId, setSelectedConfigId] = useState(configs[0]?.id ?? null);
  const [websiteDraft, setWebsiteDraft] = useState('');
  const selectedConfig =
    configs.find((config) => config.id === selectedConfigId) ?? configs[0] ?? null;
  const selectedIndex = selectedConfig
    ? configs.findIndex((config) => config.id === selectedConfig.id)
    : -1;
  const labels = getAutoGroupsManagerLabels(locale);
  const selectedPreset = selectedConfig?.presetId
    ? defaultAutoGroupPresets.find((preset) => preset.id === selectedConfig.presetId) ?? null
    : null;
  const selectedPresetPatterns = selectedPreset ? getPresetPatternLabels(selectedPreset) : [];

  useEffect(() => {
    if (selectedConfigId && configs.some((config) => config.id === selectedConfigId)) return;
    setSelectedConfigId(configs[0]?.id ?? null);
  }, [configs, selectedConfigId]);

  const addConfig = async () => {
    const id = await onAddConfig();
    setSelectedConfigId(id);
  };

  const updateSelectedConfig = (patch: Partial<AutoGroupConfig>) => {
    if (!selectedConfig) return;
    void onUpdateConfig(selectedConfig.id, patch);
  };

  const addWebsite = () => {
    if (!selectedConfig) return;

    const website = normalizeWebsiteDraft(websiteDraft);
    if (!website || selectedConfig.websites.includes(website)) {
      setWebsiteDraft('');
      return;
    }

    updateSelectedConfig({ websites: [...selectedConfig.websites, website] });
    setWebsiteDraft('');
  };

  const updateRuleAt = (
    ruleId: string,
    patch: Partial<Pick<AutoGroupRule, 'field' | 'operator' | 'value'>>
  ) => {
    if (!selectedConfig) return;

    updateSelectedConfig({
      rules: selectedConfig.rules.map((rule) =>
        rule.id === ruleId ? normalizeDraftRule({ ...rule, ...patch }) : rule
      )
    });
  };

  const addRule = () => {
    if (!selectedConfig) return;
    updateSelectedConfig({ rules: [...selectedConfig.rules, createAutoGroupRule()] });
  };

  const removeRule = (ruleId: string) => {
    if (!selectedConfig) return;
    updateSelectedConfig({ rules: selectedConfig.rules.filter((rule) => rule.id !== ruleId) });
  };

  return (
    <section className="tm-panel tm-auto-groups-page" data-surface={surfaceMode} ref={scrollRef}>
      <div className="tm-auto-groups-head">
        <button className="tm-icon-button" onClick={onBack} type="button" aria-label={labels.back}>
          <RiArrowLeftLine size={14} />
        </button>
        <div className="tm-auto-groups-title">
          <strong>{labels.title}</strong>
          <span>{labels.subtitle}</span>
        </div>
        <button className="tm-button-primary tm-auto-groups-add" onClick={() => void addConfig()} type="button">
          <RiAddCircleLine size={13} />
          <span>{labels.newGroup}</span>
        </button>
      </div>

      <div className="tm-auto-groups-layout">
        <div className="tm-auto-groups-list" role="listbox" aria-label={labels.title}>
          {configs.map((config, index) => {
            const preset = config.presetId
              ? defaultAutoGroupPresets.find((entry) => entry.id === config.presetId)
              : null;
            const title = preset && config.title === preset.titles.en
              ? getDefaultAutoGroupPresetTitle(preset, locale)
              : config.title;
            const matchCount =
              (config.presetId ? 1 : 0) + config.websites.length + config.rules.length;

            return (
              <button
                className="tm-auto-group-list-item"
                data-active={selectedConfig?.id === config.id}
                data-enabled={config.enabled}
                key={config.id}
                onClick={() => setSelectedConfigId(config.id)}
                role="option"
                type="button"
                aria-selected={selectedConfig?.id === config.id}
              >
                <span
                  className="tm-auto-group-list-dot"
                  style={{ backgroundColor: groupColorTokens[config.color].solid }}
                />
                <span className="tm-auto-group-list-copy">
                  <strong>{title}</strong>
                  <span>
                    {index + 1} · {matchCount} {labels.matchers}
                  </span>
                </span>
                <span className="tm-auto-group-list-state">
                  {config.enabled ? labels.on : labels.off}
                </span>
              </button>
            );
          })}
        </div>

        {selectedConfig ? (
          <div className="tm-auto-group-detail">
            <div className="tm-auto-group-detail-card tm-auto-group-identity">
              <div className="tm-auto-group-detail-card-head">
                <div>
                  <strong>{labels.identity}</strong>
                  <span>{selectedConfig.presetId ? labels.defaultGroup : labels.customGroup}</span>
                </div>
                <button
                  className="tm-sidepanel-settings-inline-toggle"
                  data-active={selectedConfig.enabled}
                  onClick={() => onToggleConfig(selectedConfig.id)}
                  type="button"
                >
                  <span className="tm-sidepanel-settings-inline-toggle-label">
                    {selectedConfig.enabled ? labels.on : labels.off}
                  </span>
                  <span
                    aria-hidden="true"
                    className="tm-sidepanel-settings-switch"
                    data-active={selectedConfig.enabled}
                  >
                    <span className="tm-sidepanel-settings-switch-thumb" />
                  </span>
                </button>
              </div>

              <label className="tm-auto-group-field">
                <span>{labels.name}</span>
                <input
                  className="tm-auto-group-input"
                  defaultValue={selectedConfig.title}
                  key={`${selectedConfig.id}:title`}
                  onBlur={(event) => {
                    const nextTitle = event.target.value.trim();
                    if (!nextTitle) {
                      event.target.value = selectedConfig.title;
                      return;
                    }

                    if (nextTitle === selectedConfig.title) return;
                    updateSelectedConfig({ title: nextTitle });
                  }}
                />
              </label>

              <div className="tm-auto-group-color-grid" aria-label={labels.color}>
                {allGroupColors.map((color) => {
                  const tokens = groupColorTokens[color];

                  return (
                    <button
                      aria-label={color}
                      className="tm-group-color-swatch"
                      data-active={selectedConfig.color === color}
                      key={color}
                      onClick={() => updateSelectedConfig({ color })}
                      style={{
                        backgroundColor: selectedConfig.color === color ? tokens.soft : 'transparent',
                        borderColor:
                          selectedConfig.color === color ? tokens.ring : 'var(--tm-border)'
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

            <div className="tm-auto-group-detail-card">
              <div className="tm-auto-group-detail-card-head">
                <div>
                  <strong>{labels.priority}</strong>
                  <span>{labels.priorityHint}</span>
                </div>
                <div className="tm-auto-group-priority-actions">
                  <button
                    className="tm-icon-button"
                    disabled={selectedIndex <= 0}
                    onClick={() => void onMoveConfig(selectedConfig.id, -1)}
                    type="button"
                    aria-label={labels.moveUp}
                  >
                    <RiArrowDownSLine size={14} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                  <button
                    className="tm-icon-button"
                    disabled={selectedIndex < 0 || selectedIndex >= configs.length - 1}
                    onClick={() => void onMoveConfig(selectedConfig.id, 1)}
                    type="button"
                    aria-label={labels.moveDown}
                  >
                    <RiArrowDownSLine size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="tm-auto-group-detail-card">
              <div className="tm-auto-group-detail-card-head">
                <div>
                  <strong>{labels.websites}</strong>
                  <span>{labels.websitesHint}</span>
                </div>
                <RiLinksLine size={14} />
              </div>
              <div className="tm-auto-group-add-row">
                <input
                  className="tm-auto-group-input"
                  onChange={(event) => setWebsiteDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addWebsite();
                    }
                  }}
                  placeholder={labels.websitePlaceholder}
                  value={websiteDraft}
                />
                <button className="tm-button" onClick={addWebsite} type="button">
                  <RiAddCircleLine size={13} />
                </button>
              </div>
              <div className="tm-auto-group-chip-list">
                {selectedConfig.websites.length === 0 ? (
                  <span className="tm-auto-group-empty">{labels.noWebsites}</span>
                ) : (
                  selectedConfig.websites.map((website) => (
                    <span className="tm-auto-group-site-chip" key={website}>
                      {website}
                      <button
                        aria-label={labels.remove}
                        onClick={() =>
                          updateSelectedConfig({
                            websites: selectedConfig.websites.filter((item) => item !== website)
                          })
                        }
                        type="button"
                      >
                        <RiCloseLine size={11} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {selectedPreset ? (
              <div className="tm-auto-group-detail-card">
                <div className="tm-auto-group-detail-card-head">
                  <div>
                    <strong>{labels.defaultRules}</strong>
                    <span>{labels.defaultRulesHint}</span>
                  </div>
                  <RiShining2Line size={14} />
                </div>
                <div className="tm-auto-group-chip-list">
                  {selectedPresetPatterns.map((pattern) => (
                    <span className="tm-auto-group-site-chip tm-auto-group-default-chip" key={pattern}>
                      {pattern}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="tm-auto-group-detail-card">
              <div className="tm-auto-group-detail-card-head">
                <div>
                  <strong>{labels.rules}</strong>
                  <span>{labels.rulesHint}</span>
                </div>
                <button className="tm-button" onClick={addRule} type="button">
                  <RiAddCircleLine size={13} />
                  <span>{labels.addRule}</span>
                </button>
              </div>

              <div className="tm-auto-group-rule-list">
                {selectedConfig.rules.length === 0 ? (
                  <span className="tm-auto-group-empty">{labels.noRules}</span>
                ) : (
                  selectedConfig.rules.map((rule) => (
                    <div className="tm-auto-group-rule-editor" key={rule.id}>
                      <select
                        className="tm-select tm-auto-group-rule-select"
                        onChange={(event) =>
                          updateRuleAt(rule.id, { field: event.target.value as AutoGroupRuleField })
                        }
                        value={rule.field}
                      >
                        <option value="hostname">{labels.ruleDomain}</option>
                        <option value="url">{labels.ruleUrl}</option>
                        <option value="title">{labels.ruleTitle}</option>
                      </select>
                      <select
                        className="tm-select tm-auto-group-rule-select"
                        onChange={(event) =>
                          updateRuleAt(rule.id, {
                            operator: event.target.value as AutoGroupRuleOperator
                          })
                        }
                        value={rule.operator}
                      >
                        <option value="contains">{labels.ruleContains}</option>
                        <option value="equals">{labels.ruleEquals}</option>
                      </select>
                      <input
                        className="tm-auto-group-input"
                        defaultValue={rule.value}
                        onBlur={(event) => {
                          if (event.target.value === rule.value) return;
                          updateRuleAt(rule.id, { value: event.target.value });
                        }}
                        placeholder={labels.ruleValuePlaceholder}
                      />
                      <button
                        className="tm-icon-button-danger"
                        onClick={() => removeRule(rule.id)}
                        type="button"
                        aria-label={labels.remove}
                      >
                        <RiCloseLine size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="tm-auto-group-detail-actions">
              <button
                className={selectedConfig.presetId ? 'tm-button' : 'tm-button-danger'}
                onClick={() => void onDeleteConfig(selectedConfig.id)}
                type="button"
              >
                <RiDeleteBinLine size={13} />
                <span>{selectedConfig.presetId ? labels.resetDefault : labels.deleteGroup}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="tm-empty">
            <RiFolderLine size={16} />
            <div>{labels.empty}</div>
          </div>
        )}
      </div>
    </section>
  );
}

function normalizeWebsiteDraft(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function getAutoGroupsManagerLabels(locale: string) {
  if (locale === 'zh-CN') {
    return {
      title: '自动分组',
      subtitle: '管理分组、网站列表和匹配规则',
      back: '返回',
      newGroup: '新建',
      identity: '分组信息',
      defaultGroup: '默认模块',
      customGroup: '自定义分组',
      name: '名称',
      color: '颜色',
      on: '开启',
      off: '关闭',
      priority: '匹配优先级',
      priorityHint: '靠前的分组先匹配',
      moveUp: '上移',
      moveDown: '下移',
      websites: '网站列表',
      websitesHint: '域名命中后直接归入该分组',
      websitePlaceholder: 'github.com',
      noWebsites: '还没有添加网站',
      defaultRules: '默认规则',
      defaultRulesHint: '内置模块会匹配这些关键词',
      rules: '规则',
      rulesHint: '按域名、URL 或标题匹配',
      addRule: '添加',
      noRules: '还没有自定义规则',
      ruleDomain: '域名',
      ruleUrl: 'URL',
      ruleTitle: '标题',
      ruleContains: '包含',
      ruleEquals: '等于',
      ruleValuePlaceholder: '输入匹配内容',
      remove: '删除',
      resetDefault: '清空自定义',
      deleteGroup: '删除分组',
      matchers: '条匹配',
      empty: '还没有自动分组'
    };
  }

  return {
    title: 'Auto groups',
    subtitle: 'Manage groups, websites, and matching rules',
    back: 'Back',
    newGroup: 'New',
    identity: 'Group details',
    defaultGroup: 'Default module',
    customGroup: 'Custom group',
    name: 'Name',
    color: 'Color',
    on: 'On',
    off: 'Off',
    priority: 'Match priority',
    priorityHint: 'Higher groups match first',
    moveUp: 'Move up',
    moveDown: 'Move down',
    websites: 'Websites',
    websitesHint: 'Domains route directly to this group',
    websitePlaceholder: 'github.com',
    noWebsites: 'No websites added',
    defaultRules: 'Default rules',
    defaultRulesHint: 'Built-in module matches these keywords',
    rules: 'Rules',
    rulesHint: 'Match by domain, URL, or title',
    addRule: 'Add',
    noRules: 'No custom rules',
    ruleDomain: 'Domain',
    ruleUrl: 'URL',
    ruleTitle: 'Title',
    ruleContains: 'Contains',
    ruleEquals: 'Equals',
    ruleValuePlaceholder: 'Match value',
    remove: 'Remove',
    resetDefault: 'Clear custom',
    deleteGroup: 'Delete group',
    matchers: 'matchers',
    empty: 'No auto groups yet'
  };
}
