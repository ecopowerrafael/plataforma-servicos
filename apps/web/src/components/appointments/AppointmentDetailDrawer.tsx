import {
  AppointmentHistoryResponseSchema,
  AppointmentPublicSchema,
  type AppointmentPaymentState,
} from '@plataforma/shared';
import { IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode } from 'react';

import {
  formatDateTime,
  formatDuration,
  formatMoneyCents,
  formatPhone,
  formatSource,
  initials,
  PAYMENT_STATE_LABELS,
  PAYMENT_STATE_TONE,
} from './appointment-format.js';
import { AppointmentStatusBadge } from './appointment-status.js';
import { AppointmentPaymentsPanel } from './AppointmentPaymentsPanel.js';
import { httpClient } from '../../lib/http.js';

const historyActionLabel = (action: 'CREATED' | 'STATUS_CHANGED' | 'RESCHEDULED' | 'CHECKED_IN') =>
  action === 'CREATED'
    ? 'Criado'
    : action === 'RESCHEDULED'
      ? 'Reagendado'
      : action === 'CHECKED_IN'
        ? 'Check-in'
        : 'Status alterado';

/** Painel lateral amplo com o dossiê do atendimento — porta de entrada do futuro Cliente 360. */
export function AppointmentDetailDrawer({
  tenantPublicId,
  appointmentPublicId,
  paymentState,
  canReadPayments,
  canManagePayments,
  canReadCustomers,
  onClose,
  onOpenCustomer,
  footer,
}: {
  tenantPublicId: string;
  appointmentPublicId: string;
  paymentState: AppointmentPaymentState | undefined;
  canReadPayments: boolean;
  canManagePayments: boolean;
  canReadCustomers: boolean;
  onClose: () => void;
  onOpenCustomer: (customerPublicId: string) => void;
  footer?: ReactNode;
}) {
  const detail = useQuery({
    queryKey: ['tenant', tenantPublicId, 'appointment', appointmentPublicId],
    queryFn: () =>
      httpClient.request(`/tenant/appointments/${appointmentPublicId}`, {
        schema: AppointmentPublicSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const history = useQuery({
    queryKey: ['tenant', tenantPublicId, 'appointment', appointmentPublicId, 'history'],
    queryFn: () =>
      httpClient.request(`/tenant/appointments/${appointmentPublicId}/history`, {
        schema: AppointmentHistoryResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const item = detail.data;

  return (
    <div className="appointments-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        className="appointments-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do agendamento"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="appointments-drawer-header">
          <div>
            <p className="ds-eyebrow">Atendimento</p>
            <h3>{item?.protocol ?? 'Detalhes do agendamento'}</h3>
          </div>
          <button className="icon-button" type="button" aria-label="Fechar" onClick={onClose}>
            <IconX size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="appointments-drawer-body">
          {detail.isPending && <div className="ds-list-skeleton"><i /><i /><i /></div>}
          {detail.error instanceof Error && (
            <div className="ds-inline-alert ds-inline-alert--danger">
              <div>
                <strong>Não foi possível carregar os detalhes.</strong>
              </div>
              <button
                className="secondary-button button--sm"
                type="button"
                onClick={() => {
                  void detail.refetch();
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}
          {item !== undefined && (
            <>
              <div className="appointments-drawer-badges">
                <AppointmentStatusBadge status={item.status} />
                {canReadPayments && paymentState !== undefined && (
                  <span className={`ds-badge ds-badge--${PAYMENT_STATE_TONE[paymentState]}`}>
                    {PAYMENT_STATE_LABELS[paymentState]}
                  </span>
                )}
                <span className="ds-badge ds-badge--muted">{formatSource(item.source)}</span>
                {item.isFitIn && <span className="ds-badge ds-badge--info">Encaixe</span>}
              </div>

              <section className="appointments-drawer-customer">
                <span className="appointments-avatar" aria-hidden="true">
                  {initials(item.customerName)}
                </span>
                <div>
                  <strong>{item.customerName}</strong>
                  {canReadCustomers && item.customerPhone !== null && (
                    <small>{formatPhone(item.customerPhone)}</small>
                  )}
                </div>
                {canReadCustomers && (
                  <button
                    className="secondary-button button--sm"
                    type="button"
                    onClick={() => {
                      onOpenCustomer(item.customerPublicId);
                    }}
                  >
                    Abrir ficha
                  </button>
                )}
              </section>

              <dl className="appointments-drawer-facts">
                <div>
                  <dt>Serviço</dt>
                  <dd>{item.serviceName}</dd>
                </div>
                <div>
                  <dt>Profissional</dt>
                  <dd>{item.professionalName}</dd>
                </div>
                <div>
                  <dt>Data e hora</dt>
                  <dd>{formatDateTime(item.startsAt)}</dd>
                </div>
                <div>
                  <dt>Duração</dt>
                  <dd>{formatDuration(item.durationMinutes)}</dd>
                </div>
                <div>
                  <dt>Unidade</dt>
                  <dd>{item.unitName ?? 'Não informada'}</dd>
                </div>
                <div>
                  <dt>Valor</dt>
                  <dd>{formatMoneyCents(item.priceCents)}</dd>
                </div>
                <div>
                  <dt>Origem</dt>
                  <dd>{formatSource(item.source)}</dd>
                </div>
                <div>
                  <dt>Check-in</dt>
                  <dd>
                    {item.checkedInAt === null ? 'Não registrado' : formatDateTime(item.checkedInAt)}
                  </dd>
                </div>
                {item.depositType !== null && (
                  <div>
                    <dt>Sinal</dt>
                    <dd>
                      {item.depositType === 'PERCENTAGE'
                        ? `${String(item.depositPercentage ?? 0)}%`
                        : 'Valor fixo'}
                      {item.depositAmountCents !== null &&
                        ` — ${formatMoneyCents(item.depositAmountCents)}`}
                    </dd>
                  </div>
                )}
                <div className="appointments-drawer-fact-wide">
                  <dt>Observações</dt>
                  <dd>{item.notes ?? 'Sem observações registradas.'}</dd>
                </div>
                {item.canceledReason !== null && (
                  <div className="appointments-drawer-fact-wide">
                    <dt>Motivo do cancelamento</dt>
                    <dd>{item.canceledReason}</dd>
                  </div>
                )}
                {item.rescheduleReason !== null && (
                  <div className="appointments-drawer-fact-wide">
                    <dt>Motivo do reagendamento</dt>
                    <dd>{item.rescheduleReason}</dd>
                  </div>
                )}
                {item.isFitIn && (
                  <div className="appointments-drawer-fact-wide">
                    <dt>Motivo do encaixe</dt>
                    <dd>{item.fitInReason ?? 'Sem motivo registrado'}</dd>
                  </div>
                )}
              </dl>

              {(canReadPayments || canManagePayments) && (
                <section aria-label="Pagamentos do atendimento">
                  <AppointmentPaymentsPanel
                    tenantPublicId={tenantPublicId}
                    appointmentPublicId={appointmentPublicId}
                    canRead={canReadPayments}
                    canManage={canManagePayments}
                  />
                </section>
              )}

              <section aria-label="Histórico do agendamento">
                <h4>Histórico</h4>
                {history.error instanceof Error ? (
                  <p className="ds-form-hint">Não foi possível carregar o histórico.</p>
                ) : (
                  <ol className="appointments-history">
                    {history.data?.items.map((entry) => (
                      <li key={entry.publicId}>
                        <small>{formatDateTime(entry.createdAt)}</small>
                        <strong>{historyActionLabel(entry.action)}</strong>
                        {entry.reason !== null && <span>{entry.reason}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>

        {footer !== undefined && <footer className="appointments-drawer-footer">{footer}</footer>}
      </aside>
    </div>
  );
}
