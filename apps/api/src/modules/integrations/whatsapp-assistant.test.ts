import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
import { AppointmentService } from '../appointments/appointment.service.js';
import { IntegrationService } from './integration.service.js';

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
  currentStep?: string | null;
  context?: unknown;
  expiresAt: Date;
  lastInboundAt: Date;
}

const upcoming = (items: unknown[]) => {
  const selections: { tenantId: bigint; customerId: bigint; publicId: string }[] = [];
  const confirmations: string[] = [];
  const cancellations: string[] = [];
  const reschedules: { publicId: string; startsAt: string }[] = [];
  return {
  selections,
  confirmations,
  cancellations,
  reschedules,
  listUpcomingForCustomer: () => Promise.resolve({ items }),
  getForCustomer: (tenantId: bigint, customerId: bigint, publicId: string) => {
    selections.push({ tenantId, customerId, publicId });
    const item = items.find((value) => (value as { publicId: string }).publicId === publicId);
    return item === undefined ? Promise.reject(new Error('not found')) : Promise.resolve(item);
  },
  status: (_tenantId: bigint, publicId: string) => {
    const item = items.find((value) => (value as { publicId: string }).publicId === publicId) as
      | { status: string }
      | undefined;
    if (item?.status !== 'PENDING') return Promise.reject(new Error('invalid'));
    confirmations.push(publicId);
    item.status = 'CONFIRMED';
    return Promise.resolve({ success: true });
  },
  cancelForCustomer: (_tenantId: bigint, _customerId: bigint, publicId: string) => {
    const item = items.find((value) => (value as { publicId: string }).publicId === publicId) as
      | { status: string }
      | undefined;
    if (item?.status !== 'PENDING' && item?.status !== 'CONFIRMED')
      return Promise.reject(new Error('invalid'));
    cancellations.push(publicId);
    item.status = 'CANCELED';
    return Promise.resolve({ success: true });
  },
  rescheduleForCustomer: (_tenantId: bigint, _customerId: bigint, publicId: string, startsAt: string) => {
    const item = items.find((value) => (value as { publicId: string }).publicId === publicId) as
      | { startsAt: string; status: string }
      | undefined;
    if (item === undefined) return Promise.reject(new Error('invalid'));
    if (item.status === 'CANCELED' || item.status === 'COMPLETED')
      return Promise.reject(new Error('invalid'));
    reschedules.push({ publicId, startsAt });
    item.startsAt = startsAt;
    return Promise.resolve({ publicId, startsAt });
  },
  };
};

const availableDates = (enabled = true) => ({
  available: (_tenantId: bigint, input: { date: string }) =>
    Promise.resolve({
      slots: enabled
        ? [{ state: 'AVAILABLE', startsAt: `${input.date}T14:00:00.000Z` }]
        : [{ state: 'BLOCKED', startsAt: `${input.date}T14:00:00.000Z` }],
    }),
});

const bookingCatalog = (
  services: { publicId: string; name: string; priceCents: string; durationMinutes: number }[],
  professionals: { publicId: string; name: string }[],
  unit: Record<string, unknown> | null = null,
) => ({
  publicSite: () => Promise.resolve({ bookingAvailable: true, unavailableMessage: null, services, professionals, unit }),
});

const professionalLinks = (professionalPublicIds: string[]) => ({
  listService: () =>
    Promise.resolve({
      items: professionalPublicIds.map((professionalPublicId) => ({ professionalPublicId, active: true })),
    }),
});

/** Repositório em memória: só o que o assistente usa. */
function fakeRepository(seed: StoredConversation[] = []) {
  const conversations = [...seed];
  const sent: { message: string; buttons: number; phone: string; actionIds: string[] }[] = [];
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
    tenantName: () => Promise.resolve({ displayName: 'Studio Bela', timezone: 'America/Sao_Paulo', currency: 'BRL' }),
    tenantSlug: () => Promise.resolve({ slug: 'studio-bela' }),
    customerName: () => Promise.resolve({ name: 'Rafael Augusto' }),
  } as unknown as IntegrationRepository;
  const delivery = {
    sendInteractiveButtons: (
      _tenantId: bigint,
      phone: string,
      message: string,
      buttons: { buttonId: string }[],
    ) => {
      sent.push({ message, buttons: buttons.length, phone, actionIds: buttons.map((button) => button.buttonId) });
      return Promise.resolve({
        externalMessageId: 'MSG1',
        status: 'SENT' as const,
        httpStatus: 200,
        errorCode: null,
        message: 'ok',
      });
    },
    sendPlainText: (_tenantId: bigint, phone: string, message: string) => {
      sent.push({ message, buttons: 0, phone, actionIds: [] });
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
    actionId: 'MAIN_MENU_RESCHEDULE',
  });
  assert.equal(conversations.length, 1);
  assert.equal(sent.length, 1);
  assert.equal(at(sent, 0).buttons, 0);
  assert.equal(at(sent, 0).message, 'Você não possui agendamentos futuros para reagendar.');
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

