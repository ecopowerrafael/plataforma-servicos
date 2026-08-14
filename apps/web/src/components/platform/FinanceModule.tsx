import { PlatformFinanceOverviewSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ErrorState, PageHeader, StatusBadge } from './PlatformUi.js';
import { httpClient } from '../../lib/http.js';

type Provider = 'pix-local' | 'mercadopago';
export function FinanceModule() {
  const client = useQueryClient();
  const [open, setOpen] = useState<Provider | null>(null);
  const [active, setActive] = useState(false);
  const [environment, setEnvironment] = useState<'SANDBOX' | 'PRODUCTION'>('SANDBOX');
  const [fields, setFields] = useState<Record<string, string>>({});
  const query = useQuery({
    queryKey: ['platform', 'finance'],
    queryFn: () =>
      httpClient.request('/platform/finance', { schema: PlatformFinanceOverviewSchema }),
    retry: false,
  });
  const save = useMutation({
    mutationFn: (provider: Provider) =>
      httpClient.request(`/platform/finance/providers/${provider}`, {
        method: 'PUT',
        body: {
          provider,
          active,
          environment,
          ...(Object.values(fields).some(Boolean) ? { credentials: fields } : {}),
        },
        schema: PlatformFinanceOverviewSchema,
      }),
    onSuccess: async () => {
      setOpen(null);
      setFields({});
      await client.invalidateQueries({ queryKey: ['platform', 'finance'] });
    },
  });
  const manual = useMutation({
    mutationFn: (value: boolean) =>
      httpClient.request('/platform/finance/manual-activation', {
        method: 'PUT',
        body: { active: value },
        schema: PlatformFinanceOverviewSchema,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['platform', 'finance'] });
    },
  });
  const configure = (provider: Provider) => {
    const current = query.data?.configs.find((c) => c.provider === provider);
    setOpen(provider);
    setActive(current?.active ?? false);
    setEnvironment(current?.environment ?? 'SANDBOX');
    setFields({});
  };
  return (
    <section>
      <PageHeader
        title="Financeiro"
        description="Configure como os estabelecimentos pagam suas assinaturas da plataforma."
      />
      {query.isPending ? (
        <div className="platform-table-skeleton">
          <i className="platform-skeleton" />
          <i className="platform-skeleton" />
        </div>
      ) : query.error instanceof Error ? (
        <ErrorState
          message={query.error.message}
          retry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <div className="platform-finance-grid">
          {query.data?.configs.map((config) => (
            <article className="platform-panel" key={config.provider}>
              <header>
                <h3>{config.provider === 'pix-local' ? 'PIX' : 'Mercado Pago'}</h3>
                <StatusBadge value={config.active ? 'ACTIVE' : 'INACTIVE'} />
              </header>
              <p>
                {config.provider === 'pix-local'
                  ? 'PIX próprio com confirmação administrativa.'
                  : 'Pagamento processado e confirmado pelo Mercado Pago.'}
              </p>
              <dl className="platform-details">
                <div>
                  <dt>Credenciais</dt>
                  <dd>{config.hasCredentials ? 'Configuradas' : 'Não configuradas'}</dd>
                </div>
                <div>
                  <dt>Ambiente</dt>
                  <dd>{config.environment === 'PRODUCTION' ? 'Produção' : 'Sandbox'}</dd>
                </div>
              </dl>
              <button
                onClick={() => {
                  configure(config.provider);
                }}
                type="button"
              >
                Configurar
              </button>
            </article>
          ))}
          <article className="platform-panel">
            <header>
              <h3>Ativação manual</h3>
              <StatusBadge value={query.data?.manualActivationEnabled ? 'ACTIVE' : 'INACTIVE'} />
            </header>
            <p>Permite ativar uma assinatura manualmente sem gerar pagamento online.</p>
            <button
              onClick={() => {
                void manual.mutateAsync(!(query.data?.manualActivationEnabled ?? false));
              }}
              type="button"
            >
              {query.data?.manualActivationEnabled ? 'Desativar' : 'Ativar'}
            </button>
          </article>
        </div>
      )}
      {open ? (
        <>
          <button
            className="platform-backdrop"
            aria-label="Fechar"
            onClick={() => {
              setOpen(null);
            }}
            type="button"
          />
          <aside className="platform-drawer">
            <button
              className="platform-drawer-close"
              onClick={() => {
                setOpen(null);
              }}
              type="button"
            >
              ×
            </button>
            <h3>{open === 'pix-local' ? 'Configurar PIX' : 'Configurar Mercado Pago'}</h3>
            <div className="platform-form">
              <label>
                <input
                  checked={active}
                  onChange={(e) => {
                    setActive(e.target.checked);
                  }}
                  type="checkbox"
                />{' '}
                Método ativo
              </label>
              <label>
                Ambiente
                <select
                  value={environment}
                  onChange={(e) => {
                    setEnvironment(e.target.value as typeof environment);
                  }}
                >
                  <option value="SANDBOX">Sandbox</option>
                  <option value="PRODUCTION">Produção</option>
                </select>
              </label>
              {open === 'pix-local' ? (
                <>
                  <label>
                    Tipo da chave
                    <input
                      value={fields.keyType ?? ''}
                      onChange={(e) => {
                        setFields({ ...fields, keyType: e.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Chave PIX
                    <input
                      value={fields.key ?? ''}
                      onChange={(e) => {
                        setFields({ ...fields, key: e.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Nome do recebedor
                    <input
                      value={fields.receiverName ?? ''}
                      onChange={(e) => {
                        setFields({ ...fields, receiverName: e.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Cidade
                    <input
                      value={fields.city ?? ''}
                      onChange={(e) => {
                        setFields({ ...fields, city: e.target.value });
                      }}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Access token
                    <input
                      autoComplete="new-password"
                      type="password"
                      value={fields.accessToken ?? ''}
                      onChange={(e) => {
                        setFields({ ...fields, accessToken: e.target.value });
                      }}
                      placeholder="Vazio mantém o atual"
                    />
                  </label>
                  <label>
                    Segredo do webhook
                    <input
                      autoComplete="new-password"
                      type="password"
                      value={fields.webhookSecret ?? ''}
                      onChange={(e) => {
                        setFields({ ...fields, webhookSecret: e.target.value });
                      }}
                      placeholder="Vazio mantém o atual"
                    />
                  </label>
                </>
              )}
              <button
                disabled={save.isPending}
                onClick={() => {
                  void save.mutateAsync(open);
                }}
                type="button"
              >
                Salvar alterações
              </button>
              {save.error instanceof Error ? (
                <p className="form-error">{save.error.message}</p>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}
