import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentNotificationService } from '../src/modules/notifications/appointment-notification.service.js';
import { AppointmentReminderService } from '../src/modules/notifications/appointment-reminder.service.js';
import { CustomerNotificationDispatcher } from '../src/modules/notifications/customer-notification-dispatcher.js';
import { CapturingEmailDelivery } from '../src/modules/notifications/email-delivery.js';
import { NotificationTemplateService } from '../src/modules/notifications/notification-template.service.js';
import { NotificationService } from '../src/modules/notifications/notification.service.js';
import {
  PushSubscriptionGoneError,
  UnconfiguredPushDelivery,
  type PushDelivery,
  type PushMessage,
} from '../src/modules/notifications/push-delivery.js';
import { PushSubscriptionService } from '../src/modules/notifications/push-subscription.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

class CapturingPushDeliveryForTest implements PushDelivery {
  public readonly available = true;
  public readonly messages: PushMessage[] = [];
  public send(message: PushMessage): Promise<void> {
    this.messages.push(structuredClone(message));
    return Promise.resolve();
  }
}

class GonePushDelivery implements PushDelivery {
  public readonly available = true;
  public send(): Promise<void> {
    return Promise.reject(new PushSubscriptionGoneError('gone'));
  }
}

class NetworkFailurePushDelivery implements PushDelivery {
  public readonly available = true;
  public send(): Promise<void> {
    return Promise.reject(new Error('Falha de rede simulada'));
  }
}

