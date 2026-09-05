import { WhatsAppConnectionSchema, WhatsAppQrCodeSchema } from '@plataforma/shared';
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
  const queryKey = ['tenant', tenantPublicId, 'whatsapp', 'connection'];

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
  const available = connection.data?.available ?? true;
  const provisioned = connection.data?.provisioned ?? false;

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

  const busy = createInstance.isPending || requestQr.isPending || disconnect.isPending;
  const error = [createInstance.error, requestQr.error, disconnect.error, connection.error].find(
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
      {state === 'NOT_CREATED' ? (
        <p className="ds-form-hint">
          Você conecta seu número escaneando um QR Code. Não é necessário criar conta em outro
          serviço.
        </p>
      ) : null}
      {state === 'CREATED' ? (
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
          {state === 'NOT_CREATED' ? (
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
          {state === 'CREATED' || state === 'WAITING_QR' ? (
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
          {state === 'DISCONNECTED' || state === 'ERROR' ? (
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
