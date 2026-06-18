import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import '../../assets/base.css';
import '../../assets/shortcuts.css';
import { KeyboardShortcutsProvider } from '../../components/keyboard-shortcuts/KeyboardShortcutsProvider';
import { OverviewPage } from '../../components/OverviewPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KeyboardShortcutsProvider>
      <OverviewPage mode="sidepanel" />
    </KeyboardShortcutsProvider>
  </StrictMode>
);
