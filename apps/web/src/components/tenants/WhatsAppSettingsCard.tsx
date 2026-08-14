import {
  UpsertWhatsAppConfigSchema,
  WhatsAppButtonTestRequestSchema,
  WhatsAppButtonTestResponseSchema,
  WhatsAppConfigSchema,
  WhatsAppConnectionTestSchema,
  WhatsAppConnectionTestRequestSchema,
  WhatsAppLastInboundEventSchema,
  WhatsAppWebhookConfigResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

export function WhatsAppSettingsCard({ tenantPublicId, canManage }: { tenantPublicId: string; canManage: boolean }) {
  const client = useQueryClient();
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const config = useQuery({
    queryKey: ['tenant', tenantPublicId, 'whatsapp'],
    queryFn: () => httpClient.request('/tenant/integrations/whatsapp', { schema: WhatsAppConfigSchema, tenantPublicId }),
    retry: false,
  });
  const effectiveInstanceId = instanceId ?? config.data?.instanceId ?? '';
  const save = useMutation({
    mutationFn: (active: boolean) => httpClient.request('/tenant/integrations/whatsapp', {
      method: 'PUT',
      body: UpsertWhatsAppConfigSchema.parse({ active, instanceId: effectiveInstanceId, ...(token.trim() === '' ? {} : { token }) }),
      schema: WhatsAppConfigSchema,
      tenantPublicId,
    }),
    onSuccess: () => {
      setToken('');
      void client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'whatsapp'] });
    },
  });
  const test = useMutation({
    mutationFn: () => httpClient.request('/tenant/integrations/whatsapp/test', {
      method: 'POST',body:WhatsAppConnectionTestRequestSchema.parse({instanceId:effectiveInstanceId,...(token.trim()===''?{}:{token})}), schema: WhatsAppConnectionTestSchema, tenantPublicId,
    }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'whatsapp'] }),
  });
  const item = config.data;
  return (
    <fieldset>
      <legend>WhatsApp</legend>
      {item?.available === false ? (
        <p>Disponivel em outros planos. <a href="/planos">Ver planos</a></p>
      ) : (
        <>
          <p>{item?.configured ? `Configurado - ${item.active ? 'ativo' : 'inativo'}` : 'Nao configurado'}</p>
          <label>ID da instancia<input value={effectiveInstanceId} disabled={!canManage} onChange={(event) => { setInstanceId(event.target.value); }} /></label>
          <label>Token do WPP<input type="password" autoComplete="new-password" placeholder="Manter token salvo" value={token} disabled={!canManage} onChange={(event) => { setToken(event.target.value); }} /></label>
          {item?.tokenConfigured ? <small>Token configurado</small> : null}
          {item?.connectionStatus ? <p>Conexao: {item.connectionStatus === 'CONNECTED' ? 'confirmada' : item.connectionStatus === 'ERROR' ? 'com erro' : item.connectionStatus === 'INACTIVE' ? 'inativa' : 'nao testada'}</p> : null}
          {canManage ? <div className="form-row">
            <button type="button" disabled={save.isPending || effectiveInstanceId.trim() === ''} onClick={() => { save.mutate(true); }}>Salvar e ativar</button>
            {item?.configured||token.trim()!=='' ? <button type="button" disabled={test.isPending||effectiveInstanceId.trim()===''} onClick={() => { test.mutate(); }}>Testar conexão</button> : null}
            {item?.active ? <button type="button" disabled={save.isPending} onClick={() => { save.mutate(false); }}>Desativar</button> : null}
          </div> : null}
          {test.data ? <div className={test.data.connected?'success-message':'form-error'}><strong>{test.data.connected?'WhatsApp conectado':test.data.code==='WHATSAPP_INVALID_TOKEN'?'Token inválido':test.data.code==='WHATSAPP_INSTANCE_NOT_FOUND'?'Instância não encontrada':test.data.code==='WHATSAPP_DISCONNECTED'?'WhatsApp desconectado':test.data.code==='WHATSAPP_TIMEOUT'?'Timeout':'Serviço indisponível'}</strong><p>{test.data.message}</p>{test.data.httpStatus!==null||test.data.externalCode!==null?<small>{`${test.data.httpStatus===null?'':`HTTP ${String(test.data.httpStatus)}`}${test.data.externalCode===null?'':` · Código: ${test.data.externalCode}`}`}</small>:null}</div> : null}
          {save.error instanceof Error ? <p className="form-error">{save.error.message}</p> : null}{test.error instanceof Error?<p className="form-error">{test.error.message}</p>:null}
          {item?.configured && canManage ? (
            <WhatsAppInteractionTest tenantPublicId={tenantPublicId} />
          ) : null}
        </>
      )}
    </fieldset>
  );
}

const operationError = (result: { httpStatus: number | null; externalCode: string | null }) =>
  [
    result.httpStatus === null ? null : `HTTP ${String(result.httpStatus)}`,
    result.externalCode === null ? null : `Código: ${result.externalCode}`,
  ]
    .filter((part) => part !== null)
    .join(' · ');

/**
 * Prova de integração: registra o webhook, dispara a mensagem com botões e
 * mostra o evento que voltou. Nenhum agendamento é executado aqui.
 */
