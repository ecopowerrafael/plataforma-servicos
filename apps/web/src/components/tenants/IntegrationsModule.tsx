import {
  ExternalIntegrationListSchema,
  ExternalIntegrationSchema,
  SuccessResponseSchema,
  UpsertExternalIntegrationSchema,
  UpsertWhatsAppConfigSchema,
  WhatsAppConfigSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

export function IntegrationsModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const client = useQueryClient();
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [name, setName] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [secret, setSecret] = useState('');
  const whatsapp = useQuery({
    queryKey: ['tenant', tenantPublicId, 'whatsapp'],
    queryFn: () =>
      httpClient.request('/tenant/integrations/whatsapp', {
        schema: WhatsAppConfigSchema,
        tenantPublicId,
      }),
  });
  const external = useQuery({
    queryKey: ['tenant', tenantPublicId, 'external-integrations'],
    queryFn: () =>
      httpClient.request('/tenant/integrations/external', {
        schema: ExternalIntegrationListSchema,
        tenantPublicId,
      }),
  });
  const saveWhatsapp = useMutation({
    mutationFn: (active: boolean) =>
      httpClient.request('/tenant/integrations/whatsapp', {
        method: 'PUT',
        body: UpsertWhatsAppConfigSchema.parse({
          active,
          phoneNumberId: phoneNumberId || whatsapp.data?.phoneNumberId,
          businessAccountId: businessAccountId || whatsapp.data?.businessAccountId,
          ...(accessToken === '' ? {} : { accessToken }),
          apiVersion: whatsapp.data?.apiVersion ?? 'v23.0',
        }),
        schema: WhatsAppConfigSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      setAccessToken('');
      void client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'whatsapp'] });
    },
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
    onSuccess: () => {
      void client.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'external-integrations'],
      });
    },
  });
  return (
    <section className="platform-form" aria-label="Integrações">
      <h3>WhatsApp oficial</h3>
      <p>
        {whatsapp.data?.configured
          ? `Configurado — ${whatsapp.data.active ? 'ativo' : 'inativo'}`
          : 'Não configurado; e-mail e push continuam disponíveis.'}
      </p>
      {canManage ? (
        <div className="form-row">
          <input
            placeholder="Phone Number ID"
            value={phoneNumberId}
            onChange={(event) => {
              setPhoneNumberId(event.target.value);
            }}
          />
          <input
            placeholder="Business Account ID"
            value={businessAccountId}
            onChange={(event) => {
              setBusinessAccountId(event.target.value);
            }}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Access token"
            value={accessToken}
            onChange={(event) => {
              setAccessToken(event.target.value);
            }}
          />
          <button
            type="button"
            onClick={() => {
              saveWhatsapp.mutate(!(whatsapp.data?.active ?? false));
            }}
          >
            {whatsapp.data?.active ? 'Desativar' : 'Salvar e ativar'}
          </button>
        </div>
      ) : null}
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
            <strong>{item.name}</strong> — {item.endpoint} — {item.active ? 'ativo' : 'inativo'}
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
