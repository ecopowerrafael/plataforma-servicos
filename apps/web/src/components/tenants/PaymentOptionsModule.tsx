import { TenantPaymentOptionsOverviewSchema, type PixKeyTypeSchema } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type z } from 'zod';

import { httpClient, HttpError } from '../../lib/http.js';

type PixKeyType = z.infer<typeof PixKeyTypeSchema>;

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

export function PaymentOptionsModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ['tenant', tenantPublicId, 'payment-options'];

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
    void queryClient.invalidateQueries({ queryKey });
  };

  return (
    <section className="platform-form" aria-label="Meios de pagamento">
      <h3>Meios de pagamento</h3>
      {overview.isPending ? <p>Carregando…</p> : null}
      {overview.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar os meios de pagamento.</p>
      ) : null}
      {overview.data !== undefined && (
        <>
          <PayLocalSection
            tenantPublicId={tenantPublicId}
            canManage={canManage}
            active={overview.data.payLocal.active}
            onSaved={invalidate}
          />
          <PixLocalSection
            tenantPublicId={tenantPublicId}
            canManage={canManage}
            current={overview.data.pixLocal}
            onSaved={invalidate}
          />
          <MercadoPagoSection
            tenantPublicId={tenantPublicId}
            canManage={canManage}
            current={overview.data.mercadoPago}
            onSaved={invalidate}
          />
        </>
      )}
    </section>
  );
}

function PayLocalSection({
  tenantPublicId,
  canManage,
  active,
  onSaved,
}: {
  tenantPublicId: string;
  canManage: boolean;
  active: boolean;
  onSaved: () => void;
}) {
  const save = useMutation({
    mutationFn: (nextActive: boolean) =>
      httpClient.request('/tenant/payment-options/pay-local', {
        method: 'PUT',
        body: { active: nextActive },
        schema: TenantPaymentOptionsOverviewSchema,
        tenantPublicId,
      }),
    onSuccess: onSaved,
  });

  return (
    <article className="info-card" aria-label="Pagamento no local">
      <h4>Pagamento no local</h4>
      <p>
        Quando ativo, o cliente pode concluir o agendamento sem pagar online e pagar presencialmente
        no atendimento — o pagamento real continua sendo registrado depois pela recepção, nas formas
        de pagamento já configuradas. Se o agendamento exigir sinal, o pagamento no local não
        substitui o sinal obrigatório; após o sinal ser pago, o restante pode ser pago no local
        quando esta opção estiver ativa.
      </p>
      <p>{`Status: ${active ? 'ativo' : 'inativo'}`}</p>
      {canManage && (
        <div className="form-actions">
          <label>
            <input
              type="checkbox"
              checked={active}
              disabled={save.isPending}
              onChange={(event) => {
                save.mutate(event.target.checked);
              }}
            />
            Ativar pagamento no local
          </label>
          {save.error instanceof Error ? (
            <p className="form-error">{errorMessage(save.error)}</p>
          ) : null}
        </div>
      )}
    </article>
  );
}

function PixLocalSection({
  tenantPublicId,
  canManage,
  current,
  onSaved,
}: {
  tenantPublicId: string;
  canManage: boolean;
  current: {
    active: boolean;
    hasCredentials: boolean;
    keyType: PixKeyType | null;
    receiverName: string | null;
    city: string | null;
  };
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
    onSuccess: () => {
      setKey('');
      setDescription('');
      onSaved();
    },
  });

  return (
    <article className="info-card" aria-label="PIX por chave própria">
      <h4>PIX por chave própria</h4>
      <p>
        Gera um código PIX (copia e cola) e QR Code localmente, a partir da chave PIX do próprio
        estabelecimento — nenhuma confirmação automática: o pagamento é confirmado manualmente pela
        recepção depois de recebido.
      </p>
      <ul>
        <li>{`Status: ${current.active ? 'ativo' : 'inativo'}`}</li>
        <li>{`Chave PIX: ${current.hasCredentials ? 'configurada' : 'não configurada'}`}</li>
        {current.receiverName !== null && <li>{`Recebedor: ${current.receiverName}`}</li>}
        {current.city !== null && <li>{`Cidade: ${current.city}`}</li>}
      </ul>
      {canManage && (
        <form
          className="form-actions"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => {
                setActive(event.target.checked);
              }}
            />
            Ativar PIX próprio
          </label>
          <label>
            Tipo da chave PIX
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
              placeholder={
                current.hasCredentials
                  ? 'Deixe em branco para manter a chave já salva'
                  : 'Chave PIX'
              }
              onChange={(event) => {
                setKey(event.target.value);
              }}
            />
          </label>
          <label>
            Nome do recebedor
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
          <label>
            Descrição (opcional)
            <input
              maxLength={72}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
            />
          </label>
          <button
            type="submit"
            disabled={
              save.isPending ||
              (!current.hasCredentials && key.trim() === '') ||
              receiverName.trim() === '' ||
              city.trim() === ''
            }
          >
            Salvar PIX próprio
          </button>
          {save.error instanceof Error ? (
            <p className="form-error">{errorMessage(save.error)}</p>
          ) : null}
        </form>
      )}
    </article>
  );
}

function MercadoPagoSection({
  tenantPublicId,
  canManage,
  current,
  onSaved,
}: {
  tenantPublicId: string;
  canManage: boolean;
  current: {
    active: boolean;
    hasCredentials: boolean;
    environment: 'SANDBOX' | 'PRODUCTION';
    providerImplemented: boolean;
  };
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
    onSuccess: () => {
      setAccessToken('');
      setWebhookSecret('');
      onSaved();
    },
  });

  return (
    <article className="info-card" aria-label="Mercado Pago">
      <h4>Mercado Pago</h4>
      <p>
        Cobrança via PIX pelo Mercado Pago, com credenciais próprias do estabelecimento. O token e o
        segredo de webhook nunca são exibidos novamente depois de salvos.
      </p>
      <ul>
        <li>{`Status: ${current.active ? 'ativo' : 'inativo'}`}</li>
        <li>{`Ambiente: ${current.environment === 'SANDBOX' ? 'sandbox' : 'produção'}`}</li>
        <li>{`Credenciais: ${current.hasCredentials ? 'configuradas' : 'não configuradas'}`}</li>
        {!current.providerImplemented && (
          <li>Integração deste provedor ainda não implementada nesta plataforma.</li>
        )}
      </ul>
      {canManage && (
        <form
          className="form-actions"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => {
                setActive(event.target.checked);
              }}
            />
            Ativar Mercado Pago
          </label>
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
              placeholder={
                current.hasCredentials ? 'Deixe em branco para manter o já salvo' : 'Access token'
              }
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
              placeholder={
                current.hasCredentials
                  ? 'Deixe em branco para manter o já salvo'
                  : 'Segredo do webhook'
              }
              onChange={(event) => {
                setWebhookSecret(event.target.value);
              }}
            />
          </label>
          <button type="submit" disabled={save.isPending}>
            Salvar Mercado Pago
          </button>
          {save.error instanceof Error ? (
            <p className="form-error">{errorMessage(save.error)}</p>
          ) : null}
        </form>
      )}
    </article>
  );
}
