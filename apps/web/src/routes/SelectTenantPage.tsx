import { AuthMeResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { AuthLayout } from '../components/AuthLayout.js';
import { httpClient } from '../lib/http.js';
import { selectSingleTenantIfAvailable, selectTenant, tenantDestination, tenantRoleLabel } from '../lib/tenant-selection.js';

export function SelectTenantPage() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['auth', 'me', 'tenant-list'],
    queryFn: () => httpClient.request('/auth/me', { schema: AuthMeResponseSchema }),
  });

  useEffect(() => {
    if (query.data === undefined) return;
    const destination = selectSingleTenantIfAvailable(query.data.tenants);
    if (destination !== null) void navigate(destination, { replace: true });
  }, [navigate, query.data]);

  return (
    <AuthLayout
      title="Selecione o estabelecimento"
      description="Escolha o contexto que deseja acessar."
    >
      {query.isPending ? <p>Carregando estabelecimentos…</p> : null}
      {query.isError ? <p className="form-error">Não foi possível carregar seus acessos.</p> : null}
      <div className="tenant-list">
        {query.data?.tenants.map(({ tenant, membership }) => (
          <button
            type="button"
            className="tenant-option"
            key={tenant.publicId}
            onClick={() => {
              selectTenant(tenant.publicId);
              void navigate(tenantDestination({ tenant, membership }));
            }}
          >
            <strong>{tenant.displayName}</strong>
            <span>{tenantRoleLabel(membership.roleCode)}</span>
          </button>
        ))}
      </div>
    </AuthLayout>
  );
}
