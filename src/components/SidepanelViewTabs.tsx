import type { ReactNode } from 'react';
import { SegmentedSwitch } from './SegmentedSwitch';

type SidepanelView = 'tabs' | 'sessions' | 'bookmarks';

interface SidepanelViewTabsProps {
  activeView: SidepanelView;
  tabsCount: number;
  sessionsCount: number;
  bookmarksCount: number;
  bookmarksLabel: string;
  label: string;
  meta?: string | null;
  bookmarksAction?: ReactNode;
  onSwitch: (nextView: SidepanelView) => void;
  sessionsLabel: string;
  tabsLabel: string;
  showSnapshots?: boolean;
  showBookmarks?: boolean;
}

export function SidepanelViewTabs({
  activeView,
  tabsCount,
  sessionsCount,
  bookmarksCount,
  bookmarksLabel,
  label,
  meta,
  bookmarksAction,
  onSwitch,
  sessionsLabel,
  tabsLabel,
  showSnapshots = false,
  showBookmarks = false
}: SidepanelViewTabsProps) {
  const options: Array<{ value: SidepanelView; label: string; meta: number }> = [
    { value: 'tabs', label: tabsLabel, meta: tabsCount }
  ];

  if (showSnapshots) {
    options.push({ value: 'sessions', label: sessionsLabel, meta: sessionsCount });
  }

  if (showBookmarks) {
    options.push({ value: 'bookmarks', label: bookmarksLabel, meta: bookmarksCount });
  }

  return (
    <>
      <div className="tm-sidepanel-view-tabs-row">
        <SegmentedSwitch
          ariaLabel={label}
          className="tm-sidepanel-view-tabs"
          onChange={onSwitch}
          optionClassName="tm-sidepanel-view-tab"
          options={options}
          value={activeView}
        />
        {bookmarksAction && activeView === 'bookmarks' ? (
          <div className="tm-sidepanel-view-tabs-actions">{bookmarksAction}</div>
        ) : null}
      </div>
      {meta ? <div className="tm-bookmark-search-meta">{meta}</div> : null}
    </>
  );
}
