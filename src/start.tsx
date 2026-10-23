import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { I18nProvider } from './i18n';
import { sealSeed } from './state/app';
import { registerServiceWorker } from './shared/sw';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

// replaces the pre-rendered page, if any, on its first commit
createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);

void sealSeed();
registerServiceWorker();