function WhatsAppInteractionTest({ tenantPublicId }: { tenantPublicId: string }) {
  const [phone, setPhone] = useState('');
  const [showPayload, setShowPayload] = useState(false);
  const lastEvent = useQuery({
    queryKey: ['tenant', tenantPublicId, 'whatsapp', 'last-event'],
    queryFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/last-event', {
        schema: WhatsAppLastInboundEventSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const configureWebhook = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/webhook-config', {
        method: 'POST',
        schema: WhatsAppWebhookConfigResponseSchema,
        tenantPublicId,
      }),
  });
  const sendButtons = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/button-test', {
        method: 'POST',
        body: WhatsAppButtonTestRequestSchema.parse({ phone: phone.trim() }),
        schema: WhatsAppButtonTestResponseSchema,
        tenantPublicId,
      }),
  });
  const event = lastEvent.data?.event ?? null;

  return (
    <section className="whatsapp-interaction-test">
      <h4>Teste de interação</h4>
      <label>
        Número
        <input
          inputMode="tel"
          placeholder="5511999999999"
          value={phone}
          onChange={(changed) => {
            setPhone(changed.target.value);
          }}
        />
      </label>
      <div className="form-row">
        <button
          disabled={configureWebhook.isPending}
          onClick={() => {
            configureWebhook.mutate();
          }}
          type="button"
        >
          Configurar webhook
        </button>
        <button
          disabled={sendButtons.isPending || phone.trim().length < 10}
          onClick={() => {
            sendButtons.mutate();
          }}
          type="button"
        >
          Enviar teste com botões
        </button>
      </div>

      {configureWebhook.data ? (
        <div className={configureWebhook.data.ok ? 'success-message' : 'form-error'}>
          <strong>{configureWebhook.data.ok ? 'Webhook configurado' : 'Falha ao configurar'}</strong>
          <p>{configureWebhook.data.message}</p>
          <small>{`URL: ${configureWebhook.data.webhookUrl}`}</small>
          {operationError(configureWebhook.data) === '' ? null : (
            <small>{operationError(configureWebhook.data)}</small>
          )}
        </div>
      ) : null}
      {configureWebhook.error instanceof Error ? (
        <p className="form-error">{configureWebhook.error.message}</p>
      ) : null}

      {sendButtons.data ? (
        <div className={sendButtons.data.ok ? 'success-message' : 'form-error'}>
          <strong>{sendButtons.data.ok ? 'Enviado — aguardando resposta' : 'Falha no envio'}</strong>
          <p>{sendButtons.data.message}</p>
          <small>{`IDs enviados: ${sendButtons.data.actionIds.join(' · ')}`}</small>
          {sendButtons.data.externalMessageId === null ? null : (
            <small>{`Message ID: ${sendButtons.data.externalMessageId}`}</small>
          )}
          {operationError(sendButtons.data) === '' ? null : (
            <small>{operationError(sendButtons.data)}</small>
          )}
        </div>
      ) : null}
      {sendButtons.error instanceof Error ? (
        <p className="form-error">{sendButtons.error.message}</p>
      ) : null}

      <h4>Último evento recebido</h4>
      <div className="form-row">
        <button
          disabled={lastEvent.isFetching}
          onClick={() => {
            void lastEvent.refetch();
          }}
          type="button"
        >
          Atualizar resultado
        </button>
      </div>
      {event === null ? (
        <p>Nenhum evento recebido ainda.</p>
      ) : (
        <>
          <dl className="whatsapp-event-details">
            <div>
              <dt>Evento</dt>
              <dd>{event.eventType ?? '—'}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{event.messageType ?? '—'}</dd>
            </div>
            <div>
              <dt>Telefone</dt>
              <dd>{event.maskedPhone ?? '—'}</dd>
            </div>
            <div>
              <dt>Message ID</dt>
              <dd>{event.externalMessageId ?? '—'}</dd>
            </div>
            {event.actionId === null ? null : (
              <div>
                <dt>Botão/ação</dt>
                <dd>{event.actionId}</dd>
              </div>
            )}
            <div>
              <dt>Data/hora</dt>
              <dd>{new Date(event.receivedAt).toLocaleString('pt-BR')}</dd>
            </div>
          </dl>
          {event.actionId === 'TEST_CONFIRM' ? (
            <p className="success-message">Teste concluído com sucesso · Ação: Confirmar teste</p>
          ) : null}
          {event.actionId === 'TEST_CANCEL' ? (
            <p>Resposta registrada · Ação: Cancelar teste</p>
          ) : null}
          <button
            onClick={() => {
              setShowPayload((current) => !current);
            }}
            type="button"
          >
            {showPayload ? 'Ocultar payload sanitizado' : 'Ver payload sanitizado'}
          </button>
          {showPayload ? (
            <pre className="whatsapp-event-payload">{JSON.stringify(event.payload, null, 2)}</pre>
          ) : null}
        </>
      )}
      {lastEvent.error instanceof Error ? (
        <p className="form-error">{lastEvent.error.message}</p>
      ) : null}
    </section>
  );
}
