import {
  ExternalIntegrationListSchema,
  ExternalIntegrationSchema,
  SuccessResponseSchema,
  UpsertExternalIntegrationSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';
import { WhatsAppSettingsCard } from './WhatsAppSettingsCard.js';

export function IntegrationsModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [secret, setSecret] = useState('');
  const external = useQuery({
    queryKey: ['tenant', tenantPublicId, 'external-integrations'],
    queryFn: () =>
      httpClient.request('/tenant/integrations/external', {
        schema: ExternalIntegrationListSchema,
        tenantPublicId,
      }),
  });
  const createExternal = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/integrations/external', {
        method: 'POST',
        body: UpsertExternalIntegrationSchema.parse({
          name,
          endpoint,
          secret: secret || null,
          events: ['notification.queued'],
          active: true,
        }),
        schema: ExternalIntegrationSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      setName('');
      setEndpoint('');
      setSecret('');
      void client.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'external-integrations'],
      });
    },
  });
  const remove = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(`/tenant/integrations/external/${publicId}`, {
        method: 'DELETE',
        schema: SuccessResponseSchema,
        tenantPublicId,
      }),
    onSuccess: () =>
      void client.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'external-integrations'],
      }),
  });
  return (
    <section className="platform-form" aria-label="Integracoes">
      <h3>Integrações</h3>
      <WhatsAppSettingsCard tenantPublicId={tenantPublicId} canManage={canManage} />
      <h3>Webhooks externos</h3>
      {canManage ? (
        <div className="form-row">
          <input
            placeholder="Nome"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
          <input
            placeholder="https://..."
            value={endpoint}
            onChange={(event) => {
              setEndpoint(event.target.value);
            }}
          />
          <input
            type="password"
            placeholder="Segredo de assinatura (opcional)"
            value={secret}
            onChange={(event) => {
              setSecret(event.target.value);
            }}
          />
          <button
            type="button"
            onClick={() => {
              createExternal.mutate();
            }}
          >
            Adicionar webhook
          </button>
        </div>
      ) : null}
      <ul>
        {external.data?.items.map((item) => (
          <li key={item.publicId}>
            <strong>{item.name}</strong> - {item.endpoint} - {item.active ? 'ativo' : 'inativo'}
            {canManage ? (
              <button
                type="button"
                onClick={() => {
                  remove.mutate(item.publicId);
                }}
              >
                Remover
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
