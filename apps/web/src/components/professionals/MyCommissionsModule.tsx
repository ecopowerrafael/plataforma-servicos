import {
  CommissionListResponseSchema,
  ProfessionalCommissionResponseSchema,
} from '@plataforma/shared';
import { IconCoin } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';

import { httpClient } from '../../lib/http.js';
import {
  DataTable,
  EmptyState,
  InlineAlert,
  ListSkeleton,
  SectionCard,
  StatCard,
  StatGrid,
  StatusBadge,
} from '../ui/AppUi.js';

const money = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const commissionLabel = (type: 'PERCENTAGE' | 'FIXED', value: number) =>
  type === 'PERCENTAGE' ? `${String(value)}%` : money(String(value));

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

  const records = history.data?.items ?? [];
  const activeRecords = records.filter((item) => item.status === 'ACTIVE');
  const activeTotal = activeRecords.reduce(
    (sum, item) => sum + Number(item.commissionAmountCents),
    0,
  );
  const services = commissions.data?.services ?? [];

  return (
    <div className="ds-stack" aria-label="Minhas comissões">
      {commissions.isPending ? <ListSkeleton rows={3} /> : null}
      {commissions.error instanceof Error ? (
        <InlineAlert
          tone="danger"
          title="Não foi possível carregar suas comissões"
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
        <StatGrid>
          <StatCard
            label="Comissão padrão"
            value={commissionLabel(
              commissions.data.defaultCommissionType,
              commissions.data.defaultCommissionValue,
            )}
            hint="Aplicada aos serviços sem regra específica"
          />
          <StatCard label="Comissões geradas" value={String(records.length)} />
          <StatCard
            label="Total ativo"
            value={money(String(activeTotal))}
            hint={`${String(activeRecords.length)} lançamento(s)`}
            tone="success"
          />
        </StatGrid>
      )}

      {commissions.data !== undefined && (
        <SectionCard
          title="Comissões por serviço"
          description="Regra aplicada a cada serviço que você atende."
        >
          {services.length === 0 ? (
            <EmptyState
              icon={<IconCoin size={22} aria-hidden="true" />}
              title="Nenhum serviço vinculado."
              description="Assim que serviços forem vinculados ao seu perfil, as regras aparecerão aqui."
            />
          ) : (
            <DataTable
              label="Comissões por serviço"
              headers={['Serviço', 'Comissão padrão', 'Comissão efetiva']}
            >
              {services.map((item) => (
                <tr key={item.servicePublicId}>
                  <td data-label="Serviço">
                    <strong>{item.serviceName}</strong>
                    {item.active ? null : (
                      <>
                        {' '}
                        <StatusBadge active={false}>Inativo</StatusBadge>
                      </>
                    )}
                  </td>
                  <td data-label="Comissão padrão">
                    {commissionLabel(
                      commissions.data.defaultCommissionType,
                      commissions.data.defaultCommissionValue,
                    )}
                  </td>
                  <td data-label="Comissão efetiva">
                    <strong>
                      {commissionLabel(
                        item.effectiveCommissionType,
                        item.effectiveCommissionValue,
                      )}
                    </strong>
                    {item.overrideCommissionType === null ? null : (
                      <>
                        {' '}
                        <StatusBadge tone="info">Específica</StatusBadge>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </SectionCard>
      )}

      <SectionCard
        title="Comissões geradas"
        description="Lançamentos criados a partir dos pagamentos confirmados."
      >
        {history.isPending ? <ListSkeleton rows={3} /> : null}
        {history.error instanceof Error ? (
          <InlineAlert
            tone="danger"
            title="Não foi possível carregar o histórico"
            action={
              <button
                className="secondary-button"
                type="button"
                onClick={() => void history.refetch()}
              >
                Tentar novamente
              </button>
            }
          >
            Verifique sua conexão e tente novamente.
          </InlineAlert>
        ) : null}
        {history.data !== undefined &&
          (records.length === 0 ? (
            <EmptyState
              icon={<IconCoin size={22} aria-hidden="true" />}
              title="Nenhuma comissão gerada ainda."
              description="As comissões aparecerão aqui conforme forem geradas pelos pagamentos."
            />
          ) : (
            <DataTable
              label="Comissões geradas"
              headers={['Atendimento', 'Regra', 'Base', 'Comissão', 'Situação']}
            >
              {records.map((item) => (
                <tr key={item.publicId}>
                  <td data-label="Atendimento">
                    <strong>{item.serviceName}</strong>
                    <br />
                    <small className="muted">{item.appointmentProtocol}</small>
                  </td>
                  <td data-label="Regra">
                    {commissionLabel(item.commissionType, item.commissionValue)}
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
          ))}
      </SectionCard>
    </div>
  );
}
