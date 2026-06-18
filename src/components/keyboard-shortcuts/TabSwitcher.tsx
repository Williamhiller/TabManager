import { useEffect, useRef, useState } from 'react';

interface TabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl: string;
  active: boolean;
  pinned: boolean;
  index: number;
}

interface TabSwitcherProps {
  open: boolean;
  onClose: () => void;
}

function displayUrl(url: string): string {
  try { const u = new URL(url); return u.hostname + u.pathname.slice(0, 40); } catch { return url.slice(0, 60); }
}

function TabIcon({ favIconUrl, title }: { favIconUrl: string; title: string }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!favIconUrl) { setLoaded(false); return; }
    const img = new Image();
    img.onload = () => setLoaded(true);
    img.src = favIconUrl;
  }, [favIconUrl]);

  if (favIconUrl && loaded) return <img className="tm-tab-switcher-img-fade" alt="" src={favIconUrl} />;
  return <span className="tm-tab-switcher-letter">{(title || '?').charAt(0).toUpperCase()}</span>;
}

export function TabSwitcher({ open, onClose }: TabSwitcherProps) {
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [filtered, setFiltered] = useState<TabInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    chrome.runtime.sendMessage({ type: 'tab-manager/get-tabs' }).then((response: any) => {
      if (!response?.ok) return;
      const allTabs: TabInfo[] = response.data || [];
      setTabs(allTabs);
      const activeIdx = allTabs.findIndex((t) => t.active);
      setSelectedIndex(activeIdx >= 0 ? activeIdx : 0);
    }).catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    const q = query.toLowerCase().trim();
    const result = q
      ? tabs.filter((t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q))
      : [...tabs];
    setFiltered(result);
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, result.length - 1)));
  }, [query, tabs]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current.children[selectedIndex] as HTMLElement;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const cols = scrollRef.current ? Math.floor((scrollRef.current.clientWidth - 22) / 42) || 1 : 1;
        setSelectedIndex((i) => Math.min(i + cols, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const cols = scrollRef.current ? Math.floor((scrollRef.current.clientWidth - 22) / 42) || 1 : 1;
        setSelectedIndex((i) => Math.max(i - cols, 0));
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); if (filtered[selectedIndex]) focusTab(filtered[selectedIndex]); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); if (filtered[selectedIndex]) closeTab(filtered[selectedIndex]); }
    };
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [open, filtered, selectedIndex, onClose]);

  function focusTab(tab: TabInfo) {
    chrome.runtime.sendMessage({ type: 'tab-manager/focus-tab', tabId: tab.id }).catch(() => {});
    onClose();
  }

  function closeTab(tab: TabInfo) {
    chrome.runtime.sendMessage({ type: 'tab-manager/close-tabs', tabIds: [tab.id] }).catch(() => {});
    setTabs((prev) => prev.filter((t) => t.id !== tab.id));
  }

  if (!open) return null;

  const selected = filtered[selectedIndex];

  return (
    <div className="tm-tab-switcher-overlay" onClick={onClose}>
      <div className="tm-tab-switcher" onClick={(e) => e.stopPropagation()}>
        <div className="tm-tab-switcher-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            ref={inputRef}
            placeholder="Search tabs..."
            onChange={(e) => setQuery(e.target.value)}
            type="text"
            value={query}
          />
        </div>
        <div className="tm-tab-switcher-scroll" ref={scrollRef}>
          {filtered.length === 0 && <div className="tm-tab-switcher-empty">No tabs found</div>}
          {filtered.map((tab, i) => (
            <button
              key={tab.id}
              className={`tm-tab-switcher-item${i === selectedIndex ? ' tm-tab-switcher-item-active' : ''}`}
              onClick={() => setSelectedIndex(i)}
              onDoubleClick={() => focusTab(tab)}
              type="button"
            >
              <TabIcon favIconUrl={tab.favIconUrl} title={tab.title} />
            </button>
          ))}
        </div>
        <div className="tm-tab-switcher-detail">
          {selected ? (
            <>
              <div className="tm-tab-switcher-title-row">
                <span className="tm-tab-switcher-title">{selected.title || 'Untitled'}</span>
                {(selected.pinned || selected.active) && (
                  <span className="tm-tab-switcher-badges">
                    {selected.pinned && <span className="tm-tab-switcher-badge">Pinned</span>}
                    {selected.active && <span className="tm-tab-switcher-badge">Active</span>}
                  </span>
                )}
              </div>
              <div className="tm-tab-switcher-url">{displayUrl(selected.url)}</div>
            </>
          ) : (
            <div className="tm-tab-switcher-empty-detail">No tab selected</div>
          )}
        </div>
        <div className="tm-tab-switcher-footer">
          <span><kbd>&#8592;</kbd><kbd>&#8594;</kbd><kbd>&#8593;</kbd><kbd>&#8595;</kbd> switch</span>
          <span><kbd>&#9166;</kbd> go to tab</span>
          <span><kbd>del</kbd> close tab</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
