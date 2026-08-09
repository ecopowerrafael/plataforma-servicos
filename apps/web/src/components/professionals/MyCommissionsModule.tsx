import { ProfessionalCommissionResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';

const commissionLabel = (type: 'PERCENTAGE' | 'FIXED', value: number) =>
  type === 'PERCENTAGE' ? `${String(value)}%` : `R$ ${(value / 100).toFixed(2)}`;

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
    </section>
  );
}