void test('consulta sem agendamento oferece agendar e voltar', async () => {
  const now = new Date();
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'MAIN_MENU', lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  await handle(new WhatsAppAssistantService(repository, delivery, upcoming([]) as never), inbound(), { actionId: 'MAIN_MENU_QUERY' });
  assert.equal(at(sent, 0).message.includes('não possui agendamentos futuros'), true);
  assert.equal(at(sent, 0).buttons, 2);
});

void test('consulta de um agendamento abre detalhe e salva somente seu publicId', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000001', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', priceCents: '9000', status: 'CONFIRMED' };
  const { repository, delivery, conversations, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'MAIN_MENU', lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  await handle(new WhatsAppAssistantService(repository, delivery, upcoming([item]) as never), inbound(), { actionId: 'MAIN_MENU_QUERY' });
  assert.deepEqual(at(conversations, 0).context, { appointmentPublicId: item.publicId });
  assert.equal(at(conversations, 0).currentStep, 'BOOKING_DETAILS');
  assert.equal(at(sent, 0).buttons, 5);
});

void test('consulta múltipla seleciona o agendamento dentro do tenant e cliente', async () => {
  const now = new Date(); const first = { publicId: '00000000-0000-4000-8000-000000000001', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', priceCents: '9000', status: 'PENDING' }; const second = { ...first, publicId: '00000000-0000-4000-8000-000000000002' };
  const { repository, delivery, conversations } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'MAIN_MENU', lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = upcoming([first, second]);
  const service = new WhatsAppAssistantService(repository, delivery, appointments as never);
  await handle(service, inbound(), { actionId: 'MAIN_MENU_QUERY' });
  await handle(service, inbound(), { actionId: `BOOKING_SELECT:${second.publicId}` });
  assert.deepEqual(at(conversations, 0).context, { appointmentPublicId: second.publicId });
  assert.deepEqual(appointments.selections, [{ tenantId: 1n, customerId: 7n, publicId: second.publicId }]);
});

void test('consulta múltipla pagina opções sem expor todos os agendamentos em botões', async () => {
  const now = new Date();
  const items = Array.from({ length: 6 }, (_, index) => ({
    publicId: `00000000-0000-4000-8000-00000000000${String(index + 1)}`,
    startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', priceCents: '9000', status: 'PENDING',
  }));
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'MAIN_MENU', lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  await handle(new WhatsAppAssistantService(repository, delivery, upcoming(items) as never), inbound(), { actionId: 'MAIN_MENU_QUERY' });
  assert.equal(at(sent, 0).buttons, 5);
  assert.equal(at(sent, 0).actionIds.includes('BOOKING_QUERY_PAGE:4'), true);
});

void test('confirmar presença aplica a transição PENDING para CONFIRMED sem tocar pagamento', async () => {
  const now = new Date();
  const item = { publicId: '00000000-0000-4000-8000-000000000010', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', priceCents: '9000', status: 'PENDING', paymentStatus: 'PENDING' };
  const { repository, delivery, conversations, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', currentStep: 'BOOKING_DETAILS', context: { appointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = upcoming([item]);
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never), inbound(), { actionId: 'BOOKING_CONFIRM' });
  assert.deepEqual(appointments.confirmations, [item.publicId]);
  assert.equal(item.status, 'CONFIRMED');
  assert.equal(item.paymentStatus, 'PENDING');
  assert.equal(at(conversations, 0).currentFlow, 'BOOKING_QUERY');
  assert.equal(at(sent, 0).actionIds.includes(`BOOKING_SELECT:${item.publicId}`), true);
});

void test('confirmação repetida é idempotente', async () => {
  const now = new Date();
  const item = { publicId: '00000000-0000-4000-8000-000000000011', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', priceCents: '9000', status: 'CONFIRMED' };
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', currentStep: 'BOOKING_DETAILS', context: { appointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = upcoming([item]);
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never), inbound(), { actionId: 'BOOKING_CONFIRM' });
  assert.deepEqual(appointments.confirmations, []);
  assert.equal(at(sent, 0).message, 'Seu agendamento já está confirmado.');
});

