import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../design-system/tokens.css';
import '../design-system/global.css';
import { initI18n } from '../i18n';
import { App } from '../ui/App';

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root element');

void initI18n().then(() => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
