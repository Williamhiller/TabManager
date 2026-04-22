import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import '../../assets/base.css';
import { OverviewPage } from '../../components/OverviewPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OverviewPage mode="dashboard" />
  </StrictMode>
);
