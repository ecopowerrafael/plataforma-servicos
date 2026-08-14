import assert from 'node:assert/strict';
import test from 'node:test';

import { type IntegrationRepository } from './integration.repository.js';
import { routeAction } from './whatsapp-action-router.js';
import {
  conversationExpiresAt,
  conversationIsUsable,
  greetingMessage,
  MAIN_MENU_ACTIONS,
} from './whatsapp-assistant.js';
import { WhatsAppAssistantService } from './whatsapp-assistant.service.js';
import { normalizeWApiWebhook } from './whatsapp-inbound.js';

import type { WhatsAppDelivery } from './integration-delivery.js';

/** Acesso indexado com verificação, para não espalhar optional chaining. */
const at = <T>(items: T[], index: number): T => {
  const value = items[index];
  assert.ok(value !== undefined);
  return value;
};

interface StoredConversation {
  id: bigint;
  publicId: string;
  tenantId: bigint;
  customerId: bigint | null;
  phone: string;
  status: string;
  currentFlow: string;
  expiresAt: Date;
  lastInboundAt: Date;
}

/** Repositório em memória: só o que o assistente usa. */
function fakeRepository(seed: StoredConversation[] = []) {
  const conversations = [...seed];
  const sent: { message: string; buttons: number; phone: string }[] = [];
  let nextId = BigInt(seed.length + 1);
  const repository = {
    conversationFor: (tenantId: bigint, phone: string) =>
      Promise.resolve(
        conversations
          .filter((item) => item.tenantId === tenantId && item.phone === phone)
          .sort((a, b) => b.lastInboundAt.getTime() - a.lastInboundAt.getTime())[0] ?? null,
      ),
    createConversation: (data: {
      tenantId: bigint;
      customerId: bigint | null;
      phone: string;
      lastInboundAt: Date;
      expiresAt: Date;
    }) => {
      const created: StoredConversation = {
        id: nextId++,
        publicId: `conv-${String(conversations.length + 1)}`,
        status: 'ACTIVE',
        currentFlow: 'MAIN_MENU',
        ...data,
      };
      conversations.push(created);
      return Promise.resolve(created);
    },
    updateConversation: (id: bigint, data: Partial<StoredConversation>) => {
      const found = conversations.find((item) => item.id === id);
      if (found !== undefined) Object.assign(found, data);
      return Promise.resolve(found);
    },
    closeConversation: (id: bigint) => {
      const found = conversations.find((item) => item.id === id);
      if (found !== undefined) found.status = 'CLOSED';
      return Promise.resolve(found);
    },
    createOutboundMessage: () => Promise.resolve({}),
    tenantName: () => Promise.resolve({ displayName: 'Studio Bela' }),
    customerName: () => Promise.resolve({ name: 'Rafael Augusto' }),
  } as unknown as IntegrationRepository;
  const delivery = {
    sendInteractiveButtons: (
      _tenantId: bigint,
      phone: string,
      message: string,
      buttons: { buttonId: string }[],
    ) => {
      sent.push({ message, buttons: buttons.length, phone });
      return Promise.resolve({
        externalMessageId: 'MSG1',
        status: 'SENT' as const,
        httpStatus: 200,
        errorCode: null,
        message: 'ok',
      });
    },
    sendPlainText: (_tenantId: bigint, phone: string, message: string) => {
      sent.push({ message, buttons: 0, phone });
      return Promise.resolve({
        externalMessageId: 'MSG2',
        status: 'SENT' as const,
        httpStatus: 200,
        errorCode: null,
        message: 'ok',
      });
    },
  } as unknown as WhatsAppDelivery;
  return { repository, delivery, conversations, sent };
}

const inbound = (overrides: Record<string, unknown> = {}) =>
  normalizeWApiWebhook({
    event: 'webhookReceived',
    instanceId: 'INST',
    messageId: 'M1',
    fromMe: false,
    sender: { id: '5515997118125' },
    msgContent: { conversation: 'Oi' },
    ...overrides,
  });

const handle = (
  service: WhatsAppAssistantService,
  event = inbound(),
  extra: { actionId?: string | null; entitled?: boolean; tenantId?: bigint } = {},
) =>
  service.handleInbound({
    tenantId: extra.tenantId ?? 1n,
    instanceId: 'INST',
    event,
    customerId: null,
    actionId: extra.actionId ?? null,
    entitled: extra.entitled ?? true,
  });

void test('mensagem nova cria conversa e envia saudação com o menu', async () => {
  const { repository, delivery, conversations, sent } = fakeRepository();
  const result = await handle(new WhatsAppAssistantService(repository, delivery));
  assert.equal(result.replied, true);
  assert.equal(conversations.length, 1);
  assert.equal(at(conversations, 0).status, 'ACTIVE');
  assert.equal(at(conversations, 0).currentFlow, 'MAIN_MENU');
  assert.equal(sent.length, 1);
  assert.equal(at(sent, 0).buttons, MAIN_MENU_ACTIONS.length);
  assert.equal(at(sent, 0).message.includes('Studio Bela'), true);
});

void test('conversa dentro da janela é reutilizada, sem nova saudação', async () => {
  const now = new Date();
  const { repository, delivery, conversations, sent } = fakeRepository([
    {
      id: 1n,
      publicId: 'conv-1',
      tenantId: 1n,
      customerId: null,
      phone: '5515997118125',
      status: 'ACTIVE',
      currentFlow: 'MAIN_MENU',
      lastInboundAt: now,
      expiresAt: conversationExpiresAt(now),
    },
  ]);
  await handle(new WhatsAppAssistantService(repository, delivery), inbound(), {
    actionId: 'MAIN_MENU_BOOK',
  });
  assert.equal(conversations.length, 1);
  assert.equal(sent.length, 1);
  assert.equal(at(sent, 0).buttons, 0);
  assert.equal(at(sent, 0).message.includes('Agendamento pelo WhatsApp'), true);
});

