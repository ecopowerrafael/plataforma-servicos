import { CommissionListResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';

const commissionLabel = (type: 'PERCENTAGE' | 'FIXED', value: number) =>
  type === 'PERCENTAGE' ? `${String(value)}%` : `R$ ${(value / 100).toFixed(2)}`;

const formatMoney = (cents: string) => `R$ ${(Number(cents) / 100).toFixed(2)}`;

const ruleSourceLabels: Record<string, string> = {
  OVERRIDE: 'específica do serviço',
  DEFAULT: 'padrão do profissional',
};

export function CommissionsModule({ tenantPublicId }: { tenantPublicId: string }) {
  const commissions = useQuery({
    queryKey: ['tenant', tenantPublicId, 'commissions'],
    queryFn: () =>
      httpClient.request('/tenant/commissions', {
        schema: CommissionListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  return (
    <section className="platform-form" aria-label="Comissões">
      <h3>Comissões</h3>
      {commissions.isPending ? <p>Carregando…</p> : null}
      {commissions.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar as comissões.</p>
      ) : null}
      {commissions.data !== undefined && (
        <ul>
          {commissions.data.items.map((item) => (
            <li key={item.publicId}>
              {`${item.professionalName} — ${item.appointmentProtocol} (${item.serviceName}) — ${commissionLabel(item.commissionType, item.commissionValue)} [${ruleSourceLabels[item.ruleSource] ?? item.ruleSource}] sobre ${formatMoney(item.baseAmountCents)} = ${formatMoney(item.commissionAmountCents)} — ${item.status === 'ACTIVE' ? 'ativa' : 'estornada'}`}
            </li>
          ))}
          {commissions.data.items.length === 0 && <li>Nenhuma comissão gerada ainda.</li>}
        </ul>
      )}
    </section>
  );
}
