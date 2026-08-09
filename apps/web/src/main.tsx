import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from './AppProviders.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import './styles.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Elemento raiz da aplicação não encontrado.');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProviders />
    </ErrorBoundary>
  </StrictMode>,
);
