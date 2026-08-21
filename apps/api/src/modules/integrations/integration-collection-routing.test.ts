import assert from 'node:assert/strict';
import test from 'node:test';

import { IntegrationService } from './integration.service.js';

import type { CollectionAttemptExecutionService } from '../collections/collection-attempt-execution.service.js';
import type { IntegrationRepository } from './integration.repository.js';

/**
 * Repositório mínimo para exercitar ingestWhatsappInbound: whatsappByInstanceId
 * resolve o tenant a partir da instância (nunca de um id vindo do payload), e
 * outboundByExternalMessageId reproduz a mensagem original que enviamos, com
 * o targetType que diz se ela pertence a uma cobrança do Bot Cobra.
 */
function fakeRepository(options: {
  tenantId?: bigint;
  outboundTargetType?: string | null;
  outboundTargetPublicId?: string | null;
  actionIds?: string[];
}) {
  const conversationFor = () => {
    throw new Error('assistant não deveria ser acionado para uma resposta de cobrança');
  };
  const repository = {
    client: {},
    whatsappByInstanceId: () =>
      Promise.resolve({ tenantId: options.tenantId ?? 1n, phoneNumberId: 'INST' }),
    inboundEventByFingerprint: () => Promise.resolve(null),
    createInboundEvent: () => Promise.resolve({}),
    outboundByExternalMessageId: () =>
      Promise.resolve(
        options.outboundTargetType === null
          ? null
          : {
              actionIds: options.actionIds ?? ['COLLECTION_PAY_FULL', 'COLLECTION_NEED_MORE_TIME', 'COLLECTION_HUMAN_SUPPORT'],
              status: 'DELIVERED',
              notification:
                options.outboundTargetType === undefined
                  ? null
                  : { targetType: options.outboundTargetType, targetPublicId: options.outboundTargetPublicId },
            },
      ),
    updateOutboundStatus: () => Promise.resolve({}),
    customerByPhone: () => Promise.resolve(null),
    conversationFor,
  } as unknown as IntegrationRepository;
  return repository;
}

/** Payload cru do webhook — ingestWhatsappInbound normaliza internamente. */
const buttonClick = (selectedIndex: number, stanzaID = 'MSG-ORIGINAL') => ({
  event: 'webhookReceived',
  instanceId: 'INST',
  messageId: 'M-REPLY',
  fromMe: false,
  sender: { id: '5511999999999' },
  msgContent: {
    templateButtonReplyMessage: {
      selectedIndex,
      selectedDisplayText: 'Falar com atendimento',
      contextInfo: { stanzaID },
    },
  },
});

function buildService(repository: IntegrationRepository, collectionAttemptExecution?: CollectionAttemptExecutionService) {
  return new IntegrationService(
    repository,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    collectionAttemptExecution,
  );
}

void test('clique numa mensagem de cobrança roteia para handleWhatsAppResponse, sem acionar o assistente de agendamentos', async () => {
  const calls: Array<{ tenantId: bigint; collectionAttemptPublicId: string; actionId: string | null }> = [];
  const collectionAttemptExecution = {
    handleWhatsAppResponse: (tenantId: bigint, collectionAttemptPublicId: string, actionId: string | null) => {
      calls.push({ tenantId, collectionAttemptPublicId, actionId });
      return Promise.resolve({ handled: true });
    },
  } as unknown as CollectionAttemptExecutionService;

  const repository = fakeRepository({
    tenantId: 7n,
    outboundTargetType: 'collection_attempt',
    outboundTargetPublicId: 'attempt-public-id',
  });
  const service = buildService(repository, collectionAttemptExecution);

  const result = await service.ingestWhatsappInbound(buttonClick(2));

  assert.equal(result.accepted, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.tenantId, 7n);
  assert.equal(calls[0]?.collectionAttemptPublicId, 'attempt-public-id');
  assert.equal(calls[0]?.actionId, 'COLLECTION_HUMAN_SUPPORT');
});

void test('clique numa mensagem que não é de cobrança segue o fluxo normal (assistente), sem chamar handleWhatsAppResponse', async () => {
  const collectionAttemptExecution = {
    handleWhatsAppResponse: () => {
      throw new Error('não deveria ser chamado para uma mensagem de agendamento');
    },
  } as unknown as CollectionAttemptExecutionService;

  const repository = {
    client: { tenantSubscription: { findFirst: () => Promise.resolve(null) } },
    whatsappByInstanceId: () => Promise.resolve({ tenantId: 7n, phoneNumberId: 'INST' }),
    inboundEventByFingerprint: () => Promise.resolve(null),
    createInboundEvent: () => Promise.resolve({}),
    outboundByExternalMessageId: () =>
      Promise.resolve({
        actionIds: ['BOOKING_CONFIRM', 'BOOKING_CANCEL'],
        status: 'DELIVERED',
        notification: { targetType: 'appointment', targetPublicId: 'appointment-public-id' },
      }),
    updateOutboundStatus: () => Promise.resolve({}),
    customerByPhone: () => Promise.resolve(null),
    conversationFor: () => Promise.resolve(null),
    createConversation: (data: Record<string, unknown>) =>
      Promise.resolve({ id: 1n, publicId: 'conv-1', status: 'ACTIVE', currentFlow: 'MAIN_MENU', ...data }),
    updateConversation: () => Promise.resolve({}),
    closeConversation: () => Promise.resolve({}),
    createOutboundMessage: () => Promise.resolve({}),
    tenantName: () => Promise.resolve({ displayName: 'Studio Bela', timezone: 'America/Sao_Paulo', currency: 'BRL' }),
    tenantSlug: () => Promise.resolve({ slug: 'studio-bela' }),
    customerName: () => Promise.resolve(null),
    whatsapp: () => Promise.resolve(null),
  } as unknown as IntegrationRepository;
  const delivery = {
    sendInteractiveButtons: () =>
      Promise.resolve({ externalMessageId: 'MSG-OUT', status: 'SENT' as const, httpStatus: 200, errorCode: null, message: 'ok' }),
    sendPlainText: () =>
      Promise.resolve({ externalMessageId: 'MSG-OUT', status: 'SENT' as const, httpStatus: 200, errorCode: null, message: 'ok' }),
  };
  const service = new IntegrationService(
    repository,
    undefined,
    delivery as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    collectionAttemptExecution,
  );

  const result = await service.ingestWhatsappInbound(buttonClick(0));

  assert.equal(result.accepted, true);
  assert.equal('collectionResponseHandled' in result, false);
});
