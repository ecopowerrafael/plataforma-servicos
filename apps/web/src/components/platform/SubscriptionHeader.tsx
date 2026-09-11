import { IconExternalLink } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { StatusBadge } from './PlatformUi.js';

export function SubscriptionHeader({ tenantName, tenantPublicId, planName, status }: { tenantName: string; tenantPublicId: string; planName: string; status: string }) {
  return <header className="platform-detail-heading platform-subscription-header">
    <div><h3>{tenantName}</h3><span>{planName}</span></div>
    <div className="platform-subscription-header__actions"><StatusBadge value={status} /><Link to={`/platform/tenants/${tenantPublicId}`} title="Abrir painel do estabelecimento"><IconExternalLink size={17} aria-hidden="true" /> Painel</Link></div>
  </header>;
}
