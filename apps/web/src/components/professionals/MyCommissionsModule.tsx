import {
  CommissionListResponseSchema,
  ProfessionalCommissionResponseSchema,
} from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';

const commissionLabel = (type: 'PERCENTAGE' | 'FIXED', value: number) =>
  type === 'PERCENTAGE' ? `${String(value)}%` : `R$ ${(value / 100).toFixed(2)}`;

const formatMoney = (cents: string) => `R$ ${(Number(cents) / 100).toFixed(2)}`;

export function MyCommissionsModule({ tenantPublicId }: { tenantPublicId: string }) {
  const commissions = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'me', 'commissions'],
    queryFn: () =>
      httpClient.request('/tenant/professionals/me/commissions', {
        schema: ProfessionalCommissionResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const history = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'me', 'commissions', 'history'],
    queryFn: () =>
      httpClient.request('/tenant/professionals/me/commissions/history', {
        schema: CommissionListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  return (
    <section className="platform-form" aria-label="Minhas comissões">
      <h3>Minhas comissões</h3>
      {commissions.isPending ? <p>Carregando…</p> : null}
      {commissions.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar as comissões.</p>
      ) : null}
      {commissions.data !== undefined && (
        <>
          <p>
            {`Regra padrão: ${commissionLabel(commissions.data.defaultCommissionType, commissions.data.defaultCommissionValue)}`}
          </p>
          {commissions.data.services.length === 0 ? (
            <p>Nenhum serviço vinculado.</p>
          ) : (
            <ul>
              {commissions.data.services.map((item) => (
                <li key={item.servicePublicId}>
                  <strong>{item.serviceName}</strong>
                  {!item.active && ' (inativo)'}
                  <span>
                    {item.overrideCommissionType === null
                      ? ` — comissão padrão: ${commissionLabel(item.effectiveCommissionType, item.effectiveCommissionValue)}`
                      : ` — comissão específica: ${commissionLabel(item.overrideCommissionType, item.overrideCommissionValue ?? 0)}`}
                  </span>
                  <span>{` (efetiva: ${commissionLabel(item.effectiveCommissionType, item.effectiveCommissionValue)})`}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <h4>Comissões geradas (pagamentos reais)</h4>
      {history.isPending ? <p>Carregando…</p> : null}
      {history.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar o histórico de comissões.</p>
      ) : null}
      {history.data !== undefined && (
        <ul>
          {history.data.items.map((item) => (
            <li key={item.publicId}>
              {`${item.appointmentProtocol} — ${item.serviceName} — ${commissionLabel(item.commissionType, item.commissionValue)} sobre ${formatMoney(item.baseAmountCents)} = ${formatMoney(item.commissionAmountCents)} — ${item.status === 'ACTIVE' ? 'ativa' : 'estornada'}`}
            </li>
          ))}
          {history.data.items.length === 0 && <li>Nenhuma comissão gerada ainda.</li>}
        </ul>
      )}
    </section>
  );
}
