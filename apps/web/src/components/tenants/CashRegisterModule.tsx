import {
  CashRegisterDetailResponseSchema,
  CashRegisterListResponseSchema,
  CashRegisterPublicSchema,
  CreateCashMovementRequestSchema,
} from '@plataforma/shared';
import { IconCashRegister, IconLock, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  CASH_FILTERS,
  expectedBalance,
  filterMovements,
  formatDateTime,
  formatMoneyCents,
  formatSignedMoney,
  formatTime,
  movementDescription,
  movementLabel,
  toCents,
  type CashMovement,
  type CashMovementFilter,
} from './financial-operations.js';
import { UnitSelect } from './UnitSelect.js';
import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader, SectionCard } from '../ui/AppUi.js';

export function CashRegisterModule({
  tenantPublicId,
  canManage = false,
}: {
  tenantPublicId: string;
  canManage?: boolean;
}) {
  const queryClient = useQueryClient();
  const [unitPublicId, setUnitPublicId] = useState('');
  const [filter, setFilter] = useState<CashMovementFilter>('ALL');
  const [movementOpen, setMovementOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [openOpen, setOpenOpen] = useState(false);

  const openRegister = useQuery({
    queryKey: ['tenant', tenantPublicId, 'cash-register', 'open', unitPublicId],
    queryFn: () => {
      const query = unitPublicId === '' ? '' : `?unitPublicId=${unitPublicId}`;
      return httpClient.request(`/tenant/cash-registers/open${query}`, {
        schema: CashRegisterDetailResponseSchema.nullable(),
        tenantPublicId,
      });
    },
    retry: false,
  });

  const history = useQuery({
    queryKey: ['tenant', tenantPublicId, 'cash-registers'],
    queryFn: () =>
      httpClient.request('/tenant/cash-registers', {
        schema: CashRegisterListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'cash-register'] });
    await queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'cash-registers'] });
  };

  const open = useMutation({
    mutationFn: (openingBalanceCents: number) =>
      httpClient.request('/tenant/cash-registers/open', {
        method: 'POST',
        body: {
          openingBalanceCents,
          ...(unitPublicId === '' ? {} : { unitPublicId }),
        },
        schema: CashRegisterPublicSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setOpenOpen(false);
      await invalidate();
    },
  });

  const addMovement = useMutation({
    mutationFn: (input: { direction: 'IN' | 'OUT'; amountCents: number; reason: string }) =>
      httpClient.request(
        `/tenant/cash-registers/${openRegister.data?.register.publicId ?? ''}/movements`,
        {
          method: 'POST',
          body: CreateCashMovementRequestSchema.parse(input),
          schema: CashRegisterDetailResponseSchema,
          tenantPublicId,
        },
      ),
    onSuccess: async () => {
      setMovementOpen(false);
      await invalidate();
    },
  });

  const close = useMutation({
    mutationFn: (notes: string) =>
      httpClient.request(
        `/tenant/cash-registers/${openRegister.data?.register.publicId ?? ''}/close`,
        {
          method: 'POST',
          body: { notes: notes === '' ? null : notes },
          schema: CashRegisterPublicSchema,
          tenantPublicId,
        },
      ),
    onSuccess: async () => {
      setCloseOpen(false);
      await invalidate();
    },
  });

  const detail = openRegister.data;
  const register = detail?.register;
  const movements = filterMovements(detail?.movements ?? [], filter);

  return (
    <div className="ds-stack cash-page" aria-label="Caixa">
      <PageHeader
        eyebrow="Financeiro"
        title="Caixa"
        description="Controle entradas, saídas e o saldo operacional do estabelecimento."
        actions={
          <div className="cash-header-actions">
            <UnitSelect
              tenantPublicId={tenantPublicId}
              value={unitPublicId}
              onChange={setUnitPublicId}
            />
            {canManage &&
              (register === undefined ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => {
                    setOpenOpen(true);
                  }}
                >
                  <IconCashRegister size={16} aria-hidden="true" /> Abrir caixa
                </button>
              ) : (
                <>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => {
                      setMovementOpen(true);
                    }}
                  >
                    <IconPlus size={16} aria-hidden="true" /> Nova movimentação
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setCloseOpen(true);
                    }}
                  >
                    <IconLock size={16} aria-hidden="true" /> Fechar caixa
                  </button>
                </>
              ))}
          </div>
        }
      />

      {openRegister.isPending ? (
        <ListSkeleton rows={4} />
      ) : openRegister.error instanceof Error ? (
        <div className="ds-inline-alert ds-inline-alert--danger">
          <div>
            <strong>Não foi possível carregar o caixa.</strong>
          </div>
          <button
            className="secondary-button button--sm"
            type="button"
            onClick={() => {
              void openRegister.refetch();
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : register === undefined ? (
        <EmptyState
          title="Caixa fechado"
          description="Abra o caixa para começar a registrar movimentações."
          action={
            canManage ? (
              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  setOpenOpen(true);
                }}
              >
                Abrir caixa
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <section className="cash-hero" aria-label="Situação do caixa">
            <div className="cash-hero-status">
              <span className="ds-badge ds-badge--success">Caixa aberto</span>
              <strong>{formatMoneyCents(register.balanceCents)}</strong>
              <small>
                Aberto em {formatDateTime(register.openedAt)}
                {register.openedByEmail === null ? '' : ` por ${register.openedByEmail}`}
              </small>
            </div>
            <dl className="cash-hero-facts">
              <div>
                <dt>Saldo inicial</dt>
                <dd>{formatMoneyCents(register.openingBalanceCents)}</dd>
              </div>
              <div>
                <dt>Entradas</dt>
                <dd className="is-in">{formatMoneyCents(register.totalInCents)}</dd>
              </div>
              <div>
                <dt>Saídas</dt>
                <dd className="is-out">{formatMoneyCents(register.totalOutCents)}</dd>
              </div>
              <div>
                <dt>Recebimentos</dt>
                <dd>{formatMoneyCents(register.paymentInCents)}</dd>
              </div>
            </dl>
            <p className="ds-form-hint">
              Recebimentos já estão somados nas entradas — são pagamentos de atendimentos
              refletidos no caixa, não receita adicional.
            </p>
          </section>

          <SectionCard
            title="Movimentações do caixa"
            description="Tudo que entrou e saiu desde a abertura."
            actions={
              <div className="cash-filters" role="group" aria-label="Filtrar movimentações">
                {CASH_FILTERS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={filter === item.value ? 'is-active' : ''}
                    aria-pressed={filter === item.value}
                    onClick={() => {
                      setFilter(item.value);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            }
          >
            {movements.length === 0 ? (
              <p className="ds-form-hint">Nenhuma movimentação neste filtro.</p>
            ) : (
              <>
                <div className="ds-table-scroll cash-table-wrap">
                  <table className="platform-table ds-data-table">
                    <thead>
                      <tr>
                        <th>Horário</th>
                        <th>Tipo</th>
                        <th>Descrição</th>
                        <th>Forma</th>
                        <th>Responsável</th>
                        <th>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((movement) => (
                        <tr key={movement.publicId}>
                          <td>{formatTime(movement.createdAt)}</td>
                          <td>
                            <span
                              className={`ds-badge ds-badge--${movement.type === 'PAYMENT' ? 'info' : movement.direction === 'IN' ? 'success' : 'muted'}`}
                            >
                              {movementLabel(movement)}
                            </span>
                          </td>
                          <td>{movementDescription(movement)}</td>
                          <td>{movement.paymentMethodName ?? '—'}</td>
                          <td>{movement.userEmail ?? '—'}</td>
                          <td
                            className={`cash-amount cash-amount--${movement.direction.toLowerCase()}`}
                          >
                            {formatSignedMoney(movement.amountCents, movement.direction)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="cash-cards">
                  {movements.map((movement) => (
                    <li className="cash-card" key={movement.publicId}>
                      <div className="cash-card-head">
                        <strong>{formatTime(movement.createdAt)}</strong>
                        <span
                          className={`ds-badge ds-badge--${movement.type === 'PAYMENT' ? 'info' : movement.direction === 'IN' ? 'success' : 'muted'}`}
                        >
                          {movementLabel(movement)}
                        </span>
                        <span
                          className={`cash-amount cash-amount--${movement.direction.toLowerCase()}`}
                        >
                          {formatSignedMoney(movement.amountCents, movement.direction)}
                        </span>
                      </div>
                      <p>{movementDescription(movement)}</p>
                      <small>
                        {movement.paymentMethodName ?? 'Sem forma'} ·{' '}
                        {movement.userEmail ?? 'Sem responsável'}
                      </small>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SectionCard>
        </>
      )}

      <SectionCard title="Últimos caixas" description="Aberturas e fechamentos registrados.">
        {history.isPending ? (
          <ListSkeleton rows={3} />
        ) : history.error instanceof Error ? (
          <p className="ds-form-hint">Não foi possível carregar o histórico de caixas.</p>
        ) : (history.data?.items.length ?? 0) === 0 ? (
          <p className="ds-form-hint">Nenhum caixa registrado até agora.</p>
        ) : (
          <ul className="cash-history">
            {history.data?.items.slice(0, 10).map((item) => (
              <li key={item.publicId}>
                <div>
                  <strong>{formatDateTime(item.openedAt)}</strong>
                  <small>
                    {item.closedAt === null
                      ? 'Em aberto'
                      : `Fechado em ${formatDateTime(item.closedAt)}`}
                    {item.closedByEmail === null ? '' : ` · ${item.closedByEmail}`}
                  </small>
                </div>
                <span
                  className={`ds-badge ds-badge--${item.status === 'OPEN' ? 'success' : 'muted'}`}
                >
                  {item.status === 'OPEN' ? 'Aberto' : 'Fechado'}
                </span>
                <span className="cash-history-values">
                  <strong>{formatMoneyCents(item.balanceCents)}</strong>
                  <small>inicial {formatMoneyCents(item.openingBalanceCents)}</small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {openOpen && (
        <OpenDialog
          busy={open.isPending}
          error={open.error instanceof Error ? open.error.message : null}
          onClose={() => {
            setOpenOpen(false);
          }}
          onConfirm={(cents) => {
            open.mutate(cents);
          }}
        />
      )}
      {movementOpen && (
        <MovementDialog
          busy={addMovement.isPending}
          error={addMovement.error instanceof Error ? addMovement.error.message : null}
          onClose={() => {
            setMovementOpen(false);
          }}
          onConfirm={(input) => {
            addMovement.mutate(input);
          }}
        />
      )}
      {closeOpen && register !== undefined && (
        <CloseDialog
          register={register}
          movements={detail?.movements ?? []}
          busy={close.isPending}
          error={close.error instanceof Error ? close.error.message : null}
          onClose={() => {
            setCloseOpen(false);
          }}
          onConfirm={(notes) => {
            close.mutate(notes);
          }}
        />
      )}
    </div>
  );
}

function OpenDialog({
  busy,
  error,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (openingBalanceCents: number) => void;
}) {
  const [value, setValue] = useState('0,00');
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="cash-open">
        <h3 id="cash-open">Abrir caixa</h3>
        <p>Informe o valor em caixa no momento da abertura.</p>
        <label>
          Saldo inicial (R$)
          <input
            inputMode="decimal"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
            }}
          />
        </label>
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
            disabled={busy}
            onClick={() => {
              onConfirm(Math.max(toCents(value), 0));
            }}
          >
            {busy ? 'Abrindo…' : 'Abrir caixa'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MovementDialog({
  busy,
  error,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (input: { direction: 'IN' | 'OUT'; amountCents: number; reason: string }) => void;
}) {
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const invalid = toCents(amount) <= 0 || reason.trim().length < 3;
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="cash-movement">
        <h3 id="cash-movement">Nova movimentação</h3>
        <fieldset className="ds-form-section">
          <legend>Tipo</legend>
          <div className="segmented-control">
            <button
              type="button"
              className={direction === 'IN' ? 'active' : ''}
              aria-pressed={direction === 'IN'}
              onClick={() => {
                setDirection('IN');
              }}
            >
              Entrada
            </button>
            <button
              type="button"
              className={direction === 'OUT' ? 'active' : ''}
              aria-pressed={direction === 'OUT'}
              onClick={() => {
                setDirection('OUT');
              }}
            >
              Saída
            </button>
          </div>
          <label>
            Valor (R$)
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
              }}
            />
          </label>
          <label className="ds-field-full">
            Motivo
            <input
              value={reason}
              placeholder="Ex.: compra de material, sangria, suprimento"
              onChange={(event) => {
                setReason(event.target.value);
              }}
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
            disabled={busy || invalid}
            onClick={() => {
              onConfirm({ direction, amountCents: toCents(amount), reason: reason.trim() });
            }}
          >
            {busy ? 'Registrando…' : 'Registrar movimentação'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CloseDialog({
  register,
  movements,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  register: ReturnType<typeof CashRegisterPublicSchema.parse>;
  movements: CashMovement[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}) {
  const [notes, setNotes] = useState('');
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="cash-close">
        <h3 id="cash-close">Fechar caixa</h3>
        <p>Confira o resultado antes de confirmar. {movements.length} movimentação(ões).</p>
        <dl className="cash-close-summary">
          <div>
            <dt>Saldo inicial</dt>
            <dd>{formatMoneyCents(register.openingBalanceCents)}</dd>
          </div>
          <div>
            <dt>+ Entradas</dt>
            <dd className="is-in">{formatMoneyCents(register.totalInCents)}</dd>
          </div>
          <div>
            <dt>− Saídas</dt>
            <dd className="is-out">{formatMoneyCents(register.totalOutCents)}</dd>
          </div>
          <div className="is-total">
            <dt>= Saldo esperado</dt>
            <dd>{formatMoneyCents(expectedBalance(register))}</dd>
          </div>
        </dl>
        <label>
          Observação de fechamento
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
          />
        </label>
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
            disabled={busy}
            onClick={() => {
              onConfirm(notes.trim());
            }}
          >
            {busy ? 'Fechando…' : 'Fechar caixa'}
          </button>
        </div>
      </div>
    </div>
  );
}
