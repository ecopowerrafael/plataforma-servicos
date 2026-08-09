import {
  CreateTenantDomainRequestSchema,
  SuccessResponseSchema,
  TenantDomainListResponseSchema,
  TenantDomainSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

export function TenantDomainModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const client = useQueryClient();
  const [hostname, setHostname] = useState('');
  const [type, setType] = useState<'CUSTOM' | 'SUBDOMAIN'>('CUSTOM');
  const key = ['tenant', tenantPublicId, 'domains'];
  const domains = useQuery({
    queryKey: key,
    queryFn: () =>
      httpClient.request('/tenant/domains', {
        schema: TenantDomainListResponseSchema,
        tenantPublicId,
      }),
  });
  const invalidate = () => client.invalidateQueries({ queryKey: key });
  const create = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/domains', {
        method: 'POST',
        body: CreateTenantDomainRequestSchema.parse({ hostname, type }),
        schema: TenantDomainSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setHostname('');
      await invalidate();
    },
  });
  const verify = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/tenant/domains/${publicId}/verify`, {
        method: 'POST',
        body: {},
        schema: TenantDomainSchema,
        tenantPublicId,
      }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/tenant/domains/${publicId}`, {
        method: 'DELETE',
        schema: SuccessResponseSchema,
        tenantPublicId,
      }),
    onSuccess: invalidate,
  });
  return (
    <section className="platform-form" aria-label="Domínios">
      <h3>Domínio próprio e subdomínio</h3>
      {canManage ? (
        <div className="form-row">
          <label>
            Tipo
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value === 'SUBDOMAIN' ? 'SUBDOMAIN' : 'CUSTOM');
              }}
            >
              <option value="CUSTOM">Domínio próprio</option>
              <option value="SUBDOMAIN">Subdomínio gerenciado</option>
            </select>
          </label>
          <label>
            Domínio
            <input
              value={hostname}
              placeholder={
                type === 'SUBDOMAIN' && domains.data?.platformBaseDomain !== null
                  ? `nome.${domains.data?.platformBaseDomain ?? 'dominio-base'}`
                  : 'agenda.exemplo.com.br'
              }
              onChange={(event) => {
                setHostname(event.target.value);
              }}
            />
          </label>
          <button
            type="button"
            disabled={create.isPending || hostname === ''}
            onClick={() => {
              create.mutate();
            }}
          >
            Adicionar
          </button>
        </div>
      ) : null}
      {domains.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os domínios.</p>
      ) : null}
      <ul>
        {domains.data?.items.map((domain) => (
          <li key={domain.publicId}>
            <strong>{domain.hostname}</strong> — {domain.status}
            {domain.type === 'CUSTOM' && domain.status !== 'ACTIVE' ? (
              <small>
                {' '}
                Crie TXT <code>{domain.verificationName}</code> com{' '}
                <code>{domain.verificationValue}</code>.
              </small>
            ) : null}
            {canManage && domain.type === 'CUSTOM' && domain.status !== 'ACTIVE' ? (
              <button
                type="button"
                onClick={() => {
                  verify.mutate(domain.publicId);
                }}
              >
                Verificar DNS
              </button>
            ) : null}
            {canManage ? (
              <button
                type="button"
                onClick={() => {
                  remove.mutate(domain.publicId);
                }}
              >
                Remover
              </button>
            ) : null}
            {domain.lastError !== null ? (
              <span className="form-error"> {domain.lastError}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
