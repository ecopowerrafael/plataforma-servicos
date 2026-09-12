import { IconExternalLink } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from './PlatformUi.js';

export function SubscriptionHeader({ tenantName, tenantPublicId, planName, status, actions }: { tenantName: string; tenantPublicId: string; planName: string; status: string; actions?: ReactNode }) {
  return <header className="platform-detail-heading platform-subscription-header">
    <div><h3>{tenantName}</h3><span>{planName}</span><small className="platform-subscription-header__id">ID: {tenantPublicId}</small></div>
    <div className="platform-subscription-header__actions"><StatusBadge value={status} /><Link to={`/platform/tenants/${tenantPublicId}`} title="Abrir painel do estabelecimento"><IconExternalLink size={17} aria-hidden="true" /> Painel</Link>{actions}</div>
  </header>;
}
