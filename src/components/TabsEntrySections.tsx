import type { ReactNode } from 'react';

import type { TabGroupSnapshot, TabSnapshot } from '../lib/contracts';

export interface UngroupedEntry {
  type: 'ungrouped';
  tabs: TabSnapshot[];
}

export interface GroupedEntry {
  type: 'group';
  group: TabGroupSnapshot;
  tabs: TabSnapshot[];
}

export function UngroupedTabsSection({
  entry,
  renderTabRow
}: {
  entry: UngroupedEntry;
  renderTabRow: (tab: TabSnapshot) => ReactNode;
}) {
  return (
    <section key={`ungrouped:${entry.tabs[0]?.id ?? 'empty'}`} className="tm-section-block">
      <div className="tm-section-children tm-section-children-root">
        {entry.tabs.map((tab) => renderTabRow(tab))}
      </div>
    </section>
  );
}

export function GroupedTabsSection({
  entry,
  renderGroupBlock
}: {
  entry: GroupedEntry;
  renderGroupBlock: (entry: GroupedEntry) => ReactNode;
}) {
  return renderGroupBlock(entry);
}

export function renderTabsEntry({
  entry,
  renderGroupedEntry,
  renderUngroupedEntry
}: {
  entry: UngroupedEntry | GroupedEntry;
  renderGroupedEntry: (entry: GroupedEntry) => ReactNode;
  renderUngroupedEntry: (entry: UngroupedEntry) => ReactNode;
}) {
  return entry.type === 'ungrouped' ? renderUngroupedEntry(entry) : renderGroupedEntry(entry);
}
