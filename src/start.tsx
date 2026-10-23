import { startTransition, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { I18nProvider } from './i18n';
import { sealSeed } from './state/app';
import { registerServiceWorker } from './shared/sw';

const container = document.getElementById('root');
if (!container) throw new Error('#root missing');
const root = createRoot(container);

// The first render replaces the pre-rendered page, if any, on its commit. As a transition, React
// builds it in slices that let the browser breathe instead of one long task, while the copy (or the
// blank page) stays on screen.
startTransition(() => {
  root.render(
    <StrictMode>
      <I18nProvider>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
});

void sealSeed();
registerServiceWorker();
