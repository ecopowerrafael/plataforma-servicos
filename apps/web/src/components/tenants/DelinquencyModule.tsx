import { DelinquencyResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

const formatMoney = (cents: string) => `R$ ${(Number(cents) / 100).toFixed(2)}`;

const statusLabels: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  IN_PROGRESS: 'Em atendimento',
  COMPLETED: 'Concluído',
  NO_SHOW: 'Falta',
};

export function DelinquencyModule({ tenantPublicId }: { tenantPublicId: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');

  const query = new URLSearchParams();
  if (from !== '') query.set('from', `${from}T00:00:00.000Z`);
  if (to !== '') query.set('to', `${to}T23:59:59.999Z`);
  if (status !== '') query.set('status', status);

  const delinquency = useQuery({
    queryKey: ['tenant', tenantPublicId, 'delinquency', from, to, status],
    queryFn: () =>
      httpClient.request(`/tenant/delinquency?${query.toString()}`, {
        schema: DelinquencyResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  return (
    <section className="platform-form" aria-label="Inadimplência">
      <h3>Inadimplência</h3>
      <div className="form-actions">
        <input
          type="date"
          value={from}
          onChange={(event) => {
            setFrom(event.target.value);
          }}
        />
        <input
          type="date"
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
          }}
        />
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
          }}
        >
          <option value="">Todos os status</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {delinquency.isPending ? <p>Carregando…</p> : null}
      {delinquency.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar a inadimplência.</p>
      ) : null}
      {delinquency.data !== undefined && (
        <>
          <p>{`Saldo total pendente: ${formatMoney(delinquency.data.totalBalanceCents)}`}</p>
          <ul>
            {delinquency.data.items.map((item) => (
              <li key={item.appointmentPublicId}>
                {`${item.protocol} — ${item.customerName} — ${item.professionalName}${item.unitName === null ? '' : ` — ${item.unitName}`} — ${new Date(item.startsAt).toLocaleString('pt-BR')} — total: ${formatMoney(item.priceCents)} — pago: ${formatMoney(item.paidCents)} — saldo: ${formatMoney(item.balanceCents)} (${statusLabels[item.status] ?? item.status})`}
              </li>
            ))}
            {delinquency.data.items.length === 0 && <li>Nenhum agendamento com saldo pendente.</li>}
          </ul>
        </>
      )}
    </section>
  );
}
