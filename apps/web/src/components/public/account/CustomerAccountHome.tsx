import { AppointmentListResponseSchema, LoyaltyAccountSummarySchema } from '@plataforma/shared';
import {
  IconArrowRight,
  IconCalendarEvent,
  IconCalendarPlus,
  IconGift,
  IconHeart,
  IconSparkles,
  IconUser,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { accountPath } from './customer-account.js';
import { CustomerTreatmentsTeaser } from './CustomerTreatmentsTeaser.js';
import { httpClient } from '../../../lib/http.js';
import { AppointmentStatusBadge } from '../../appointments/appointment-status.js';

const formatBalance = (type: string, balance: string) =>
  type === 'CASHBACK'
    ? `R$ ${(Number(balance) / 100).toFixed(2)}`
    : `${balance} ${Number(balance) === 1 ? 'ponto' : 'pontos'}`;

const dateParts = (iso: string) => {
  const value = new Date(iso);
  return {
    weekday: value.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase(),
    day: value.toLocaleDateString('pt-BR', { day: '2-digit' }),
    month: value.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase(),
  };
};

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const shortcuts = [
  { label: 'Agendar', description: 'Escolha seu próximo horário', icon: IconCalendarPlus, section: null },
  { label: 'Agendamentos', description: 'Veja seus próximos horários', icon: IconCalendarEvent, section: 'appointments' },
  { label: 'Tratamentos', description: 'Orçamentos e sessões', icon: IconSparkles, section: 'treatments' },
  { label: 'Favoritos', description: 'Acesse suas escolhas salvas', icon: IconHeart, section: 'favorites' },
  { label: 'Perfil', description: 'Gerencie sua conta', icon: IconUser, section: 'profile' },
] as const;

/** Visão inicial da conta: somente dados que já existem nos endpoints atuais. */
export function CustomerAccountHome({ slug, name }: { slug: string; name: string }) {
  const upcoming = useQuery({
    queryKey: ['public', slug, 'customer', 'appointments', 'upcoming'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/appointments/upcoming`, {
        schema: AppointmentListResponseSchema,
      }),
    retry: false,
  });

  const loyalty = useQuery({
    queryKey: ['public', slug, 'customer', 'loyalty'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/loyalty`, {
        schema: LoyaltyAccountSummarySchema,
      }),
    retry: false,
  });

  const next = upcoming.data?.items[0];
  const balances = loyalty.data?.balances ?? [];
  const nextDate = next === undefined ? null : dateParts(next.startsAt);
  const firstName = name.trim().split(' ')[0] ?? name;

  return (
    <div className="customer-account-home">
      <section className="customer-home-hero">
        <span className="customer-home-hero__eyebrow"><IconSparkles aria-hidden="true" size={16} /> Sua experiência</span>
        <div>
          <h1>{`Olá, ${firstName}`}</h1>
          <p>Pronto para o seu próximo horário?</p>
        </div>
        <Link className="customer-home-primary-cta" to={`/public/${slug}`}>
          Agendar agora <IconArrowRight aria-hidden="true" size={18} />
        </Link>
        <span className="customer-home-hero__orb" aria-hidden="true" />
      </section>

      <section className="customer-home-appointment" aria-label="Próximo agendamento">
        <header>
          <span>Próximo agendamento</span>
          <Link to={accountPath(slug, 'appointments')}>Ver todos</Link>
        </header>
        {upcoming.isPending ? <p className="customer-skeleton" aria-busy="true" /> : null}
        {upcoming.error instanceof Error ? (
          <p className="public-form-error">Não foi possível carregar seus agendamentos.</p>
        ) : null}
        {upcoming.data !== undefined && next === undefined ? (
          <div className="customer-home-appointment__empty">
            <IconCalendarEvent aria-hidden="true" size={28} />
            <strong>Nenhum horário marcado</strong>
            <p>Quando você agendar, os detalhes aparecerão aqui.</p>
            <Link to={`/public/${slug}`}>Agendar horário</Link>
          </div>
        ) : null}
        {next === undefined ? null : (
          <div className="customer-home-appointment__content">
            <time className="customer-home-date" dateTime={next.startsAt}>
              <small>{nextDate?.weekday}</small><strong>{nextDate?.day}</strong><span>{nextDate?.month}</span>
            </time>
            <div className="customer-home-appointment__info">
              <b>{timeLabel(next.startsAt)}</b>
              <strong>{next.serviceName}</strong>
              <p>{`com ${next.professionalName}`}</p>
              {next.unitName === null ? null : <small>{next.unitName}</small>}
            </div>
            <AppointmentStatusBadge status={next.status} />
            <Link className="customer-home-secondary-cta" to={accountPath(slug, 'appointments')}>
              Ver detalhes <IconArrowRight aria-hidden="true" size={16} />
            </Link>
          </div>
        )}
      </section>

      <CustomerTreatmentsTeaser slug={slug} />

      <nav className="customer-home-shortcuts" aria-label="Atalhos">
        {shortcuts.map((shortcut) => {
          const Icon = shortcut.icon;
          const to = shortcut.section === null ? `/public/${slug}` : accountPath(slug, shortcut.section);
          return (
            <Link key={shortcut.label} to={to}>
              <span className="customer-home-shortcut__icon"><Icon aria-hidden="true" size={26} stroke={1.7} /></span>
              <span className="customer-home-shortcut__copy">
                <strong>{shortcut.label}</strong>
                <small>{shortcut.description}</small>
              </span>
              <IconArrowRight className="customer-home-shortcut__arrow" aria-hidden="true" size={17} />
            </Link>
          );
        })}
      </nav>

      {balances.length === 0 ? null : (
        <section className="customer-home-loyalty" aria-label="Fidelidade">
          <header>
            <span className="customer-home-loyalty__icon"><IconGift aria-hidden="true" size={24} /></span>
            <div><small>Fidelidade</small><strong>Seu saldo</strong></div>
            <Link to={accountPath(slug, 'loyalty')}>Ver extrato</Link>
          </header>
          <div className="customer-home-loyalty__metrics">
            {balances.map((item) => (
              <article key={item.type}>
                <small>{item.type === 'CASHBACK' ? 'Cashback' : 'Seus pontos'}</small>
                <strong>{formatBalance(item.type, item.balance)}</strong>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
