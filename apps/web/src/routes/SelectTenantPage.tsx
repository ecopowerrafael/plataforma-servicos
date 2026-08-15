import { AuthMeResponseSchema } from '@plataforma/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { AuthLayout } from '../components/AuthLayout.js';
import { httpClient } from '../lib/http.js';
import { selectTenant } from '../lib/tenant-selection.js';

export function SelectTenantPage() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['auth', 'me', 'tenant-list'],
    queryFn: () => httpClient.request('/auth/me', { schema: AuthMeResponseSchema }),
  });

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
              void navigate(
                membership.roleCode === 'PROFESSIONAL' ? '/profissional' : '/app',
              );
            }}
          >
            <strong>{tenant.displayName}</strong>
            <span>{membership.roleCode}</span>
          </button>
        ))}
      </div>
    </AuthLayout>
  );
}
