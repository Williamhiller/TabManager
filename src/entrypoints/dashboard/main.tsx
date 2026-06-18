import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import '../../assets/base.css';
import '../../assets/shortcuts.css';
import { DashboardPage } from '../../components/DashboardPage';
import { KeyboardShortcutsProvider } from '../../components/keyboard-shortcuts/KeyboardShortcutsProvider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KeyboardShortcutsProvider>
      <DashboardPage />
    </KeyboardShortcutsProvider>
  </StrictMode>
);