void test('confirmação recusa estado inválido sem chamar a transição', async () => {
  const now = new Date();
  const item = { publicId: '00000000-0000-4000-8000-000000000012', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', priceCents: '9000', status: 'CANCELED' };
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', currentStep: 'BOOKING_DETAILS', context: { appointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = upcoming([item]);
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never), inbound(), { actionId: 'BOOKING_CONFIRM' });
  assert.deepEqual(appointments.confirmations, []);
  assert.equal(at(sent, 0).message, 'Este agendamento foi cancelado e não pode mais ser confirmado.');
});

void test('cliente diferente não confirma o agendamento do contexto', async () => {
  const now = new Date(); let statusCalled = false;
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', currentStep: 'BOOKING_DETAILS', context: { appointmentPublicId: '00000000-0000-4000-8000-000000000013' }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = {
    getForCustomer: () => Promise.reject(new Error('not found')),
    status: () => { statusCalled = true; return Promise.resolve({ success: true }); },
  };
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never), inbound(), { actionId: 'BOOKING_CONFIRM' });
  assert.equal(statusCalled, false);
  assert.equal(at(sent, 0).message, 'O agendamento não está mais disponível.');
});

void test('primeiro clique em cancelar apenas pede confirmação', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000020', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', priceCents: '9000', status: 'PENDING' };
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', context: { appointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = upcoming([item]);
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never), inbound(), { actionId: 'BOOKING_CANCEL' });
  assert.deepEqual(appointments.cancellations, []);
  assert.deepEqual(at(sent, 0).actionIds, ['BOOKING_CANCEL_CONFIRM', 'BOOKING_CANCEL_ABORT']);
});

void test('confirmação de cancelamento usa a regra pública e limpa o contexto', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000021', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', priceCents: '9000', status: 'PENDING' };
  const { repository, delivery, conversations, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', context: { appointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = upcoming([item]);
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never), inbound(), { actionId: 'BOOKING_CANCEL_CONFIRM' });
  assert.deepEqual(appointments.cancellations, [item.publicId]);
  assert.equal(item.status, 'CANCELED');
  assert.deepEqual(at(conversations, 0).context, { lastCanceledAppointmentPublicId: item.publicId });
  assert.equal(at(sent, 0).actionIds.includes('MAIN_MENU_BOOK'), true);
});

void test('abortar cancelamento mantém o agendamento', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000022', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', priceCents: '9000', status: 'PENDING' };
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', context: { appointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = upcoming([item]);
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never), inbound(), { actionId: 'BOOKING_CANCEL_ABORT' });
  assert.equal(item.status, 'PENDING');
  assert.deepEqual(appointments.cancellations, []);
  assert.equal(at(sent, 0).actionIds.includes(`BOOKING_SELECT:${item.publicId}`), true);
});

void test('cancelamento duplicado é idempotente', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000023', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', priceCents: '9000', status: 'CANCELED' };
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'MAIN_MENU', context: { lastCanceledAppointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = upcoming([item]);
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never), inbound(), { actionId: 'BOOKING_CANCEL_CONFIRM' });
  assert.deepEqual(appointments.cancellations, []);
  assert.equal(at(sent, 0).message, 'Este agendamento já está cancelado.');
});

void test('política de cancelamento continua sendo aplicada', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000024', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', priceCents: '9000', status: 'PENDING' };
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', context: { appointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = { getForCustomer: () => Promise.resolve(item), cancelForCustomer: () => Promise.reject(new Error('window closed')) };
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never), inbound(), { actionId: 'BOOKING_CANCEL_CONFIRM' });
  assert.equal(at(sent, 0).actionIds.includes('MAIN_MENU_OTHER'), true);
});

void test('cliente diferente não cancela o agendamento do contexto', async () => {
  const now = new Date(); let cancelled = false;
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', context: { appointmentPublicId: '00000000-0000-4000-8000-000000000025' }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = { getForCustomer: () => Promise.reject(new Error('not found')), cancelForCustomer: () => { cancelled = true; return Promise.resolve({ success: true }); } };
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never), inbound(), { actionId: 'BOOKING_CANCEL_CONFIRM' });
  assert.equal(cancelled, false);
  assert.equal(at(sent, 0).message, 'O agendamento não está mais disponível.');
});

void test('reagendamento abre escolhas usando disponibilidade real', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000030', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', professionalPublicId: '00000000-0000-4000-8000-000000000031', servicePublicId: '00000000-0000-4000-8000-000000000032', unitPublicId: null, priceCents: '9000', status: 'PENDING' };
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', context: { appointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  await handle(new WhatsAppAssistantService(repository, delivery, upcoming([item]) as never, availableDates() as never), inbound(), { actionId: 'BOOKING_RESCHEDULE' });
  assert.equal(at(sent, 0).actionIds.some((actionId) => actionId.startsWith('BOOKING_RESCHEDULE_DATE:')), true);
});

