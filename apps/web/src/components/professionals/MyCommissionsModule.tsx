import {
  CommissionListResponseSchema,
  ProfessionalCommissionResponseSchema,
  TenantContextResponseSchema,
} from '@plataforma/shared';
import { IconCoin } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

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

const dateInTimezone = (date: Date, timezone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((parts, item) => {
      if (item.type !== 'literal') parts[item.type] = item.value;
      return parts;
    }, {});

const civilDate = (date: Date, timezone: string) => {
  const parts = dateInTimezone(date, timezone);
  return `${parts.year ?? '0000'}-${parts.month ?? '01'}-${parts.day ?? '01'}`;
};

const addCivilDays = (day: string, amount: number) => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (date ?? 1) + amount))
    .toISOString()
    .slice(0, 10);
};

const money = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const commissionLabel = (type: 'PERCENTAGE' | 'FIXED', value: number) =>
  type === 'PERCENTAGE' ? `${String(value)}%` : money(String(value));

export function MyCommissionsModule({ tenantPublicId }: { tenantPublicId: string }) {
  const [period, setPeriod] = useState<'today' | '7' | '30' | 'month'>('30');
  const tenantContext = useQuery({
    queryKey: ['tenant', tenantPublicId, 'context'],
    queryFn: () =>
      httpClient.request('/tenant/context', {
        schema: TenantContextResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const timezone = tenantContext.data?.tenant.timezone ?? 'UTC';
  const today = civilDate(new Date(), timezone);
  const fromDate =
    period === 'today'
      ? today
      : period === '7'
        ? addCivilDays(today, -6)
        : period === '30'
          ? addCivilDays(today, -29)
          : `${today.slice(0, 7)}-01`;
  const historyQuery = `?fromDate=${encodeURIComponent(fromDate)}&toDate=${encodeURIComponent(today)}`;
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
    queryKey: ['tenant', tenantPublicId, 'professionals', 'me', 'commissions', 'history', period],
    queryFn: () =>
      httpClient.request(`/tenant/professionals/me/commissions/history${historyQuery}`, {
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
        <div className="segmented-control" role="group" aria-label="Período das comissões">
          {([{ value: 'today', label: 'Hoje' }, { value: '7', label: '7 dias' }, { value: '30', label: '30 dias' }, { value: 'month', label: 'Este mês' }] as const).map((option) => <button key={option.value} type="button" className={period === option.value ? 'active' : ''} onClick={() => setPeriod(option.value)}>{option.label}</button>)}
        </div>
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
