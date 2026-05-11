import {
  DndContext,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ReactNode, Ref, RefObject } from 'react';

import type { TabSnapshot } from '../lib/contracts';

interface TabsManagerViewProps {
  children: ReactNode;
  collisionDetection: CollisionDetection;
  isSidepanel: boolean;
  markScrollbarActive: (element: HTMLDivElement | null) => void;
  onDragCancel: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragStart: (event: DragStartEvent) => void;
  scrollRef?: Ref<HTMLElement>;
  sensors: ReturnType<typeof import('@dnd-kit/core').useSensors>;
  treeListScrollRef?: RefObject<HTMLDivElement | null>;
  visibleTabs: TabSnapshot[];
}

export function TabsManagerView({
  children,
  collisionDetection,
  isSidepanel,
  markScrollbarActive,
  onDragCancel,
  onDragEnd,
  onDragMove,
  onDragOver,
  onDragStart,
  scrollRef,
  sensors,
  treeListScrollRef,
  visibleTabs
}: TabsManagerViewProps) {
  return (
    <section className="tm-panel tm-tree-shell" ref={isSidepanel ? scrollRef : undefined}>
      <DndContext
        collisionDetection={collisionDetection}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
        onDragMove={onDragMove}
        onDragOver={onDragOver}
        onDragStart={onDragStart}
        sensors={sensors}
      >
        <SortableContext items={visibleTabs.map((tab) => `tab:${tab.id}`)} strategy={verticalListSortingStrategy}>
          <div
            className={`tm-tree-list${isSidepanel ? ' tm-tree-list-sidepanel' : ' tm-scrollbar'}`}
            data-scrolling={isSidepanel ? undefined : 'false'}
            onScroll={isSidepanel ? undefined : () => markScrollbarActive(treeListScrollRef?.current ?? null)}
            ref={isSidepanel ? undefined : treeListScrollRef}
          >
            {children}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
