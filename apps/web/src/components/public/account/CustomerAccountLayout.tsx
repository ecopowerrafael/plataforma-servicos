import {
  IconCalendar,
  IconChevronRight,
  IconChevronLeft,
  IconHeart,
  IconHome,
  IconLock,
  IconLogout,
  IconMessageStar,
  IconBell,
  IconGift,
  IconUser,
} from '@tabler/icons-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { accountPath, ACCOUNT_SECTIONS, type AccountSection } from './customer-account.js';
import { environment } from '../../../config/environment.js';

const primaryNavigation: { id: AccountSection; label: string; icon: typeof IconHome }[] = [
  { id: 'home', label: 'Início', icon: IconHome },
  { id: 'appointments', label: 'Agendamentos', icon: IconCalendar },
  { id: 'favorites', label: 'Favoritos', icon: IconHeart },
  { id: 'profile', label: 'Perfil', icon: IconUser },
];
const profileNavigation: { id: AccountSection; label: string; icon: typeof IconHome }[] = [
  { id: 'profile', label: 'Meus dados', icon: IconUser },
  { id: 'appointments', label: 'Meus agendamentos', icon: IconCalendar },
  { id: 'loyalty', label: 'Pontos de fidelidade', icon: IconGift },
  { id: 'favorites', label: 'Favoritos', icon: IconHeart },
  { id: 'reviews', label: 'Avaliações', icon: IconMessageStar },
  { id: 'notifications', label: 'Notificações', icon: IconBell },
  { id: 'security', label: 'Segurança', icon: IconLock },
];

/** Shell mobile-first: a conta permanece uma experiência de cliente também no desktop. */
export function CustomerAccountLayout({
  slug,
  displayName,
  section,
  customer,
  onLogout,
  children,
}: {
  slug: string;
  displayName: string;
  section: AccountSection;
  customer: { name: string; email: string | null; photoUrl: string | null; photoUpdatedAt: string | null } | null;
  onLogout?: () => void;
  children: ReactNode;
}) {
  const title = ACCOUNT_SECTIONS.find((item) => item.id === section)?.label ?? 'Minha conta';
  const isHome = section === 'home';

  return (
    <div className="customer-account">
      <header className="customer-app-topbar">
        {isHome ? <span className="customer-app-tenant">{displayName}</span> : (
          <Link aria-label="Voltar ao início da conta" className="customer-app-back" to={accountPath(slug, 'home')}>
            <IconChevronLeft aria-hidden="true" size={22} />
          </Link>
        )}
        <strong>{isHome ? 'Minha conta' : title}</strong>
        {customer === null ? <span aria-hidden="true" /> : <Link aria-label="Ver perfil" className="customer-app-avatar" to={accountPath(slug, 'profile')}>{customer.photoUrl === null ? customer.name.slice(0, 1) : <img alt="" src={`${environment.apiUrl}/public/sites/${slug}/customer/photo?v=${encodeURIComponent(customer.photoUpdatedAt ?? '')}`} />}</Link>}
      </header>

      <main className={`customer-account-panel${customer === null ? ' customer-account-panel--auth' : ''}`}>
        {customer !== null && section === 'profile' ? (
          <section className="customer-profile-overview" aria-label="Perfil">
            <span className="customer-profile-avatar" aria-hidden="true">{customer.photoUrl === null ? customer.name.slice(0, 1) : <img alt="" src={`${environment.apiUrl}/public/sites/${slug}/customer/photo?v=${encodeURIComponent(customer.photoUpdatedAt ?? '')}`} />}</span>
            <strong>{customer.name}</strong>
            {customer.email === null ? null : <small>{customer.email}</small>}
            <nav className="customer-profile-menu" aria-label="Opções do perfil">
              {profileNavigation.map((item) => {
                const Icon = item.icon;
                return <Link key={item.id} to={accountPath(slug, item.id)}><Icon aria-hidden="true" size={20} /><span>{item.label}</span><IconChevronRight aria-hidden="true" size={18} /></Link>;
              })}
              {onLogout === undefined ? null : <button className="is-danger" onClick={onLogout} type="button"><IconLogout aria-hidden="true" size={20} /><span>Sair</span><IconChevronRight aria-hidden="true" size={18} /></button>}
            </nav>
          </section>
        ) : null}
        {children}
      </main>

      {customer === null ? null : (
        <nav className="customer-bottom-navigation" aria-label="Navegação principal da conta">
          {primaryNavigation.map((item) => {
            const Icon = item.icon;
            return <Link key={item.id} to={accountPath(slug, item.id)} aria-current={item.id === section ? 'page' : undefined}><Icon aria-hidden="true" size={21} /><span>{item.label}</span></Link>;
          })}
        </nav>
      )}
    </div>
  );
}
