import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from './AppProviders.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import './styles.css';
import './app-design-system.css';
import './public-premium.css';
import './public-premium-booking.css';
import './onboarding.css';
import './brand-studio.css';
import './customer-account.css';
import './my-agenda.css';
import './agenda-overview.css';
import './appointments-console.css';
import './customers-crm.css';
import './customer-recovery.css';
import './finance-overview.css';
import './financial-operations.css';

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
