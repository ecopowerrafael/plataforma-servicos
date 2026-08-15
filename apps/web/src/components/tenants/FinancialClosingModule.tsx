import {
  FinancialClosingListResponseSchema,
  FinancialClosingPublicSchema,
} from '@plataforma/shared';
import { IconDots, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  closingPeriod,
  CLOSING_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatMoneyCents,
  localDate,
  type FinancialClosing,
} from './financial-operations.js';
import { UnitSelect } from './UnitSelect.js';
import { httpClient } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';
import { EmptyState, ListSkeleton, PageHeader } from '../ui/AppUi.js';

const startOfDayIso = (date: string) => new Date(`${date}T00:00:00`).toISOString();
const endOfDayIso = (date: string) => new Date(`${date}T23:59:59.999`).toISOString();

export function FinancialClosingModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<FinancialClosing | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);

  const queryKey = ['tenant', tenantPublicId, 'financial-closings'];

  const closings = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/financial-closings', {
        schema: FinancialClosingListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const create = useMutation({
    mutationFn: (input: { periodFrom: string; periodTo: string; unitPublicId: string }) =>
      httpClient.request('/tenant/financial-closings', {
        method: 'POST',
        body: {
          periodFrom: input.periodFrom,
          periodTo: input.periodTo,
          ...(input.unitPublicId === '' ? {} : { unitPublicId: input.unitPublicId }),
        },
        schema: FinancialClosingPublicSchema,
        tenantPublicId,
      }),
    onSuccess: async (closing) => {
      setCreating(false);
      setSelected(closing);
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const cancel = useMutation({
    mutationFn: ({ publicId, reason }: { publicId: string; reason: string }) =>
      httpClient.request(`/tenant/financial-closings/${publicId}/cancel`, {
        method: 'POST',
        body: { reason },
        schema: FinancialClosingPublicSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const items = closings.data?.items ?? [];

  return (
    <div className="ds-stack closings-page" aria-label="Fechamentos financeiros">
      <PageHeader
        eyebrow="Financeiro"
        title="Fechamentos"
        description="Consolide períodos financeiros e consulte os resultados registrados."
        actions={
          canManage ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setCreating(true);
              }}
            >
              <IconPlus size={16} aria-hidden="true" /> Novo fechamento
            </button>
          ) : undefined
        }
      />

      <p className="ds-form-hint closings-note">
        O fechamento financeiro consolida um período e guarda o resultado apurado naquele
        momento. É diferente de fechar o caixa do dia.
      </p>

      {closings.isPending ? (
        <ListSkeleton rows={4} />
      ) : closings.error instanceof Error ? (
        <div className="ds-inline-alert ds-inline-alert--danger">
          <div>
            <strong>Não foi possível carregar os fechamentos.</strong>
          </div>
          <button
            className="secondary-button button--sm"
            type="button"
            onClick={() => {
              void closings.refetch();
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhum fechamento registrado."
          description="Consolide um período para guardar o resultado financeiro apurado."
          action={
            canManage ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setCreating(true);
                }}
              >
                Novo fechamento
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="ds-table-scroll closings-table-wrap">
            <table className="platform-table ds-data-table">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Status</th>
                  <th>Recebido</th>
                  <th>Resultado</th>
                  <th>Criado em</th>
                  <th>Responsável</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {items.map((closing) => (
                  <tr key={closing.publicId}>
                    <td>
                      <div className="closing-period">
                        <strong>{closingPeriod(closing)}</strong>
                        <small>
                          {formatDate(closing.periodFrom)} — {formatDate(closing.periodTo)}
                        </small>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`ds-badge ds-badge--${closing.status === 'ACTIVE' ? 'success' : 'muted'}`}
                      >
                        {CLOSING_STATUS_LABELS[closing.status]}
                      </span>
                    </td>
                    <td>{formatMoneyCents(closing.totalReceivedCents)}</td>
                    <td>
                      <strong>
                        {closing.balanceCents.startsWith('-') ? '−' : ''}
                        {formatMoneyCents(closing.balanceCents.replace('-', ''))}
                      </strong>
                    </td>
                    <td>{formatDateTime(closing.closedAt)}</td>
                    <td>{closing.closedByEmail ?? '—'}</td>
                    <td>
                      <div className="ds-row-actions">
                        <button
                          className="secondary-button button--sm"
                          type="button"
                          onClick={() => {
                            setSelected(closing);
                          }}
                        >
                          Ver detalhes
                        </button>
                        {canManage && closing.status === 'ACTIVE' && (
                          <div className="closing-menu">
                            <button
                              className="secondary-button button--sm"
                              type="button"
                              aria-haspopup="menu"
                              aria-expanded={openMenu === closing.publicId}
                              aria-label="Mais ações"
                              onClick={() => {
                                setOpenMenu(
                                  openMenu === closing.publicId ? null : closing.publicId,
                                );
                              }}
                            >
                              <IconDots size={16} aria-hidden="true" />
                            </button>
                            {openMenu === closing.publicId && (
                              <ul className="closing-menu-list" role="menu">
                                <li>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="is-danger"
                                    onClick={() => {
                                      setOpenMenu(null);
                                      setConfirmation({
                                        title: 'Cancelar fechamento?',
                                        description:
                                          'O fechamento continua registrado no histórico, marcado como cancelado. Informe o motivo.',
                                        confirmLabel: 'Cancelar fechamento',
                                        requiresReason: true,
                                        reasonLabel: 'Motivo do cancelamento',
                                        variant: 'danger',
                                        onConfirm: async (reason) => {
                                          await cancel.mutateAsync({
                                            publicId: closing.publicId,
                                            reason,
                                          });
                                        },
                                      });
                                    }}
                                  >
                                    Cancelar fechamento
                                  </button>
                                </li>
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="closings-cards">
            {items.map((closing) => (
              <li className="closing-card" key={closing.publicId}>
                <div className="closing-card-head">
                  <strong>{closingPeriod(closing)}</strong>
                  <span
                    className={`ds-badge ds-badge--${closing.status === 'ACTIVE' ? 'success' : 'muted'}`}
                  >
                    {CLOSING_STATUS_LABELS[closing.status]}
                  </span>
                </div>
                <dl className="closing-card-facts">
                  <div>
                    <dt>Recebido</dt>
                    <dd>{formatMoneyCents(closing.totalReceivedCents)}</dd>
                  </div>
                  <div>
                    <dt>Resultado</dt>
                    <dd>
                      {closing.balanceCents.startsWith('-') ? '−' : ''}
                      {formatMoneyCents(closing.balanceCents.replace('-', ''))}
                    </dd>
                  </div>
                  <div>
                    <dt>Criado em</dt>
                    <dd>{formatDateTime(closing.closedAt)}</dd>
                  </div>
                </dl>
                <button
                  className="secondary-button button--sm"
                  type="button"
                  onClick={() => {
                    setSelected(closing);
                  }}
                >
                  Ver detalhes
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {creating && (
        <CreateDialog
          tenantPublicId={tenantPublicId}
          busy={create.isPending}
          error={create.error instanceof Error ? create.error.message : null}
          onClose={() => {
            setCreating(false);
          }}
          onConfirm={(from, to, unit) => {
            create.mutate({
              periodFrom: startOfDayIso(from),
              periodTo: endOfDayIso(to),
              unitPublicId: unit,
            });
          }}
        />
      )}

      {selected !== null && (
        <div
          className="appointments-drawer-backdrop"
          role="presentation"
          onMouseDown={() => {
            setSelected(null);
          }}
        >
          <aside
            className="appointments-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Detalhes do fechamento"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            <header className="appointments-drawer-header">
              <div>
                <p className="ds-eyebrow">Fechamento</p>
                <h3>{closingPeriod(selected)}</h3>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Fechar"
                onClick={() => {
                  setSelected(null);
                }}
              >
                ×
              </button>
            </header>
            <div className="appointments-drawer-body">
              <div className="appointments-drawer-badges">
                <span
                  className={`ds-badge ds-badge--${selected.status === 'ACTIVE' ? 'success' : 'muted'}`}
                >
                  {CLOSING_STATUS_LABELS[selected.status]}
                </span>
              </div>
              <p className="ds-form-hint">
                Valores apurados no momento do fechamento: {formatDate(selected.periodFrom)} —{' '}
                {formatDate(selected.periodTo)}.
              </p>
              <dl className="appointments-drawer-facts">
                <div>
                  <dt>Recebido</dt>
                  <dd>{formatMoneyCents(selected.totalReceivedCents)}</dd>
                </div>
                <div>
                  <dt>Estornado</dt>
                  <dd>{formatMoneyCents(selected.totalCanceledCents)}</dd>
                </div>
                <div>
                  <dt>Sinais</dt>
                  <dd>{formatMoneyCents(selected.depositTotalCents)}</dd>
                </div>
                <div>
                  <dt>Entradas manuais</dt>
                  <dd>{formatMoneyCents(selected.manualInCents)}</dd>
                </div>
                <div>
                  <dt>Saídas manuais</dt>
                  <dd>{formatMoneyCents(selected.manualOutCents)}</dd>
                </div>
                <div>
                  <dt>Caixa (líquido)</dt>
                  <dd>
                    {selected.cashMovementsNetCents.startsWith('-') ? '−' : ''}
                    {formatMoneyCents(selected.cashMovementsNetCents.replace('-', ''))}
                  </dd>
                </div>
                <div>
                  <dt>Comissões</dt>
                  <dd>{formatMoneyCents(selected.commissionsTotalCents)}</dd>
                </div>
                <div>
                  <dt>Resultado</dt>
                  <dd>
                    {selected.balanceCents.startsWith('-') ? '−' : ''}
                    {formatMoneyCents(selected.balanceCents.replace('-', ''))}
                  </dd>
                </div>
                <div>
                  <dt>Responsável</dt>
                  <dd>{selected.closedByEmail ?? '—'}</dd>
                </div>
                {selected.canceledAt !== null && (
                  <div className="appointments-drawer-fact-wide">
                    <dt>Cancelado em</dt>
                    <dd>
                      {formatDateTime(selected.canceledAt)}
                      {selected.canceledReason === null ? '' : ` · ${selected.canceledReason}`}
                    </dd>
                  </div>
                )}
              </dl>

              <section aria-label="Formas de pagamento do fechamento">
                <h4>Formas de pagamento</h4>
                {selected.paymentMethodBreakdown.length === 0 ? (
                  <p className="ds-form-hint">Nenhum pagamento neste período.</p>
                ) : (
                  <ul className="closing-methods">
                    {selected.paymentMethodBreakdown.map((method) => (
                      <li key={method.paymentMethodPublicId}>
                        <span>{method.paymentMethodName}</span>
                        <small>{method.count} pagamento(s)</small>
                        <strong>{formatMoneyCents(method.totalCents)}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </aside>
        </div>
      )}

      {confirmation !== null && (
        <ConfirmationDialog
          request={confirmation}
          onClose={() => {
            setConfirmation(null);
          }}
        />
      )}
    </div>
  );
}

function CreateDialog({
  tenantPublicId,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  tenantPublicId: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (from: string, to: string, unitPublicId: string) => void;
}) {
  const [from, setFrom] = useState(() => localDate(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(() => localDate(new Date()));
  const [unitPublicId, setUnitPublicId] = useState('');
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="closing-create">
        <h3 id="closing-create">Novo fechamento</h3>
        <p>
          O período será consolidado e o resultado apurado fica registrado como um retrato
          daquele momento.
        </p>
        <fieldset className="ds-form-section ds-form-section--2">
          <label>
            De
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
              }}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
              }}
            />
          </label>
          <label className="ds-field-full">
            Unidade
            <UnitSelect
              tenantPublicId={tenantPublicId}
              value={unitPublicId}
              onChange={setUnitPublicId}
            />
          </label>
        </fieldset>
        {error !== null && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="ds-form-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={busy || from > to}
            onClick={() => {
              onConfirm(from, to, unitPublicId);
            }}
          >
            {busy ? 'Fechando…' : 'Realizar fechamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
