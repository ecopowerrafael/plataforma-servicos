import {
  UpdateWhatsAppProviderSchema,
  WhatsAppConnectionSchema,
  WhatsAppProviderSelectionResultSchema,
  WhatsAppProvidersResponseSchema,
  WhatsAppQrCodeSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

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

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const prettyPhone = (phone: string | null) => {
  if (phone === null) return null;
  const digits = phone.replace(/\D/gu, '');
  if (digits.length < 12) return phone;
  const rest = digits.slice(4);
  return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
};

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
  const state = connection.data?.state ?? 'NOT_CREATED';
  const activeProvider = connection.data?.provider ?? 'WAPI';
  const available = connection.data?.available ?? true;
  const provisioned = connection.data?.provisioned ?? false;
  const currentProvider = selectedProvider === activeProvider ? activeProvider : selectedProvider;

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
          currentProvider === 'WAPI'
            ? { provider: 'WAPI' }
            : {
                provider: 'META',
                phoneNumberId: metaForm.phoneNumberId,
                businessAccountId: metaForm.businessAccountId,
                accessToken: metaForm.accessToken,
                apiVersion: metaForm.apiVersion,
              },
        ),
        schema: WhatsAppProviderSelectionResultSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setNotice(currentProvider === 'META' ? 'Configuração Meta salva.' : 'Método W-API selecionado.');
      await refresh();
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

  const busy = createInstance.isPending || requestQr.isPending || disconnect.isPending || updateProvider.isPending;
  const error = [createInstance.error, requestQr.error, disconnect.error, updateProvider.error, connection.error, providers.error].find(
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
      <legend>WhatsApp</legend>
      <p className="whatsapp-card__intro">
        Automatize seus agendamentos e o atendimento pelo WhatsApp.
      </p>
      <div className="whatsapp-provider-grid" role="list" aria-label="Método de conexão">
        {(providers.data?.items ?? []).map((item) => (
          <button
            key={item.provider}
            type="button"
            className={`whatsapp-provider-option ${currentProvider === item.provider ? 'is-selected' : ''}`}
            onClick={() => {
              setSelectedProvider(item.provider);
              setQrCode(null);
            }}
          >
            <span>{item.label}</span>
            <strong>{item.provider === 'META' ? 'Meta Cloud API' : 'W-API'}</strong>
            <small>{item.description}</small>
            <em>{item.available ? 'Disponível' : 'Em configuração'}</em>
          </button>
        ))}
      </div>
      <p className="whatsapp-card__status">
        <span aria-hidden="true">{STATE_DOT[state] ?? '⚪'}</span>
        <strong>{STATE_LABEL[state] ?? 'Não conectado'}</strong>
      </p>
      {connection.data?.legacy === true && state !== 'CONNECTED' ? (
        <p className="ds-form-hint">Configuração existente. Verifique o status para confirmar.</p>
      ) : null}
      {state === 'CONNECTED' && connection.data !== undefined ? (
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
      {currentProvider === 'META' ? (
        <div className="whatsapp-meta-form">
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
              placeholder="Token da Meta"
            />
          </label>
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
        </div>
      ) : null}
      {currentProvider === 'WAPI' && state === 'NOT_CREATED' ? (
        <p className="ds-form-hint">
          Você conecta seu número escaneando um QR Code. Não é necessário criar conta em outro
          serviço.
        </p>
      ) : null}
      {currentProvider === 'WAPI' && state === 'CREATED' ? (
        <p className="ds-form-hint">
          Agora conecte o WhatsApp que será usado pelo estabelecimento.
        </p>
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
          {currentProvider === 'META' ? (
            <button
              className="primary-button"
              type="button"
              disabled={busy}
              onClick={() => {
                updateProvider.mutate();
              }}
            >
              {updateProvider.isPending ? 'Salvando Meta…' : 'Salvar Meta Cloud API'}
            </button>
          ) : null}
          {currentProvider === 'META' && activeProvider === 'META' ? (
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => {
                createInstance.mutate();
              }}
            >
              {createInstance.isPending ? 'Validando configuração…' : 'Validar configuração'}
            </button>
          ) : null}
          {currentProvider === 'WAPI' && activeProvider !== 'WAPI' ? (
            <button
              className="secondary-button"
              type="button"
              disabled={busy}
              onClick={() => {
                updateProvider.mutate();
              }}
            >
              Usar W-API
            </button>
          ) : null}
          {currentProvider === 'WAPI' && state === 'NOT_CREATED' ? (
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
          {currentProvider === 'WAPI' && (state === 'CREATED' || state === 'WAITING_QR') ? (
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
          {currentProvider === 'WAPI' && (state === 'DISCONNECTED' || state === 'ERROR') ? (
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
          {provisioned ? (
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
          {state === 'CONNECTED' ? (
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
