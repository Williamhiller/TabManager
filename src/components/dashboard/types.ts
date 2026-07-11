import type { RemixiconComponentType } from '@remixicon/react';

import type {
  AutoGroupConfig,
  AutoGroupRule,
  BookmarkTreeSnapshot,
  LocaleMode,
  ManagerSettings,
  OverviewSnapshot,
  RedirectTrackingPermissionState,
  SessionsSnapshot
} from '../../lib/contracts';
import type { Messages, ResolvedLocale } from '../../lib/i18n';

export type DashboardViewId = 'tabs' | 'snapshots' | 'bookmarks' | 'automation' | 'deduplication' | 'autoclose' | 'settings';

export type DashboardNavItem = {
  id: DashboardViewId;
  labelKey: keyof Messages;
  icon: RemixiconComponentType;
};

export type DashboardNavItemView = {
  id: DashboardViewId;
  label: string;
  icon: RemixiconComponentType;
};

export type DashboardLocaleOption = {
  value: LocaleMode;
  labelKey: keyof Messages;
};

export type DashboardLocaleOptionView = {
  value: LocaleMode;
  label: string;
};

export type DashboardData = {
  bookmarks: BookmarkTreeSnapshot | null;
  overview: OverviewSnapshot | null;
  redirectTrackingPermission: RedirectTrackingPermissionState | null;
  sessions: SessionsSnapshot | null;
  settings: ManagerSettings;
};

export type DashboardMetric = {
  label: string;
  note?: string;
  value: string;
};

export type DashboardListItem = {
  meta?: string;
  subtitle?: string;
  title: string;
};

export type DashboardViewModel = {
  asideItems: DashboardListItem[];
  asideTitle: string;
  items: DashboardListItem[];
  metrics: DashboardMetric[];
  title: string;
};

export type DashboardAutoGroupPanelProps = {
  autoGroupEnabled: boolean;
  autoGroupLearningSensitivity: ManagerSettings['autoGroupLearningSensitivity'];
  configs: AutoGroupConfig[];
  locale: ResolvedLocale;
  onAddConfig: () => void;
  onAddRule: (configId: string) => void;
  onDeleteConfig: (configId: string) => void;
  onDeleteRule: (configId: string, ruleId: string) => void;
  onReorderConfigs: (activeConfigId: string, overConfigId: string) => void;
  onSelectConfig: (configId: string) => void;
  onToggleAutoGroup: () => void;
  onToggleAutoGroupLearning: () => void;
  onToggleConfig: (configId: string) => void;
  onUpdateConfig: (configId: string, patch: Partial<AutoGroupConfig>) => void;
  onUpdateRule: (configId: string, ruleId: string, patch: Partial<AutoGroupRule>) => void;
  selectedConfigId: string | null;
  t: Record<string, string>;
};

export type DashboardDeduplicationPanelProps = {
  busy: boolean;
  onDeduplicationKeepChange: (keep: ManagerSettings['autoDeduplicationKeep']) => void;
  onDeduplicationScopeChange: (scope: ManagerSettings['autoDeduplicationScope']) => void;
  onDeduplicationSitesChange: (entries: string[]) => void;
  onToggleAutoDeduplicateTabs: () => void;
  settings: ManagerSettings;
  t: Record<string, string>;
};

export type DashboardSnapshotsPanelProps = {
  autoSnapshotsEnabled: boolean;
  errorMessage: string | null;
  locale: ResolvedLocale;
  onRefreshSessions: () => Promise<void>;
  onToggleAutoSnapshots: () => void;
  openUrls: string[];
  sessions: SessionsSnapshot | null;
  t: Messages;
};

export type DashboardTabsPanelProps = {
  errorMessage: string | null;
  onRefreshOverview: () => Promise<void>;
  overview: OverviewSnapshot | null;
  settings: ManagerSettings;
};
