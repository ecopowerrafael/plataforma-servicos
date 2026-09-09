import {
  IconCheck,
  IconCloud,
  IconCopy,
  IconInfoCircle,
  IconPlugConnected,
  IconPlugOff,
  IconQrcode,
  IconRefresh,
} from '@tabler/icons-react';
import {
  TenantMetaTemplatesResponseSchema,
  UpdateWhatsAppProviderSchema,
  WhatsAppConnectionSchema,
  WhatsAppProviderSelectionResultSchema,
  WhatsAppProvidersResponseSchema,
  WhatsAppQrCodeSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { httpClient } from '../../lib/http.js';

const STATE_LABEL: Record<string, string> = {
  NOT_CREATED: 'Não configurado',
  CREATED: 'Configurado',
  WAITING_QR: 'Aguardando QR Code',
  CONNECTED: 'Conectado',
  DISCONNECTED: 'Desconectado',
  ERROR: 'Desconectado',
};

const TEMPLATE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Em análise',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  PAUSED: 'Pausado',
  DISABLED: 'Desativado',
  UNKNOWN: 'Desconhecido',
};

type ProviderId = 'WAPI' | 'META';
type MetaTab = 'account' | 'webhook' | 'templates';
type ProviderCardOption = {
  provider: ProviderId;
  available: boolean;
  configured?: boolean;
  phoneNumberId?: string | null;
  businessAccountId?: string | null;
  apiVersion?: string | null;
  webhookUrl?: string | null;
  verifyToken?: string | null;
  tokenConfigured?: boolean;
  appSecretConfigured?: boolean;
};

const PROVIDER_PRESENTATION: Record<
  ProviderId,
  { name: string; subtitle: string; description: string; advantages: string[]; considerations: string[] }
> = {
  WAPI: {
    name: 'API não oficial',
    subtitle: 'Conexão por QR Code',
    description: 'Conecte seu número de forma rápida usando o QR Code do WhatsApp.',
    advantages: ['Configuração simples', 'Conexão rápida por QR Code', 'Não exige configuração na Meta', 'Boa opção para começar rapidamente'],
    considerations: [
      'Pode exigir nova leitura do QR Code em caso de desconexão',
      'Depende do funcionamento do WhatsApp Web',
      'Atualizações do WhatsApp podem afetar temporariamente a conexão',
    ],
  },
  META: {
    name: 'API Oficial',
    subtitle: 'Meta Cloud API',
    description: 'Integração direta com a plataforma oficial do WhatsApp Business da Meta.',
    advantages: [
      'Integração oficial da Meta',
      'Maior estabilidade para uso profissional',
      'Webhooks oficiais',
      'Indicada para operações de maior volume',
      'Templates oficiais para mensagens automáticas',
    ],
    considerations: [
      'Configuração inicial exige conta/aplicativo Meta',
      'Algumas mensagens precisam de templates aprovados',
      'A aprovação depende da Meta',
      'A Meta pode aplicar cobranças conforme suas regras vigentes',
    ],
  },
};

export function metaTemplateStatusIcon(status: string) {
  return TEMPLATE_STATUS_LABEL[status] ?? TEMPLATE_STATUS_LABEL.UNKNOWN;
}

export function metaTemplateProvisionButtonLabel(items: Array<{ exists: boolean }> | undefined, loading: boolean) {
  if (loading) return 'Criando templates…';
  return items?.some((item) => item.exists) === true ? 'Completar templates padrão' : 'Criar templates padrão';
}

export function allMetaTemplatesCreated(items: Array<{ exists: boolean }> | undefined) {
  return items !== undefined && items.length > 0 && items.every((item) => item.exists);
}

export function whatsappProviderBadge(item: ProviderCardOption, activeProvider: ProviderId) {
  if (activeProvider === item.provider) return 'EM USO';
  return item.configured === true ? 'CONFIGURADA' : 'NÃO CONFIGURADA';
}

export function whatsappProviderBadgeState(item: ProviderCardOption, activeProvider: ProviderId) {
  if (activeProvider === item.provider) return 'is-active';
  return item.configured === true ? 'is-configured' : 'is-not-configured';
}

export function whatsappProviderDraftMessage(managedProvider: ProviderId, activeProvider: ProviderId) {
  if (managedProvider === activeProvider) return null;
  return 'Você está gerenciando uma opção diferente da conexão atual. A troca só acontece pelo botão de uso explícito.';
}

