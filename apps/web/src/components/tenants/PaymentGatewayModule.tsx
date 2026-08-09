import { PaymentGatewayConfigPublicSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

export function PaymentGatewayModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState('');
  const [active, setActive] = useState(false);
  const [environment, setEnvironment] = useState<'SANDBOX' | 'PRODUCTION'>('SANDBOX');
  const [credentialsJson, setCredentialsJson] = useState('');

  const queryKey = ['tenant', tenantPublicId, 'payment-gateway'];

  const config = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/payment-gateway', {
        schema: PaymentGatewayConfigPublicSchema.nullable(),
        tenantPublicId,
      }),
    retry: false,
  });

  const save = useMutation({
    mutationFn: () => {
      let credentials: Record<string, unknown> | undefined;
      if (credentialsJson.trim() !== '') {
        const parsed: unknown = JSON.parse(credentialsJson);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
          throw new Error('As credenciais devem ser um objeto JSON.');
        credentials = parsed as Record<string, unknown>;
      }
      return httpClient.request('/tenant/payment-gateway', {
        method: 'PUT',
        body: {
          provider,
          active,
          environment,
          ...(credentials === undefined ? {} : { credentials }),
        },
        schema: PaymentGatewayConfigPublicSchema,
        tenantPublicId,
      });
    },
    onSuccess: () => {
      setCredentialsJson('');
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const current = config.data ?? null;

  return (
    <section className="platform-form" aria-label="Gateway de pagamento">
      <h3>Gateway de pagamento</h3>
      {config.isPending ? <p>Carregando…</p> : null}
      {config.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar a configuração do gateway.</p>
      ) : null}
      {current === null && !canManage && <p>Nenhum gateway configurado.</p>}
      {current !== null && (
        <ul>
          <li>{`Provedor: ${current.provider}`}</li>
          <li>{`Status: ${current.active ? 'ativo' : 'inativo'}`}</li>
          <li>{`Ambiente: ${current.environment === 'SANDBOX' ? 'sandbox' : 'produção'}`}</li>
          <li>{`Credenciais: ${current.hasCredentials ? 'configuradas' : 'não configuradas'}`}</li>
          <li>
            {current.providerImplemented
              ? 'Integração deste provedor implementada.'
              : 'Este provedor ainda não possui integração implementada nesta plataforma — a configuração fica salva, mas nenhuma cobrança poderá ser criada até que a integração seja desenvolvida.'}
          </li>
        </ul>
      )}
      {canManage && (
        <div className="form-actions">
          <input
            placeholder="Identificador do provedor (ex.: nome do fornecedor)"
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value);
            }}
          />
          <select
            value={environment}
            onChange={(event) => {
              setEnvironment(event.target.value as 'SANDBOX' | 'PRODUCTION');
            }}
          >
            <option value="SANDBOX">Sandbox</option>
            <option value="PRODUCTION">Produção</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => {
                setActive(event.target.checked);
              }}
            />
            Ativo
          </label>
          <textarea
            placeholder="Credenciais (JSON, opcional — deixe em branco para manter as já salvas)"
            value={credentialsJson}
            onChange={(event) => {
              setCredentialsJson(event.target.value);
            }}
          />
          <button
            type="button"
            disabled={save.isPending || provider.trim() === ''}
            onClick={() => {
              save.mutate();
            }}
          >
            Salvar configuração
          </button>
          {save.error instanceof Error ? <p className="form-error">{save.error.message}</p> : null}
        </div>
      )}
    </section>
  );
}
