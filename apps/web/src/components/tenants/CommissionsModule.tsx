import { CommissionListResponseSchema } from '@plataforma/shared';
import { IconCoin } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';
import {
  DataTable,
  EmptyState,
  InlineAlert,
  ListSkeleton,
  PageHeader,
  SectionCard,
  StatCard,
  StatGrid,
  StatusBadge,
} from '../ui/AppUi.js';

const commissionLabel = (type: 'PERCENTAGE' | 'FIXED', value: number) =>
  type === 'PERCENTAGE' ? `${String(value)}%` : money(String(value));

const money = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const ruleSourceLabels: Record<string, string> = {
  OVERRIDE: 'Específica do serviço',
  DEFAULT: 'Padrão do profissional',
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

  const items = commissions.data?.items ?? [];
  const active = items.filter((item) => item.status === 'ACTIVE');
  const canceled = items.filter((item) => item.status === 'CANCELED');
  const total = (rows: typeof items) =>
    rows.reduce((sum, item) => sum + Number(item.commissionAmountCents), 0);

  return (
    <div className="ds-stack" aria-label="Comissões da equipe">
      <PageHeader
        eyebrow="Equipe"
        title="Comissões"
        description="Comissões geradas pelos pagamentos já registrados."
      />

      {commissions.isPending ? <ListSkeleton rows={4} /> : null}
      {commissions.error instanceof Error ? (
        <InlineAlert
          tone="danger"
          title="Não foi possível carregar as comissões"
          action={
            <button
              className="secondary-button"
              type="button"
              onClick={() => void commissions.refetch()}
            >
              Tentar novamente
            </button>
          }
        >
          Verifique sua conexão e tente novamente.
        </InlineAlert>
      ) : null}

      {commissions.data !== undefined && (
        <>
          <StatGrid>
            <StatCard label="Comissões geradas" value={String(items.length)} />
            <StatCard
              label="Total ativo"
              value={money(String(total(active)))}
              hint={`${String(active.length)} lançamento(s)`}
              tone="success"
            />
            <StatCard
              label="Estornado"
              value={money(String(total(canceled)))}
              hint={`${String(canceled.length)} lançamento(s)`}
            />
          </StatGrid>

          <SectionCard
            title="Comissões geradas"
            description="Cada linha corresponde a um pagamento confirmado."
          >
            {items.length === 0 ? (
              <EmptyState
                icon={<IconCoin size={22} aria-hidden="true" />}
                title="Nenhuma comissão gerada ainda."
                description="As comissões aparecerão aqui conforme forem geradas pelos pagamentos."
              />
            ) : (
              <DataTable
                label="Comissões geradas"
                headers={[
                  'Profissional',
                  'Atendimento',
                  'Regra',
                  'Base',
                  'Comissão',
                  'Situação',
                ]}
              >
                {items.map((item) => (
                  <tr key={item.publicId}>
                    <td data-label="Profissional">
                      <strong>{item.professionalName}</strong>
                    </td>
                    <td data-label="Atendimento">
                      {item.serviceName}
                      <br />
                      <small className="muted">{item.appointmentProtocol}</small>
                    </td>
                    <td data-label="Regra">
                      {commissionLabel(item.commissionType, item.commissionValue)}
                      <br />
                      <small className="muted">
                        {ruleSourceLabels[item.ruleSource] ?? item.ruleSource}
                      </small>
                    </td>
                    <td data-label="Base">{money(item.baseAmountCents)}</td>
                    <td data-label="Comissão">
                      <strong>{money(item.commissionAmountCents)}</strong>
                    </td>
                    <td data-label="Situação">
                      <StatusBadge active={item.status === 'ACTIVE'}>
                        {item.status === 'ACTIVE' ? 'Ativa' : 'Estornada'}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
