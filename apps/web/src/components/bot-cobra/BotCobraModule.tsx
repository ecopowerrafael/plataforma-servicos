import { useLocation } from 'react-router-dom';
import { BotCobraOverviewSection } from './sections/BotCobraOverviewSection.js';
import { BotCobraDebtsSection } from './sections/BotCobraDebtsSection.js';
import { BotCobraNewDebtSection } from './sections/BotCobraNewDebtSection.js';
import { BotCobraCampaignsSection } from './sections/BotCobraCampaignsSection.js';
import { BotCobraPromisesSection } from './sections/BotCobraPromisesSection.js';
import { BotCobraHumanSupportSection } from './sections/BotCobraHumanSupportSection.js';
import { BotCobraSettingsSection } from './sections/BotCobraSettingsSection.js';

export function BotCobraModule({ tenantPublicId }: { tenantPublicId: string }) {
  const location = useLocation();
  const section = location.pathname.split('/')[3] || undefined;

  if (section === 'cobrancas') {
    return <BotCobraDebtsSection tenantPublicId={tenantPublicId} />;
  }
  if (section === 'nova') {
    return <BotCobraNewDebtSection tenantPublicId={tenantPublicId} />;
  }
  if (section === 'campanhas') {
    return <BotCobraCampaignsSection tenantPublicId={tenantPublicId} />;
  }
  if (section === 'promessas') {
    return <BotCobraPromisesSection tenantPublicId={tenantPublicId} />;
  }
  if (section === 'atendimento') {
    return <BotCobraHumanSupportSection tenantPublicId={tenantPublicId} />;
  }
  if (section === 'configuracoes') {
    return <BotCobraSettingsSection tenantPublicId={tenantPublicId} />;
  }

  return <BotCobraOverviewSection tenantPublicId={tenantPublicId} />;
}
