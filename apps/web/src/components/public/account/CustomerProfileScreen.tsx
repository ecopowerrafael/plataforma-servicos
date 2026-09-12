import {
  IconBell,
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconGift,
  IconHeart,
  IconLock,
  IconLogout,
  IconStar,
  IconUserEdit,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { type z } from 'zod';
import { type CustomerProfileResponseSchema, type UpdateCustomerProfileRequestSchema } from '@plataforma/shared';

import { accountPath, type useCustomerAccount } from './customer-account.js';
import { CustomerProfileForm } from '../../CustomerProfileForm.js';
import { environment } from '../../../config/environment.js';

type Profile = z.infer<typeof CustomerProfileResponseSchema>;
type ProfileValue = z.output<typeof UpdateCustomerProfileRequestSchema>;

export function CustomerProfileScreen({
  slug,
  account,
  profile,
  error,
  onSave,
}: {
  slug: string;
  account: ReturnType<typeof useCustomerAccount>;
  profile: Profile;
  error: string | null;
  onSave: (value: ProfileValue) => Promise<void>;
}) {
  const [view, setView] = useState<'menu' | 'edit'>('menu');
  const navigate = useNavigate();
  const customer = account.customer;
  if (customer === null) return null;

  const avatar = customer.photoUrl === null ? customer.name.slice(0, 1) : (
    <img alt="" src={`${environment.apiUrl}/public/sites/${slug}/customer/photo?v=${encodeURIComponent(customer.photoUpdatedAt ?? '')}`} />
  );

  if (view === 'edit') {
    return (
      <section className="customer-profile-edit" aria-label="Meus dados">
        <button className="client-subview-back" type="button" onClick={() => { setView('menu'); }}>
          <IconChevronLeft aria-hidden="true" size={22} /> Meus dados
        </button>
        <div className="customer-profile-photo">
          <span className="client-avatar client-avatar--large">{avatar}</span>
          <label className="client-photo-button">
            {account.uploadPhoto.isPending ? 'Enviando…' : 'Alterar foto'}
            <input accept="image/jpeg,image/png,image/webp" type="file" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) account.uploadPhoto.mutate(file);
            }} />
          </label>
        </div>
        <CustomerProfileForm profile={profile} busy={account.updateProfile.isPending} error={error} onSave={onSave} />
      </section>
    );
  }

  const menu = [
    { label: 'Meus agendamentos', section: 'appointments', icon: IconCalendarEvent },
    { label: 'Pontos de fidelidade', section: 'loyalty', icon: IconGift },
    { label: 'Favoritos', section: 'favorites', icon: IconHeart },
    { label: 'Avaliações', section: 'reviews', icon: IconStar },
    { label: 'Notificações', section: 'notifications', icon: IconBell },
    { label: 'Segurança', section: 'security', icon: IconLock },
  ] as const;

  return (
    <section className="customer-profile-screen" aria-label="Perfil">
      <div className="customer-profile-hero">
        <span className="client-avatar client-avatar--large">{avatar}</span>
        <h1>{customer.name}</h1>
        {customer.email === null ? null : <p>{customer.email}</p>}
      </div>
      <nav className="client-menu" aria-label="Opções do perfil">
        <button type="button" onClick={() => { setView('edit'); }}><IconUserEdit /><span>Meus dados</span><IconChevronRight /></button>
        {menu.map((item) => {
          const Icon = item.icon;
          return <Link key={item.section} to={accountPath(slug, item.section)}><Icon /><span>{item.label}</span><IconChevronRight /></Link>;
        })}
      </nav>
      <button className="client-logout-button" disabled={account.logout.isPending} type="button" onClick={() => { account.logout.mutate(undefined, { onSuccess: () => { void navigate(`/public/${slug}`); } }); }}>
        <IconLogout aria-hidden="true" size={20} />{account.logout.isPending ? 'Saindo…' : 'Sair'}
      </button>
    </section>
  );
}