void test('data disponível é salva no contexto sem alterar o agendamento', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000033', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', professionalPublicId: '00000000-0000-4000-8000-000000000034', servicePublicId: '00000000-0000-4000-8000-000000000035', unitPublicId: null, priceCents: '9000', status: 'PENDING' };
  const { repository, delivery, conversations, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', context: { appointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const service = new WhatsAppAssistantService(repository, delivery, upcoming([item]) as never, availableDates() as never);
  await handle(service, inbound(), { actionId: 'BOOKING_RESCHEDULE' });
  const dateAction = at(sent, 0).actionIds.find((actionId) => actionId.startsWith('BOOKING_RESCHEDULE_DATE:'));
  assert.ok(dateAction);
  await handle(service, inbound(), { actionId: dateAction });
  assert.equal(at(conversations, 0).currentFlow, 'BOOKING_RESCHEDULE');
  assert.deepEqual(at(conversations, 0).context, {
    appointmentPublicId: item.publicId,
    rescheduleDate: dateAction.slice('BOOKING_RESCHEDULE_DATE:'.length),
  });
  assert.equal(item.startsAt, '2026-08-14T17:30:00.000Z');
});

void test('data inválida para disponibilidade é recusada', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000036', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', professionalPublicId: '00000000-0000-4000-8000-000000000037', servicePublicId: '00000000-0000-4000-8000-000000000038', unitPublicId: null, priceCents: '9000', status: 'PENDING' };
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', context: { appointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  await handle(new WhatsAppAssistantService(repository, delivery, upcoming([item]) as never, availableDates(false) as never), inbound(), { actionId: 'BOOKING_RESCHEDULE_DATE:2000-01-01' });
  assert.equal(at(sent, 0).message, 'Essa data não está disponível para reagendamento.');
});

void test('abortar reagendamento remove somente a data escolhida', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000039', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', priceCents: '9000', status: 'PENDING' };
  const { repository, delivery, conversations } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_RESCHEDULE', currentStep: 'DATE_SELECTED', context: { appointmentPublicId: item.publicId, rescheduleDate: '2026-08-20' }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  await handle(new WhatsAppAssistantService(repository, delivery, upcoming([item]) as never), inbound(), { actionId: 'BOOKING_RESCHEDULE_ABORT' });
  assert.deepEqual(at(conversations, 0).context, { appointmentPublicId: item.publicId });
});

void test('cliente diferente não inicia reagendamento', async () => {
  const now = new Date();
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', context: { appointmentPublicId: '00000000-0000-4000-8000-000000000040' }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = { getForCustomer: () => Promise.reject(new Error('not found')) };
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never, availableDates() as never), inbound(), { actionId: 'BOOKING_RESCHEDULE' });
  assert.equal(at(sent, 0).message, 'O agendamento não está mais disponível.');
});

