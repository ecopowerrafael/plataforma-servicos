import {
  WhatsAppButtonTestRequestSchema,
  WhatsAppButtonTestResponseSchema,
  WhatsAppControlTestResponseSchema,
  WhatsAppInstanceDiagnosticsSchema,
  WhatsAppLastInboundEventSchema,
  WhatsAppWebhookConfigResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { WhatsAppConnectionCard } from './WhatsAppConnectionCard.js';
import { httpClient } from '../../lib/http.js';

/**
 * Cartao de WhatsApp: a conexao vem do provisionamento automatico e as
 * ferramentas de diagnostico continuam disponiveis quando ha instancia.
 */
export function WhatsAppSettingsCard({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  return (
    <WhatsAppConnectionCard tenantPublicId={tenantPublicId} canManage={canManage}>
      {(provisioned) =>
        provisioned && canManage ? (
          <WhatsAppInteractionTest tenantPublicId={tenantPublicId} />
        ) : null
      }
    </WhatsAppConnectionCard>
  );
}

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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
  const diagnostics = useQuery({
    queryKey: ['tenant', tenantPublicId, 'whatsapp', 'diagnostics'],
    queryFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/diagnostics', {
        schema: WhatsAppInstanceDiagnosticsSchema,
        tenantPublicId,
      }),
    enabled: false,
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
  const controlTest = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/integrations/whatsapp/control-test', {
        method: 'POST',
        body: WhatsAppButtonTestRequestSchema.parse({ phone: phone.trim() }),
        schema: WhatsAppControlTestResponseSchema,
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
  const lastMessage = lastEvent.data?.lastMessage ?? null;
  const lastConversation = lastEvent.data?.lastConversation ?? null;

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
          Configurar webhooks
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
        <button
          disabled={controlTest.isPending || phone.trim().length < 10}
          onClick={() => {
            controlTest.mutate();
          }}
          type="button"
        >
          Testar número + texto simples
        </button>
      </div>

      {controlTest.data ? (
        <div className={controlTest.data.text.ok ? 'success-message' : 'form-error'}>
          <strong>Controle (sem botões)</strong>
          <p>{controlTest.data.text.message}</p>
          <small>{`Número tem WhatsApp — HTTP ${String(controlTest.data.phoneCheck.httpStatus ?? '—')}`}</small>
          <pre className="whatsapp-event-payload">
            {JSON.stringify(controlTest.data.phoneCheck.payload, null, 2)}
          </pre>
          {controlTest.data.text.externalMessageId === null ? null : (
            <small>{`Message ID do texto: ${controlTest.data.text.externalMessageId}`}</small>
          )}
        </div>
      ) : null}
      {controlTest.error instanceof Error ? (
        <p className="form-error">{controlTest.error.message}</p>
      ) : null}

      {configureWebhook.data ? (
        <div
          className={
            configureWebhook.data.received.ok && configureWebhook.data.status.ok
              ? 'success-message'
              : 'form-error'
          }
        >
          <dl className="whatsapp-event-details">
            <div>
              <dt>Mensagens recebidas</dt>
              <dd>{configureWebhook.data.received.ok ? 'Configurado' : 'Falhou'}</dd>
            </div>
            <div>
              <dt>Status das mensagens</dt>
              <dd>{configureWebhook.data.status.ok ? 'Configurado' : 'Falhou'}</dd>
            </div>
          </dl>
          {[configureWebhook.data.received, configureWebhook.data.status]
            .filter((item) => !item.ok)
            .map((item) => (
              <p key={item.message}>{`${item.message} ${operationError(item)}`}</p>
            ))}
          <small>{`URL: ${configureWebhook.data.webhookUrl}`}</small>
        </div>
      ) : null}
      {configureWebhook.error instanceof Error ? (
        <p className="form-error">{configureWebhook.error.message}</p>
      ) : null}

      {sendButtons.data ? (
        <div className={sendButtons.data.status === 'FAILED' ? 'form-error' : 'success-message'}>
          <strong>
            {sendButtons.data.status === 'FAILED'
              ? 'Falha no envio'
              : 'Enviado — aguardando resposta'}
          </strong>
          <p>{sendButtons.data.message}</p>
          <small>{`IDs enviados: ${sendButtons.data.actionIds.join(' · ')}`}</small>
          {sendButtons.data.externalMessageId === null ? null : (
            <small>{`Message ID: ${sendButtons.data.externalMessageId}`}</small>
          )}
          {sendButtons.data.errorCode === null ? null : (
            <small>{`Código: ${sendButtons.data.errorCode}${sendButtons.data.httpStatus === null ? '' : ` · HTTP ${String(sendButtons.data.httpStatus)}`}`}</small>
          )}
        </div>
      ) : null}
      {sendButtons.error instanceof Error ? (
        <p className="form-error">{sendButtons.error.message}</p>
      ) : null}

      <h4>Diagnóstico da instância</h4>
      <p>
        {'Recurso de botões exige instância PRO. Se a mensagem some após o HTTP 200, confira aqui o '}
        {'tipo da instância e a fila pendente.'}
      </p>
      <div className="form-row">
        <button
          disabled={diagnostics.isFetching}
          onClick={() => {
            void diagnostics.refetch();
          }}
          type="button"
        >
          {diagnostics.isFetching ? 'Consultando…' : 'Consultar instância e fila'}
        </button>
      </div>
      {diagnostics.data ? (
        <>
          <strong>{`Instância — HTTP ${String(diagnostics.data.instance.httpStatus ?? '—')}`}</strong>
          <pre className="whatsapp-event-payload">
            {JSON.stringify(diagnostics.data.instance.payload, null, 2)}
          </pre>
          <strong>{`Fila pendente — HTTP ${String(diagnostics.data.queue.httpStatus ?? '—')}`}</strong>
          <pre className="whatsapp-event-payload">
            {JSON.stringify(diagnostics.data.queue.payload, null, 2)}
          </pre>
        </>
      ) : null}
      {diagnostics.error instanceof Error ? (
        <p className="form-error">{diagnostics.error.message}</p>
      ) : null}

      <h4>Assistente</h4>
      <p>{`Status: ${lastConversation === null ? 'Em preparação' : 'Ativo'}`}</p>
      {lastConversation === null ? null : (
        <dl className="whatsapp-event-details">
          <div>
            <dt>Telefone</dt>
            <dd>{lastConversation.maskedPhone ?? '—'}</dd>
          </div>
          <div>
            <dt>Status da conversa</dt>
            <dd>{lastConversation.status}</dd>
          </div>
          <div>
            <dt>Fluxo</dt>
            <dd>{lastConversation.currentFlow}</dd>
          </div>
          <div>
            <dt>Última interação</dt>
            <dd>{new Date(lastConversation.lastInboundAt).toLocaleString('pt-BR')}</dd>
          </div>
        </dl>
      )}

      <h4>Última mensagem de teste</h4>
      {lastMessage === null ? (
        <p>Nenhuma mensagem enviada ainda.</p>
      ) : (
        <dl className="whatsapp-event-details">
          <div>
            <dt>Enviada</dt>
            <dd>{`✓ ${timeOf(lastMessage.sentAt)}`}</dd>
          </div>
          {lastMessage.deliveredAt === null ? null : (
            <div>
              <dt>Entregue</dt>
              <dd>{`✓ ${timeOf(lastMessage.deliveredAt)}`}</dd>
            </div>
          )}
          {lastMessage.readAt === null ? null : (
            <div>
              <dt>Lida</dt>
              <dd>{`✓ ${timeOf(lastMessage.readAt)}`}</dd>
            </div>
          )}
          {lastMessage.failedAt === null ? null : (
            <div>
              <dt>Falhou</dt>
              <dd>{`${timeOf(lastMessage.failedAt)}${lastMessage.errorCode === null ? '' : ` · ${lastMessage.errorCode}`}`}</dd>
            </div>
          )}
          {event?.actionId === null || event === null ? null : (
            <div>
              <dt>Resposta</dt>
              <dd>{`${event.actionId} · ${timeOf(event.receivedAt)}`}</dd>
            </div>
          )}
        </dl>
      )}

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
