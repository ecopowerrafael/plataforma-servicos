import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from './AppProviders.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import './styles/design-system.css';
import './styles/app-shell.css';
import './styles/header-sidebar.css';
import './styles/components.css';
import './styles/modules.css';
import './styles/dashboard.css';
import './styles/agenda.css';
import './styles/customers.css';
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
import './treatment-plans.css';
import './finance-overview.css';
import './financial-operations.css';
import './prospecting.css';
import './components/platform/prospecting-flows.css';
import './components/platform/prospecting-objections.css';
import './platform-premium.css';

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