describe.skipIf(url === undefined)('push notifications (Etapa 13) com MySQL local', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let otherTenantId: bigint;
  let customerId: bigint;
  let customerPublicId: string;
  let otherCustomerId: bigint;
  let professionalId: bigint;
  let serviceId: bigint;

  const endpoint = (label: string) => `https://push.test.invalid/${suffix}-${label}`;

  beforeEach(async () => {
    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `push-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Teste',
        displayName: 'Teste',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    const other = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `push-other-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Outro',
        displayName: 'Outro',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;
    otherTenantId = other.id;

    const customer = await client.customer.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        name: 'Cliente Push',
        email: 'cliente-push@test.invalid',
        acceptsCommunications: true,
      },
    });
    customerId = customer.id;
    customerPublicId = customer.publicId;

    const otherCustomer = await client.customer.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        name: 'Outro cliente',
        acceptsCommunications: true,
      },
    });
    otherCustomerId = otherCustomer.id;

    const professional = await client.professional.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        name: 'Profissional',
        publicName: 'Profissional',
        calendarColor: '#111111',
      },
    });
    const service = await client.service.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        name: 'Consulta',
        durationMinutes: 30,
        hasPostServiceBreak: false,
        priceCents: 10_000n,
        color: '#222222',
      },
    });
    professionalId = professional.id;
    serviceId = service.id;
  });

  afterEach(async () => {
    const ids = [tenantId, otherTenantId];
    await client.notificationLog.deleteMany({ where: { tenantId: { in: ids } } });
    await client.pushSubscription.deleteMany({ where: { tenantId: { in: ids } } });
    await client.appointment.deleteMany({ where: { tenantId: { in: ids } } });
    await client.customer.deleteMany({ where: { tenantId: { in: ids } } });
    await client.service.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
    await client.tenant.deleteMany({ where: { id: { in: ids } } });
  });

  it('cria uma inscrição push vinculada ao cliente e ao tenant', async () => {
    const service = new PushSubscriptionService(client);
    const result = await service.subscribe(tenantId, customerId, {
      endpoint: endpoint('a'),
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      userAgent: 'TestAgent/1.0',
    });

    const stored = await client.pushSubscription.findUniqueOrThrow({
      where: { publicId: result.publicId },
    });
    expect(stored.tenantId).toBe(tenantId);
    expect(stored.customerId).toBe(customerId);
    expect(stored.active).toBe(true);
    expect(stored.endpoint).toBe(endpoint('a'));
  });

  it('permite mais de um dispositivo (endpoint) por cliente', async () => {
    const service = new PushSubscriptionService(client);
    await service.subscribe(tenantId, customerId, {
      endpoint: endpoint('device-1'),
      keys: { p256dh: 'k1', auth: 'a1' },
    });
    await service.subscribe(tenantId, customerId, {
      endpoint: endpoint('device-2'),
      keys: { p256dh: 'k2', auth: 'a2' },
    });

    const { items } = await service.list(tenantId, customerId);
    expect(items).toHaveLength(2);
  });

  it('isola subscriptions por tenant e cliente — não permite ler nem remover de outro dono', async () => {
    const service = new PushSubscriptionService(client);
    await service.subscribe(tenantId, customerId, {
      endpoint: endpoint('isolated'),
      keys: { p256dh: 'k', auth: 'a' },
    });

    const otherCustomerList = await service.list(tenantId, otherCustomerId);
    expect(otherCustomerList.items).toHaveLength(0);

    const otherTenantList = await service.list(otherTenantId, customerId);
    expect(otherTenantList.items).toHaveLength(0);

    await expect(
      service.unsubscribe(tenantId, otherCustomerId, endpoint('isolated')),
    ).rejects.toMatchObject({ code: 'PUSH_SUBSCRIPTION_NOT_FOUND' });
    await expect(
      service.unsubscribe(otherTenantId, customerId, endpoint('isolated')),
    ).rejects.toMatchObject({ code: 'PUSH_SUBSCRIPTION_NOT_FOUND' });
  });

  it('remove (unsubscribe) uma inscrição própria e ela some da listagem', async () => {
    const service = new PushSubscriptionService(client);
    await service.subscribe(tenantId, customerId, {
      endpoint: endpoint('remove-me'),
      keys: { p256dh: 'k', auth: 'a' },
    });

    await service.unsubscribe(tenantId, customerId, endpoint('remove-me'));

    const { items } = await service.list(tenantId, customerId);
    expect(items).toHaveLength(0);
  });

  it('inscrever novamente o mesmo endpoint é idempotente (reassocia/reativa em vez de duplicar)', async () => {
    const service = new PushSubscriptionService(client);
    const first = await service.subscribe(tenantId, customerId, {
      endpoint: endpoint('same'),
      keys: { p256dh: 'k1', auth: 'a1' },
    });
    const second = await service.subscribe(tenantId, customerId, {
      endpoint: endpoint('same'),
      keys: { p256dh: 'k2', auth: 'a2' },
    });

    expect(second.publicId).toBe(first.publicId);
    const count = await client.pushSubscription.count({ where: { tenantId, customerId } });
    expect(count).toBe(1);
    const stored = await client.pushSubscription.findUniqueOrThrow({
      where: { publicId: first.publicId },
    });
    expect(stored.p256dh).toBe('k2');
  });

  it('desativa automaticamente uma inscrição inválida/expirada (404/410 do provedor) sem perder a notificação', async () => {
    const pushService = new PushSubscriptionService(client);
    const subscription = await pushService.subscribe(tenantId, customerId, {
      endpoint: endpoint('gone'),
      keys: { p256dh: 'k', auth: 'a' },
    });

    const notifications = new NotificationService(client, {
      email: new CapturingEmailDelivery(),
      push: new GonePushDelivery(),
    });
    await notifications.enqueue(tenantId, {
      channel: 'PUSH',
      kind: 'appointment.booking_confirmed',
      targetType: 'appointment',
      targetPublicId: randomUUID(),
      recipient: subscription.publicId,
      subject: 'Assunto',
      body: 'Corpo',
    });

    await notifications.processPending();

    const { items } = await notifications.list(tenantId, { page: 1, limit: 20 });
    expect(items[0]?.status).toBe('FAILED');
    expect(items[0]?.lastError).not.toBeNull();

    const stored = await client.pushSubscription.findUniqueOrThrow({
      where: { publicId: subscription.publicId },
    });
    expect(stored.active).toBe(false);
  });

  it('uma falha de entrega comum (não Gone) mantém a inscrição ativa e registra o erro', async () => {
    const pushService = new PushSubscriptionService(client);
    const subscription = await pushService.subscribe(tenantId, customerId, {
      endpoint: endpoint('flaky'),
      keys: { p256dh: 'k', auth: 'a' },
    });

    const notifications = new NotificationService(client, {
      email: new CapturingEmailDelivery(),
      push: new NetworkFailurePushDelivery(),
    });
    await notifications.enqueue(tenantId, {
      channel: 'PUSH',
      kind: 'appointment.booking_confirmed',
      targetType: 'appointment',
      targetPublicId: randomUUID(),
      recipient: subscription.publicId,
      subject: 'Assunto',
      body: 'Corpo',
    });
    await notifications.processPending();

    const stored = await client.pushSubscription.findUniqueOrThrow({
      where: { publicId: subscription.publicId },
    });
    expect(stored.active).toBe(true);
  });

  it('integração com a fila: notificação PUSH fica PENDING até processPending() e então é entregue', async () => {
    const pushService = new PushSubscriptionService(client);
    const subscription = await pushService.subscribe(tenantId, customerId, {
      endpoint: endpoint('queue'),
      keys: { p256dh: 'k', auth: 'a' },
    });

    const pushDelivery = new CapturingPushDeliveryForTest();
    const notifications = new NotificationService(client, {
      email: new CapturingEmailDelivery(),
      push: pushDelivery,
    });
    await notifications.enqueue(tenantId, {
      channel: 'PUSH',
      kind: 'appointment.reminder',
      targetType: 'appointment',
      targetPublicId: randomUUID(),
      recipient: subscription.publicId,
      subject: 'Lembrete',
      body: 'Seu atendimento é amanhã.',
    });

    const pending = await notifications.list(tenantId, { page: 1, limit: 20 });
    expect(pending.items[0]?.status).toBe('PENDING');
    expect(pushDelivery.messages).toHaveLength(0);

    await notifications.processPending();

    expect(pushDelivery.messages).toHaveLength(1);
    const sent = await notifications.list(tenantId, { page: 1, limit: 20 });
    expect(sent.items[0]?.status).toBe('SENT');
  });

  it('sem configuração de VAPID (push não configurado), a notificação é SKIPPED sem quebrar o sistema', async () => {
    const pushService = new PushSubscriptionService(client);
    const subscription = await pushService.subscribe(tenantId, customerId, {
      endpoint: endpoint('unconfigured'),
      keys: { p256dh: 'k', auth: 'a' },
    });

    const notifications = new NotificationService(client, {
      email: new CapturingEmailDelivery(),
      push: new UnconfiguredPushDelivery(),
    });
    await notifications.enqueue(tenantId, {
      channel: 'PUSH',
      kind: 'appointment.booking_confirmed',
      targetType: 'appointment',
      targetPublicId: randomUUID(),
      recipient: subscription.publicId,
      subject: 'Assunto',
      body: 'Corpo',
    });

    await expect(notifications.processPending()).resolves.toEqual({ processed: 1 });

    const { items } = await notifications.list(tenantId, { page: 1, limit: 20 });
    expect(items[0]?.status).toBe('SKIPPED');
    expect(items[0]?.lastError).toContain('VAPID');
  });

  it('acceptsCommunications = false bloqueia também o canal push, não só e-mail', async () => {
    await client.customer.update({
      where: { id: customerId },
      data: { acceptsCommunications: false },
    });
    const pushService = new PushSubscriptionService(client);
    await pushService.subscribe(tenantId, customerId, {
      endpoint: endpoint('opted-out'),
      keys: { p256dh: 'k', auth: 'a' },
    });

    const notifications = new NotificationService(client, {
      email: new CapturingEmailDelivery(),
      push: new CapturingPushDeliveryForTest(),
    });
    const templates = new NotificationTemplateService(client);
    const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);

    const dispatched = await dispatcher.dispatch(
      tenantId,
      customerId,
      'appointment.booking_confirmed',
      randomUUID(),
      {
        customerName: 'Cliente Push',
        protocol: 'AGD-000001',
        serviceName: 'Consulta',
        professionalName: 'Profissional',
        when: '01/01/2026 10:00',
        canceledReasonLine: '',
      },
    );

    expect(dispatched).toBe(false);
    const { items } = await notifications.list(tenantId, { page: 1, limit: 20 });
    expect(items).toHaveLength(0);
  });

  it('dispara push (além do e-mail) em confirmação, cancelamento e lembrete de agendamento', async () => {
    const pushService = new PushSubscriptionService(client);
    await pushService.subscribe(tenantId, customerId, {
      endpoint: endpoint('lifecycle'),
      keys: { p256dh: 'k', auth: 'a' },
    });

    const notifications = new NotificationService(client, {
      email: new CapturingEmailDelivery(),
      push: new CapturingPushDeliveryForTest(),
    });
    const templates = new NotificationTemplateService(client);
    const dispatcher = new CustomerNotificationDispatcher(client, notifications, templates);
    const appointmentNotifications = new AppointmentNotificationService(client, dispatcher);
    const reminders = new AppointmentReminderService(client, dispatcher);

    const appointmentPayload = (kindSuffix: string, canceledReason: string | null = null) => ({
      publicId: randomUUID(),
      protocol: `AGD-${kindSuffix}`,
      customerPublicId,
      customerName: 'Cliente Push',
      customerPhone: null,
      professionalPublicId: randomUUID(),
      professionalName: 'Profissional',
      servicePublicId: randomUUID(),
      serviceName: 'Consulta',
      unitPublicId: null,
      unitName: null,
      startsAt: new Date().toISOString(),
      endsAt: new Date().toISOString(),
      durationMinutes: 30,
      postServiceBreakMinutes: 0,
      priceCents: '10000',
      status: 'PENDING' as const,
      notes: null,
      source: 'INTERNAL',
      canceledReason,
      rescheduleReason: null,
      isFitIn: false,
      fitInReason: null,
      checkedInAt: null,
      depositType: null,
      depositPercentage: null,
      depositAmountCents: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await appointmentNotifications.notifyBookingConfirmed(
      tenantId,
      appointmentPayload('confirmed'),
    );
    await appointmentNotifications.notifyBookingCanceled(
      tenantId,
      appointmentPayload('canceled', 'Cliente desistiu'),
    );

    const appointment = await client.appointment.create({
      data: {
        publicId: randomUUID(),
        protocol: 'AGD-reminder',
        tenantId,
        customerId,
        professionalId,
        serviceId,
        startsAt: new Date(Date.now() + 12 * 3_600_000),
        endsAt: new Date(Date.now() + 12 * 3_600_000 + 30 * 60_000),
        priceCents: 10_000n,
        durationMinutes: 30,
        source: 'INTERNAL',
      },
    });
    await reminders.scheduleUpcomingReminders();

    const { items } = await notifications.list(tenantId, { page: 1, limit: 20 });
    const pushKinds = items.filter((item) => item.channel === 'PUSH').map((item) => item.kind);
    expect(pushKinds).toContain('appointment.booking_confirmed');
    expect(pushKinds).toContain('appointment.booking_canceled');
    expect(pushKinds).toContain('appointment.reminder');
    const reminderPush = items.find(
      (item) => item.channel === 'PUSH' && item.kind === 'appointment.reminder',
    );
    expect(reminderPush?.targetPublicId).toBe(appointment.publicId);
  });
});
