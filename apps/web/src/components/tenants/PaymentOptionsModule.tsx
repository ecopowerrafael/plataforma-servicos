import { TenantPaymentOptionsOverviewSchema, type PixKeyTypeSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { type z } from 'zod';

import { httpClient, HttpError } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader, StatusBadge } from '../ui/AppUi.js';

type PixKeyType = z.infer<typeof PixKeyTypeSchema>;
type Overview = z.infer<typeof TenantPaymentOptionsOverviewSchema>;
type Card = 'payLocal' | 'pixLocal' | 'mercadoPago';

const PIX_KEY_TYPE_LABELS: Record<PixKeyType, string> = {
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  EMAIL: 'E-mail',
  PHONE: 'Telefone',
  RANDOM: 'Chave aleatória',
};

function errorMessage(error: unknown): string | null {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error) return error.message;
  return null;
}

/** Cartão de resumo: status, dados principais e a ação de configurar. */
function OptionCard({
  title,
  active,
  summary,
  details,
  canManage,
  onConfigure,
}: {
  title: string;
  active: boolean;
  summary: string;
  details: [string, string][];
  canManage: boolean;
  onConfigure: () => void;
}) {
  return (
    <article className="app-card payment-option-card" aria-label={title}>
      <header>
        <strong>{title}</strong>
        <StatusBadge active={active}>{active ? 'Ativo' : 'Inativo'}</StatusBadge>
      </header>
      <p className="muted">{summary}</p>
      <dl className="platform-details">
        {details.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {canManage && (
        <button className="secondary-button" type="button" onClick={onConfigure}>
          Configurar
        </button>
      )}
    </article>
  );
}

function ConfigDrawer({
  title,
  busy,
  error,
  children,
  onClose,
  onSubmit,
  disabled = false,
}: {
  title: string;
  busy: boolean;
  error: string | null;
  children: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  return (
    <form
      className="app-drawer payment-option-drawer"
      aria-label={title}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="drawer-header">
        <h3>{title}</h3>
        <button className="secondary-button" type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
      {children}
      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="payment-option-actions">
        <button className="primary-button" disabled={busy || disabled} type="submit">
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
        <button className="secondary-button" type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function PaymentOptionsModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['tenant', tenantPublicId, 'payment-options'];
  const [open, setOpen] = useState<Card | null>(null);

  const overview = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/payment-options', {
        schema: TenantPaymentOptionsOverviewSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const invalidate = () => {
    setOpen(null);
    void queryClient.invalidateQueries({ queryKey });
  };

  return (
    <section className="sessions-panel payment-options" aria-label="Opções de cobrança">
      <PageHeader
        eyebrow="Financeiro"
        title="Opções de cobrança"
        description="Escolha como o cliente pode pagar ao agendar."
      />
      {overview.isPending ? (
        <ListSkeleton rows={3} />
      ) : overview.error instanceof Error || overview.data === undefined ? (
        <EmptyState
          title="Não foi possível carregar as opções de cobrança."
          description="Tente novamente."
          action={<button onClick={() => void overview.refetch()}>Tentar novamente</button>}
        />
      ) : (
        <>
          <div className="payment-option-grid">
            <OptionCard
              title="Pagamento no local"
              active={overview.data.payLocal.active}
              summary="O cliente agenda sem pagar online e paga presencialmente no atendimento."
              details={[
                ['Confirmação', 'Registrada depois pela recepção'],
                ['Sinal obrigatório', 'Não é substituído por esta opção'],
              ]}
              canManage={canManage}
              onConfigure={() => {
                setOpen('payLocal');
              }}
            />
            <OptionCard
              title="PIX próprio"
              active={overview.data.pixLocal.active}
              summary="Gera copia e cola e QR Code com a chave do estabelecimento; a baixa é manual."
              details={[
                [
                  'Chave PIX',
                  overview.data.pixLocal.hasCredentials ? 'Configurada' : 'Não configurada',
                ],
                [
                  'Tipo',
                  overview.data.pixLocal.keyType === null
                    ? '—'
                    : PIX_KEY_TYPE_LABELS[overview.data.pixLocal.keyType],
                ],
                ['Recebedor', overview.data.pixLocal.receiverName ?? '—'],
                ['Cidade', overview.data.pixLocal.city ?? '—'],
              ]}
              canManage={canManage}
              onConfigure={() => {
                setOpen('pixLocal');
              }}
            />
            <OptionCard
              title="Mercado Pago"
              active={overview.data.mercadoPago.active}
              summary="Cobrança por PIX via Mercado Pago com credenciais do estabelecimento."
              details={[
                [
                  'Ambiente',
                  overview.data.mercadoPago.environment === 'SANDBOX' ? 'Sandbox' : 'Produção',
                ],
                [
                  'Credenciais',
                  overview.data.mercadoPago.hasCredentials ? 'Configuradas' : 'Não configuradas',
                ],
                ...(overview.data.mercadoPago.providerImplemented
                  ? []
                  : ([['Integração', 'Ainda não disponível nesta plataforma']] as [
                      string,
                      string,
                    ][])),
              ]}
              canManage={canManage}
              onConfigure={() => {
                setOpen('mercadoPago');
              }}
            />
          </div>
          {open === 'payLocal' && (
            <PayLocalForm
              tenantPublicId={tenantPublicId}
              current={overview.data.payLocal}
              onClose={() => {
                setOpen(null);
              }}
              onSaved={invalidate}
            />
          )}
          {open === 'pixLocal' && (
            <PixLocalForm
              tenantPublicId={tenantPublicId}
              current={overview.data.pixLocal}
              onClose={() => {
                setOpen(null);
              }}
              onSaved={invalidate}
            />
          )}
          {open === 'mercadoPago' && (
            <MercadoPagoForm
              tenantPublicId={tenantPublicId}
              current={overview.data.mercadoPago}
              onClose={() => {
                setOpen(null);
              }}
              onSaved={invalidate}
            />
          )}
        </>
      )}
    </section>
  );
}

function PayLocalForm({
  tenantPublicId,
  current,
  onClose,
  onSaved,
}: {
  tenantPublicId: string;
  current: Overview['payLocal'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [active, setActive] = useState(current.active);
  const save = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/payment-options/pay-local', {
        method: 'PUT',
        body: { active },
        schema: TenantPaymentOptionsOverviewSchema,
        tenantPublicId,
      }),
    onSuccess: onSaved,
  });
  return (
    <ConfigDrawer
      title="Pagamento no local"
      busy={save.isPending}
      error={errorMessage(save.error)}
      onClose={onClose}
      onSubmit={() => {
        save.mutate();
      }}
    >
      <label className="ds-switch-field">
        <input
          className="ds-switch"
          role="switch"
          type="checkbox"
          checked={active}
          onChange={(event) => {
            setActive(event.target.checked);
          }}
        />
        Ativar pagamento no local
      </label>
      <p className="muted">
        O agendamento é concluído sem pagamento online. A recepção registra o pagamento depois, nas
        formas já configuradas. Quando houver sinal obrigatório, ele continua sendo exigido.
      </p>
    </ConfigDrawer>
  );
}

function PixLocalForm({
  tenantPublicId,
  current,
  onClose,
  onSaved,
}: {
  tenantPublicId: string;
  current: Overview['pixLocal'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [active, setActive] = useState(current.active);
  const [keyType, setKeyType] = useState<PixKeyType>(current.keyType ?? 'EMAIL');
  const [key, setKey] = useState('');
  const [receiverName, setReceiverName] = useState(current.receiverName ?? '');
  const [city, setCity] = useState(current.city ?? '');
  const [description, setDescription] = useState('');
  const save = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/payment-options/pix-local', {
        method: 'PUT',
        body: {
          active,
          keyType,
          key,
          receiverName,
          city,
          ...(description.trim() === '' ? {} : { description: description.trim() }),
        },
        schema: TenantPaymentOptionsOverviewSchema,
        tenantPublicId,
      }),
    onSuccess: onSaved,
  });
  return (
    <ConfigDrawer
      title="PIX próprio"
      busy={save.isPending}
      error={errorMessage(save.error)}
      disabled={
        (!current.hasCredentials && key.trim() === '') ||
        receiverName.trim() === '' ||
        city.trim() === ''
      }
      onClose={onClose}
      onSubmit={() => {
        save.mutate();
      }}
    >
      <label className="ds-switch-field">
        <input
          className="ds-switch"
          role="switch"
          type="checkbox"
          checked={active}
          onChange={(event) => {
            setActive(event.target.checked);
          }}
        />
        Ativar PIX próprio
      </label>
      <div className="payment-option-grid-fields">
        <label>
          Tipo da chave
          <select
            value={keyType}
            onChange={(event) => {
              setKeyType(event.target.value as PixKeyType);
            }}
          >
            {Object.entries(PIX_KEY_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Chave PIX
          <input
            value={key}
            placeholder={current.hasCredentials ? 'Manter a chave salva' : 'Informe a chave'}
            onChange={(event) => {
              setKey(event.target.value);
            }}
          />
          {current.hasCredentials && <small>Deixe em branco para manter a atual.</small>}
        </label>
        <label>
          Recebedor
          <input
            required
            maxLength={25}
            value={receiverName}
            onChange={(event) => {
              setReceiverName(event.target.value);
            }}
          />
        </label>
        <label>
          Cidade
          <input
            required
            maxLength={15}
            value={city}
            onChange={(event) => {
              setCity(event.target.value);
            }}
          />
        </label>
        <label className="payment-field--wide">
          Descrição (opcional)
          <input
            maxLength={72}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
          />
          <small>Aparece para o cliente no pagamento.</small>
        </label>
      </div>
    </ConfigDrawer>
  );
}

function MercadoPagoForm({
  tenantPublicId,
  current,
  onClose,
  onSaved,
}: {
  tenantPublicId: string;
  current: Overview['mercadoPago'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [active, setActive] = useState(current.active);
  const [environment, setEnvironment] = useState<'SANDBOX' | 'PRODUCTION'>(current.environment);
  const [accessToken, setAccessToken] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const save = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/payment-options/mercado-pago', {
        method: 'PUT',
        body: {
          active,
          environment,
          ...(accessToken.trim() === '' ? {} : { accessToken: accessToken.trim() }),
          ...(webhookSecret.trim() === '' ? {} : { webhookSecret: webhookSecret.trim() }),
        },
        schema: TenantPaymentOptionsOverviewSchema,
        tenantPublicId,
      }),
    onSuccess: onSaved,
  });
  return (
    <ConfigDrawer
      title="Mercado Pago"
      busy={save.isPending}
      error={errorMessage(save.error)}
      onClose={onClose}
      onSubmit={() => {
        save.mutate();
      }}
    >
      <label className="ds-switch-field">
        <input
          className="ds-switch"
          role="switch"
          type="checkbox"
          checked={active}
          onChange={(event) => {
            setActive(event.target.checked);
          }}
        />
        Ativar Mercado Pago
      </label>
      <div className="payment-option-grid-fields">
        <label>
          Ambiente
          <select
            value={environment}
            onChange={(event) => {
              setEnvironment(event.target.value as 'SANDBOX' | 'PRODUCTION');
            }}
          >
            <option value="SANDBOX">Sandbox</option>
            <option value="PRODUCTION">Produção</option>
          </select>
        </label>
        <label>
          Access token
          <input
            type="password"
            autoComplete="off"
            value={accessToken}
            placeholder={current.hasCredentials ? 'Manter o token salvo' : 'Informe o token'}
            onChange={(event) => {
              setAccessToken(event.target.value);
            }}
          />
        </label>
        <label>
          Segredo do webhook
          <input
            type="password"
            autoComplete="off"
            value={webhookSecret}
            placeholder={current.hasCredentials ? 'Manter o segredo salvo' : 'Informe o segredo'}
            onChange={(event) => {
              setWebhookSecret(event.target.value);
            }}
          />
        </label>
      </div>
      <p className="muted">Credenciais salvas nunca são exibidas novamente.</p>
    </ConfigDrawer>
  );
}