void test('conversa expirada abre sessão nova com saudação', async () => {
  const old = new Date(Date.now() - 60 * 60_000);
  const { repository, delivery, conversations, sent } = fakeRepository([
    {
      id: 1n,
      publicId: 'conv-1',
      tenantId: 1n,
      customerId: null,
      phone: '5515997118125',
      status: 'ACTIVE',
      currentFlow: 'MAIN_MENU',
      lastInboundAt: old,
      expiresAt: conversationExpiresAt(old),
    },
  ]);
  await handle(new WhatsAppAssistantService(repository, delivery));
  assert.equal(conversations.length, 2);
  assert.equal(at(conversations, 0).status, 'CLOSED');
  assert.equal(at(sent, 0).buttons, MAIN_MENU_ACTIONS.length);
});

void test('conversa de outro tenant não é reaproveitada', async () => {
  const now = new Date();
  const { repository, delivery, conversations } = fakeRepository([
    {
      id: 1n,
      publicId: 'conv-1',
      tenantId: 1n,
      customerId: null,
      phone: '5515997118125',
      status: 'ACTIVE',
      currentFlow: 'MAIN_MENU',
      lastInboundAt: now,
      expiresAt: conversationExpiresAt(now),
    },
  ]);
  await handle(new WhatsAppAssistantService(repository, delivery), inbound(), { tenantId: 2n });
  assert.equal(conversations.length, 2);
  assert.equal(at(conversations, 1).tenantId, 2n);
});

void test('eventos que não são mensagem do cliente não movem o assistente', async () => {
  const { repository, delivery, sent } = fakeRepository();
  const service = new WhatsAppAssistantService(repository, delivery);
  const status = await handle(
    service,
    normalizeWApiWebhook({ instanceId: 'INST', messageId: 'M1', status: 'READ' }),
  );
  assert.equal(status.replied, false);
  assert.equal(status.reason, 'NOT_A_CUSTOMER_MESSAGE');

  const own = await handle(service, inbound({ fromMe: true }));
  assert.equal(own.reason, 'FROM_ME');

  const group = await handle(service, inbound({ isGroup: true }));
  assert.equal(group.reason, 'GROUP');
  assert.equal(sent.length, 0);
});

void test('sem o recurso no plano nada é enviado', async () => {
  const { repository, delivery, conversations, sent } = fakeRepository();
  const result = await handle(new WhatsAppAssistantService(repository, delivery), inbound(), {
    entitled: false,
  });
  assert.equal(result.reason, 'NOT_ENTITLED');
  assert.equal(conversations.length, 0);
  assert.equal(sent.length, 0);
});

void test('em atendimento humano o assistente cala', async () => {
  const now = new Date();
  const { repository, delivery, sent } = fakeRepository([
    {
      id: 1n,
      publicId: 'conv-1',
      tenantId: 1n,
      customerId: null,
      phone: '5515997118125',
      status: 'HUMAN_SUPPORT',
      currentFlow: 'MAIN_MENU',
      lastInboundAt: now,
      expiresAt: conversationExpiresAt(now),
    },
  ]);
  const result = await handle(new WhatsAppAssistantService(repository, delivery));
  assert.equal(result.replied, false);
  assert.equal(result.reason, 'HUMAN_SUPPORT');
  assert.equal(sent.length, 0);
});

void test('"Outros assuntos" transfere a conversa para atendimento humano', async () => {
  const now = new Date();
  const { repository, delivery, conversations } = fakeRepository([
    {
      id: 1n,
      publicId: 'conv-1',
      tenantId: 1n,
      customerId: null,
      phone: '5515997118125',
      status: 'ACTIVE',
      currentFlow: 'MAIN_MENU',
      lastInboundAt: now,
      expiresAt: conversationExpiresAt(now),
    },
  ]);
  await handle(new WhatsAppAssistantService(repository, delivery), inbound(), {
    actionId: 'MAIN_MENU_OTHER',
  });
  assert.equal(at(conversations, 0).status, 'HUMAN_SUPPORT');
});

void test('texto não reconhecido dentro do menu reenvia as opções', () => {
  const outcome = routeAction(null);
  assert.equal(outcome.resendMenu, true);
  assert.equal(outcome.nextStatus, 'ACTIVE');
  assert.equal(outcome.reply, 'Escolha uma das opções abaixo para continuar.');
});

void test('saudação muda conforme o cliente é conhecido', () => {
  assert.equal(
    greetingMessage('Studio Bela', 'Rafael Augusto').startsWith('Olá, Rafael! 👋'),
    true,
  );
  assert.equal(greetingMessage('Studio Bela', null).startsWith('Olá! 👋'), true);
});

void test('validade da sessão respeita status e expiração', () => {
  const now = new Date();
  const future = { status: 'ACTIVE', expiresAt: new Date(now.getTime() + 60_000) };
  assert.equal(conversationIsUsable(future, now), true);
  assert.equal(conversationIsUsable({ ...future, status: 'CLOSED' }, now), false);
  assert.equal(
    conversationIsUsable({ status: 'ACTIVE', expiresAt: new Date(now.getTime() - 1) }, now),
    false,
  );
  assert.equal(conversationIsUsable(null, now), false);
});
