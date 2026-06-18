import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import '../../assets/base.css';
import '../../assets/shortcuts.css';
import { DashboardPage } from '../../components/DashboardPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DashboardPage />
  </StrictMode>
);
