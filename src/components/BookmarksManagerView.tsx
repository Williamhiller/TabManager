import { CSS } from '@dnd-kit/utilities';
import {
  FloatingArrow,
  FloatingPortal,
  arrow,
  autoUpdate,
  flip,
  offset,
  safePolygon,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useHover,
  useInteractions,
  useRole
} from '@floating-ui/react';
import {
  DndContext,
  PointerSensor,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { defaultAnimateLayoutChanges, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  RiArrowDownSLine,
  RiArrowRightUpLine,
  RiBookmarkLine,
  RiDeleteBinLine,
  RiDragMove2Line,
  RiEdit2Line,
  RiFolderAddLine,
  RiFolderLine,
  RiLinksLine,
  RiMore2Line,
  RiRefreshLine,
  RiStarLine
} from '@remixicon/react';
import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';

import type { BookmarkNodeSnapshot } from '../lib/contracts';
import {
  createBookmarkFolder,
  createBookmarkFromActiveTab,
  deleteBookmark,
  moveBookmark,
  updateBookmark
} from '../lib/runtime-client';
import { getErrorMessage } from '../lib/format';
import type { ResolvedLocale } from '../lib/i18n';
import { IconButton } from './IconButton';
import { Tooltip } from './Tooltip';
import { blockDrag } from './tab-tree-helpers';

interface BookmarksManagerViewProps {
  bookmarks: BookmarkNodeSnapshot[];
  isSidepanel: boolean;
  locale: string;
  query: string;
  refreshBookmarks: () => Promise<void>;
  scrollRef?: Ref<HTMLElement>;
  surface?: 'default' | 'dashboard';
}

type BookmarkSurface = NonNullable<BookmarksManagerViewProps['surface']>;

type BookmarkDialogState =
  | {
      kind: 'edit';
      node: BookmarkNodeSnapshot;
      title: string;
      url: string;
    }
  | {
      kind: 'new-folder';
      parentId: string;
      title: string;
    };

type BookmarkDropPosition = 'before' | 'after' | 'inside';

type ParsedBookmarkDropId =
  | { kind: 'root'; id: string }
  | { kind: 'node'; id: string }
  | null;

interface TreeNodeMeta {
  node: BookmarkNodeSnapshot;
  depth: number;
  parentId: string | null;
  rootId: string;
}

interface FilterResult {
  nodes: BookmarkNodeSnapshot[];
  matchedCount: number;
}

const ROOT_ORDER = ['1', '2', '3'];
const EMPTY_DRAG_OVERLAY_STATE = {
  activeId: null as string | null,
  height: 0,
  left: 0,
  maxTop: 0,
  minTop: 0,
  originTop: 0,
  top: 0,
  width: 0
};

const collisionDetectionStrategy: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : closestCorners(args);
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildBookmarkFaviconUrl(url: string | null): string | null {
  const trimmedUrl = url?.trim();
  if (!trimmedUrl) return null;

  try {
    const parsedUrl = new URL(trimmedUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }

    const encodedPageUrl = encodeURIComponent(parsedUrl.href);
    return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodedPageUrl}&size=32`);
  } catch {
    return null;
  }
}

function extractClientY(event: Event | null | undefined): number | null {
  if (!event) return null;
  if (event instanceof PointerEvent || event instanceof MouseEvent) return event.clientY;
  if (event instanceof TouchEvent) {
    return event.touches[0]?.clientY ?? event.changedTouches[0]?.clientY ?? null;
  }
  return null;
}

function resolveVerticalDropPosition(
  overRect: { top: number; height: number } | null | undefined,
  pointerY: number | null,
  fallbackRect: { top: number; height: number } | null | undefined
): Exclude<BookmarkDropPosition, 'inside'> {
  if (!overRect) return 'before';

  const referenceY =
    pointerY ??
    (fallbackRect
      ? fallbackRect.top + fallbackRect.height / 2
      : overRect.top + overRect.height / 2);

  return referenceY < overRect.top + overRect.height / 2 ? 'before' : 'after';
}

function getLiveDropRect(dropId: string): DOMRect | null {
  if (typeof document === 'undefined') return null;

  const cssApi = globalThis.CSS;
  const escapedId =
    cssApi && typeof cssApi.escape === 'function'
      ? cssApi.escape(dropId)
      : dropId.replace(/["\\]/g, '\\$&');

  return (
    document.querySelector<HTMLElement>(`[data-drop-id="${escapedId}"]`)?.getBoundingClientRect() ??
    null
  );
}

function parseDropId(value: string | null | undefined): ParsedBookmarkDropId {
  if (!value) return null;
  if (value.startsWith('bookmark-root:')) {
    return { kind: 'root', id: value.slice('bookmark-root:'.length) };
  }
  if (value.startsWith('bookmark-node:')) {
    return { kind: 'node', id: value.slice('bookmark-node:'.length) };
  }
  return null;
}

function collectNodeIds(nodes: BookmarkNodeSnapshot[]): string[] {
  return nodes.flatMap((node) => [
    `bookmark-node:${node.id}`,
    ...collectNodeIds(node.children)
  ]);
}

function countBookmarksOnly(node: BookmarkNodeSnapshot): number {
  return node.children.reduce(
    (total, child) => total + (child.url ? 1 : 0) + countBookmarksOnly(child),
    0
  );
}

function nodeContainsDescendant(node: BookmarkNodeSnapshot, targetId: string): boolean {
  return node.children.some(
    (child) => child.id === targetId || nodeContainsDescendant(child, targetId)
  );
}

function getDomainLabel(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function getBookmarkPrimaryLabel(node: BookmarkNodeSnapshot): string {
  return node.title || (node.url ? getDomainLabel(node.url) || node.url : 'Untitled');
}

const bookmarkLabelMap = {
  en: {
    addCurrentTab: 'Add current tab',
    bookmarksWorkspace: 'Bookmarks workspace',
    creatingFolder: 'Creating folder…',
    deleteLabel: 'Delete',
    deleting: 'Deleting…',
    drag: 'Drag to reorder',
    edit: 'Edit',
    editBookmark: 'Edit bookmark',
    editNamePrompt: 'Rename',
    editUrlPrompt: 'Edit URL',
    empty: 'No matching bookmarks.',
    emptyHint: 'Clear the search or switch location.',
    folderNamePrompt: 'New folder name',
    items: 'items',
    matchedSuffix: 'matched',
    more: 'More actions',
    move: 'Moving bookmark…',
    name: 'Name',
    newFolder: 'New folder',
    open: 'Open',
    openInNewTab: 'Open in new tab',
    refresh: 'Refresh bookmarks',
    rename: 'Rename',
    renameFolder: 'Rename folder',
    rootLocal: 'Local',
    rootMetaLocal: 'Local',
    rootMetaSync: 'Account',
    rootSync: 'Account',
    rootMobile: 'Mobile bookmarks',
    rootOther: 'Other bookmarks',
    rootToolbar: 'Bookmarks bar',
    savingCurrentTab: 'Saving current tab…',
    save: 'Save',
    cancel: 'Cancel',
    updatingBookmark: 'Updating bookmark…',
    updatingFolder: 'Updating folder…',
    url: 'URL'
  },
  'zh-CN': {
        addCurrentTab: '添加当前标签页',
        bookmarksWorkspace: '书签空间',
        creatingFolder: '创建文件夹…',
        deleteLabel: '删除',
        deleting: '删除中…',
        drag: '拖拽排序',
        edit: '编辑',
        editBookmark: '编辑书签',
        editNamePrompt: '修改名称',
        editUrlPrompt: '修改链接',
        empty: '当前没有匹配的书签。',
        emptyHint: '清空搜索或切换位置。',
        folderNamePrompt: '新建文件夹名称',
        items: '项',
        matchedSuffix: '项匹配',
        more: '更多操作',
        move: '移动书签…',
        name: '名称',
        newFolder: '新建文件夹',
        open: '打开',
        openInNewTab: '在新标签打开',
        refresh: '刷新书签',
        rename: '重命名',
        renameFolder: '重命名文件夹',
        rootLocal: '本地',
        rootMetaLocal: '本地',
        rootMetaSync: '账号',
        rootSync: '账号',
        rootMobile: '移动设备书签',
        rootOther: '其他书签',
        rootToolbar: '书签栏',
        savingCurrentTab: '添加当前标签页…',
        save: '保存',
        cancel: '取消',
        updatingBookmark: '更新书签…',
        updatingFolder: '更新文件夹…',
        url: '网址'
  },
  ja: {
    addCurrentTab: '現在のタブを追加',
    bookmarksWorkspace: 'ブックマーク',
    creatingFolder: 'フォルダーを作成中…',
    deleteLabel: '削除',
    deleting: '削除中…',
    drag: 'ドラッグして並べ替え',
    edit: '編集',
    editBookmark: 'ブックマークを編集',
    editNamePrompt: '名前を変更',
    editUrlPrompt: 'URLを編集',
    empty: '一致するブックマークはありません。',
    emptyHint: '検索をクリアするか場所を切り替えてください。',
    folderNamePrompt: '新しいフォルダー名',
    items: '項目',
    matchedSuffix: '一致',
    more: 'その他の操作',
    move: 'ブックマークを移動中…',
    name: '名前',
    newFolder: '新しいフォルダー',
    open: '開く',
    openInNewTab: '新しいタブで開く',
    refresh: 'ブックマークを更新',
    rename: '名前を変更',
    renameFolder: 'フォルダー名を変更',
    rootLocal: 'ローカル',
    rootMetaLocal: 'ローカル',
    rootMetaSync: 'アカウント',
    rootSync: 'アカウント',
    rootMobile: 'モバイルのブックマーク',
    rootOther: 'その他のブックマーク',
    rootToolbar: 'ブックマークバー',
    savingCurrentTab: '現在のタブを追加中…',
    save: '保存',
    cancel: 'キャンセル',
    updatingBookmark: 'ブックマークを更新中…',
    updatingFolder: 'フォルダーを更新中…',
    url: 'URL'
  },
  fr: {
    addCurrentTab: 'Ajouter l’onglet actuel',
    bookmarksWorkspace: 'Favoris',
    creatingFolder: 'Création du dossier…',
    deleteLabel: 'Supprimer',
    deleting: 'Suppression…',
    drag: 'Glisser pour réordonner',
    edit: 'Modifier',
    editBookmark: 'Modifier le favori',
    editNamePrompt: 'Renommer',
    editUrlPrompt: 'Modifier l’URL',
    empty: 'Aucun favori correspondant.',
    emptyHint: 'Effacez la recherche ou changez d’emplacement.',
    folderNamePrompt: 'Nom du nouveau dossier',
    items: 'éléments',
    matchedSuffix: 'correspondants',
    more: 'Plus d’actions',
    move: 'Déplacement du favori…',
    name: 'Nom',
    newFolder: 'Nouveau dossier',
    open: 'Ouvrir',
    openInNewTab: 'Ouvrir dans un nouvel onglet',
    refresh: 'Actualiser les favoris',
    rename: 'Renommer',
    renameFolder: 'Renommer le dossier',
    rootLocal: 'Local',
    rootMetaLocal: 'Local',
    rootMetaSync: 'Compte',
    rootSync: 'Compte',
    rootMobile: 'Favoris mobiles',
    rootOther: 'Autres favoris',
    rootToolbar: 'Barre de favoris',
    savingCurrentTab: 'Ajout de l’onglet actuel…',
    save: 'Enregistrer',
    cancel: 'Annuler',
    updatingBookmark: 'Mise à jour du favori…',
    updatingFolder: 'Mise à jour du dossier…',
    url: 'URL'
  },
  es: {
    addCurrentTab: 'Añadir pestaña actual',
    bookmarksWorkspace: 'Marcadores',
    creatingFolder: 'Creando carpeta…',
    deleteLabel: 'Eliminar',
    deleting: 'Eliminando…',
    drag: 'Arrastra para reordenar',
    edit: 'Editar',
    editBookmark: 'Editar marcador',
    editNamePrompt: 'Renombrar',
    editUrlPrompt: 'Editar URL',
    empty: 'No hay marcadores coincidentes.',
    emptyHint: 'Limpia la búsqueda o cambia de ubicación.',
    folderNamePrompt: 'Nombre de carpeta nueva',
    items: 'elementos',
    matchedSuffix: 'coincidentes',
    more: 'Más acciones',
    move: 'Moviendo marcador…',
    name: 'Nombre',
    newFolder: 'Carpeta nueva',
    open: 'Abrir',
    openInNewTab: 'Abrir en pestaña nueva',
    refresh: 'Actualizar marcadores',
    rename: 'Renombrar',
    renameFolder: 'Renombrar carpeta',
    rootLocal: 'Local',
    rootMetaLocal: 'Local',
    rootMetaSync: 'Cuenta',
    rootSync: 'Cuenta',
    rootMobile: 'Marcadores móviles',
    rootOther: 'Otros marcadores',
    rootToolbar: 'Barra de marcadores',
    savingCurrentTab: 'Añadiendo pestaña actual…',
    save: 'Guardar',
    cancel: 'Cancelar',
    updatingBookmark: 'Actualizando marcador…',
    updatingFolder: 'Actualizando carpeta…',
    url: 'URL'
  },
  ar: {
    addCurrentTab: 'إضافة التبويب الحالي',
    bookmarksWorkspace: 'الإشارات',
    creatingFolder: 'جار إنشاء المجلد…',
    deleteLabel: 'حذف',
    deleting: 'جار الحذف…',
    drag: 'اسحب لإعادة الترتيب',
    edit: 'تعديل',
    editBookmark: 'تعديل الإشارة',
    editNamePrompt: 'إعادة تسمية',
    editUrlPrompt: 'تعديل الرابط',
    empty: 'لا توجد إشارات مطابقة.',
    emptyHint: 'امسح البحث أو غيّر الموقع.',
    folderNamePrompt: 'اسم المجلد الجديد',
    items: 'عناصر',
    matchedSuffix: 'مطابقة',
    more: 'إجراءات إضافية',
    move: 'جار نقل الإشارة…',
    name: 'الاسم',
    newFolder: 'مجلد جديد',
    open: 'فتح',
    openInNewTab: 'فتح في تبويب جديد',
    refresh: 'تحديث الإشارات',
    rename: 'إعادة تسمية',
    renameFolder: 'إعادة تسمية المجلد',
    rootLocal: 'محلي',
    rootMetaLocal: 'محلي',
    rootMetaSync: 'الحساب',
    rootSync: 'الحساب',
    rootMobile: 'إشارات الجوال',
    rootOther: 'إشارات أخرى',
    rootToolbar: 'شريط الإشارات',
    savingCurrentTab: 'جار إضافة التبويب الحالي…',
    save: 'حفظ',
    cancel: 'إلغاء',
    updatingBookmark: 'جار تحديث الإشارة…',
    updatingFolder: 'جار تحديث المجلد…',
    url: 'الرابط'
  },
  ru: {
    addCurrentTab: 'Добавить текущую вкладку',
    bookmarksWorkspace: 'Закладки',
    creatingFolder: 'Создание папки…',
    deleteLabel: 'Удалить',
    deleting: 'Удаление…',
    drag: 'Перетащите для изменения порядка',
    edit: 'Редактировать',
    editBookmark: 'Редактировать закладку',
    editNamePrompt: 'Переименовать',
    editUrlPrompt: 'Редактировать URL',
    empty: 'Нет подходящих закладок.',
    emptyHint: 'Очистите поиск или смените расположение.',
    folderNamePrompt: 'Имя новой папки',
    items: 'элементов',
    matchedSuffix: 'совпадений',
    more: 'Действия',
    move: 'Перемещение закладки…',
    name: 'Имя',
    newFolder: 'Новая папка',
    open: 'Открыть',
    openInNewTab: 'Открыть в новой вкладке',
    refresh: 'Обновить закладки',
    rename: 'Переименовать',
    renameFolder: 'Переименовать папку',
    rootLocal: 'Локальные',
    rootMetaLocal: 'Локальные',
    rootMetaSync: 'Аккаунт',
    rootSync: 'Аккаунт',
    rootMobile: 'Мобильные закладки',
    rootOther: 'Другие закладки',
    rootToolbar: 'Панель закладок',
    savingCurrentTab: 'Добавление текущей вкладки…',
    save: 'Сохранить',
    cancel: 'Отмена',
    updatingBookmark: 'Обновление закладки…',
    updatingFolder: 'Обновление папки…',
    url: 'URL'
  },
  el: {
    addCurrentTab: 'Προσθήκη τρέχουσας καρτέλας',
    bookmarksWorkspace: 'Σελιδοδείκτες',
    creatingFolder: 'Δημιουργία φακέλου…',
    deleteLabel: 'Διαγραφή',
    deleting: 'Διαγραφή…',
    drag: 'Σύρετε για αναδιάταξη',
    edit: 'Επεξεργασία',
    editBookmark: 'Επεξεργασία σελιδοδείκτη',
    editNamePrompt: 'Μετονομασία',
    editUrlPrompt: 'Επεξεργασία URL',
    empty: 'Δεν βρέθηκαν σελιδοδείκτες.',
    emptyHint: 'Καθαρίστε την αναζήτηση ή αλλάξτε τοποθεσία.',
    folderNamePrompt: 'Όνομα νέου φακέλου',
    items: 'στοιχεία',
    matchedSuffix: 'ταιριάζουν',
    more: 'Περισσότερες ενέργειες',
    move: 'Μετακίνηση σελιδοδείκτη…',
    name: 'Όνομα',
    newFolder: 'Νέος φάκελος',
    open: 'Άνοιγμα',
    openInNewTab: 'Άνοιγμα σε νέα καρτέλα',
    refresh: 'Ανανέωση σελιδοδεικτών',
    rename: 'Μετονομασία',
    renameFolder: 'Μετονομασία φακέλου',
    rootLocal: 'Τοπικά',
    rootMetaLocal: 'Τοπικά',
    rootMetaSync: 'Λογαριασμός',
    rootSync: 'Λογαριασμός',
    rootMobile: 'Κινητοί σελιδοδείκτες',
    rootOther: 'Άλλοι σελιδοδείκτες',
    rootToolbar: 'Γραμμή σελιδοδεικτών',
    savingCurrentTab: 'Αποθήκευση τρέχουσας καρτέλας…',
    save: 'Αποθήκευση',
    cancel: 'Ακύρωση',
    updatingBookmark: 'Ενημέρωση σελιδοδείκτη…',
    updatingFolder: 'Ενημέρωση φακέλου…',
    url: 'URL'
  },
  ko: {
    addCurrentTab: '현재 탭 추가',
    bookmarksWorkspace: '북마크',
    creatingFolder: '폴더 생성 중…',
    deleteLabel: '삭제',
    deleting: '삭제 중…',
    drag: '드래그하여 재정렬',
    edit: '편집',
    editBookmark: '북마크 편집',
    editNamePrompt: '이름 변경',
    editUrlPrompt: 'URL 편집',
    empty: '일치하는 북마크가 없습니다.',
    emptyHint: '검색을 지우거나 위치를 변경하세요.',
    folderNamePrompt: '새 폴더 이름',
    items: '항목',
    matchedSuffix: '일치',
    more: '더보기',
    move: '북마크 이동 중…',
    name: '이름',
    newFolder: '새 폴더',
    open: '열기',
    openInNewTab: '새 탭에서 열기',
    refresh: '북마크 새로고침',
    rename: '이름 변경',
    renameFolder: '폴더 이름 변경',
    rootLocal: '로컬',
    rootMetaLocal: '로컬',
    rootMetaSync: '계정',
    rootSync: '계정',
    rootMobile: '모바일 북마크',
    rootOther: '기타 북마크',
    rootToolbar: '북마크 바',
    savingCurrentTab: '현재 탭 저장 중…',
    save: '저장',
    cancel: '취소',
    updatingBookmark: '북마크 업데이트 중…',
    updatingFolder: '폴더 업데이트 중…',
    url: 'URL'
  }
} satisfies Record<ResolvedLocale, Record<string, string>>;

function getRootLabel(node: BookmarkNodeSnapshot, labels: ReturnType<typeof getBookmarkLabels>): string {
  if (node.folderType === 'bookmarks-bar') return labels.rootToolbar;
  if (node.folderType === 'other') return labels.rootOther;
  if (node.folderType === 'mobile') return labels.rootMobile;
  return getBookmarkPrimaryLabel(node);
}

function getBookmarkLabels(locale: string) {
  return bookmarkLabelMap[locale as ResolvedLocale] ?? bookmarkLabelMap.en;
}

function getRootDisplay(node: BookmarkNodeSnapshot, labels: ReturnType<typeof getBookmarkLabels>): { title: string; meta: string } {
  const baseTitle =
    node.folderType === 'bookmarks-bar'
      ? labels.rootToolbar
      : node.folderType === 'other'
        ? labels.rootOther
        : node.folderType === 'mobile'
          ? labels.rootMobile
          : getRootLabel(node, labels);
  const sourceLabel = node.syncing ? labels.rootSync : labels.rootLocal;

  return {
    title: `${sourceLabel} · ${baseTitle}`,
    meta: node.syncing ? labels.rootMetaSync : labels.rootMetaLocal
  };
}

function filterBookmarkNodes(nodes: BookmarkNodeSnapshot[], query: string): FilterResult {
  if (!query) {
    return {
      nodes,
      matchedCount: nodes.reduce(
        (total, node) => total + (node.url ? 1 : 0) + countBookmarksOnly(node),
        0
      )
    };
  }

  let matchedCount = 0;
  const nextNodes = nodes.flatMap((node) => {
    const childrenResult = filterBookmarkNodes(node.children, query);
    const haystacks = [node.title, node.url ?? '', getDomainLabel(node.url)];
    const selfMatches = haystacks.some((value) => value.toLowerCase().includes(query));

    if (!selfMatches && childrenResult.nodes.length === 0) {
      return [];
    }

    matchedCount += (selfMatches && node.url ? 1 : 0) + childrenResult.matchedCount;
    return [{ ...node, children: childrenResult.nodes }];
  });

  return { nodes: nextNodes, matchedCount };
}

function flattenTree(nodes: BookmarkNodeSnapshot[], rootId: string, depth = 0, parentId: string | null = null): TreeNodeMeta[] {
  return nodes.flatMap((node) => [
    { node, depth, parentId, rootId },
    ...flattenTree(node.children, rootId, depth + 1, node.id)
  ]);
}

function getBookmarkMoveTarget(
  nodes: BookmarkNodeSnapshot[],
  bookmarkId: string,
  over: ParsedBookmarkDropId,
  dropPosition: BookmarkDropPosition
): { parentId: string; index: number } | null {
  if (!over) return null;

  const rootsById = new Map(nodes.map((node) => [node.id, node]));
  const metas = nodes.flatMap((root) => flattenTree(root.children, root.id, 0, root.id));
  const metaById = new Map(metas.map((meta) => [meta.node.id, meta]));
  const draggedMeta = metaById.get(bookmarkId);
  if (!draggedMeta) return null;

  const siblingsOf = (parentId: string | null, rootId: string): BookmarkNodeSnapshot[] => {
    if (parentId == null) return [];
    if (parentId === rootId) {
      return rootsById.get(rootId)?.children ?? [];
    }
    return metaById.get(parentId)?.node.children ?? [];
  };

  if (over.kind === 'root') {
    if (dropPosition === 'inside') {
      const root = rootsById.get(over.id);
      if (!root) return null;
      return { parentId: root.id, index: root.children.length };
    }

    const siblings = rootsById.get(over.id)?.children ?? [];
    return { parentId: over.id, index: dropPosition === 'before' ? 0 : siblings.length };
  }

  const targetMeta = metaById.get(over.id);
  if (!targetMeta || targetMeta.node.id === bookmarkId) return null;
  if (nodeContainsDescendant(draggedMeta.node, targetMeta.node.id)) return null;

  if (dropPosition === 'inside' && targetMeta.node.url == null) {
    return {
      parentId: targetMeta.node.id,
      index: targetMeta.node.children.length
    };
  }

  const targetParentId = targetMeta.parentId;
  if (!targetParentId) return null;
  const siblings = siblingsOf(targetParentId, targetMeta.rootId);
  const targetIndex = siblings.findIndex((entry) => entry.id === targetMeta.node.id);
  if (targetIndex < 0) return null;

  let index = dropPosition === 'before' ? targetIndex : targetIndex + 1;
  if (targetParentId === draggedMeta.parentId) {
    const currentIndex = siblings.findIndex((entry) => entry.id === bookmarkId);
    if (currentIndex >= 0 && currentIndex < index) {
      index -= 1;
    }
  }

  return {
    parentId: targetParentId,
    index
  };
}

function BookmarkRow({
  active,
  children,
  compact,
  depth,
  dragSortingLocked,
  dragPreview,
  menuOpen,
  over,
  overPosition,
  rowId,
  sortable,
  surface = 'default'
}: {
  active?: boolean;
  children: ReactNode;
  compact?: boolean;
  depth: number;
  dragSortingLocked: boolean;
  dragPreview: boolean;
  menuOpen: boolean;
  over: boolean;
  overPosition: BookmarkDropPosition | null;
  rowId: string;
  sortable: ReturnType<typeof useSortable>;
  surface?: BookmarkSurface;
}) {
  const style = dragSortingLocked || dragPreview
    ? undefined
    : {
        transform: sortable.isDragging ? undefined : CSS.Transform.toString(sortable.transform),
        transition: sortable.isDragging ? undefined : sortable.transition
      };

  return (
    <div
      ref={sortable.setNodeRef}
      {...sortable.attributes}
      {...sortable.listeners}
      className={`tm-tab-row tm-bookmark-row${surface === 'dashboard' ? ' tm-bookmark-row-dashboard' : ''}`}
      data-active={active}
      data-bookmark-kind="item"
      data-compact={compact}
      data-depth={depth}
      data-dragging={dragPreview}
      data-drop-id={rowId}
      data-drag-overlay-id={rowId}
      data-menu-open={menuOpen}
      data-over={over}
      data-over-position={overPosition ?? undefined}
      data-selected={false}
      style={style}
    >
      {children}
    </div>
  );
}

function BookmarkLeafRow({
  dragSortingLocked,
  dragPreview,
  index,
  labels,
  menuOpen,
  node,
  onDelete,
  onEdit,
  onOpen,
  onOpenNewTab,
  onSetMoreOpen,
  overDropId,
  overDropPosition,
  surface = 'default'
}: {
  dragSortingLocked: boolean;
  dragPreview: boolean;
  index: number;
  labels: ReturnType<typeof getBookmarkLabels>;
  menuOpen: boolean;
  node: BookmarkNodeSnapshot;
  onDelete: () => void;
  onEdit: () => void;
  onOpen: () => void;
  onOpenNewTab: () => void;
  onSetMoreOpen: (open: boolean) => void;
  overDropId: string | null;
  overDropPosition: BookmarkDropPosition | null;
  surface?: BookmarkSurface;
}) {
  const sortable = useSortable({
    id: `bookmark-node:${node.id}`,
    transition: null,
    animateLayoutChanges: (args) => (args.isSorting ? defaultAnimateLayoutChanges(args) : false)
  });
  const [openByHover, setOpenByHover] = useState(false);
  const arrowRef = useRef<SVGSVGElement | null>(null);
  const { refs, floatingStyles, context, placement } = useFloating({
    open: menuOpen || openByHover,
    onOpenChange: (nextOpen) => {
      setOpenByHover(nextOpen);
      onSetMoreOpen(nextOpen);
    },
    placement: 'bottom-end',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: arrowRef, padding: 10 })]
  });
  const hover = useHover(context, {
    move: false,
    delay: { open: 70, close: 90 },
    handleClose: safePolygon()
  });
  const click = useClick(context, { event: 'click', toggle: false });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, click, dismiss, role]);

  const rowId = `bookmark-node:${node.id}`;
  const domain = getDomainLabel(node.url);
  const faviconUrl = buildBookmarkFaviconUrl(node.url);

  return (
    <BookmarkRow
      active={false}
      compact={surface === 'dashboard'}
      depth={surface === 'dashboard' ? 1 : 0}
      dragSortingLocked={dragSortingLocked}
      dragPreview={dragPreview}
      menuOpen={menuOpen}
      over={overDropId === rowId}
      overPosition={overDropId === rowId ? overDropPosition : null}
      rowId={rowId}
      surface={surface}
      sortable={sortable}
    >
      <div className="tm-tab-leading">
        {surface === 'dashboard' ? (
          <div className="tm-tab-sequence-slot">
            <span aria-hidden="true" className="tm-tab-sequence">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span aria-hidden="true" className="tm-tab-drag-indicator" title={labels.drag}>
              <RiDragMove2Line size={14} />
            </span>
          </div>
        ) : (
          <div className="tm-tab-handle" title={labels.drag}>
            <RiDragMove2Line size={14} />
          </div>
        )}
      </div>
      {faviconUrl ? (
        <img alt="" className="tm-favicon tm-favicon-small" src={faviconUrl} />
      ) : (
        <div className="tm-favicon tm-favicon-small">
          {domain ? domain.slice(0, 1).toUpperCase() : <RiBookmarkLine size={14} />}
        </div>
      )}
      <div className="tm-tab-main">
        <button className="tm-bookmark-open-button" onClick={onOpen} type="button">
          <div className="tm-tab-line">
            <strong className="tm-tab-title">{getBookmarkPrimaryLabel(node)}</strong>
          </div>
          {surface === 'dashboard' ? (
            <span className="tm-tab-subline tm-tab-subline-inline">
              <span className="tm-tab-subline-primary">{domain || node.url || ''}</span>
            </span>
          ) : (
            <div className="tm-tab-subline">
              <span className="tm-tab-subline-primary">{domain || node.url || ''}</span>
            </div>
          )}
        </button>
      </div>
      <div className="tm-row-actions-overlay" data-tab-action-root="true">
        <div className="tm-row-actions">
          <Tooltip content={labels.open}>
            <IconButton icon={RiArrowRightUpLine} label={labels.open} nativeTitle={false} onClick={onOpen} />
          </Tooltip>
          <Tooltip content={labels.edit}>
            <IconButton icon={RiEdit2Line} label={labels.edit} nativeTitle={false} onClick={onEdit} />
          </Tooltip>
          <button
            ref={refs.setReference}
            aria-label={labels.more}
            className="tm-icon-button tm-row-menu-trigger"
            data-open={menuOpen}
            type="button"
            {...getReferenceProps({ onPointerDown: blockDrag })}
          >
            <RiMore2Line size={14} />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {menuOpen ? (
            <FloatingPortal>
              <motion.div
                ref={refs.setFloating}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="tm-row-menu"
                data-side={placement.split('-')[0]}
                data-tab-action-root="true"
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                style={floatingStyles}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                {...getFloatingProps()}
              >
                <button className="tm-row-menu-button" onClick={onOpen} onPointerDown={blockDrag} type="button">
                  <RiArrowRightUpLine size={13} />
                  <span>{labels.open}</span>
                </button>
                <button className="tm-row-menu-button" onClick={onOpenNewTab} onPointerDown={blockDrag} type="button">
                  <RiLinksLine size={13} />
                  <span>{labels.openInNewTab}</span>
                </button>
                <button className="tm-row-menu-button" onClick={onEdit} onPointerDown={blockDrag} type="button">
                  <RiEdit2Line size={13} />
                  <span>{labels.edit}</span>
                </button>
                <button className="tm-row-menu-button tm-row-menu-button-danger" onClick={onDelete} onPointerDown={blockDrag} type="button">
                  <RiDeleteBinLine size={13} />
                  <span>{labels.deleteLabel}</span>
                </button>
                <FloatingArrow ref={arrowRef} className="tm-row-menu-arrow" context={context} />
              </motion.div>
            </FloatingPortal>
          ) : null}
        </AnimatePresence>
      </div>
    </BookmarkRow>
  );
}

function BookmarkFolderRow({
  children,
  dragSortingLocked,
  dragPreview,
  labels,
  expanded,
  menuOpen,
  node,
  onAddBookmark,
  onAddFolder,
  onDelete,
  onEdit,
  onSetExpanded,
  onSetMoreOpen,
  overDropId,
  overDropPosition,
  surface = 'default'
}: {
  children?: ReactNode;
  dragSortingLocked: boolean;
  dragPreview: boolean;
  labels: ReturnType<typeof getBookmarkLabels>;
  expanded: boolean;
  menuOpen: boolean;
  node: BookmarkNodeSnapshot;
  onAddBookmark: () => void;
  onAddFolder: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSetExpanded: (expanded: boolean) => void;
  onSetMoreOpen: (open: boolean) => void;
  overDropId: string | null;
  overDropPosition: BookmarkDropPosition | null;
  surface?: BookmarkSurface;
}) {
  const sortable = useSortable({
    id: `bookmark-node:${node.id}`,
    transition: null,
    animateLayoutChanges: (args) => (args.isSorting ? defaultAnimateLayoutChanges(args) : false)
  });
  const rowId = `bookmark-node:${node.id}`;
  const [openByHover, setOpenByHover] = useState(false);
  const arrowRef = useRef<SVGSVGElement | null>(null);
  const { refs, floatingStyles, context, placement } = useFloating({
    open: menuOpen || openByHover,
    onOpenChange: (nextOpen) => {
      setOpenByHover(nextOpen);
      onSetMoreOpen(nextOpen);
    },
    placement: 'bottom-end',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 }), arrow({ element: arrowRef, padding: 10 })]
  });
  const hover = useHover(context, {
    move: false,
    delay: { open: 70, close: 90 },
    handleClose: safePolygon()
  });
  const click = useClick(context, { event: 'click', toggle: false });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, click, dismiss, role]);
  const dropOnSelf = overDropId === rowId;
  const activeDrop = dropOnSelf && overDropPosition === 'inside';
  const insertPosition = dropOnSelf && overDropPosition !== 'inside' ? overDropPosition : null;
  const dragStyle = dragSortingLocked
    ? { opacity: dragPreview ? 0.12 : 1 }
    : {
        transform: sortable.isDragging ? undefined : CSS.Transform.toString(sortable.transform),
        transition: sortable.isDragging ? undefined : sortable.transition,
        opacity: dragPreview ? 0.12 : 1
      };
  const handleFolderHeaderClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.closest('button, input, select, a, [data-tab-action-root="true"]')) return;
    onSetExpanded(!expanded);
  };

  return (
    <section
      className={`tm-section-block tm-bookmark-folder-section${surface === 'dashboard' ? ' tm-bookmark-folder-section-dashboard' : ''}`}
      data-active={activeDrop}
      data-menu-open={menuOpen}
      ref={sortable.setNodeRef}
      style={dragStyle}
    >
      <div
        className={`tm-group-header tm-bookmark-folder-header${surface === 'dashboard' ? ' tm-bookmark-folder-header-dashboard' : ''}`}
        data-compact={surface === 'dashboard'}
        data-active={activeDrop}
        data-drop-id={rowId}
        data-drag-overlay-id={rowId}
        data-over-position={insertPosition ?? undefined}
        onClick={handleFolderHeaderClick}
        ref={sortable.setActivatorNodeRef}
      >
        <div className="tm-group-header-leading">
          <div className="tm-tab-handle tm-group-drag-handle" title={labels.drag}>
            <button
              aria-label={labels.drag}
              className="tm-group-drag-button"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={blockDrag}
              type="button"
              {...sortable.attributes}
              {...sortable.listeners}
            >
              <RiDragMove2Line size={14} />
            </button>
          </div>
          <button className="tm-group-toggle" onClick={() => onSetExpanded(!expanded)} onPointerDown={blockDrag} type="button">
            <RiArrowDownSLine className="tm-group-toggle-icon tm-bookmark-folder-arrow" data-expanded={expanded} size={16} />
          </button>
        </div>
        <span className="tm-bookmark-folder-badge tm-bookmark-folder-badge-group">
          <RiFolderLine size={14} />
        </span>
        <div className="tm-group-title">
          <span className="tm-group-title-label">{getBookmarkPrimaryLabel(node)}</span>
          <span className="tm-group-count">{countBookmarksOnly(node)}</span>
        </div>
        <div className="tm-group-actions" data-tab-action-root="true">
          <Tooltip content={labels.newFolder}>
            <IconButton icon={RiFolderAddLine} label={labels.newFolder} nativeTitle={false} onClick={onAddFolder} />
          </Tooltip>
          <Tooltip content={labels.addCurrentTab}>
            <IconButton icon={RiStarLine} label={labels.addCurrentTab} nativeTitle={false} onClick={onAddBookmark} />
          </Tooltip>
          <button
            ref={refs.setReference}
            aria-label={labels.more}
            className="tm-icon-button tm-group-edit-trigger"
            data-open={menuOpen}
            type="button"
            {...getReferenceProps({
              onPointerDown: blockDrag
            })}
          >
            <RiMore2Line size={14} />
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {menuOpen ? (
          <FloatingPortal>
            <motion.div
              ref={refs.setFloating}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="tm-row-menu"
              data-side={placement.split('-')[0]}
              data-tab-action-root="true"
              exit={{ opacity: 0, y: 4, scale: 0.98 }}
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              style={floatingStyles}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              {...getFloatingProps()}
            >
              <button className="tm-row-menu-button" onClick={onAddBookmark} onPointerDown={blockDrag} type="button">
                <RiStarLine size={13} />
                <span>{labels.addCurrentTab}</span>
              </button>
              <button className="tm-row-menu-button" onClick={onAddFolder} onPointerDown={blockDrag} type="button">
                <RiFolderAddLine size={13} />
                <span>{labels.newFolder}</span>
              </button>
              <button className="tm-row-menu-button" onClick={onEdit} onPointerDown={blockDrag} type="button">
                <RiEdit2Line size={13} />
                <span>{labels.rename}</span>
              </button>
              {node.unmodifiable ? null : (
                <button className="tm-row-menu-button tm-row-menu-button-danger" onClick={onDelete} onPointerDown={blockDrag} type="button">
                  <RiDeleteBinLine size={13} />
                  <span>{labels.deleteLabel}</span>
                </button>
              )}
              <FloatingArrow ref={arrowRef} className="tm-row-menu-arrow" context={context} />
            </motion.div>
          </FloatingPortal>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {expanded && node.children.length > 0 ? (
          <motion.div
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0, y: -6 }}
            initial={{ height: 0, opacity: 0, y: -10 }}
            transition={{
              height: {
                type: 'spring',
                stiffness: 360,
                damping: 30,
                mass: 0.82
              },
              opacity: { duration: 0.16, ease: 'easeOut' },
              y: {
                type: 'spring',
                stiffness: 420,
                damping: 32,
                mass: 0.72
              }
            }}
          >
            <div
              className={`tm-section-children tm-section-children-group tm-bookmark-children${surface === 'dashboard' ? ' tm-bookmark-children-dashboard' : ''}`}
            >
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function BookmarksTree({
  activeMenuId,
  activeDragNodeId,
  expandedIds,
  labels,
  locale,
  nodes,
  onAddBookmark,
  onAddFolder,
  onDeleteNode,
  onEditNode,
  onOpenNode,
  onOpenNodeNewTab,
  onSetExpanded,
  onSetMenuId,
  overDropId,
  overDropPosition,
  surface = 'default'
}: {
  activeMenuId: string | null;
  activeDragNodeId: string | null;
  expandedIds: Set<string>;
  labels: ReturnType<typeof getBookmarkLabels>;
  locale: string;
  nodes: BookmarkNodeSnapshot[];
  onAddBookmark: (folderId: string) => void;
  onAddFolder: (folderId: string) => void;
  onDeleteNode: (node: BookmarkNodeSnapshot) => void;
  onEditNode: (node: BookmarkNodeSnapshot) => void;
  onOpenNode: (node: BookmarkNodeSnapshot) => void;
  onOpenNodeNewTab: (node: BookmarkNodeSnapshot) => void;
  onSetExpanded: (folderId: string, expanded: boolean) => void;
  onSetMenuId: (id: string | null) => void;
  overDropId: string | null;
  overDropPosition: BookmarkDropPosition | null;
  surface?: BookmarkSurface;
}) {
  return (
    <div className={`tm-bookmark-tree${surface === 'dashboard' ? ' tm-bookmark-tree-dashboard' : ''}`}>
      {nodes.map((node) => {
        const expanded = expandedIds.has(node.id);
        const menuOpen = activeMenuId === node.id;
        const isFolder = node.url == null;
        const dragSortingLocked = activeDragNodeId !== null;
        const dragPreview = activeDragNodeId === node.id;

        return (
          <div key={node.id} className="tm-bookmark-node">
            {isFolder ? (
              <BookmarkFolderRow
                dragSortingLocked={dragSortingLocked}
                dragPreview={dragPreview}
                expanded={expanded}
                labels={labels}
                menuOpen={menuOpen}
                node={node}
                onAddBookmark={() => onAddBookmark(node.id)}
                onAddFolder={() => onAddFolder(node.id)}
                onDelete={() => onDeleteNode(node)}
                onEdit={() => onEditNode(node)}
                onSetExpanded={(nextExpanded) => onSetExpanded(node.id, nextExpanded)}
                onSetMoreOpen={(open) => onSetMenuId(open ? node.id : null)}
                overDropId={overDropId}
                overDropPosition={overDropPosition}
                surface={surface}
              >
                <BookmarksTree
                  activeMenuId={activeMenuId}
                  activeDragNodeId={activeDragNodeId}
                  expandedIds={expandedIds}
                  labels={labels}
                  locale={locale}
                  nodes={node.children}
                  onAddBookmark={onAddBookmark}
                  onAddFolder={onAddFolder}
                  onDeleteNode={onDeleteNode}
                  onEditNode={onEditNode}
                  onOpenNode={onOpenNode}
                  onOpenNodeNewTab={onOpenNodeNewTab}
                  onSetExpanded={onSetExpanded}
                  onSetMenuId={onSetMenuId}
                  overDropId={overDropId}
                  overDropPosition={overDropPosition}
                  surface={surface}
                />
              </BookmarkFolderRow>
            ) : (
              <BookmarkLeafRow
                dragSortingLocked={dragSortingLocked}
                dragPreview={dragPreview}
                index={nodes.findIndex((entry) => entry.id === node.id)}
                labels={labels}
                menuOpen={menuOpen}
                node={node}
                onDelete={() => onDeleteNode(node)}
                onEdit={() => onEditNode(node)}
                onOpen={() => onOpenNode(node)}
                onOpenNewTab={() => onOpenNodeNewTab(node)}
                onSetMoreOpen={(open) => onSetMenuId(open ? node.id : null)}
                overDropId={overDropId}
                overDropPosition={overDropPosition}
                surface={surface}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BookmarkRootSection({
  active,
  children,
  count,
  expanded,
  label,
  labels,
  onAddBookmark,
  onAddFolder,
  onToggleExpand,
  rootId,
  surface = 'default'
}: {
  active: boolean;
  children: ReactNode;
  count: number;
  expanded: boolean;
  label: string;
  labels: ReturnType<typeof getBookmarkLabels>;
  onAddBookmark: () => void;
  onAddFolder: () => void;
  onToggleExpand: () => void;
  rootId: string;
  surface?: BookmarkSurface;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `bookmark-root:${rootId}` });
  return (
    <section
      className={`tm-section-block tm-bookmark-root-section${surface === 'dashboard' ? ' tm-bookmark-root-section-dashboard' : ''}`}
      data-active={active || isOver}
    >
      <div
        ref={setNodeRef}
        className={`tm-group-header tm-bookmark-root-header${surface === 'dashboard' ? ' tm-bookmark-root-header-dashboard' : ''}`}
        data-compact={surface === 'dashboard'}
        data-active={active || isOver}
        data-drop-id={`bookmark-root:${rootId}`}
        onClick={(event) => {
          if (!(event.target instanceof HTMLElement)) return;
          if (event.target.closest('button, input, select, a, [data-tab-action-root="true"]')) return;
          onToggleExpand();
        }}
      >
        <div className="tm-group-header-leading">
          <button className="tm-group-toggle" onClick={onToggleExpand} onPointerDown={blockDrag} type="button">
            <RiArrowDownSLine className="tm-group-toggle-icon tm-bookmark-folder-arrow" data-expanded={expanded} size={16} />
          </button>
        </div>
        <span className="tm-bookmark-root-pill">
          <RiFolderLine size={13} />
        </span>
        <div className="tm-group-title">
          <span className="tm-group-title-label">{label}</span>
          <span className="tm-group-count">{count}</span>
        </div>
        <div className="tm-group-actions" data-tab-action-root="true">
          <Tooltip content={labels.newFolder}>
            <IconButton
              icon={RiFolderAddLine}
              label={labels.newFolder}
              nativeTitle={false}
              onClick={onAddFolder}
            />
          </Tooltip>
          <Tooltip content={labels.addCurrentTab}>
            <IconButton
              icon={RiStarLine}
              label={labels.addCurrentTab}
              nativeTitle={false}
              onClick={onAddBookmark}
            />
          </Tooltip>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0, y: -6 }}
            initial={{ height: 0, opacity: 0, y: -10 }}
            transition={{
              height: {
                type: 'spring',
                stiffness: 360,
                damping: 30,
                mass: 0.82
              },
              opacity: { duration: 0.16, ease: 'easeOut' },
              y: {
                type: 'spring',
                stiffness: 420,
                damping: 32,
                mass: 0.72
              }
            }}
          >
            <div
              className={`tm-section-children tm-section-children-root tm-bookmark-root-body${surface === 'dashboard' ? ' tm-bookmark-root-body-dashboard' : ''}`}
            >
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export function BookmarksManagerView({
  bookmarks,
  isSidepanel,
  locale,
  query,
  refreshBookmarks,
  scrollRef,
  surface = 'default'
}: BookmarksManagerViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(ROOT_ORDER));
  const [expandedRootIds, setExpandedRootIds] = useState<Set<string>>(new Set(ROOT_ORDER));
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [activeDragNodeId, setActiveDragNodeId] = useState<string | null>(null);
  const [dragOverlayState, setDragOverlayState] = useState(EMPTY_DRAG_OVERLAY_STATE);
  const [dialogState, setDialogState] = useState<BookmarkDialogState | null>(null);
  const [overDropId, setOverDropId] = useState<string | null>(null);
  const [overDropPosition, setOverDropPosition] = useState<BookmarkDropPosition | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const dragPointerYRef = useRef<number | null>(null);
  const treeListRef = useRef<HTMLDivElement | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const labels = useMemo(() => getBookmarkLabels(locale), [locale]);
  const filtered = useMemo(() => filterBookmarkNodes(bookmarks, normalizedQuery), [bookmarks, normalizedQuery]);
  const orderedRoots = useMemo(() => {
    const priority = new Map(ROOT_ORDER.map((id, index) => [id, index]));
    return [...filtered.nodes].sort(
      (left, right) => {
        const typeOrder = (priority.get(left.id) ?? 99) - (priority.get(right.id) ?? 99);
        if (typeOrder !== 0) return typeOrder;
        if (left.syncing !== right.syncing) return left.syncing ? -1 : 1;
        return left.id.localeCompare(right.id);
      }
    );
  }, [filtered.nodes]);
  useEffect(() => {
    if (!normalizedQuery) return;

    setExpandedIds((current) => {
      const next = new Set(current);
      const nextRoots = new Set(expandedRootIds);
      const visit = (nodes: BookmarkNodeSnapshot[]) => {
        for (const node of nodes) {
          if (node.children.length > 0) {
            next.add(node.id);
            visit(node.children);
          }
        }
      };
      orderedRoots.forEach((root) => nextRoots.add(root.id));
      visit(orderedRoots);
      setExpandedRootIds(nextRoots);
      return next;
    });
  }, [expandedRootIds, normalizedQuery, orderedRoots]);

  const rootItemIds = useMemo(
    () => orderedRoots.flatMap((root) => collectNodeIds(root.children)),
    [orderedRoots]
  );

  const execute = async (message: string, task: () => Promise<void>) => {
    try {
      setStatus(message);
      await task();
      setStatus(null);
    } catch (error) {
      setStatus(getErrorMessage(error));
    }
  };

  const openNode = (node: BookmarkNodeSnapshot, active = true) => {
    if (!node.url) return;
    void chrome.tabs.create({ url: node.url, active });
  };

  const handleEdit = (node: BookmarkNodeSnapshot) => {
    setDialogState({
      kind: 'edit',
      node,
      title: node.title || getBookmarkPrimaryLabel(node),
      url: node.url ?? ''
    });
  };

  const handleDelete = (node: BookmarkNodeSnapshot) => {
    void execute(labels.deleting, async () => {
      await deleteBookmark(node.id);
      await refreshBookmarks();
    });
  };

  const handleAddFolder = (parentId: string) => {
    setDialogState({
      kind: 'new-folder',
      parentId,
      title: ''
    });
  };

  const handleAddBookmark = (parentId: string) => {
    void execute(labels.savingCurrentTab, async () => {
      await createBookmarkFromActiveTab(parentId);
      setExpandedIds((current) => new Set(current).add(parentId));
      await refreshBookmarks();
    });
  };

  const handleDialogSubmit = () => {
    if (!dialogState) return;

    const trimmedTitle = dialogState.title.trim();
    if (!trimmedTitle) return;

    if (dialogState.kind === 'new-folder') {
      void execute(labels.creatingFolder, async () => {
        await createBookmarkFolder(dialogState.parentId, trimmedTitle);
        setExpandedIds((current) => new Set(current).add(dialogState.parentId));
        setDialogState(null);
        await refreshBookmarks();
      });
      return;
    }

    if (dialogState.node.url) {
      const trimmedUrl = dialogState.url.trim();
      if (!trimmedUrl) return;

      void execute(labels.updatingBookmark, async () => {
        await updateBookmark(dialogState.node.id, {
          title: trimmedTitle,
          url: trimmedUrl
        });
        setDialogState(null);
        await refreshBookmarks();
      });
      return;
    }

    void execute(labels.updatingFolder, async () => {
      await updateBookmark(dialogState.node.id, { title: trimmedTitle });
      setDialogState(null);
      await refreshBookmarks();
    });
  };

  const resolveDragDropPosition = (
    active: ParsedBookmarkDropId,
    over: ParsedBookmarkDropId,
    overId: string | null,
    overRect: { top: number; height: number } | null | undefined,
    fallbackRect: { top: number; height: number } | null | undefined
  ): BookmarkDropPosition | null => {
    if (!active || !over || !overId) return null;

    if (
      active.kind === 'node' &&
      over.kind === 'node' &&
      active.id !== over.id
    ) {
      const targetMeta = orderedRoots
        .flatMap((root) => flattenTree(root.children, root.id, 0, root.id))
        .find((meta) => meta.node.id === over.id);
      if (targetMeta?.node.url == null) {
        const liveRect = getLiveDropRect(overId) ?? overRect;
        if (!liveRect) return 'inside';
        const referenceY =
          dragPointerYRef.current ??
          (fallbackRect
            ? fallbackRect.top + fallbackRect.height / 2
            : liveRect.top + liveRect.height / 2);
        const topThreshold = liveRect.top + liveRect.height * 0.26;
        const bottomThreshold = liveRect.top + liveRect.height * 0.74;
        if (referenceY <= topThreshold) return 'before';
        if (referenceY >= bottomThreshold) return 'after';
        return 'inside';
      }

      return resolveVerticalDropPosition(
        getLiveDropRect(overId) ?? overRect,
        dragPointerYRef.current,
        fallbackRect
      );
    }

    if (active.kind === 'node' && over.kind === 'root') {
      const liveRect = getLiveDropRect(overId) ?? overRect;
      if (!liveRect) return 'inside';
      const referenceY =
        dragPointerYRef.current ??
        (fallbackRect
          ? fallbackRect.top + fallbackRect.height / 2
          : liveRect.top + liveRect.height / 2);
      const topThreshold = liveRect.top + liveRect.height * 0.38;
      const bottomThreshold = liveRect.top + liveRect.height * 0.62;
      if (referenceY <= topThreshold) return 'before';
      if (referenceY >= bottomThreshold) return 'after';
      return 'inside';
    }

    return 'inside';
  };

  const updateDragTarget = (event: DragMoveEvent | DragOverEvent | DragEndEvent) => {
    const active = parseDropId(event.active.id as string);
    const overId = typeof event.over?.id === 'string' ? event.over.id : null;
    const over = parseDropId(overId ?? undefined);

    if (!active || !overId || !over) {
      setOverDropId(null);
      setOverDropPosition(null);
      return;
    }

    if (active.kind === 'node' && over.kind === 'node' && active.id === over.id) {
      setOverDropId(null);
      setOverDropPosition(null);
      return;
    }

    const position =
      resolveDragDropPosition(
        active,
        over,
        overId,
        event.over?.rect,
        event.active.rect.current.translated
      ) ?? 'inside';

    setOverDropId(overId);
    setOverDropPosition(position);
  };

  const handleDragStart = (event: DragStartEvent) => {
    dragPointerYRef.current = extractClientY(event.activatorEvent);
    setActiveMenuId(null);
    const active = parseDropId(event.active.id as string);
    const activeId = typeof event.active.id === 'string' ? event.active.id : null;
    const escapedActiveId = activeId
      ? globalThis.CSS?.escape?.(activeId) ?? activeId.replace(/["\\]/g, '\\$&')
      : null;
    const activeElement = escapedActiveId
      ? document.querySelector<HTMLElement>(`[data-drag-overlay-id="${escapedActiveId}"]`)
      : null;
    const listRect = treeListRef.current?.getBoundingClientRect();
    const activeRect = activeElement?.getBoundingClientRect();

    setDragOverlayState(
      activeId && listRect && activeRect
        ? {
            activeId,
            height: activeRect.height,
            left: listRect.left,
            maxTop: Math.max(listRect.bottom - activeRect.height, listRect.top),
            minTop: listRect.top,
            originTop: activeRect.top,
            top: activeRect.top,
            width: listRect.width
          }
        : EMPTY_DRAG_OVERLAY_STATE
    );
    setActiveDragNodeId(active?.kind === 'node' ? active.id : null);
  };

  const handleDragMove = (event: DragMoveEvent) => {
    setDragOverlayState((current) =>
      current.activeId
        ? {
            ...current,
            top: clamp(current.originTop + event.delta.y, current.minTop, current.maxTop)
          }
        : current
    );
    updateDragTarget(event);
  };

  const handleDragOver = (event: DragOverEvent) => {
    updateDragTarget(event);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    dragPointerYRef.current = null;
    setActiveDragNodeId(null);
    setDragOverlayState(EMPTY_DRAG_OVERLAY_STATE);
    updateDragTarget(event);
    const activeId = typeof event.active.id === 'string' ? event.active.id : null;
    const overId = typeof event.over?.id === 'string' ? event.over.id : null;
    const position = overDropPosition;
    setOverDropId(null);
    setOverDropPosition(null);
    if (!activeId || !overId || !position) return;

    const active = parseDropId(activeId);
    const over = parseDropId(overId);
    if (!active || !over) return;
    if (active.kind !== 'node') return;

    const target = getBookmarkMoveTarget(orderedRoots, active.id, over, position);
    if (!target) return;

    void execute(labels.move, async () => {
      await moveBookmark(active.id, target.parentId, target.index);
      if (position === 'inside') {
        setExpandedIds((current) => new Set(current).add(target.parentId));
      }
      await refreshBookmarks();
    });
  };

  return (
    <section
      className={`${surface === 'dashboard' ? 'tm-tree-shell' : 'tm-panel tm-tree-shell'} tm-bookmark-manager${surface === 'dashboard' ? ' tm-bookmark-manager-dashboard' : ''}`}
      ref={isSidepanel ? scrollRef : undefined}
    >
      <DndContext
        collisionDetection={collisionDetectionStrategy}
        onDragCancel={() => {
          dragPointerYRef.current = null;
          setActiveDragNodeId(null);
          setDragOverlayState(EMPTY_DRAG_OVERLAY_STATE);
          setOverDropId(null);
          setOverDropPosition(null);
        }}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <SortableContext items={rootItemIds} strategy={verticalListSortingStrategy}>
          <div
            className={`tm-tree-list${isSidepanel ? ' tm-tree-list-sidepanel' : ' tm-scrollbar'}${surface === 'dashboard' ? ' tm-bookmark-tree-list-dashboard' : ''}`}
            ref={treeListRef}
          >
            {status ? <div className="tm-bookmark-status">{status}</div> : null}

            {orderedRoots.length === 0 ? (
              <div className="tm-empty">
                <RiBookmarkLine size={16} />
                <div>
                  <div className="font-medium">
                    {labels.empty}
                  </div>
                  <div className="tm-subtle">
                    {labels.emptyHint}
                  </div>
                </div>
              </div>
            ) : (
              orderedRoots.map((root) => (
                (() => {
                  const display = getRootDisplay(root, labels);
                  return (
                    <BookmarkRootSection
                      key={root.id}
                      active={overDropId === `bookmark-root:${root.id}`}
                      count={countBookmarksOnly(root)}
                      expanded={expandedRootIds.has(root.id)}
                      label={display.title}
                      labels={labels}
                      onAddBookmark={() => handleAddBookmark(root.id)}
                      onAddFolder={() => handleAddFolder(root.id)}
                      onToggleExpand={() =>
                        setExpandedRootIds((current) => {
                          const next = new Set(current);
                          if (next.has(root.id)) next.delete(root.id);
                          else next.add(root.id);
                          return next;
                        })
                      }
                      rootId={root.id}
                      surface={surface}
                    >
                      <BookmarksTree
                        activeMenuId={activeMenuId}
                        activeDragNodeId={activeDragNodeId}
                        expandedIds={expandedIds}
                        labels={labels}
                        locale={locale}
                        nodes={root.children}
                        onAddBookmark={handleAddBookmark}
                        onAddFolder={handleAddFolder}
                        onDeleteNode={handleDelete}
                        onEditNode={handleEdit}
                        onOpenNode={(node) => openNode(node, true)}
                        onOpenNodeNewTab={(node) => openNode(node, false)}
                        onSetExpanded={(folderId, expanded) =>
                          setExpandedIds((current) => {
                            const next = new Set(current);
                            if (expanded) {
                              next.add(folderId);
                            } else {
                              next.delete(folderId);
                            }
                            return next;
                          })
                        }
                        onSetMenuId={setActiveMenuId}
                        overDropId={overDropId}
                        overDropPosition={overDropPosition}
                        surface={surface}
                      />
                    </BookmarkRootSection>
                  );
                })()
              ))
            )}
          </div>
        </SortableContext>

        {surface !== 'dashboard' && !isSidepanel ? (
          <div className="tm-bookmark-floating-refresh">
            <Tooltip content={labels.refresh}>
              <IconButton
                icon={RiRefreshLine}
                label={labels.refresh}
                nativeTitle={false}
                onClick={() => void refreshBookmarks()}
              />
            </Tooltip>
          </div>
        ) : null}

        {createPortal(
          <>
            {dragOverlayState.activeId ? (
              <div
                className="tm-dashboard-automation-overlay-frame"
                style={{
                  height: dragOverlayState.height,
                  left: dragOverlayState.left,
                  position: 'fixed',
                  top: dragOverlayState.top,
                  width: dragOverlayState.width,
                  zIndex: 2400
                }}
              />
            ) : null}

            <AnimatePresence initial={false}>
              {dialogState ? (
                <div className="tm-bookmark-dialog-backdrop" onClick={() => setDialogState(null)}>
                  <motion.div
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="tm-group-edit-menu tm-bookmark-dialog"
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    initial={{ opacity: 0, y: 12, scale: 0.96 }}
                    onClick={(event) => event.stopPropagation()}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                  >
                    <div className="tm-group-edit-section">
                      <div className="tm-bookmark-dialog-title">
                        {dialogState.kind === 'new-folder'
                          ? labels.newFolder
                          : dialogState.node.url
                            ? labels.editBookmark
                            : labels.renameFolder}
                      </div>

                      <label className="tm-bookmark-dialog-field">
                        <span>{labels.name}</span>
                        <input
                          className="tm-group-edit-input"
                          onChange={(event) =>
                            setDialogState((current) =>
                              current ? { ...current, title: event.target.value } : current
                            )
                          }
                          value={dialogState.title}
                        />
                      </label>
                      {dialogState.kind === 'edit' && dialogState.node.url ? (
                        <label className="tm-bookmark-dialog-field">
                          <span>{labels.url}</span>
                          <input
                            className="tm-group-edit-input"
                            onChange={(event) =>
                              setDialogState((current) =>
                                current ? { ...current, url: event.target.value } : current
                              )
                            }
                            value={dialogState.url}
                          />
                        </label>
                      ) : null}
                    </div>

                    <div className="tm-group-edit-actions tm-bookmark-dialog-actions">
                      <button className="tm-button" onClick={() => setDialogState(null)} type="button">
                        {labels.cancel}
                      </button>
                      <button className="tm-button-primary" onClick={handleDialogSubmit} type="button">
                        {labels.save}
                      </button>
                    </div>
                  </motion.div>
                </div>
              ) : null}
            </AnimatePresence>
          </>,
          document.body
        )}
      </DndContext>
    </section>
  );
}
