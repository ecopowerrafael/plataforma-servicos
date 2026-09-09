import {
  UpdateWhatsAppProviderSchema,
  TenantMetaTemplatesResponseSchema,
  WhatsAppConnectionSchema,
  WhatsAppProviderSelectionResultSchema,
  WhatsAppProvidersResponseSchema,
  WhatsAppQrCodeSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { httpClient } from '../../lib/http.js';

/** Rótulos amigáveis: o tenant nunca vê o estado interno cru. */
const STATE_LABEL: Record<string, string> = {
  NOT_CREATED: 'Não conectado',
  CREATED: 'Instância criada',
  WAITING_QR: 'Aguardando conexão',
  CONNECTED: 'Conectado',
  DISCONNECTED: 'Desconectado',
  ERROR: 'Não conectado',
};
const STATE_DOT: Record<string, string> = {
  NOT_CREATED: '⚪',
  CREATED: '🟡',
  WAITING_QR: '🟡',
  CONNECTED: '🟢',
  DISCONNECTED: '🔴',
  ERROR: '🔴',
};
const TEMPLATE_STATUS_DOT: Record<string, string> = {
  PENDING: '🟡',
  APPROVED: '🟢',
  REJECTED: '🔴',
  PAUSED: '🟠',
  DISABLED: '⚫',
  UNKNOWN: '⚪',
};
const PROVIDER_PRESENTATION: Record<ProviderId, {
  name: string;
  subtitle: string;
  description: string;
  advantages: string[];
  considerations: string[];
}> = {
  WAPI: {
    name: 'API não oficial',
    subtitle: 'Conexão por QR Code',
    description: 'Uma alternativa prática para conectar seu WhatsApp sem passar pela configuração da Meta.',
    advantages: [
      'Conexão simples por QR Code',
      'Configuração mais rápida',
      'Não exige criação de aplicativo na Meta',
      'Boa opção para começar rapidamente',
      'Maior flexibilidade para mensagens comuns',
    ],
    considerations: [
      'Pode exigir nova leitura do QR Code em caso de desconexão',
      'Depende do funcionamento do WhatsApp Web',
      'Pode sofrer alterações quando o WhatsApp é atualizado',
      'Não é uma integração oficial homologada pela Meta',
    ],
  },
  META: {
    name: 'API Oficial',
    subtitle: 'Meta Cloud API',
    description: 'Conecte seu WhatsApp Business diretamente pela API oficial da Meta.',
    advantages: [
      'Integração oficial da Meta',
      'Maior estabilidade para operação profissional',
      'Webhooks oficiais',
      'Melhor opção para volume e escala',
      'Templates oficiais para comunicações automáticas',
    ],
    considerations: [
      'Configuração inicial exige conta/aplicativo da Meta',
      'Algumas mensagens precisam utilizar templates aprovados',
      'Aprovação de templates depende da Meta',
      'Podem existir cobranças da Meta conforme regras vigentes',
    ],
  },
};

export function metaTemplateStatusIcon(status: string) {
  return TEMPLATE_STATUS_DOT[status] ?? '⚪';
}

export function metaTemplateProvisionButtonLabel(items: Array<{ exists: boolean }> | undefined, loading: boolean) {
  if (loading) return 'Criando templates…';
  return items?.some((item) => item.exists) === true ? 'Completar templates padrão' : 'Criar templates padrão';
}

export function allMetaTemplatesCreated(items: Array<{ exists: boolean }> | undefined) {
  return items !== undefined && items.length > 0 && items.every((item) => item.exists);
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const prettyPhone = (phone: string | null) => {
  if (phone === null) return null;
  const digits = phone.replace(/\D/gu, '');
  if (digits.length < 12) return phone;
  const rest = digits.slice(4);
  return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
};

type ProviderId = 'WAPI' | 'META';
type ProviderCardOption = {
  provider: ProviderId;
  available: boolean;
};

export function whatsappProviderBadge(item: ProviderCardOption, selectedProvider: ProviderId) {
  if (selectedProvider === item.provider) return 'Configurando';
  return item.available ? 'Configurado' : 'Não configurado';
}

export function whatsappProviderBadgeState(item: ProviderCardOption, selectedProvider: ProviderId) {
  if (selectedProvider === item.provider) return 'is-selected';
  return item.available ? 'is-available' : 'is-unavailable';
}

export function whatsappProviderDraftMessage(selectedProvider: ProviderId, activeProvider: ProviderId) {
  if (selectedProvider === activeProvider) return null;
  return selectedProvider === 'META'
    ? 'API Oficial aberta para configuração. A conexão ativa só muda quando você clicar em Usar API Oficial.'
    : 'API não oficial aberta para configuração. A conexão ativa só muda quando você clicar em Usar API não oficial.';
}

export function shouldShowWapiActivation(selectedProvider: ProviderId, activeProvider: ProviderId) {
  return selectedProvider === 'WAPI' && activeProvider !== 'WAPI';
}

/**
 * Conexão do WhatsApp pelo painel: criar a instância, ler o QR, acompanhar o
 * status, desconectar e reconectar. Nenhuma credencial do provedor passa por
 * aqui — o backend resolve a instância pela sessão autenticada do tenant.
 */
export function WhatsAppConnectionCard({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const client = useQueryClient();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<'WAPI' | 'META'>('WAPI');
  const [metaForm, setMetaForm] = useState({
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    appSecret: '',
    apiVersion: 'v23.0',
  });
  const queryKey = ['tenant', tenantPublicId, 'whatsapp', 'connection'];

  const providers = useQuery({
    queryKey: ['tenant', tenantPublicId, 'whatsapp', 'providers'],
    queryFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/providers', {
        schema: WhatsAppProvidersResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const connection = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/status', {
        schema: WhatsAppConnectionSchema,
        tenantPublicId,
      }),
    // Com o QR na tela o status é consultado em ritmo curto; fora dele, não.
    refetchInterval: qrCode === null ? false : 4000,
    retry: false,
  });
  const metaTemplates = useQuery({
    queryKey: ['tenant', tenantPublicId, 'whatsapp', 'meta', 'templates'],
    queryFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/meta/templates', {
        schema: TenantMetaTemplatesResponseSchema,
        tenantPublicId,
      }),
    enabled: selectedProvider === 'META',
    retry: false,
  });
  const state = connection.data?.state ?? 'NOT_CREATED';
  const activeProvider = connection.data?.provider ?? 'WAPI';
  const available = connection.data?.available ?? true;
  const provisioned = connection.data?.provisioned ?? false;
  const selectedProviderOption = providers.data?.items.find((item) => item.provider === selectedProvider);
  const selectedProviderIsActive = selectedProvider === activeProvider;
  const draftMessage = whatsappProviderDraftMessage(selectedProvider, activeProvider);
  const activePresentation = PROVIDER_PRESENTATION[activeProvider];

  useEffect(() => {
    if (connection.data?.provider !== undefined) setSelectedProvider(connection.data.provider);
  }, [connection.data?.provider]);

  useEffect(() => {
    if (connection.data?.provider !== 'META') return;
    setMetaForm((value) => ({
      ...value,
      phoneNumberId: connection.data?.phoneNumberId ?? '',
      businessAccountId: connection.data?.businessAccountId ?? '',
      apiVersion: connection.data?.apiVersion ?? 'v23.0',
      accessToken: '',
      appSecret: '',
    }));
  }, [
    connection.data?.provider,
    connection.data?.phoneNumberId,
    connection.data?.businessAccountId,
    connection.data?.apiVersion,
  ]);

  // Derivado: assim que a conexão é detectada, o QR sai da tela sozinho.
  const visibleQrCode = qrCode !== null && state !== 'CONNECTED' ? qrCode : null;
  const justConnected = qrCode !== null && state === 'CONNECTED';

  const refresh = async () => {
    await client.invalidateQueries({ queryKey });
  };

  const createInstance = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/instance', {
        method: 'POST',
        body: {},
        schema: WhatsAppConnectionSchema,
        tenantPublicId,
      }),
    onSuccess: refresh,
  });
  const updateProvider = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/provider', {
        method: 'PUT',
        body: UpdateWhatsAppProviderSchema.parse(
          selectedProvider === 'WAPI'
              ? { provider: 'WAPI' }
            : {
                provider: 'META',
                phoneNumberId: metaForm.phoneNumberId,
                businessAccountId: metaForm.businessAccountId,
                ...(metaForm.accessToken.trim() === '' ? {} : { accessToken: metaForm.accessToken }),
                ...(metaForm.appSecret.trim() === '' ? {} : { appSecret: metaForm.appSecret }),
                apiVersion: metaForm.apiVersion,
              },
        ),
        schema: WhatsAppProviderSelectionResultSchema,
        tenantPublicId,
    }),
    onSuccess: async () => {
      setNotice(selectedProvider === 'META' ? 'API Oficial salva.' : 'API não oficial selecionada.');
      await refresh();
    },
  });
  const provisionTemplates = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/meta/templates/provision', {
        method: 'POST',
        body: {},
        schema: TenantMetaTemplatesResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async (data) => {
      setNotice(`Templates Meta: ${data.summary?.created ?? 0} criados, ${data.summary?.existing ?? 0} já existentes, ${data.summary?.failed ?? 0} falhas.`);
      await client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'whatsapp', 'meta', 'templates'] });
    },
  });
  const refreshTemplates = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/meta/templates/refresh', {
        method: 'POST',
        body: {},
        schema: TenantMetaTemplatesResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setNotice('Status dos templates Meta atualizado.');
      await client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'whatsapp', 'meta', 'templates'] });
    },
  });
  const requestQr = useMutation({
    mutationFn: (path: 'qr' | 'reconnect') =>
      httpClient.request(`/tenant/integrations/whatsapp/${path}`, {
        method: 'POST',
        body: {},
        schema: WhatsAppQrCodeSchema,
        tenantPublicId,
      }),
    onSuccess: async (data) => {
      setQrCode(data.qrCode);
      setNotice(null);
      await refresh();
    },
  });
  const disconnect = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/disconnect', {
        method: 'POST',
        body: {},
        schema: WhatsAppConnectionSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setDisconnecting(false);
      setNotice('WhatsApp desconectado.');
      await refresh();
    },
  });

  const busy = createInstance.isPending || requestQr.isPending || disconnect.isPending || updateProvider.isPending || provisionTemplates.isPending || refreshTemplates.isPending;
  const error = [createInstance.error, requestQr.error, disconnect.error, updateProvider.error, provisionTemplates.error, refreshTemplates.error, connection.error, providers.error, metaTemplates.error].find(
    (item): item is Error => item instanceof Error,
  );

  if (!available)
    return (
      <fieldset className="whatsapp-card">
        <legend>WhatsApp</legend>
        <p>
          {'Disponível em outros planos. '}
          <a href="/planos">Ver planos</a>
        </p>
      </fieldset>
    );

  return (
    <fieldset className="whatsapp-card">
      <legend>WhatsApp › Conexão</legend>
      <p className="whatsapp-card__intro">
        Escolha e gerencie a API usada para envio e atendimento pelo WhatsApp. Clicar em um card
        apenas abre a configuração; a troca de API exige uma ação explícita.
      </p>
      <section className="whatsapp-current-connection" aria-label="Sua conexão atual">
        <div>
          <span className="whatsapp-current-connection__check" aria-hidden="true">✓</span>
          <p>Sua conexão atual</p>
          <h3>{activePresentation.name}</h3>
          <strong>{activePresentation.subtitle}</strong>
          <span>
            {STATE_LABEL[state] ?? 'Não conectado'}
            {connection.data?.connectedPhone === null || connection.data?.connectedPhone === undefined
              ? ''
              : ` · ${prettyPhone(connection.data.connectedPhone)}`}
          </span>
        </div>
        <em>Em uso</em>
      </section>
      <div className="whatsapp-provider-grid" role="list" aria-label="Método de conexão">
        {(providers.data?.items ?? []).map((item) => (
          <button
            key={item.provider}
            type="button"
            className={`whatsapp-provider-option ${selectedProvider === item.provider ? 'is-selected' : ''} ${activeProvider === item.provider ? 'is-active-provider' : ''}`}
            disabled={!item.available}
            onClick={() => {
              if (!item.available) return;
              setSelectedProvider(item.provider);
              setQrCode(null);
            }}
          >
            <span className="whatsapp-provider-option__label">{PROVIDER_PRESENTATION[item.provider].name}</span>
            <strong>{PROVIDER_PRESENTATION[item.provider].subtitle}</strong>
            <small>{PROVIDER_PRESENTATION[item.provider].description}</small>
            <div className="whatsapp-provider-option__lists" aria-hidden="true">
              <span>Vantagens</span>
              <ul>
                {PROVIDER_PRESENTATION[item.provider].advantages.slice(0, 3).map((advantage) => (
                  <li key={advantage}>{advantage}</li>
                ))}
              </ul>
              <span>Pontos a considerar</span>
              <ul>
                {PROVIDER_PRESENTATION[item.provider].considerations.slice(0, 2).map((consideration) => (
                  <li key={consideration}>{consideration}</li>
                ))}
              </ul>
            </div>
            <em
              className={`whatsapp-provider-option__badge ${whatsappProviderBadgeState(item, selectedProvider)}`}
            >
              {activeProvider === item.provider ? 'Em uso' : whatsappProviderBadge(item, selectedProvider)}
            </em>
            <em className={`whatsapp-provider-option__status is-${item.provider === activeProvider ? state.toLowerCase().replace('_', '-') : 'available'}`}>
              {item.provider === activeProvider
                ? (STATE_LABEL[state] ?? 'Não conectado')
                : item.available
                  ? 'Configurável'
                  : 'Não configurado'}
            </em>
          </button>
        ))}
      </div>
      {selectedProviderOption?.available === false ? (
        <p className="ds-form-hint">Meta Cloud API ainda não configurada no servidor.</p>
      ) : null}
      {selectedProviderIsActive ? (
        <p className="whatsapp-card__status">
          <span aria-hidden="true">{STATE_DOT[state] ?? '⚪'}</span>
          <strong>{STATE_LABEL[state] ?? 'Não conectado'}</strong>
        </p>
      ) : (
        <p className="whatsapp-card__draft-status">{draftMessage}</p>
      )}
      {selectedProviderIsActive && connection.data?.legacy === true && state !== 'CONNECTED' ? (
        <p className="ds-form-hint">Configuração existente. Verifique o status para confirmar.</p>
      ) : null}
      {selectedProviderIsActive && state === 'CONNECTED' && connection.data !== undefined ? (
        <div className="whatsapp-card__connected">
          {connection.data.connectedPhone === null ? null : (
            <p>
              <span>Número</span>
              <strong>{prettyPhone(connection.data.connectedPhone)}</strong>
            </p>
          )}
          {connection.data.connectedName === null ? null : (
            <p>
              <span>Nome</span>
              <strong>{connection.data.connectedName}</strong>
            </p>
          )}
          <p>
            <span>Última verificação</span>
            <strong>
              {connection.data.lastStatusCheckAt === null
                ? '—'
                : timeOf(connection.data.lastStatusCheckAt)}
            </strong>
          </p>
          <small>Atendimento automático ativo.</small>
        </div>
      ) : null}
      {selectedProvider === 'META' ? (
        <div className="whatsapp-meta-form">
          <div className="whatsapp-provider-detail">
            <h3>API Oficial</h3>
            <p>Configuração da Meta Cloud API para operação profissional com webhooks e templates oficiais.</p>
            <div className="whatsapp-provider-detail__columns">
              <div>
                <strong>Vantagens</strong>
                <ul>
                  {PROVIDER_PRESENTATION.META.advantages.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <strong>Pontos a considerar</strong>
                <ul>
                  {PROVIDER_PRESENTATION.META.considerations.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          </div>
          <label>
            Phone Number ID
            <input
              value={metaForm.phoneNumberId}
              onChange={(event) => setMetaForm((value) => ({ ...value, phoneNumberId: event.target.value }))}
              placeholder="Ex.: 1234567890"
            />
          </label>
          <label>
            WhatsApp Business Account ID
            <input
              value={metaForm.businessAccountId}
              onChange={(event) => setMetaForm((value) => ({ ...value, businessAccountId: event.target.value }))}
              placeholder="Ex.: 9876543210"
            />
          </label>
          <label>
            Access Token
            <input
              type="password"
              value={metaForm.accessToken}
              onChange={(event) => setMetaForm((value) => ({ ...value, accessToken: event.target.value }))}
              placeholder={connection.data?.tokenConfigured === true ? '•••••••••••• — deixe vazio para manter o atual' : 'Token da Meta'}
            />
          </label>
          {connection.data?.tokenConfigured === true ? <span className="whatsapp-secret-badge">✓ Token configurado</span> : null}
          <label>
            App Secret
            <input
              type="password"
              value={metaForm.appSecret}
              onChange={(event) => setMetaForm((value) => ({ ...value, appSecret: event.target.value }))}
              placeholder={connection.data?.appSecretConfigured === true ? '•••••••••••• — deixe vazio para manter o atual' : 'App Secret do aplicativo Meta'}
            />
          </label>
          {connection.data?.appSecretConfigured === true ? <span className="whatsapp-secret-badge">✓ App Secret configurado</span> : null}
          <label>
            Versão API
            <input
              value={metaForm.apiVersion}
              onChange={(event) => setMetaForm((value) => ({ ...value, apiVersion: event.target.value }))}
            />
          </label>
          <p className="ds-form-hint">
            A Meta não usa QR Code. As credenciais ficam cifradas no backend e o envio será ativado pelo adapter oficial.
          </p>
          {connection.data?.webhookUrl !== undefined && connection.data.webhookUrl !== null && connection.data.verifyToken !== undefined && connection.data.verifyToken !== null ? (
            <div className="whatsapp-webhook-box">
              <h4>Webhook</h4>
              <p>Use estes dados na configuração de Webhooks do seu aplicativo Meta.</p>
              <label>
                URL de retorno
                <input readOnly value={connection.data.webhookUrl} />
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void navigator.clipboard?.writeText(connection.data?.webhookUrl ?? '')}
              >
                Copiar URL
              </button>
              <label>
                Verify Token
                <input readOnly value={connection.data.verifyToken} />
              </label>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void navigator.clipboard?.writeText(connection.data?.verifyToken ?? '')}
              >
                Copiar Verify Token
              </button>
            </div>
          ) : null}
          <div className="whatsapp-templates-box">
            <div>
              <h4>Templates da API Oficial</h4>
              <p>Infraestrutura da Meta para comunicações automáticas. Não é a personalização do assistente.</p>
            </div>
            {metaTemplates.data !== undefined ? (
              <p className="whatsapp-template-summary">
                {metaTemplates.data.items.length} templates ·{' '}
                {metaTemplates.data.items.filter((item) => item.category === 'UTILITY').length} Utility ·{' '}
                {metaTemplates.data.items.filter((item) => item.category === 'MARKETING').length} Marketing ·{' '}
                {metaTemplates.data.items.filter((item) => item.status === 'APPROVED').length} aprovados
              </p>
            ) : null}
            {metaTemplates.isLoading ? <p className="ds-form-hint">Carregando templates…</p> : null}
            <div className="whatsapp-template-list">
              {(metaTemplates.data?.items ?? []).map((template) => (
                <article key={template.templateName} className="whatsapp-template-item">
                  <div>
                    <strong>{template.friendlyName}</strong>
                    <small>{template.templateName}</small>
                  </div>
                  <span>{template.category}</span>
                  <em>
                    <span aria-hidden="true">{metaTemplateStatusIcon(template.status)}</span>
                    {template.statusLabel}
                  </em>
                  <small>
                    {template.lastCheckedAt === null ? 'Ainda não verificado' : `Verificado às ${timeOf(template.lastCheckedAt)}`}
                  </small>
                  {template.rejectionReason === null ? null : <p>{template.rejectionReason}</p>}
                </article>
              ))}
            </div>
            {allMetaTemplatesCreated(metaTemplates.data?.items) ? (
              <p className="success-message">Todos os templates padrão já foram criados.</p>
            ) : null}
            <div className="form-row whatsapp-card__actions">
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => provisionTemplates.mutate()}
              >
                {metaTemplateProvisionButtonLabel(metaTemplates.data?.items, provisionTemplates.isPending)}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={busy}
                onClick={() => refreshTemplates.mutate()}
              >
                {refreshTemplates.isPending ? 'Atualizando status…' : 'Atualizar status'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {selectedProvider === 'WAPI' ? (
        <div className="whatsapp-provider-detail">
          <h3>API não oficial</h3>
          <p>Uma alternativa prática para conectar seu WhatsApp sem passar pela configuração da Meta.</p>
          <div className="whatsapp-provider-detail__columns">
            <div>
              <strong>Vantagens</strong>
              <ul>
                {PROVIDER_PRESENTATION.WAPI.advantages.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <strong>Pontos a considerar</strong>
              <ul>
                {PROVIDER_PRESENTATION.WAPI.considerations.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
          <p className="whatsapp-provider-detail__note">
            O uso de integrações não oficiais está sujeito às regras do WhatsApp. O Agendei mantém
            mecanismos de conexão e monitoramento, mas não pode garantir disponibilidade contínua
            nem se responsabilizar por eventuais limitações ou bloqueios aplicados pelo WhatsApp.
          </p>
          {selectedProviderIsActive && state === 'NOT_CREATED' ? (
            <p className="ds-form-hint">Você conecta seu número escaneando um QR Code.</p>
          ) : null}
          {selectedProviderIsActive && state === 'CREATED' ? (
            <p className="ds-form-hint">Agora conecte o WhatsApp que será usado pelo estabelecimento.</p>
          ) : null}
        </div>
      ) : null}
      {justConnected ? (
        <p className="success-message">{'✓ WhatsApp conectado com sucesso'}</p>
      ) : null}
      {notice === null ? null : <p className="success-message">{notice}</p>}
      {error === undefined ? null : (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      )}
      {canManage ? (
        <div className="form-row whatsapp-card__actions">
          {selectedProvider === 'META' ? (
            <button
              className="primary-button"
              type="button"
              disabled={busy || selectedProviderOption?.available === false}
              onClick={() => {
                updateProvider.mutate();
              }}
            >
              {updateProvider.isPending ? 'Salvando API Oficial…' : activeProvider === 'META' ? 'Salvar API Oficial' : 'Usar API Oficial'}
            </button>
          ) : null}
          {selectedProvider === 'META' && activeProvider === 'META' ? (
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => {
                createInstance.mutate();
              }}
            >
              {createInstance.isPending ? 'Validando configuração…' : 'Validar API Oficial'}
            </button>
          ) : null}
          {shouldShowWapiActivation(selectedProvider, activeProvider) ? (
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => {
                updateProvider.mutate();
              }}
            >
              Usar API não oficial
            </button>
          ) : null}
          {selectedProvider === 'WAPI' && selectedProviderIsActive && state === 'NOT_CREATED' ? (
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => {
                createInstance.mutate();
              }}
            >
              {createInstance.isPending ? 'Criando conexão…' : 'Conectar WhatsApp'}
            </button>
          ) : null}
          {selectedProvider === 'WAPI' && selectedProviderIsActive && (state === 'CREATED' || state === 'WAITING_QR') ? (
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => {
                requestQr.mutate('qr');
              }}
            >
              {requestQr.isPending ? 'Gerando QR Code…' : 'Gerar QR Code'}
            </button>
          ) : null}
          {selectedProvider === 'WAPI' && selectedProviderIsActive && (state === 'DISCONNECTED' || state === 'ERROR') ? (
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => {
                requestQr.mutate('reconnect');
              }}
            >
              {requestQr.isPending ? 'Gerando QR Code…' : 'Reconectar'}
            </button>
          ) : null}
          {selectedProviderIsActive && provisioned ? (
            <button
              className="secondary-button"
              type="button"
              disabled={busy || connection.isFetching}
              onClick={() => {
                setNotice('Status atualizado agora.');
                void refresh();
              }}
            >
              {connection.isFetching ? 'Atualizando…' : 'Atualizar status'}
            </button>
          ) : null}
          {selectedProviderIsActive && state === 'CONNECTED' ? (
            <button
              className="text-button"
              type="button"
              disabled={busy}
              onClick={() => {
                setDisconnecting(true);
              }}
            >
              Desconectar WhatsApp
            </button>
          ) : null}
        </div>
      ) : null}

      {visibleQrCode === null ? null : (
        <div className="treatment-sheet-backdrop" role="dialog" aria-label="Conectar WhatsApp">
          <div className="treatment-sheet whatsapp-qr">
            <h3>Conectar WhatsApp</h3>
            <ol className="whatsapp-qr__steps">
              <li>Abra o WhatsApp no celular</li>
              <li>{'Vá em Dispositivos conectados'}</li>
              <li>Toque em Conectar dispositivo</li>
              <li>Escaneie este QR Code</li>
            </ol>
            <img
              alt="QR Code para conectar o WhatsApp"
              className="whatsapp-qr__image"
              src={visibleQrCode}
            />
            <p className="whatsapp-qr__waiting" aria-live="polite">
              {requestQr.isPending ? 'Atualizando QR Code…' : 'Aguardando conexão…'}
            </p>
            {requestQr.error instanceof Error ? (
              <p className="form-error" role="alert">
                Este QR Code expirou. Gere um novo para continuar.
              </p>
            ) : null}
            <div className="ds-form-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={requestQr.isPending}
                onClick={() => {
                  requestQr.mutate('qr');
                }}
              >
                Atualizar QR Code
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={connection.isFetching}
                onClick={() => {
                  void refresh();
                }}
              >
                {'Já escaneei — verificar'}
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setQrCode(null);
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {disconnecting ? (
        <div className="treatment-sheet-backdrop" role="dialog" aria-label="Desconectar WhatsApp">
          <div className="treatment-sheet">
            <h3>Desconectar WhatsApp?</h3>
            <p>
              O atendimento automático e as notificações por WhatsApp deixarão de funcionar até uma
              nova conexão.
            </p>
            <div className="ds-form-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setDisconnecting(false);
                }}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={disconnect.isPending}
                onClick={() => {
                  disconnect.mutate();
                }}
              >
                {disconnect.isPending ? 'Desconectando…' : 'Desconectar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