void test('agendar abre o fluxo e lista serviços públicos reais', async () => {
  const now = new Date(); const services = [{ publicId: 'service-a', name: 'Corte', priceCents: '5000', durationMinutes: 30 }];
  const { repository, delivery, conversations, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: null, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'MAIN_MENU', context: { appointmentPublicId: 'old' }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  await handle(new WhatsAppAssistantService(repository, delivery, undefined, undefined, bookingCatalog(services, []) as never, professionalLinks([]) as never), inbound(), { actionId: 'MAIN_MENU_BOOK' });
  assert.equal(at(conversations, 0).currentFlow, 'BOOKING_CREATE');
  assert.deepEqual(at(conversations, 0).context, {});
  assert.deepEqual(at(sent, 0).actionIds, ['BOOKING_CREATE_SERVICE:service-a']);
});

void test('serviço inválido não é aceito e serviço válido filtra profissionais', async () => {
  const now = new Date(); const services = [{ publicId: 'service-a', name: 'Corte', priceCents: '5000', durationMinutes: 30 }]; const professionals = [{ publicId: 'pro-a', name: 'Rafael' }, { publicId: 'pro-b', name: 'Outro' }];
  const { repository, delivery, conversations, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: null, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_CREATE', context: {}, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const service = new WhatsAppAssistantService(repository, delivery, undefined, undefined, bookingCatalog(services, professionals) as never, professionalLinks(['pro-a']) as never);
  await handle(service, inbound(), { actionId: 'BOOKING_CREATE_SERVICE:other-tenant' });
  assert.equal(at(sent, 0).message, 'Esse serviço não está disponível para agendamento.');
  await handle(service, inbound(), { actionId: 'BOOKING_CREATE_SERVICE:service-a' });
  assert.deepEqual(at(conversations, 0).context, { servicePublicId: 'service-a' });
  assert.equal(at(sent, 1).actionIds.includes('BOOKING_CREATE_PROFESSIONAL:pro-a'), true);
  assert.equal(at(sent, 1).actionIds.includes('BOOKING_CREATE_PROFESSIONAL:pro-b'), false);
});

void test('profissional válido é salvo e trocar serviço limpa o profissional', async () => {
  const now = new Date(); const services = [{ publicId: 'service-a', name: 'Corte', priceCents: '5000', durationMinutes: 30 }]; const professionals = [{ publicId: 'pro-a', name: 'Rafael' }];
  const { repository, delivery, conversations } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: null, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_CREATE', currentStep: 'PROFESSIONAL_SELECTION', context: { servicePublicId: 'service-a' }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const service = new WhatsAppAssistantService(repository, delivery, undefined, undefined, bookingCatalog(services, professionals) as never, professionalLinks(['pro-a']) as never);
  await handle(service, inbound(), { actionId: 'BOOKING_CREATE_PROFESSIONAL:pro-a' });
  assert.deepEqual(at(conversations, 0).context, { servicePublicId: 'service-a', professionalPublicId: 'pro-a' });
  await handle(service, inbound(), { actionId: 'BOOKING_CREATE_CHANGE_SERVICE' });
  assert.equal(at(conversations, 0).currentStep, 'SERVICE_SELECTION');
  assert.deepEqual(at(conversations, 0).context, {});
});

void test('abortar criação limpa o fluxo', async () => {
  const now = new Date(); const { repository, delivery, conversations } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: null, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_CREATE', context: { servicePublicId: 'service-a', professionalPublicId: 'pro-a' }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  await handle(new WhatsAppAssistantService(repository, delivery), inbound(), { actionId: 'BOOKING_CREATE_ABORT' });
  assert.equal(at(conversations, 0).currentFlow, 'MAIN_MENU');
  assert.deepEqual(at(conversations, 0).context, {});
});

void test('data selecionada mostra horários reais e horário entra no contexto sem reagendar', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000041', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', professionalPublicId: '00000000-0000-4000-8000-000000000042', servicePublicId: '00000000-0000-4000-8000-000000000043', unitPublicId: null, priceCents: '9000', status: 'PENDING' };
  const { repository, delivery, conversations, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', context: { appointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = upcoming([item]); const service = new WhatsAppAssistantService(repository, delivery, appointments as never, availableDates() as never);
  await handle(service, inbound(), { actionId: 'BOOKING_RESCHEDULE' });
  const dateAction = at(sent, 0).actionIds.find((id) => id.startsWith('BOOKING_RESCHEDULE_DATE:'));
  assert.ok(dateAction); await handle(service, inbound(), { actionId: dateAction });
  const timeAction = at(sent, 1).actionIds.find((id) => id.startsWith('BOOKING_RESCHEDULE_TIME:'));
  assert.ok(timeAction); await handle(service, inbound(), { actionId: timeAction });
  assert.deepEqual(appointments.reschedules, []);
  assert.equal(at(conversations, 0).currentStep, 'CONFIRMATION');
  assert.equal(at(conversations, 0).context !== null, true);
});

void test('confirmação de reagendamento usa o service público e limpa data/hora', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000044', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', professionalPublicId: '00000000-0000-4000-8000-000000000045', servicePublicId: '00000000-0000-4000-8000-000000000046', unitPublicId: null, priceCents: '9000', status: 'PENDING' };
  const { repository, delivery, conversations, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_RESCHEDULE', currentStep: 'CONFIRMATION', context: { appointmentPublicId: item.publicId, rescheduleDate: '2026-08-20', rescheduleTime: '11:00' }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = upcoming([item]);
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never, availableDates() as never), inbound(), { actionId: 'BOOKING_RESCHEDULE_CONFIRM' });
  assert.equal(appointments.reschedules.length, 1);
  assert.deepEqual(at(conversations, 0).context, {
    appointmentPublicId: item.publicId,
    lastRescheduledStartsAt: item.startsAt,
  });
  assert.equal(at(sent, 0).actionIds.includes(`BOOKING_SELECT:${item.publicId}`), true);
});

