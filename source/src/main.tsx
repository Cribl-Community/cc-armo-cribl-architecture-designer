import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@capra/theme/base.css';
import '@capra/core/styles.css';
import '@capra/icons/styles.css';
import '@xyflow/react/dist/style.css';
import './styles/app.css';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { HostThemeProvider } from './platform/hostTheme';
import { DesignStoreProvider } from './state/DesignStore';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={window.CRIBL_BASE_PATH || '/'}>
      <HostThemeProvider>
        <DesignStoreProvider>
          <App />
        </DesignStoreProvider>
      </HostThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
