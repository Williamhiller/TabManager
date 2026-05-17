import { RiAddCircleLine, RiSearchLine } from '@remixicon/react';
import type { ReactNode } from 'react';

import type { Messages } from '../lib/i18n';

interface TabsTreeContentProps<TEntry> {
  entries: TEntry[];
  historyContent?: ReactNode;
  renderEntry: (entry: TEntry) => ReactNode;
  showCreateGroupDropZone: boolean;
  t: Messages;
}

export function TabsTreeContent<TEntry>({
  entries,
  historyContent,
  renderEntry,
  showCreateGroupDropZone,
  t
}: TabsTreeContentProps<TEntry>) {
  return (
    <>
      {showCreateGroupDropZone ? (
        <DropZoneRow id="new-group-drop" icon={RiAddCircleLine} label={t.dropToCreateGroup} />
      ) : null}

      {entries.length === 0 ? (
        <div className="tm-empty">
          <RiSearchLine size={16} />
          <div>
            <div className="font-medium">{t.noMatch}</div>
            <div className="tm-subtle">{t.noMatchHint}</div>
          </div>
        </div>
      ) : null}

      {entries.map((entry) => renderEntry(entry))}
      {historyContent}
    </>
  );
}

function DropZoneRow({ id, icon: Icon, label }: { id: string; icon: typeof RiAddCircleLine; label: string }) {
  return (
    <div className="tm-drop-row" data-drop-id={id}>
      <Icon size={14} />
      <span>{label}</span>
    </div>
  );
}
