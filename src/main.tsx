import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { FeedbackProvider } from './components/Feedback';
import { requestPersistence } from './db';
import { installAudioUnlock } from './lib/audio';
import { applyTheme } from './lib/settings';
import { initSync } from './lib/sync';
import './index.css';

applyTheme();
installAudioUnlock();
void requestPersistence();
initSync();
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FeedbackProvider>
      <App />
    </FeedbackProvider>
  </StrictMode>,
);
