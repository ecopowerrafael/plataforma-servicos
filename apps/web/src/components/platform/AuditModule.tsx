import { PlatformAuditResponseSchema, PlatformTenantListResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

export function AuditModule() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [tenantPublicId, setTenantPublicId] = useState('');
  const [userPublicId, setUserPublicId] = useState('');
  const [targetType, setTargetType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const tenants = useQuery({
    queryKey: ['platform', 'tenants', 'audit-options'],
    queryFn: () =>
      httpClient.request('/platform/tenants?limit=100', {
        schema: PlatformTenantListResponseSchema,
      }),
    retry: false,
  });
  const tenantNames = new Map(
    (tenants.data?.items ?? []).map((tenant) => [tenant.publicId, tenant.displayName]),
  );
  const audit = useQuery({
    queryKey: [
      'platform',
      'audit',
      page,
      action,
      tenantPublicId,
      userPublicId,
      targetType,
      from,
      to,
      direction,
    ],
    queryFn: () => {
      const query = new URLSearchParams({ page: String(page), limit: '20', direction });
      if (action.trim() !== '') query.set('action', action.trim());
      if (tenantPublicId !== '') query.set('tenantPublicId', tenantPublicId);
      if (userPublicId.trim() !== '') query.set('userPublicId', userPublicId.trim());
      if (targetType.trim() !== '') query.set('targetType', targetType.trim());
      if (from.trim() !== '') query.set('from', from.trim());
      if (to.trim() !== '') query.set('to', to.trim());
      return httpClient.request(`/platform/audit?${query.toString()}`, {
        schema: PlatformAuditResponseSchema,
      });
    },
    retry: false,
  });
  const clearFilters = () => {
    setPage(1);
    setAction('');
    setTenantPublicId('');
    setUserPublicId('');
    setTargetType('');
    setFrom('');
    setTo('');
    setDirection('desc');
  };

  return (
    <section aria-labelledby="audit-title">
      <p className="eyebrow">{'Rastreabilidade global'}</p>
      <h2 id="audit-title">Auditoria</h2>
      <p className="muted">
        {
          'A API atual n\u00e3o retorna metadata; somente os campos p\u00fablicos aprovados s\u00e3o exibidos.'
        }
      </p>
      <div className="platform-form">
        <label>
          {'A\u00e7\u00e3o'}
          <input
            placeholder="platform.subscription.created"
            value={action}
            onChange={(event) => {
              setPage(1);
              setAction(event.target.value);
            }}
          />
        </label>
        <label>
          Estabelecimento
          <select
            value={tenantPublicId}
            onChange={(event) => {
              setPage(1);
              setTenantPublicId(event.target.value);
            }}
          >
            <option value="">Todos</option>
            {(tenants.data?.items ?? []).map((tenant) => (
              <option key={tenant.publicId} value={tenant.publicId}>
                {tenant.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          {'Usu\u00e1rio (identificador p\u00fablico)'}
          <input
            inputMode="text"
            value={userPublicId}
            onChange={(event) => {
              setPage(1);
              setUserPublicId(event.target.value);
            }}
          />
        </label>
        <label>
          Tipo de alvo
          <input
            placeholder="tenant_subscription"
            value={targetType}
            onChange={(event) => {
              setPage(1);
              setTargetType(event.target.value);
            }}
          />
        </label>
        <label>
          {'A partir de (ISO)'}
          <input
            placeholder="2026-08-01T00:00:00.000Z"
            value={from}
            onChange={(event) => {
              setPage(1);
              setFrom(event.target.value);
            }}
          />
        </label>
        <label>
          {'At\u00e9 (ISO)'}
          <input
            placeholder="2026-08-31T23:59:59.999Z"
            value={to}
            onChange={(event) => {
              setPage(1);
              setTo(event.target.value);
            }}
          />
        </label>
        <label>
          {'Dire\u00e7\u00e3o'}
          <select
            value={direction}
            onChange={(event) => {
              setPage(1);
              setDirection(event.target.value as 'asc' | 'desc');
            }}
          >
            <option value="desc">Decrescente</option>
            <option value="asc">Crescente</option>
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button onClick={clearFilters} type="button">
          Limpar filtros
        </button>
        <button
          onClick={() => {
            void audit.refetch();
          }}
          type="button"
        >
          Atualizar
        </button>
      </div>
      {audit.isPending ? (
        <p>{'Carregando eventos de auditoria\u2026'}</p>
      ) : audit.error instanceof Error ? (
        <p className="form-error">{'N\u00e3o foi poss\u00edvel carregar a auditoria.'}</p>
      ) : audit.data === undefined || audit.data.items.length === 0 ? (
        <p>Nenhum evento encontrado para os filtros atuais.</p>
      ) : (
        <>
          <div className="data-list"><table className="platform-table"><thead><tr><th>Data/hora</th><th>Administrador</th><th>Ação</th><th>Entidade</th><th>Estabelecimento</th><th>Detalhes</th></tr></thead><tbody>{audit.data.items.map((item) => <tr key={item.publicId}><td>{new Date(item.createdAt).toLocaleString('pt-BR')}</td><td>{item.user?.email ?? 'Sistema'}</td><td>{item.action}</td><td>{item.targetType}</td><td>{tenantNames.get(item.tenantPublicId ?? '') ?? '—'}</td><td>{item.targetPublicId ?? '—'}</td></tr>)}</tbody></table></div>
          <div className="form-actions">
            <button
              disabled={page <= 1}
              onClick={() => {
                setPage(page - 1);
              }}
              type="button"
            >
              Anterior
            </button>
            <span>{`P\u00e1gina ${String(audit.data.page.page)} de ${String(audit.data.page.totalPages)}`}</span>
            <button
              disabled={page >= audit.data.page.totalPages}
              onClick={() => {
                setPage(page + 1);
              }}
              type="button"
            >
              {'Pr\u00f3xima'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
