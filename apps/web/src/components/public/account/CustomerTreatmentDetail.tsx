import { IconChevronLeft } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { accountPath } from './customer-account.js';
import {
  day,
  dayTime,
  money,
  primaryAction,
  stateLabel,
  upcomingSession,
  useCustomerTreatment,
} from './customer-treatments.js';
import { TreatmentAmount, TreatmentProgress } from './CustomerTreatmentsPage.js';
import { TreatmentSessionBooking } from './TreatmentSessionBooking.js';

const SESSION_STATUS: Record<string, string> = {
  PENDING: 'Agendada',
  CONFIRMED: 'Confirmada',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELED: 'Cancelada',
  NO_SHOW: 'Não compareceu',
};


/**
 * Detalhe do tratamento: orçamento, progresso, sessões e as ações do cliente
 * (aprovar e agendar). O agendamento usa a disponibilidade pública real do
 * profissional — não existe agenda paralela aqui.
 */
export function CustomerTreatmentDetail({
  slug,
  publicId,
  whatsappNumber,
}: {
  slug: string;
  publicId: string;
  whatsappNumber: string | null;
}) {
  const { plan, approve } = useCustomerTreatment(slug, publicId);
  const [confirming, setConfirming] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const current = plan.data;

  if (plan.isPending) return <p className="customer-skeleton" aria-busy="true" />;
  if (current === undefined)
    return <p className="public-form-error">Não foi possível carregar este tratamento.</p>;

  const action = primaryAction(current);
  const upcoming = upcomingSession(current);
  // Em TOTAL o restante é o que falta do tratamento; em PER_SESSION cada
  // sessão tem o próprio saldo e não existe "restante" único.
  const remaining =
    current.billingMode === 'TOTAL'
      ? Math.max(Number(current.amountCents) - Number(current.paidCents), 0)
      : null;

  return (
    <section className="customer-treatment-detail" aria-label={current.title}>
      <Link className="customer-treatment-detail__back" to={accountPath(slug, 'treatments')}>
        <IconChevronLeft aria-hidden="true" size={18} /> Meus tratamentos
      </Link>

      <header>
        <span className="ds-badge">{stateLabel(current)}</span>
        <h1>{current.title}</h1>
        <p>{current.serviceName}</p>
        <p className="customer-treatment__professional">{current.professionalName}</p>
      </header>

      <div className="customer-treatment-block">
        <h2>Orçamento</h2>
        <TreatmentAmount plan={current} />
        {current.estimatedTotalCents === null ? null : (
          <p className="customer-treatment__hint">
            {`Total estimado: ${money(current.estimatedTotalCents)}`}
          </p>
        )}
        {current.returnIntervalDays === null ? null : (
          <p className="customer-treatment__hint">
            {`${String(current.returnIntervalDays)} dias entre sessões`}
          </p>
        )}
      </div>

      <div className="customer-treatment-block">
        <h2>Progresso</h2>
        <TreatmentProgress plan={current} />
        {current.sessionsCompleted === 0 && current.status === 'APPROVED' ? (
          <p className="customer-treatment__hint">
            Orçamento aprovado. Agora agende sua primeira sessão.
          </p>
        ) : null}
        {upcoming === undefined ? (
          current.recommendedNextDate === null || current.sessionsCompleted === 0 ? null : (
            <p className="customer-treatment__next">
              Próxima sessão recomendada
              <strong>{day(current.recommendedNextDate)}</strong>
            </p>
          )
        ) : (
          <p className="customer-treatment__next">
            Próxima sessão
            <strong>{dayTime(upcoming.startsAt)}</strong>
          </p>
        )}
      </div>

      <div className="customer-treatment-block">
        <h2>Pagamentos</h2>
        <p className="customer-treatment__amount">{`Recebido: ${money(current.paidCents)}`}</p>
        {remaining === null ? null : (
          <p className="customer-treatment__hint">
            {`Restante do tratamento: ${money(String(remaining))}`}
          </p>
        )}
      </div>

      <div className="customer-treatment-block">
        <h2>Sessões</h2>
        {current.sessions.length === 0 ? (
          <p className="customer-treatment__hint">Nenhuma sessão agendada ainda.</p>
        ) : (
          <ul className="customer-treatment-sessions">
            {current.sessions.map((session) => (
              <li key={session.appointmentPublicId}>
                <strong>{`Sessão ${String(session.sessionNumber)}`}</strong>
                <span>{dayTime(session.startsAt)}</span>
                <span>{SESSION_STATUS[session.status] ?? session.status}</span>
                <span>{money(session.priceCents)}</span>
                <span>{session.balanceCents === '0' ? 'Pago' : 'Em aberto'}</span>
              </li>
            ))}
          </ul>
        )}
        {current.sessionsPlanned !== null &&
        current.sessions.length < current.sessionsPlanned &&
        current.status !== 'CANCELED' ? (
          <p className="customer-treatment__hint">
            {`Sessão ${String(current.sessions.length + 1)}: ainda não agendada`}
          </p>
        ) : null}
      </div>

      {current.status === 'PENDING' ? (
        <div className="customer-treatment-approval">
          <strong>Seu orçamento está pronto</strong>
          <TreatmentAmount plan={current} />
          {current.returnIntervalDays === null ? null : (
            <p className="customer-treatment__hint">
              {`Intervalo de ${String(current.returnIntervalDays)} dias`}
            </p>
          )}
          {approve.error instanceof Error ? (
            <p className="public-form-error" role="alert">
              {approve.error.message}
            </p>
          ) : null}
          <button
            className="customer-home-primary-cta"
            type="button"
            disabled={approve.isPending}
            onClick={() => {
              setConfirming(true);
            }}
          >
            Aprovar orçamento
          </button>
          {whatsappNumber === null ? null : (
            <a
              className="customer-home-secondary-cta"
              href={`https://wa.me/${whatsappNumber.replace(/\D/gu, '')}`}
              target="_blank"
              rel="noreferrer"
            >
              Falar no WhatsApp
            </a>
          )}
        </div>
      ) : null}

      {action.kind === 'first-session' || action.kind === 'next-session' ? (
        <button
          className="customer-home-primary-cta"
          type="button"
          onClick={() => {
            setScheduling(true);
          }}
        >
          {action.label}
        </button>
      ) : null}

      {confirming ? (
        <div className="treatment-sheet-backdrop" role="dialog" aria-label="Aprovar orçamento">
          <div className="treatment-sheet">
            <h3>Aprovar orçamento?</h3>
            <p>
              <strong>{current.title}</strong>
            </p>
            <TreatmentAmount plan={current} />
            <div className="ds-form-actions">
              <button
                className="customer-home-primary-cta"
                type="button"
                disabled={approve.isPending}
                onClick={() => {
                  approve.mutate(undefined, {
                    onSuccess: () => {
                      setConfirming(false);
                    },
                  });
                }}
              >
                {approve.isPending ? 'Aprovando…' : 'Confirmar aprovação'}
              </button>
              <button
                className="customer-home-secondary-cta"
                type="button"
                onClick={() => {
                  setConfirming(false);
                }}
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scheduling && action.kind !== 'none' ? (
        <div className="treatment-sheet-backdrop">
          <TreatmentSessionBooking
            slug={slug}
            site={{
              publicId: '',
              name: '',
              terminology: { service: { singular: 'serviço' } },
              services: [],
              professionals: [],
              units: [],
            }}
            treatmentPublicId={publicId}
            sessionNumber={current.sessions.length + 1}
            serviceName={current.serviceName}
            professionalName={current.professionalName}
            priceCents={
              current.billingMode === 'PER_SESSION' ? current.amountCents : current.amountCents
            }
            recommendedDate={current.recommendedNextDate}
            onSuccess={() => {
              setScheduling(false);
            }}
            onCancel={() => {
              setScheduling(false);
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