export function shouldShowWapiActivation(managedProvider: ProviderId, activeProvider: ProviderId) {
  return managedProvider === 'WAPI' && activeProvider !== 'WAPI';
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const prettyPhone = (phone: string | null | undefined) => {
  if (phone == null) return null;
  const digits = phone.replace(/\D/gu, '');
  if (digits.length < 12) return phone;
  const rest = digits.slice(4);
  return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
};

function ProviderIcon({ provider }: { provider: ProviderId }) {
  return provider === 'META' ? <IconCloud size={24} /> : <IconQrcode size={24} />;
}

function StatusBadge({ children, tone }: { children: string; tone: 'primary' | 'success' | 'danger' | 'neutral' | 'warning' }) {
  return <span className={`whatsapp-status-badge is-${tone}`}>{children}</span>;
}

function connectionTone(state: string): 'success' | 'danger' | 'neutral' | 'warning' {
  if (state === 'CONNECTED') return 'success';
  if (state === 'WAITING_QR') return 'warning';
  if (state === 'DISCONNECTED' || state === 'ERROR') return 'danger';
  return 'neutral';
}

function templateStatusTone(status: string): 'success' | 'danger' | 'neutral' | 'warning' {
  if (status === 'APPROVED') return 'success';
  if (status === 'PENDING') return 'warning';
  if (status === 'REJECTED') return 'danger';
  return 'neutral';
}

export function WhatsAppConnectionCard({ tenantPublicId, canManage }: { tenantPublicId: string; canManage: boolean }) {
  const client = useQueryClient();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState<ProviderId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [managedProvider, setManagedProvider] = useState<ProviderId>('WAPI');
  const [metaTab, setMetaTab] = useState<MetaTab>('account');
  const [metaForm, setMetaForm] = useState({ phoneNumberId: '', businessAccountId: '', accessToken: '', appSecret: '', apiVersion: 'v23.0' });
  const queryKey = ['tenant', tenantPublicId, 'whatsapp', 'connection'];

  const providers = useQuery({
    queryKey: ['tenant', tenantPublicId, 'whatsapp', 'providers'],
    queryFn: () => httpClient.request('/tenant/integrations/whatsapp/providers', { schema: WhatsAppProvidersResponseSchema, tenantPublicId }),
    retry: false,
  });
  const connection = useQuery({
    queryKey,
    queryFn: () => httpClient.request('/tenant/integrations/whatsapp/status', { schema: WhatsAppConnectionSchema, tenantPublicId }),
    refetchInterval: qrCode === null ? false : 4000,
    retry: false,
  });
  const metaTemplates = useQuery({
    queryKey: ['tenant', tenantPublicId, 'whatsapp', 'meta', 'templates'],
    queryFn: () => httpClient.request('/tenant/integrations/whatsapp/meta/templates', { schema: TenantMetaTemplatesResponseSchema, tenantPublicId }),
    enabled: managedProvider === 'META' && metaTab === 'templates',
    retry: false,
  });

  const activeProvider = connection.data?.provider ?? 'WAPI';
  const state = connection.data?.state ?? 'NOT_CREATED';
  const available = connection.data?.available ?? true;
  const provisioned = connection.data?.provisioned ?? false;
  const activePresentation = PROVIDER_PRESENTATION[activeProvider];
  const managedPresentation = PROVIDER_PRESENTATION[managedProvider];
  const providerItems = providers.data?.items ?? [
    { provider: 'WAPI' as const, available: true, configured: activeProvider === 'WAPI' },
    { provider: 'META' as const, available: true, configured: activeProvider === 'META' },
  ];
  const selectedProviderOption = providerItems.find((item) => item.provider === managedProvider);
  const managedProviderIsActive = managedProvider === activeProvider;
  const metaConnectionDetails = managedProvider === 'META'
    ? {
        phoneNumberId: selectedProviderOption?.phoneNumberId ?? (activeProvider === 'META' ? connection.data?.phoneNumberId : null) ?? '',
        businessAccountId: selectedProviderOption?.businessAccountId ?? (activeProvider === 'META' ? connection.data?.businessAccountId : null) ?? '',
        apiVersion: selectedProviderOption?.apiVersion ?? (activeProvider === 'META' ? connection.data?.apiVersion : null) ?? 'v23.0',
        webhookUrl: selectedProviderOption?.webhookUrl ?? (activeProvider === 'META' ? connection.data?.webhookUrl : null) ?? null,
        verifyToken: selectedProviderOption?.verifyToken ?? (activeProvider === 'META' ? connection.data?.verifyToken : null) ?? null,
        tokenConfigured: selectedProviderOption?.tokenConfigured ?? (activeProvider === 'META' ? connection.data?.tokenConfigured : false) ?? false,
        appSecretConfigured: selectedProviderOption?.appSecretConfigured ?? (activeProvider === 'META' ? connection.data?.appSecretConfigured : false) ?? false,
      }
    : null;
  const savedCredentials = metaConnectionDetails?.tokenConfigured === true || metaConnectionDetails?.appSecretConfigured === true;
  const accountIncomplete = managedProvider === 'META' && (metaForm.phoneNumberId.trim() === '' || metaForm.businessAccountId.trim() === '' || metaForm.apiVersion.trim() === '');
  const draftMessage = whatsappProviderDraftMessage(managedProvider, activeProvider);
  const templateSummary = useMemo(() => {
    const items = metaTemplates.data?.items ?? [];
    return {
      total: items.length,
      utility: items.filter((item) => item.category === 'UTILITY').length,
      marketing: items.filter((item) => item.category === 'MARKETING').length,
      approved: items.filter((item) => item.status === 'APPROVED').length,
    };
  }, [metaTemplates.data?.items]);

  useEffect(() => {
    if (connection.data?.provider !== undefined) setManagedProvider(connection.data.provider);
  }, [connection.data?.provider]);

  useEffect(() => {
    if (managedProvider !== 'META' || metaConnectionDetails === null) return;
    setMetaForm((value) => ({
      ...value,
      phoneNumberId: metaConnectionDetails.phoneNumberId,
      businessAccountId: metaConnectionDetails.businessAccountId,
      apiVersion: metaConnectionDetails.apiVersion,
      accessToken: '',
      appSecret: '',
    }));
  }, [managedProvider, metaConnectionDetails?.phoneNumberId, metaConnectionDetails?.businessAccountId, metaConnectionDetails?.apiVersion]);

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey }),
      client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'whatsapp', 'providers'] }),
    ]);
  };
  const createInstance = useMutation({
    mutationFn: () => httpClient.request('/tenant/integrations/whatsapp/instance', { method: 'POST', body: {}, schema: WhatsAppConnectionSchema, tenantPublicId }),
    onSuccess: async () => {
      setNotice('Conexão preparada. Gere o QR Code para conectar.');
      await refresh();
    },
  });
  const updateProvider = useMutation({
    mutationFn: (provider: ProviderId) =>
      httpClient.request('/tenant/integrations/whatsapp/provider', {
        method: 'PUT',
        body: UpdateWhatsAppProviderSchema.parse(
          provider === 'WAPI'
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
      setConfirmSwitch(null);
      setNotice('Configuração salva com sucesso.');
      await refresh();
    },
  });
  const provisionTemplates = useMutation({
    mutationFn: () => httpClient.request('/tenant/integrations/whatsapp/meta/templates/provision', { method: 'POST', body: {}, schema: TenantMetaTemplatesResponseSchema, tenantPublicId }),
    onSuccess: async () => {
      setNotice('Templates atualizados.');
      await client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'whatsapp', 'meta', 'templates'] });
    },
  });
  const refreshTemplates = useMutation({
    mutationFn: () => httpClient.request('/tenant/integrations/whatsapp/meta/templates/refresh', { method: 'POST', body: {}, schema: TenantMetaTemplatesResponseSchema, tenantPublicId }),
    onSuccess: async () => {
      setNotice('Status dos templates atualizado.');
      await client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'whatsapp', 'meta', 'templates'] });
    },
  });
  const requestQr = useMutation({
    mutationFn: (path: 'qr' | 'reconnect') => httpClient.request(`/tenant/integrations/whatsapp/${path}`, { method: 'POST', body: {}, schema: WhatsAppQrCodeSchema, tenantPublicId }),
    onSuccess: async (data) => {
      setQrCode(data.qrCode);
      setNotice(null);
      await refresh();
    },
  });
  const disconnect = useMutation({
    mutationFn: () => httpClient.request('/tenant/integrations/whatsapp/disconnect', { method: 'POST', body: {}, schema: WhatsAppConnectionSchema, tenantPublicId }),
    onSuccess: async () => {
      setNotice('WhatsApp desconectado.');
      await refresh();
    },
  });

  const busy = createInstance.isPending || requestQr.isPending || disconnect.isPending || updateProvider.isPending || provisionTemplates.isPending || refreshTemplates.isPending;
  const accountError = [createInstance.error, requestQr.error, disconnect.error, updateProvider.error, connection.error, providers.error].find((item): item is Error => item instanceof Error);
  const templateError = [provisionTemplates.error, refreshTemplates.error, metaTemplates.error].find((item): item is Error => item instanceof Error);

  if (!available) {
    return (
      <section className="whatsapp-connection-dashboard">
        <div className="whatsapp-panel">
          <h2>Conexão do WhatsApp</h2>
          <p>Disponível em outros planos. <a href="/planos">Ver planos</a></p>
        </div>
      </section>
    );
  }

  const openProvider = (provider: ProviderId) => {
    setManagedProvider(provider);
    setQrCode(null);
    setConfirmSwitch(null);
    setNotice(null);
  };
  const switchProvider = (provider: ProviderId) => updateProvider.mutate(provider);

  return (
    <section className="whatsapp-connection-dashboard">
      <header className="whatsapp-connection-hero">
        <p className="eyebrow">INTEGRAÇÃO</p>
        <h1>Conexão do WhatsApp</h1>
        <p>Escolha como o Agendei se conecta ao WhatsApp do seu estabelecimento.</p>
      </header>

      <section className="whatsapp-current-card" aria-label="Conexão atual">
        <div className="whatsapp-provider-icon" aria-hidden="true"><ProviderIcon provider={activeProvider} /></div>
        <div>
          <p className="whatsapp-section-kicker">CONEXÃO ATUAL</p>
          <h2>{activePresentation.name}</h2>
          <span>{activePresentation.subtitle}</span>
          <dl className="whatsapp-current-card__facts">
            <div><dt>Número</dt><dd>{prettyPhone(connection.data?.connectedPhone) ?? 'Ainda não identificado'}</dd></div>
            <div><dt>Última verificação</dt><dd>{connection.data?.lastStatusCheckAt == null ? 'Ainda não verificada' : timeOf(connection.data.lastStatusCheckAt)}</dd></div>
          </dl>
        </div>
        <div className="whatsapp-current-card__actions">
          <div className="whatsapp-badge-row">
            <StatusBadge tone="primary">EM USO</StatusBadge>
            <StatusBadge tone={connectionTone(state)}>{STATE_LABEL[state] ?? 'Não configurado'}</StatusBadge>
          </div>
          <button className="secondary-button" type="button" onClick={() => openProvider(activeProvider)}>Gerenciar conexão</button>
        </div>
      </section>

      <section className="whatsapp-section-block">
        <div className="whatsapp-section-heading">
          <h2>Formas de conexão</h2>
          <p>Escolha a opção mais adequada para a operação do seu estabelecimento.</p>
        </div>
        <div className="whatsapp-provider-grid" role="list" aria-label="Formas de conexão do WhatsApp">
          {providerItems.map((item) => {
            const presentation = PROVIDER_PRESENTATION[item.provider];
            const isActive = activeProvider === item.provider;
            const isManaged = managedProvider === item.provider;
            return (
              <article key={item.provider} className={`whatsapp-provider-option ${isManaged ? 'is-selected' : ''} ${isActive ? 'is-active-provider' : ''}`}>
                <button type="button" className="whatsapp-provider-option__body" disabled={!item.available} onClick={() => item.available && openProvider(item.provider)}>
                  <div className="whatsapp-provider-option__top">
                    <span className="whatsapp-provider-icon" aria-hidden="true"><ProviderIcon provider={item.provider} /></span>
                    <StatusBadge tone={isActive ? 'primary' : 'neutral'}>{whatsappProviderBadge(item, activeProvider)}</StatusBadge>
                  </div>
                  <span className="whatsapp-provider-option__label">{presentation.name}</span>
                  <strong>{presentation.subtitle}</strong>
                  <small>{presentation.description}</small>
                  <div className="whatsapp-provider-option__lists">
                    <div>
                      <span>Vantagens</span>
                      <ul className="whatsapp-check-list">
                        {presentation.advantages.map((advantage) => <li key={advantage}><IconCheck size={15} aria-hidden="true" />{advantage}</li>)}
                      </ul>
                    </div>
                    <div>
                      <span>Pontos a considerar</span>
                      <ul>{presentation.considerations.map((consideration) => <li key={consideration}>{consideration}</li>)}</ul>
                    </div>
                  </div>
                  {item.provider === 'WAPI' ? (
                    <p className="whatsapp-provider-note">
                      <IconInfoCircle size={16} aria-hidden="true" />
                      Esta conexão utiliza uma integração não oficial do WhatsApp. O Agendei trabalha para manter a conexão estável, porém eventuais limitações ou bloqueios aplicados pelo WhatsApp não estão sob nosso controle.
                    </p>
                  ) : null}
                </button>
                {canManage ? (
                  <div className="whatsapp-provider-option__footer">
                    {isActive ? (
                      <button className="secondary-button" type="button" onClick={() => openProvider(item.provider)}>
                        {item.provider === 'META' ? 'Gerenciar API Oficial' : 'Gerenciar conexão'}
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        type="button"
                        disabled={!item.available || busy}
                        onClick={() => {
                          openProvider(item.provider);
                          if (item.configured === true) setConfirmSwitch(item.provider);
                        }}
                      >
                        {item.configured === true ? (item.provider === 'META' ? 'Usar API Oficial' : 'Usar API não oficial') : item.provider === 'META' ? 'Configurar API Oficial' : 'Configurar'}
                      </button>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="whatsapp-managed-panel" aria-label={`Configuração de ${managedPresentation.name}`}>
        <header className="whatsapp-managed-panel__header">
          <div className="whatsapp-provider-icon" aria-hidden="true"><ProviderIcon provider={managedProvider} /></div>
          <div>
            <h2>{managedPresentation.name}</h2>
            <span>{managedPresentation.subtitle}</span>
            <p>{managedProvider === 'META' ? 'Gerencie os dados, webhook e templates da sua integração oficial.' : 'Gerencie a conexão por QR Code e o status do número conectado.'}</p>
            {draftMessage === null ? null : <small className="whatsapp-managed-panel__hint">{draftMessage}</small>}
          </div>
          <StatusBadge tone={managedProviderIsActive ? 'primary' : 'neutral'}>
            {managedProviderIsActive ? 'EM USO' : selectedProviderOption?.configured === true ? 'CONFIGURADA' : 'NÃO CONFIGURADA'}
          </StatusBadge>
        </header>

        {confirmSwitch === null ? null : (
          <div className="whatsapp-inline-confirm" role="alert">
            <div><strong>Alterar conexão do WhatsApp?</strong><p>Suas configurações atuais serão preservadas e você poderá voltar depois.</p></div>
            <div>
              <button className="secondary-button" type="button" onClick={() => setConfirmSwitch(null)}>Cancelar</button>
              <button className="primary-button" type="button" disabled={busy} onClick={() => switchProvider(confirmSwitch)}>Confirmar troca</button>
            </div>
          </div>
        )}
        {notice === null ? null : <p className="whatsapp-inline-success">{notice}</p>}

        {managedProvider === 'WAPI' ? (
          <div className="whatsapp-wapi-panel">
            <div className="whatsapp-connection-status">
              <div className="whatsapp-provider-icon" aria-hidden="true">{state === 'CONNECTED' ? <IconPlugConnected size={24} /> : <IconPlugOff size={24} />}</div>
              <div>
                <h3>Status da conexão</h3>
                <p>{state === 'CONNECTED' ? 'Seu WhatsApp está conectado.' : 'Conecte seu WhatsApp lendo o QR Code.'}</p>
                <dl>
                  <div><dt>Número conectado</dt><dd>{prettyPhone(connection.data?.connectedPhone) ?? 'Ainda não identificado'}</dd></div>
                  <div><dt>Estado</dt><dd>{STATE_LABEL[state] ?? 'Não configurado'}</dd></div>
                </dl>
              </div>
            </div>
            {qrCode === null ? null : (
              <div className="whatsapp-inline-qr" aria-live="polite">
                <div><h3>QR Code para conexão</h3><p>Abra o WhatsApp no celular, acesse Dispositivos conectados e escaneie o código.</p></div>
                <img alt="QR Code para conectar o WhatsApp" src={qrCode} />
              </div>
            )}
            {accountError === undefined ? null : <p className="form-error">{accountError.message}</p>}
            {canManage ? (
              <footer className="whatsapp-panel-actions">
                {state === 'CONNECTED' ? (
                  <>
                    <button className="secondary-button" type="button" disabled={busy || connection.isFetching} onClick={() => void refresh()}><IconRefresh size={16} aria-hidden="true" />Atualizar status</button>
                    <button className="text-button" type="button" disabled={busy} onClick={() => disconnect.mutate()}>Desconectar</button>
                  </>
                ) : (
                  <>
                    {provisioned ? (
                      <button className="primary-button" type="button" disabled={busy} onClick={() => requestQr.mutate(state === 'DISCONNECTED' || state === 'ERROR' ? 'reconnect' : 'qr')}>
                        {requestQr.isPending ? 'Gerando QR Code…' : state === 'DISCONNECTED' || state === 'ERROR' ? 'Reconectar' : 'Gerar QR Code'}
                      </button>
                    ) : (
                      <button className="primary-button" type="button" disabled={busy} onClick={() => createInstance.mutate()}>
                        {createInstance.isPending ? 'Preparando conexão…' : 'Configurar'}
                      </button>
                    )}
                    {shouldShowWapiActivation(managedProvider, activeProvider) ? (
                      <button className="secondary-button" type="button" disabled={busy} onClick={() => setConfirmSwitch('WAPI')}>Usar API não oficial</button>
                    ) : null}
                  </>
                )}
              </footer>
            ) : null}
          </div>
        ) : (
          <div className="whatsapp-meta-panel">
            <div className="whatsapp-tablist" role="tablist" aria-label="Configuração da API Oficial">
              {[
                ['account', 'Dados da conta'],
                ['webhook', 'Webhook'],
                ['templates', 'Templates'],
              ].map(([tab, label]) => (
                <button key={tab} type="button" role="tab" aria-selected={metaTab === tab} className={metaTab === tab ? 'is-active' : ''} onClick={() => setMetaTab(tab as MetaTab)}>
                  {label}
                </button>
              ))}
            </div>

            {metaTab === 'account' ? (
              <section className="whatsapp-tab-panel">
                <header><h3>Dados da conta</h3><p>Informações utilizadas para conectar o Agendei à sua conta da Meta.</p></header>
                <div className="whatsapp-form-grid">
                  <label><span>Phone Number ID</span><input value={metaForm.phoneNumberId} onChange={(event) => setMetaForm((value) => ({ ...value, phoneNumberId: event.target.value }))} /><small>Identificador do número configurado na Meta.</small></label>
                  <label><span>WhatsApp Business Account ID</span><input value={metaForm.businessAccountId} onChange={(event) => setMetaForm((value) => ({ ...value, businessAccountId: event.target.value }))} /><small>Identificador da conta WhatsApp Business.</small></label>
                  <label><span>Access Token</span><input type="password" value={metaForm.accessToken} placeholder={metaConnectionDetails?.tokenConfigured === true ? '••••••••••••••••••••' : 'Token da Meta'} onChange={(event) => setMetaForm((value) => ({ ...value, accessToken: event.target.value }))} /><small>Deixe vazio para manter o token atual.</small>{metaConnectionDetails?.tokenConfigured === true ? <StatusBadge tone="success">Token configurado</StatusBadge> : null}</label>
                  <label><span>App Secret</span><input type="password" value={metaForm.appSecret} placeholder={metaConnectionDetails?.appSecretConfigured === true ? '••••••••••••••••' : 'App Secret do aplicativo Meta'} onChange={(event) => setMetaForm((value) => ({ ...value, appSecret: event.target.value }))} /><small>Deixe vazio para manter o App Secret atual.</small>{metaConnectionDetails?.appSecretConfigured === true ? <StatusBadge tone="success">App Secret configurado</StatusBadge> : null}</label>
                  <label><span>Versão da API</span><input value={metaForm.apiVersion} onChange={(event) => setMetaForm((value) => ({ ...value, apiVersion: event.target.value }))} placeholder="v23.0" /></label>
                </div>
                {accountError === undefined ? null : <p className="form-error">{accountError.message}</p>}
                <footer className="whatsapp-panel-actions">
                  <span className={accountIncomplete ? 'whatsapp-account-state is-incomplete' : 'whatsapp-account-state is-complete'}>{accountIncomplete ? 'Configuração incompleta' : savedCredentials ? 'Credenciais salvas' : 'Dados prontos para salvar'}</span>
                  <div>
                    {managedProviderIsActive ? <button className="secondary-button" type="button" disabled={busy} onClick={() => createInstance.mutate()}>Validar configuração</button> : null}
                    <button className="primary-button" type="button" disabled={busy || selectedProviderOption?.available === false} onClick={() => updateProvider.mutate('META')}>
                      {updateProvider.isPending ? 'Salvando…' : managedProviderIsActive ? 'Salvar alterações' : 'Salvar e usar API Oficial'}
                    </button>
                  </div>
                </footer>
              </section>
            ) : null}

            {metaTab === 'webhook' ? (
              <section className="whatsapp-tab-panel">
                <header><h3>Webhook</h3><p>Use estes dados na configuração de Webhooks do seu aplicativo Meta.</p></header>
                <StatusBadge tone={metaConnectionDetails?.webhookUrl == null ? 'neutral' : 'success'}>{metaConnectionDetails?.webhookUrl == null ? 'Dados indisponíveis' : 'Dados disponíveis'}</StatusBadge>
                <div className="whatsapp-copy-fields">
                  <label><span>URL de retorno</span><div><input readOnly value={metaConnectionDetails?.webhookUrl ?? ''} aria-readonly="true" /><button type="button" className="secondary-button" aria-label="Copiar URL de retorno" onClick={() => void navigator.clipboard?.writeText(metaConnectionDetails?.webhookUrl ?? '')}><IconCopy size={16} aria-hidden="true" />Copiar</button></div></label>
                  <label><span>Verify Token</span><div><input readOnly value={metaConnectionDetails?.verifyToken ?? ''} aria-readonly="true" /><button type="button" className="secondary-button" aria-label="Copiar Verify Token" onClick={() => void navigator.clipboard?.writeText(metaConnectionDetails?.verifyToken ?? '')}><IconCopy size={16} aria-hidden="true" />Copiar</button></div></label>
                </div>
              </section>
            ) : null}

            {metaTab === 'templates' ? (
              <section className="whatsapp-tab-panel">
                <header><h3>Templates da API Oficial</h3><p>Templates necessários para mensagens automáticas enviadas fora da janela de atendimento.</p></header>
                <div className="whatsapp-template-metrics">
                  <article><strong>{templateSummary.total}</strong><span>Templates</span></article>
                  <article><strong>{templateSummary.utility}</strong><span>Utility</span></article>
                  <article><strong>{templateSummary.marketing}</strong><span>Marketing</span></article>
                  <article><strong>{templateSummary.approved}</strong><span>Aprovados</span></article>
                </div>
                {templateError === undefined ? null : (
                  <div className="whatsapp-template-error" role="alert"><p>Não foi possível atualizar os templates agora.</p><button className="secondary-button" type="button" onClick={() => void metaTemplates.refetch()}>Tentar novamente</button></div>
                )}
                <div className="whatsapp-template-table" role="table" aria-label="Templates da API Oficial">
                  <div role="row" className="whatsapp-template-table__head"><span>Template</span><span>Categoria</span><span>Status</span><span>Atualizado</span></div>
                  {(metaTemplates.data?.items ?? []).map((template) => (
                    <div role="row" key={template.templateName}>
                      <span><strong>{template.friendlyName}</strong><small>{template.templateName}</small></span>
                      <span>{template.category}</span>
                      <span><StatusBadge tone={templateStatusTone(template.status)}>{metaTemplateStatusIcon(template.status)}</StatusBadge></span>
                      <span>{template.lastCheckedAt === null ? 'Não verificado' : timeOf(template.lastCheckedAt)}</span>
                    </div>
                  ))}
                </div>
                <footer className="whatsapp-panel-actions">
                  {allMetaTemplatesCreated(metaTemplates.data?.items) ? <span className="whatsapp-account-state is-complete">Todos os templates padrão já foram criados.</span> : <span />}
                  <div>
                    {!allMetaTemplatesCreated(metaTemplates.data?.items) ? <button className="secondary-button" type="button" disabled={busy} onClick={() => provisionTemplates.mutate()}>{metaTemplateProvisionButtonLabel(metaTemplates.data?.items, provisionTemplates.isPending)}</button> : null}
                    <button className="secondary-button" type="button" disabled={busy} onClick={() => refreshTemplates.mutate()}>Atualizar status</button>
                  </div>
                </footer>
              </section>
            ) : null}
          </div>
        )}
      </section>
    </section>
  );
}
