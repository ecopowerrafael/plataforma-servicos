import { IconCalendarEvent, IconChevronLeft, IconHeart, IconHome, IconUser } from '@tabler/icons-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { accountPath, type AccountSection } from './customer-account.js';
import { environment } from '../../../config/environment.js';

const navigation = [
  { id: 'home', label: 'Início', icon: IconHome },
  { id: 'appointments', label: 'Agendamentos', icon: IconCalendarEvent },
  { id: 'favorites', label: 'Favoritos', icon: IconHeart },
  { id: 'profile', label: 'Perfil', icon: IconUser },
] satisfies { id: AccountSection; label: string; icon: typeof IconHome }[];

export function CustomerAccountLayout({
  slug,
  displayName,
  logoUrl,
  section,
  customer,
  children,
}: {
  slug: string;
  displayName: string;
  logoUrl: string | null;
  section: AccountSection;
  customer: { name: string; photoUrl: string | null; photoUpdatedAt: string | null } | null;
  children: ReactNode;
}) {
  const backPath = section === 'home' ? `/public/${slug}` : accountPath(slug, 'home');

  return (
    <div className="customer-account">
      <header className="customer-app-header">
        <Link aria-label={section === 'home' ? 'Voltar ao estabelecimento' : 'Voltar ao início'} className="client-icon-button" to={backPath}>
          <IconChevronLeft aria-hidden="true" size={24} />
        </Link>
        <Link className="customer-app-logo" to={`/public/${slug}`} aria-label={displayName}>
          {logoUrl === null ? <strong>{displayName}</strong> : <img src={`${environment.apiUrl}${logoUrl}`} alt={displayName} />}
        </Link>
        {customer === null ? <span /> : (
          <Link aria-label="Abrir perfil" className="client-avatar client-avatar--small" to={accountPath(slug, 'profile')}>
            {customer.photoUrl === null ? customer.name.slice(0, 1) : <img alt="" src={`${environment.apiUrl}/public/sites/${slug}/customer/photo?v=${encodeURIComponent(customer.photoUpdatedAt ?? '')}`} />}
          </Link>
        )}
      </header>

      <main className={`customer-account-panel${customer === null ? ' customer-account-panel--auth' : ''}`}>{children}</main>

      {customer === null ? null : (
        <nav className="customer-bottom-navigation" aria-label="Navegação principal da conta">
          {navigation.map((item) => {
            const Icon = item.icon;
            const destination = item.id === 'home' ? `/public/${slug}` : accountPath(slug, item.id);
            return (
              <Link key={item.id} to={destination} aria-current={item.id === section ? 'page' : undefined}>
                <span className="customer-bottom-navigation__icon"><Icon aria-hidden="true" size={23} stroke={1.8} /></span><span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