void test('horário ocupado antes da confirmação é recusado sem reagendar', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000047', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', professionalPublicId: '00000000-0000-4000-8000-000000000048', servicePublicId: '00000000-0000-4000-8000-000000000049', unitPublicId: null, priceCents: '9000', status: 'PENDING' };
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_RESCHEDULE', currentStep: 'CONFIRMATION', context: { appointmentPublicId: item.publicId, rescheduleDate: '2026-08-20', rescheduleTime: '11:00' }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = upcoming([item]);
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never, availableDates(false) as never), inbound(), { actionId: 'BOOKING_RESCHEDULE_CONFIRM' });
  assert.deepEqual(appointments.reschedules, []);
  assert.equal(at(sent, 0).message, 'Esse horário acabou de ficar indisponível.');
});

void test('confirmação de reagendamento duplicada é idempotente', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000053', startsAt: '2026-08-20T14:00:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', professionalPublicId: '00000000-0000-4000-8000-000000000054', servicePublicId: '00000000-0000-4000-8000-000000000055', unitPublicId: null, priceCents: '9000', status: 'PENDING' };
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', currentStep: 'BOOKING_DETAILS', context: { appointmentPublicId: item.publicId, lastRescheduledStartsAt: item.startsAt }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = upcoming([item]);
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never, availableDates() as never), inbound(), { actionId: 'BOOKING_RESCHEDULE_CONFIRM' });
  assert.deepEqual(appointments.reschedules, []);
  assert.equal(at(sent, 0).message.includes('reagendado com sucesso'), true);
});

void test('escolher outro horário preserva a data', async () => {
  const now = new Date(); const item = { publicId: '00000000-0000-4000-8000-000000000050', startsAt: '2026-08-14T17:30:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', professionalPublicId: '00000000-0000-4000-8000-000000000051', servicePublicId: '00000000-0000-4000-8000-000000000052', unitPublicId: null, priceCents: '9000', status: 'PENDING' };
  const { repository, delivery, conversations } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_RESCHEDULE', currentStep: 'CONFIRMATION', context: { appointmentPublicId: item.publicId, rescheduleDate: '2026-08-20', rescheduleTime: '11:00' }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  await handle(new WhatsAppAssistantService(repository, delivery, upcoming([item]) as never, availableDates() as never), inbound(), { actionId: 'BOOKING_RESCHEDULE_CHANGE_TIME' });
  assert.deepEqual(at(conversations, 0).context, { appointmentPublicId: item.publicId, rescheduleDate: '2026-08-20' });
});

void test('voltar ao menu limpa o contexto do agendamento', async () => {
  const now = new Date(); const { repository, delivery, conversations } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', currentStep: 'BOOKING_DETAILS', context: { appointmentPublicId: 'x' }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  await handle(new WhatsAppAssistantService(repository, delivery), inbound(), { actionId: 'MAIN_MENU_BACK' });
  assert.deepEqual(at(conversations, 0).context, {});
  assert.equal(at(conversations, 0).currentFlow, 'MAIN_MENU');
});

