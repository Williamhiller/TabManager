import type {
  CollisionDetection,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent
} from '@dnd-kit/core';
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
  collisionDetection: CollisionDetection;
  dragOverlayState: {
    activeId: string | null;
    height: number;
    left: number;
    top: number;
    width: number;
  };
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
  showCreateGroupDropZone: boolean;
  t: Messages;
  treeListScrollRef: RefObject<HTMLDivElement | null>;
  visibleTabs: TabSnapshot[];
}

export function TabsWorkspaceView<TEntry>({
  activeDragGroupColor,
  activeDragGroupId,
  collisionDetection,
  dragOverlayState,
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
  showCreateGroupDropZone,
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
        showCreateGroupDropZone={showCreateGroupDropZone}
        t={t}
      />

      {createPortal(
        dragOverlayState.activeId ? (
          <div
            className="tm-dashboard-automation-overlay-frame"
            style={{
              borderColor:
                activeDragGroupId != null
                  ? groupColorTokens[activeDragGroupColor ?? 'blue'].ring
                  : undefined,
              height: dragOverlayState.height,
              left: dragOverlayState.left,
              position: 'fixed',
              top: dragOverlayState.top,
              width: dragOverlayState.width,
              zIndex: 2400
            }}
          />
        ) : null,
        document.body
      )}
    </TabsManagerView>
  );
}
