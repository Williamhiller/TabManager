import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';

import '../../assets/base.css';
import { OptionsPage } from '../../components/OptionsPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OptionsPage />
  </StrictMode>
);
