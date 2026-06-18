import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { TabSwitcher } from './TabSwitcher';

interface KeyboardShortcutsProviderProps {
  children: ReactNode;
}

export function KeyboardShortcutsProvider({ children }: KeyboardShortcutsProviderProps) {
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('commandPalette') === '1') {
      setTabSwitcherOpen(true);
    }

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName === 'session' && changes['tmToggleTabSwitcher']) {
        setTabSwitcherOpen((open) => !open);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  return (
    <>
      {children}
      <TabSwitcher
        open={tabSwitcherOpen}
        onClose={() => setTabSwitcherOpen(false)}
      />
    </>
  );
}
