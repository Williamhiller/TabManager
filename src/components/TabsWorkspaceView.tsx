import type {
  CollisionDetection,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent
} from '@dnd-kit/core';
import { DragOverlay } from '@dnd-kit/core';
import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

import type { TabGroupColor, TabSnapshot } from '../lib/contracts';
import { groupColorTokens } from '../lib/theme';
import type { Messages } from '../lib/i18n';
import { TabsManagerView } from './TabsManagerView';
import { TabsTreeContent } from './TabsTreeContent';

interface TabsWorkspaceViewProps<TEntry> {
  activeDragGroupColor?: TabGroupColor;
  activeDragGroupId: number | null;
  activeDragTabId: number | null;
  collisionDetection: CollisionDetection;
  entries: TEntry[];
  historyContent?: ReactNode;
  isSidepanel: boolean;
  markScrollbarActive: (element: HTMLDivElement | null) => void;
  onDragCancel: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragStart: (event: DragStartEvent) => void;
  renderEntry: (entry: TEntry) => ReactNode;
  scrollRef: RefObject<HTMLElement | null>;
  sensors: ReturnType<typeof import('@dnd-kit/core').useSensors>;
  showTools: boolean;
  t: Messages;
  treeListScrollRef: RefObject<HTMLDivElement | null>;
  visibleTabs: TabSnapshot[];
}

export function TabsWorkspaceView<TEntry>({
  activeDragGroupColor,
  activeDragGroupId,
  activeDragTabId,
  collisionDetection,
  entries,
  historyContent,
  isSidepanel,
  markScrollbarActive,
  onDragCancel,
  onDragEnd,
  onDragMove,
  onDragOver,
  onDragStart,
  renderEntry,
  scrollRef,
  sensors,
  showTools,
  t,
  treeListScrollRef,
  visibleTabs
}: TabsWorkspaceViewProps<TEntry>) {
  return (
    <TabsManagerView
      collisionDetection={collisionDetection}
      isSidepanel={isSidepanel}
      markScrollbarActive={markScrollbarActive}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      scrollRef={scrollRef}
      sensors={sensors}
      treeListScrollRef={treeListScrollRef}
      visibleTabs={visibleTabs}
    >
      <TabsTreeContent
        entries={entries}
        historyContent={historyContent}
        renderEntry={renderEntry}
        showTools={showTools}
        t={t}
      />

      {createPortal(
        <DragOverlay dropAnimation={null}>
          {activeDragTabId != null ? (
            <div className={`tm-drag-frame ${isSidepanel ? 'tm-drag-frame-tab-compact' : 'tm-drag-frame-tab'}`} />
          ) : activeDragGroupId != null ? (
            <div
              className={`tm-drag-frame ${isSidepanel ? 'tm-drag-frame-group-compact' : 'tm-drag-frame-group'}`}
              style={{
                borderColor: groupColorTokens[activeDragGroupColor ?? 'blue'].ring
              }}
            />
          ) : null}
        </DragOverlay>,
        document.body
      )}
    </TabsManagerView>
  );
}
