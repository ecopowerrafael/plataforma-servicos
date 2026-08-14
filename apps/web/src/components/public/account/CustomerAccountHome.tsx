import { AppointmentListResponseSchema, LoyaltyAccountSummarySchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { IconCalendarEvent, IconCalendarPlus, IconHeart, IconUser } from '@tabler/icons-react';

import { accountPath } from './customer-account.js';
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

/** Visão inicial da conta: só dados que já existem nos endpoints atuais. */
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

  return (
    <div className="customer-account-home">
      <header className="customer-home-welcome">
        <h1>{`Olá, ${name.split(' ')[0] ?? name}`}</h1>
        <p>Que bom ter você por aqui.</p>
      </header>

      <section className="customer-card" aria-label="Próximo agendamento">
        <header className="client-card-header">
          <strong>Próximo agendamento</strong>
          <Link className="public-link-button" to={accountPath(slug, 'appointments')}>
            Ver todos
          </Link>
        </header>
        {upcoming.isPending ? <p className="customer-skeleton" aria-busy="true" /> : null}
        {upcoming.error instanceof Error ? (
          <p className="public-form-error">Não foi possível carregar seus agendamentos.</p>
        ) : null}
        {upcoming.data !== undefined &&
          (next === undefined ? (
            <p className="customer-empty">Você não tem horários marcados.</p>
          ) : (
            <div className="customer-next-appointment">
              <time className="client-date-tile" dateTime={next.startsAt}>
                <small>{nextDate?.weekday}</small><strong>{nextDate?.day}</strong><span>{nextDate?.month}</span>
              </time>
              <span className="customer-next-info">
                <b>{timeLabel(next.startsAt)}</b>
                <strong>{next.serviceName}</strong>
                <small>{`com ${next.professionalName}`}</small>
                {next.unitName === null ? null : <small>{next.unitName}</small>}
              </span>
              <AppointmentStatusBadge status={next.status} />
              <Link className="client-card-cta" to={accountPath(slug, 'appointments')}>Ver detalhes</Link>
            </div>
          ))}
      </section>

      {balances.length === 0 ? null : (
        <section className="customer-card" aria-label="Seu saldo">
          <header>
            <strong>Seu saldo</strong>
            <Link className="public-link-button" to={accountPath(slug, 'loyalty')}>
              Ver extrato
            </Link>
          </header>
          <div className="customer-balance-grid">
            {balances.map((item) => (
              <article className="customer-balance" key={item.type}>
                <small>{item.type === 'CASHBACK' ? 'Cashback' : 'Pontos'}</small>
                <strong>{formatBalance(item.type, item.balance)}</strong>
              </article>
            ))}
          </div>
        </section>
      )}

      <nav className="customer-shortcuts" aria-label="Atalhos">
        <Link to={`/public/${slug}`}><IconCalendarPlus aria-hidden="true" /><span>Agendar</span></Link>
        <Link to={accountPath(slug, 'appointments')}><IconCalendarEvent aria-hidden="true" /><span>Meus agendamentos</span></Link>
        <Link to={accountPath(slug, 'favorites')}><IconHeart aria-hidden="true" /><span>Favoritos</span></Link>
        <Link to={accountPath(slug, 'profile')}><IconUser aria-hidden="true" /><span>Perfil</span></Link>
      </nav>
    </div>
  );
}
