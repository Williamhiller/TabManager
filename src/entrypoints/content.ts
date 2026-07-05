import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ExtensionResult, RuntimeTabListItem } from '../lib/contracts';
import { eventToBinding } from '../lib/keyboard-shortcuts/shared-utils';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  main() {
    let lastFiredTime = 0;
    const DEBOUNCE_MS = 50;

    function handleKeydown(e: KeyboardEvent): void {
      if (e.repeat) return;
      const now = Date.now();
      if (now - lastFiredTime < DEBOUNCE_MS) return;
      const binding = eventToBinding(e);
      if (binding === 'Mod+Shift+k') {
        e.preventDefault();
        lastFiredTime = now;
        toggleTabSwitcher();
      }
    }

    document.addEventListener('keydown', handleKeydown, { capture: true });

    let overlayRoot: ShadowRoot | null = null;
    let hostEl: HTMLDivElement | null = null;
    let isOpen = false;
    let tabs: RuntimeTabListItem[] = [];
    let filtered: RuntimeTabListItem[] = [];
    let selectedIndex = 0;

    function esc(s: string): string {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function displayUrl(url: string): string {
      try { const u = new URL(url); return u.hostname + u.pathname.slice(0, 40); } catch { return url.slice(0, 60); }
    }

    function toggleTabSwitcher() {
      if (isOpen) closeSwitcher(); else openSwitcher();
    }

    function openSwitcher() {
      if (!hostEl) createOverlay();
      isOpen = true;
      overlayRoot!.getElementById('overlay')!.classList.add('open');
      loadTabs();
      requestAnimationFrame(() => overlayRoot!.getElementById('search')!.focus());
    }

    function closeSwitcher() {
      isOpen = false;
      overlayRoot?.getElementById('overlay')?.classList.remove('open');
    }

    function loadTabs() {
      chrome.runtime.sendMessage({ type: 'tab-manager/get-tabs' }).then((response: ExtensionResult<RuntimeTabListItem[]> | undefined) => {
        if (!response?.ok) return;
        tabs = response.data;
        selectedIndex = tabs.findIndex((t) => t.active);
        if (selectedIndex === -1) selectedIndex = 0;
        renderTabs();
      }).catch(() => { tabs = []; renderTabs(); });
    }

    function renderTabs() {
      const searchEl = overlayRoot?.getElementById('search') as HTMLInputElement | null;
      const tabsScrollEl = overlayRoot?.getElementById('tabs-scroll');
      if (!searchEl || !tabsScrollEl) return;

      const q = searchEl.value.toLowerCase().trim();
      filtered = q ? tabs.filter((t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)) : [...tabs];

      if (filtered.length === 0) {
        tabsScrollEl.innerHTML = '<div class="empty">No tabs found</div>';
        renderDetail();
        return;
      }

      selectedIndex = Math.min(selectedIndex, filtered.length - 1);

      let html = '';
      for (let i = 0; i < filtered.length; i++) {
        const tab = filtered[i];
        const cls = i === selectedIndex ? ' active' : '';
        const letter = esc((tab.title || '?').charAt(0).toUpperCase());
        html += `<div class="tab-item${cls}" data-idx="${i}"><div class="tab-letter">${letter}</div></div>`;
      }
      tabsScrollEl.innerHTML = html;

      for (let i = 0; i < filtered.length; i++) {
        const tab = filtered[i];
        if (tab.favIconUrl) {
          const el = tabsScrollEl.children[i] as HTMLElement;
          if (el) loadFavicon(tab.favIconUrl, el);
        }
      }

      tabsScrollEl.querySelectorAll('.tab-item').forEach((el) => {
        el.addEventListener('click', () => {
          const idx = parseInt((el as HTMLElement).dataset.idx || '0');
          if (idx !== selectedIndex) {
            selectedIndex = idx;
            updateSelection();
          }
        });
        el.addEventListener('dblclick', () => {
          const idx = parseInt((el as HTMLElement).dataset.idx || '0');
          focusTab(filtered[idx]);
        });
      });

      renderDetail();
      tabsScrollEl.querySelector('.tab-item.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    function updateSelection() {
      const tabsScrollEl = overlayRoot?.getElementById('tabs-scroll');
      if (!tabsScrollEl) return;
      const items = tabsScrollEl.querySelectorAll('.tab-item');
      items.forEach((el, i) => {
        el.classList.toggle('active', i === selectedIndex);
      });
      renderDetail();
      tabsScrollEl.querySelector('.tab-item.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    function renderDetail() {
      const detailEl = overlayRoot?.getElementById('tab-detail');
      if (!detailEl) return;
      if (filtered.length === 0) { detailEl.innerHTML = '<div class="tab-detail-empty">No tab selected</div>'; return; }
      const tab = filtered[selectedIndex];
      const badges = [];
      if (tab.pinned) badges.push('Pinned');
      if (tab.active) badges.push('Active');
      detailEl.innerHTML = `
        <div class="tab-detail-title-row">
          <span class="tab-detail-title">${esc(tab.title || 'Untitled')}</span>
          ${badges.length ? `<span class="tab-detail-badges">${badges.map((b) => `<span class="tab-detail-badge">${b}</span>`).join('')}</span>` : ''}
        </div>
        <div class="tab-detail-url">${esc(displayUrl(tab.url))}</div>
      `;
    }

    function focusTab(tab: RuntimeTabListItem) {
      chrome.runtime.sendMessage({ type: 'tab-manager/focus-tab', tabId: tab.id }).catch(() => {});
      closeSwitcher();
    }

    function closeTab(tab: RuntimeTabListItem) {
      chrome.runtime.sendMessage({ type: 'tab-manager/close-tabs', tabIds: [tab.id] }).catch(() => {});
      tabs = tabs.filter((t) => t.id !== tab.id);
      selectedIndex = Math.min(selectedIndex, tabs.length - 1);
      if (selectedIndex < 0) selectedIndex = 0;
      renderTabs();
    }

    function loadFavicon(url: string, container: HTMLElement) {
      if (container.querySelector('img')) return;
      const img = new Image();
      img.onload = () => {
        const letter = container.querySelector('.tab-letter');
        if (letter) {
          img.className = 'tab-item-img-fade';
          container.replaceChild(img, letter);
        }
      };
      img.src = url;
    }

    function createOverlay() {
      hostEl = document.createElement('div');
      hostEl.id = 'tm-tab-switcher-host';
      hostEl.style.cssText = 'all:initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; pointer-events: none !important;';
      document.documentElement.appendChild(hostEl);
      overlayRoot = hostEl.attachShadow({ mode: 'open' });
      overlayRoot.innerHTML = `
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: flex-start; justify-content: center; padding-top: 15vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; opacity: 0; transition: opacity 150ms ease; pointer-events: none; }
          .overlay.open { opacity: 1; pointer-events: auto; }
          .panel { width: 452px; max-width: calc(100vw - 40px); background: #fff; border: 1px solid #e5e5e5; border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.25); overflow: hidden; transform: translateY(-8px) scale(0.98); transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1); display: flex; flex-direction: column; }
          .overlay.open .panel { transform: translateY(0) scale(1); }
          .search-row { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #e5e5e5; }
          .search-row svg { flex-shrink: 0; color: #999; }
          .search-row input { flex: 1; border: 0; outline: 0; background: transparent; font-size: 14px; color: #1a1a1a; font-family: inherit; }
          .search-row input::placeholder { color: #aaa; }
          .tabs-scroll { display: grid; grid-template-columns: repeat(auto-fill, 36px); gap: 6px; padding: 12px 14px; max-height: 200px; overflow-y: auto; scrollbar-width: thin; border-bottom: 1px solid #e5e5e5; }
          .tabs-scroll::-webkit-scrollbar { width: 4px; }
          .tabs-scroll::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }
          .tab-item { width: 36px; height: 36px; border-radius: 8px; border: 2px solid transparent; overflow: hidden; cursor: pointer; transition: border-color 120ms, transform 120ms; background: #f5f5f5; display: flex; align-items: center; justify-content: center; }
          .tab-item:hover { border-color: #ccc; }
          .tab-item.active { border-color: #1a73e8; transform: scale(1.08); }
          .tab-item img { width: 100%; height: 100%; object-fit: contain; border-radius: 6px; }
          .tab-item-img-fade { animation: fadeIn 200ms ease; }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          .tab-letter { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 14px; color: #999; background: #f0f0f0; border-radius: 6px; }
          .tab-detail { padding: 14px; min-height: 70px; display: flex; flex-direction: column; gap: 4px; }
          .tab-detail-empty { display: flex; align-items: center; justify-content: center; height: 70px; color: #aaa; font-size: 13px; }
          .tab-detail-title-row { display: flex; align-items: center; gap: 6px; min-width: 0; }
          .tab-detail-title { font-size: 14px; font-weight: 600; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
          .tab-detail-url { font-size: 12px; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .tab-detail-badges { display: inline-flex; gap: 4px; flex-shrink: 0; }
          .tab-detail-badge { display: inline-flex; align-items: center; padding: 1px 6px; border-radius: 4px; background: #f0f0f0; font-size: 10px; color: #666; }
          .footer { padding: 8px 14px; border-top: 1px solid #e5e5e5; display: flex; align-items: center; gap: 12px; font-size: 11px; color: #aaa; }
          .footer kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 4px; border: 1px solid #ddd; border-radius: 3px; background: #fafafa; font-family: ui-monospace, monospace; font-size: 10px; color: #666; }
          .empty { padding: 32px 16px; text-align: center; font-size: 13px; color: #999; }
          @media (prefers-color-scheme: dark) {
            .panel { background: #1a1a1a; border-color: #333; }
            .search-row { border-color: #333; }
            .search-row input { color: #eee; }
            .search-row input::placeholder { color: #666; }
            .tabs-scroll { border-color: #333; }
            .tab-item { background: #2a2a2a; }
            .tab-item:hover { border-color: #555; }
            .tab-item.active { border-color: #4a9eff; }
            .tab-letter { background: #2a2a2a; color: #888; }
            .tab-detail-title { color: #eee; }
            .tab-detail-badge { background: #333; color: #aaa; }
            .tab-detail-url { color: #888; }
            .tab-detail-badge { background: #333; color: #aaa; }
            .empty { color: #666; }
            .footer { border-color: #333; color: #666; }
            .footer kbd { border-color: #444; background: #222; color: #999; }
            .overlay { background: rgba(0,0,0,0.65); }
          }
        </style>
        <div class="overlay" id="overlay">
          <div class="panel">
            <div class="search-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input type="text" id="search" placeholder="Search tabs..." autocomplete="off" spellcheck="false" />
            </div>
            <div class="tabs-scroll" id="tabs-scroll"></div>
            <div class="tab-detail" id="tab-detail"><div class="tab-detail-empty">No tab selected</div></div>
            <div class="footer">
              <span><kbd>\u2190</kbd><kbd>\u2192</kbd><kbd>\u2191</kbd><kbd>\u2193</kbd> switch</span>
              <span><kbd>\u23CE</kbd> go to tab</span>
              <span><kbd>del</kbd> close tab</span>
              <span><kbd>esc</kbd> close</span>
            </div>
          </div>
        </div>
      `;

      const overlayEl = overlayRoot.getElementById('overlay')!;
      const searchEl = overlayRoot.getElementById('search') as HTMLInputElement;

      searchEl.addEventListener('input', () => { selectedIndex = 0; renderTabs(); });
      overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) closeSwitcher(); });
    }

    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSwitcher(); return; }
      const tabsScrollEl = overlayRoot?.getElementById('tabs-scroll');
      const cols = tabsScrollEl ? Math.floor((tabsScrollEl.clientWidth - 22) / 42) || 1 : 1;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filtered.length - 1);
        updateSelection();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        updateSelection();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + cols, filtered.length - 1);
        updateSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - cols, 0);
        updateSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) focusTab(filtered[selectedIndex]);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (filtered[selectedIndex]) closeTab(filtered[selectedIndex]);
      }
    }, true);

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'tab-manager/toggle-page-palette') toggleTabSwitcher();
    });
  }
});
