import { expect, test, vi } from 'vitest';

import { IntegrationService } from './integration.service.js';
import { MetaInboundNormalizer } from './meta-whatsapp-inbound.js';

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

  expect(result.accepted).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.tenantId).toBe(7n);
  expect(calls[0]?.collectionAttemptPublicId).toBe('attempt-public-id');
  expect(calls[0]?.actionId).toBe('COLLECTION_HUMAN_SUPPORT');
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
  const normalizer = new MetaInboundNormalizer();
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

  expect(result.accepted).toBe(true);
  expect('collectionResponseHandled' in result).toBe(false);
});

void test('clique em resposta imediata (collection_reply) roteia para handleWhatsAppDebtResponse com debtPublicId', async () => {
  const calls: Array<{ tenantId: bigint; debtPublicId: string; actionId: string | null }> = [];
  const collectionAttemptExecution = {
    handleWhatsAppDebtResponse: (tenantId: bigint, debtPublicId: string, actionId: string | null) => {
      calls.push({ tenantId, debtPublicId, actionId });
      return Promise.resolve({ handled: true });
    },
  } as unknown as CollectionAttemptExecutionService;

  const repository = fakeRepository({
    tenantId: 7n,
    outboundTargetType: 'collection_reply',
    outboundTargetPublicId: 'debt-public-id-123',
    actionIds: ['COLLECTION_PARTIAL_20', 'COLLECTION_PARTIAL_30', 'COLLECTION_PAY_FULL'],
  });
  const service = buildService(repository, collectionAttemptExecution);

  const result = await service.ingestWhatsappInbound(buttonClick(1));

  expect(result.accepted).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.tenantId).toBe(7n);
  expect(calls[0]?.debtPublicId).toBe('debt-public-id-123');
  expect(calls[0]?.actionId).toBe('COLLECTION_PARTIAL_30');
});

const metaButtonWebhook = (buttonId: string) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: {
            metadata: { phone_number_id: 'META-PHONE' },
            messages: [
              {
                from: '5511999999999',
                id: 'wamid.reply',
                timestamp: '1788800000',
                type: 'interactive',
                context: { id: 'wamid.original' },
                interactive: {
                  type: 'button_reply',
                  button_reply: { id: buttonId, title: 'Texto visível ignorado' },
                },
              },
            ],
          },
        },
      ],
    },
  ],
});

void test('botão Meta de agendamento resolve actionId pelo id do botão vinculado ao outbound', async () => {
  const createInboundEvent = vi.fn().mockResolvedValue({});
  const repository = {
    client: { tenantSubscription: { findFirst: () => Promise.resolve(null) } },
    selectedWhatsappProvider: () => Promise.resolve('META'),
    whatsappByInstanceId: () => Promise.resolve({ tenantId: 7n, phoneNumberId: 'META-PHONE', provider: 'META' }),
    inboundEventByFingerprint: () => Promise.resolve(null),
    createInboundEvent,
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
    updateConversation: vi.fn().mockResolvedValue({}),
    closeConversation: () => Promise.resolve({}),
    createOutboundMessage: () => Promise.resolve({}),
    tenantName: () => Promise.resolve({ displayName: 'Studio Bela', timezone: 'America/Sao_Paulo', currency: 'BRL' }),
    tenantSlug: () => Promise.resolve({ slug: 'studio-bela' }),
    customerName: () => Promise.resolve(null),
    whatsappAssistantConfig: () => Promise.resolve(null),
  } as unknown as IntegrationRepository;
  const normalizer = new MetaInboundNormalizer();
  const service = new IntegrationService(
    repository,
    undefined,
    {
      sendInteractiveButtons: () => Promise.resolve({ externalMessageId: 'out', status: 'SENT', httpStatus: 200, errorCode: null, message: 'ok' }),
      sendPlainText: () => Promise.resolve({ externalMessageId: 'out', status: 'SENT', httpStatus: 200, errorCode: null, message: 'ok' }),
    } as never,
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
    undefined,
    undefined,
    { inbound: () => normalizer } as never,
  );

  const result = await service.ingestWhatsappInboundForProvider('META', metaButtonWebhook('BOOKING_CONFIRM'));

  expect(result).toMatchObject({ received: true, processed: 1, rejected: 0 });
  expect(createInboundEvent).toHaveBeenCalledWith(expect.objectContaining({
    actionId: 'BOOKING_CONFIRM',
    referencedMessageId: 'wamid.original',
  }));
});

void test('botão Meta de cobrança resolve collection_reply sem confiar no label', async () => {
  const calls: Array<{ debtPublicId: string; actionId: string | null }> = [];
  const collectionAttemptExecution = {
    handleWhatsAppDebtResponse: (_tenantId: bigint, debtPublicId: string, actionId: string | null) => {
      calls.push({ debtPublicId, actionId });
      return Promise.resolve({ handled: true });
    },
  } as unknown as CollectionAttemptExecutionService;
  const repository = {
    client: {},
    selectedWhatsappProvider: () => Promise.resolve('META'),
    whatsappByInstanceId: () => Promise.resolve({ tenantId: 7n, phoneNumberId: 'META-PHONE', provider: 'META' }),
    inboundEventByFingerprint: () => Promise.resolve(null),
    createInboundEvent: () => Promise.resolve({}),
    outboundByExternalMessageId: () =>
      Promise.resolve({
        actionIds: ['COLLECTION_PARTIAL_20', 'COLLECTION_PARTIAL_30'],
        status: 'DELIVERED',
        notification: { targetType: 'collection_reply', targetPublicId: 'debt-public-id' },
      }),
    updateOutboundStatus: () => Promise.resolve({}),
    customerByPhone: () => Promise.resolve(null),
  } as unknown as IntegrationRepository;
  const normalizer = new MetaInboundNormalizer();
  const service = new IntegrationService(
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
    undefined,
    undefined,
    undefined,
    { inbound: () => normalizer } as never,
  );

  const result = await service.ingestWhatsappInboundForProvider('META', metaButtonWebhook('COLLECTION_PARTIAL_30'));

  expect(result).toMatchObject({ received: true, processed: 1, rejected: 0 });
  expect(calls).toEqual([{ debtPublicId: 'debt-public-id', actionId: 'COLLECTION_PARTIAL_30' }]);
});
