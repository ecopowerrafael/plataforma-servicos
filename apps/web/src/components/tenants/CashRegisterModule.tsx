import { CashRegisterDetailResponseSchema, CashMovementPublicSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

const formatMoney = (cents: string) => `R$ ${(Number(cents) / 100).toFixed(2)}`;

export function CashRegisterModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [openingBalance, setOpeningBalance] = useState('0');
  const [closingNotes, setClosingNotes] = useState('');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const queryKey = ['tenant', tenantPublicId, 'cash-register', 'open'];

  const open = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/cash-registers/open', {
        schema: CashRegisterDetailResponseSchema.nullable(),
        tenantPublicId,
      }),
    retry: false,
  });
  const openRegisterData = open.data ?? null;

  const openRegister = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/cash-registers/open', {
        method: 'POST',
        body: { openingBalanceCents: Math.round(Number(openingBalance.replace(',', '.')) * 100) },
        schema: CashRegisterDetailResponseSchema.shape.register,
        tenantPublicId,
      }),
    onSuccess: () => {
      setOpeningBalance('0');
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const closeRegister = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/tenant/cash-registers/${publicId}/close`, {
        method: 'POST',
        body: { notes: closingNotes === '' ? null : closingNotes },
        schema: CashRegisterDetailResponseSchema.shape.register,
        tenantPublicId,
      }),
    onSuccess: () => {
      setClosingNotes('');
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const addMovement = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/tenant/cash-registers/${publicId}/movements`, {
        method: 'POST',
        body: {
          direction,
          amountCents: Math.round(Number(amount.replace(',', '.')) * 100),
          reason,
        },
        schema: CashMovementPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      setAmount('');
      setReason('');
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <section className="platform-form" aria-label="Caixa">
      <h3>Caixa</h3>
      {open.isPending ? <p>Carregando…</p> : null}
      {open.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar o caixa.</p>
      ) : null}
      {open.data === null && canManage && (
        <div className="form-actions">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Saldo inicial (R$)"
            value={openingBalance}
            onChange={(event) => {
              setOpeningBalance(event.target.value);
            }}
          />
          <button
            type="button"
            disabled={openRegister.isPending}
            onClick={() => {
              openRegister.mutate();
            }}
          >
            Abrir caixa
          </button>
          {openRegister.error instanceof Error ? (
            <p className="form-error">{openRegister.error.message}</p>
          ) : null}
        </div>
      )}
      {open.data === null && !canManage && <p>Nenhum caixa aberto no momento.</p>}
      {openRegisterData !== null && (
        <>
          <p>
            {`Status: ${openRegisterData.register.status === 'OPEN' ? 'Aberto' : 'Fechado'} — Saldo inicial: ${formatMoney(openRegisterData.register.openingBalanceCents)} — Saldo atual: ${formatMoney(openRegisterData.register.balanceCents)}`}
          </p>
          <h4>Movimentações</h4>
          <ul>
            {openRegisterData.movements.map((movement) => (
              <li key={movement.publicId}>
                {`[${movement.direction === 'IN' ? 'Entrada' : 'Saída'}] ${formatMoney(movement.amountCents)} — ${movement.reason ?? (movement.type === 'PAYMENT' ? 'Pagamento de agendamento' : '')}`}
              </li>
            ))}
            {openRegisterData.movements.length === 0 && <li>Nenhuma movimentação registrada.</li>}
          </ul>
          {canManage && (
            <>
              <div className="form-actions">
                <select
                  value={direction}
                  onChange={(event) => {
                    setDirection(event.target.value as 'IN' | 'OUT');
                  }}
                >
                  <option value="IN">Entrada</option>
                  <option value="OUT">Saída</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Valor (R$)"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                  }}
                />
                <input
                  placeholder="Motivo"
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                  }}
                />
                <button
                  type="button"
                  disabled={addMovement.isPending || amount === '' || reason === ''}
                  onClick={() => {
                    addMovement.mutate(openRegisterData.register.publicId);
                  }}
                >
                  Registrar movimentação
                </button>
                {addMovement.error instanceof Error ? (
                  <p className="form-error">{addMovement.error.message}</p>
                ) : null}
              </div>
              {openRegisterData.register.status === 'OPEN' && (
                <div className="form-actions">
                  <input
                    placeholder="Observação de fechamento (opcional)"
                    value={closingNotes}
                    onChange={(event) => {
                      setClosingNotes(event.target.value);
                    }}
                  />
                  <button
                    type="button"
                    disabled={closeRegister.isPending}
                    onClick={() => {
                      closeRegister.mutate(openRegisterData.register.publicId);
                    }}
                  >
                    Fechar caixa
                  </button>
                  {closeRegister.error instanceof Error ? (
                    <p className="form-error">{closeRegister.error.message}</p>
                  ) : null}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
