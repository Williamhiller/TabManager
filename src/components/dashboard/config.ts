import {
  RiBookmarkLine,
  RiCloseCircleLine,
  RiFilterOffLine,
  RiHistoryLine,
  RiLayoutGridLine,
  RiNodeTree,
  RiSettings3Line
} from '@remixicon/react';

import type { DashboardLocaleOption, DashboardNavItem, DashboardViewId } from './types';

export const DASHBOARD_DEFAULT_VIEW: DashboardViewId = 'tabs';

export const DASHBOARD_LANGUAGE_OPTIONS: DashboardLocaleOption[] = [
  { value: 'system', labelKey: 'localeAuto' },
  { value: 'en', labelKey: 'localeEnglish' },
  { value: 'zh-CN', labelKey: 'localeChinese' },
  { value: 'ja', labelKey: 'localeJapanese' },
  { value: 'fr', labelKey: 'localeFrench' },
  { value: 'es', labelKey: 'localeSpanish' },
  { value: 'ar', labelKey: 'localeArabic' }
];

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  { id: 'tabs', labelKey: 'navTabs', icon: RiLayoutGridLine },
  { id: 'snapshots', labelKey: 'navSnapshots', icon: RiHistoryLine },
  { id: 'bookmarks', labelKey: 'navBookmarks', icon: RiBookmarkLine },
  { id: 'automation', labelKey: 'navAutomation', icon: RiNodeTree },
  { id: 'deduplication', labelKey: 'autoDeduplicate', icon: RiFilterOffLine },
  { id: 'autoclose', labelKey: 'autoCloseInactiveTabs', icon: RiCloseCircleLine },
  { id: 'settings', labelKey: 'settings', icon: RiSettings3Line }
];