void test('pagamento usa as opções reais e PIX cria a cobrança real', async () => {
  const now = new Date();
  const item = {
    publicId: '00000000-0000-4000-8000-000000000060', startsAt: '2026-08-20T14:00:00.000Z',
    serviceName: 'Corte', professionalName: 'Rafael', priceCents: '5000', status: 'PENDING',
  };
  const { repository, delivery, conversations, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', context: { appointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const optionsCalls: string[] = [];
  const paymentOptions = {
    getAvailableOptionsForAppointment: (_tenantId: bigint, publicId: string) => { optionsCalls.push(publicId); return Promise.resolve({ pixLocalAvailable: true, mercadoPagoAvailable: false, payLocalAvailable: true, balanceCents: '5000' }); },
    createPixCharge: () => Promise.resolve({ charge: { publicId: 'charge-pix', amountCents: '5000', currency: 'BRL', pixCopyPaste: 'pix-copia-cola' } }),
  };
  const service = new WhatsAppAssistantService(repository, delivery, upcoming([item]) as never, undefined, undefined, undefined, undefined, paymentOptions as never);
  await (service as unknown as { openBookingPayment: (input: unknown, conversationId: bigint, phone: string, customerId: bigint, appointmentPublicId: string) => Promise<void> }).openBookingPayment({ tenantId: 1n, instanceId: 'INST', customerId: 7n }, 1n, '5515997118125', 7n, item.publicId);
  assert.deepEqual(optionsCalls, [item.publicId]);
  assert.deepEqual(at(sent, 0).actionIds, ['BOOKING_PAYMENT_PIX', 'BOOKING_PAYMENT_LOCAL']);
  await handle(service, inbound(), { actionId: 'BOOKING_PAYMENT_PIX' });
  assert.equal(at(sent, 1).message.includes('pix-copia-cola'), true);
  assert.deepEqual(at(conversations, 0).context, { appointmentPublicId: item.publicId, paymentMethod: 'PIX', chargePublicId: 'charge-pix' });
});

void test('Mercado Pago cria cobrança real, local não cria pagamento e status usa PaymentService', async () => {
  const now = new Date();
  const item = { publicId: '00000000-0000-4000-8000-000000000061', startsAt: '2026-08-20T14:00:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', priceCents: '5000', status: 'PENDING' };
  const { repository, delivery, conversations, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_PAYMENT', context: { appointmentPublicId: item.publicId }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  let mercadoPagoCharges = 0; let paymentReads = 0;
  const options = { createMercadoPagoCharge: () => { mercadoPagoCharges += 1; return Promise.resolve({ publicId: 'charge-mp', amountCents: '5000', currency: 'BRL', pixCopyPaste: 'mp-pix' }); } };
  const payments = { listForAppointment: () => { paymentReads += 1; return Promise.resolve({ summary: { totalPaidCents: '5000' } }); } };
  const service = new WhatsAppAssistantService(repository, delivery, upcoming([item]) as never, undefined, undefined, undefined, undefined, options as never, payments as never);
  await handle(service, inbound(), { actionId: 'BOOKING_PAYMENT_MERCADO_PAGO' });
  assert.equal(mercadoPagoCharges, 1);
  assert.equal(at(sent, 0).message.includes('mp-pix'), true);
  await handle(service, inbound(), { actionId: 'BOOKING_PAYMENT_STATUS' });
  assert.equal(paymentReads, 1);
  assert.equal(at(sent, 1).message, 'Pagamento confirmado ✅');
  await handle(service, inbound(), { actionId: 'BOOKING_PAYMENT_LOCAL' });
  assert.equal(mercadoPagoCharges, 1);
  assert.equal(at(sent, 2).message, 'Pronto ✅\nSeu pagamento será realizado no estabelecimento.');
  assert.deepEqual(at(conversations, 0).context, { appointmentPublicId: item.publicId });
});

void test('pagamento não cria cobrança para agendamento fora do escopo do cliente', async () => {
  const now = new Date(); let pixCharges = 0;
  const { repository, delivery, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_PAYMENT', context: { appointmentPublicId: '00000000-0000-4000-8000-000000000062' }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = { getForCustomer: () => Promise.reject(new Error('not found')) };
  const options = { createPixCharge: () => { pixCharges += 1; return Promise.resolve({}); } };
  await handle(new WhatsAppAssistantService(repository, delivery, appointments as never, undefined, undefined, undefined, undefined, options as never), inbound(), { actionId: 'BOOKING_PAYMENT_PIX' });
  assert.equal(pixCharges, 0);
  assert.equal(at(sent, 0).message, 'O agendamento não está mais disponível.');
});

void test('cancelar e reagendar pelo menu usam seleção compartilhada e o fluxo existente', async () => {
  const now = new Date();
  const first = { publicId: '00000000-0000-4000-8000-000000000070', startsAt: '2026-08-20T14:00:00.000Z', serviceName: 'Corte', professionalName: 'Rafael', professionalPublicId: 'pro-a', servicePublicId: 'service-a', unitPublicId: null, priceCents: '5000', status: 'PENDING' };
  const second = { ...first, publicId: '00000000-0000-4000-8000-000000000071' };
  const { repository, delivery, conversations, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'MAIN_MENU', context: {}, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  const appointments = upcoming([first, second]);
  const service = new WhatsAppAssistantService(repository, delivery, appointments as never, availableDates() as never);
  await handle(service, inbound(), { actionId: 'MAIN_MENU_CANCEL' });
  assert.deepEqual(at(conversations, 0).context, { pendingAppointmentAction: 'CANCEL' });
  await handle(service, inbound(), { actionId: `BOOKING_SELECT:${second.publicId}` });
  assert.equal(at(sent, 2).actionIds.includes('BOOKING_CANCEL_CONFIRM'), true);
  await handle(service, inbound(), { actionId: 'MAIN_MENU_RESCHEDULE' });
  assert.deepEqual(at(conversations, 0).context, { pendingAppointmentAction: 'RESCHEDULE' });
  await handle(service, inbound(), { actionId: `BOOKING_SELECT:${first.publicId}` });
  assert.equal(at(sent, 5).actionIds.some((id) => id.startsWith('BOOKING_RESCHEDULE_DATE:')), true);
});

void test('como chegar reutiliza a URL de mapas cadastrada e informa quando não há localização', async () => {
  const now = new Date();
  const base = { id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_QUERY', context: {}, lastInboundAt: now, expiresAt: conversationExpiresAt(now) };
  const withLocation = fakeRepository([base]);
  await handle(new WhatsAppAssistantService(withLocation.repository, withLocation.delivery, undefined, undefined, bookingCatalog([], [], { googleMapsUrl: 'https://maps.app.goo.gl/studio', latitude: null, longitude: null }) as never), inbound(), { actionId: 'BOOKING_DIRECTIONS' });
  assert.equal(at(withLocation.sent, 0).message.includes('https://maps.app.goo.gl/studio'), true);
  const withoutLocation = fakeRepository([{ ...base, id: 2n }]);
  await handle(new WhatsAppAssistantService(withoutLocation.repository, withoutLocation.delivery, undefined, undefined, bookingCatalog([], []) as never), inbound(), { actionId: 'BOOKING_DIRECTIONS' });
  assert.equal(at(withoutLocation.sent, 0).message, 'O estabelecimento ainda não cadastrou uma localização para navegação.');
});

void test('ponte criação para pagamento cria o agendamento e consulta as opções', async () => {
  const now = new Date(); let creates = 0; const optionsCalls: string[] = [];
  const appointmentPublicId = '00000000-0000-4000-8000-000000000080';
  const { repository, delivery, conversations, sent } = fakeRepository([{ id: 1n, publicId: 'conv-1', tenantId: 1n, customerId: 7n, phone: '5515997118125', status: 'ACTIVE', currentFlow: 'BOOKING_CREATE', currentStep: 'CONFIRMATION', context: { servicePublicId: 'service-a', professionalPublicId: 'pro-a', date: '2026-08-20', time: '11:00' }, lastInboundAt: now, expiresAt: conversationExpiresAt(now) }]);
  (repository as unknown as { client: { customer: { findUnique: () => Promise<{ publicId: string }> } } }).client = { customer: { findUnique: () => Promise.resolve({ publicId: 'customer-a' }) } };
  const appointments = { create: () => { creates += 1; return Promise.resolve({ publicId: appointmentPublicId }); } };
  const options = { getAvailableOptionsForAppointment: (_tenantId: bigint, id: string) => { optionsCalls.push(id); return Promise.resolve({ pixLocalAvailable: true, mercadoPagoAvailable: false, payLocalAvailable: true, balanceCents: '5000' }); } };
  const service = new WhatsAppAssistantService(repository, delivery, appointments as never, availableDates() as never, bookingCatalog([{ publicId: 'service-a', name: 'Corte', priceCents: '5000', durationMinutes: 30 }], [{ publicId: 'pro-a', name: 'Rafael' }]) as never, undefined, undefined, options as never);
  await handle(service, inbound(), { actionId: 'BOOKING_CREATE_CONFIRM' });
  assert.equal(creates, 1);
  assert.deepEqual(optionsCalls, [appointmentPublicId]);
  assert.deepEqual(at(conversations, 0).context, { appointmentPublicId });
  assert.equal(at(conversations, 0).currentFlow, 'BOOKING_PAYMENT');
  assert.equal(at(sent, 0).actionIds.includes('BOOKING_PAYMENT_PIX'), true);
});

void test('IntegrationService entrega as dependências críticas ao assistant', () => {
  const { repository, delivery } = fakeRepository();
  const appointments = {};
  const availability = {};
  const paymentOptions = {};
  const payments = {};
  const service = new IntegrationService(repository, undefined, delivery, appointments as never, availability as never, undefined, undefined, undefined, paymentOptions as never, payments as never);
  const assistant = (service as unknown as { assistant: { appointments: unknown; availability: unknown; paymentOptions: unknown; payments: unknown } }).assistant;
  assert.equal(assistant.appointments, appointments);
  assert.equal(assistant.availability, availability);
  assert.equal(assistant.paymentOptions, paymentOptions);
  assert.equal(assistant.payments, payments);
  const connectionSource = readFileSync(new URL('../../database/connection.ts', import.meta.url), 'utf8');
  assert.match(
    connectionSource,
    /new IntegrationService\([\s\S]*appointments,[\s\S]*availability,[\s\S]*tenantPaymentOptions,[\s\S]*payments,/u,
  );
});

void test('cliente do tenant A não acessa agendamento do tenant B', async () => {
  const findCalls: { tenantId: bigint; publicId: string }[] = [];
  const appointments = new AppointmentService(
    {
      find: (tenantId: bigint, publicId: string) => {
        findCalls.push({ tenantId, publicId });
        return Promise.resolve(null);
      },
    } as never,
    {} as never,
  );
  await assert.rejects(
    appointments.getForCustomer(1n, 7n, '00000000-0000-4000-8000-000000000099'),
  );
  assert.deepEqual(findCalls, [{ tenantId: 1n, publicId: '00000000-0000-4000-8000-000000000099' }]);
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
