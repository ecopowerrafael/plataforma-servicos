import { describe, expect, it, vi } from 'vitest';

import { CapturingEmailDelivery } from './email-delivery.js';
import { NotificationService } from './notification.service.js';
import { type PrismaClient } from '../../database-client/client.js';

describe('NotificationService enqueue idempotency', () => {
  it('does not create a notification that is already persisted', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 10n });
    const create = vi.fn();
    const client = {
      notificationLog: { findFirst, create },
    } as unknown as PrismaClient;
    const service = new NotificationService(client, {
      email: new CapturingEmailDelivery(),
      push: { available: false, send: vi.fn() },
    });

    await service.enqueue(1n, {
      channel: 'EMAIL',
      kind: 'appointment.booking_confirmed',
      targetType: 'appointment',
      targetPublicId: 'appointment-1',
      recipient: 'cliente@example.com',
      subject: 'Agendamento confirmado',
      body: 'Confirmado.',
    });

    expect(findFirst).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });

  it('coalesces concurrent attempts for the same notification', async () => {
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const findFirst = vi.fn().mockImplementation(async () => {
      await waiting;
      return null;
    });
    const create = vi.fn().mockResolvedValue({ publicId: 'notification-1' });
    const client = {
      notificationLog: { findFirst, create },
      externalIntegration: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    const service = new NotificationService(client, {
      email: new CapturingEmailDelivery(),
      push: { available: false, send: vi.fn() },
    });
    const input = {
      channel: 'EMAIL' as const,
      kind: 'appointment.booking_confirmed',
      targetType: 'appointment',
      targetPublicId: 'appointment-1',
      recipient: 'cliente@example.com',
      subject: 'Agendamento confirmado',
      body: 'Confirmado.',
    };

    const first = service.enqueue(1n, input);
    const second = service.enqueue(1n, input);
    release?.();
    await Promise.all([first, second]);

    expect(findFirst).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });

  it('sends booking confirmation on WhatsApp with tracked interactive actions', async () => {
    const log = {
      id: 12n,
      tenantId: 1n,
      channel: 'WHATSAPP',
      kind: 'appointment.booking_confirmed',
      targetType: 'appointment',
      targetPublicId: 'appointment-1',
      recipient: '5511999999999',
      subject: 'Agendamento criado',
      body: 'Seu agendamento foi criado ✅',
      status: 'PENDING',
    };
    const sendInteractiveButtons = vi.fn().mockResolvedValue({
      externalMessageId: 'message-1', status: 'SENT', errorCode: null,
    });
    const outboundCreate = vi.fn().mockResolvedValue({});
    const client = {
      notificationLog: {
        findMany: vi.fn().mockResolvedValue([{ id: log.id, status: log.status }]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(log),
        update: vi.fn().mockResolvedValue({}),
      },
      tenantWhatsAppConfig: { findUnique: vi.fn().mockResolvedValue({ phoneNumberId: 'INST' }) },
      whatsAppOutboundMessage: { create: outboundCreate },
    } as unknown as PrismaClient;
    const service = new NotificationService(client, {
      email: new CapturingEmailDelivery(),
      push: { available: false, send: vi.fn() },
      whatsapp: { sendInteractiveButtons } as never,
    });

    await service.processPending();

    expect(sendInteractiveButtons).toHaveBeenCalledWith(
      1n,
      '5511999999999',
      'Seu agendamento foi criado ✅',
      [
        { buttonId: 'BOOKING_CONFIRM', label: 'Confirmar agendamento' },
        { buttonId: 'BOOKING_RESCHEDULE', label: 'Reagendar' },
      ],
    );
    expect(outboundCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        notificationLogId: 12n,
        actionIds: ['BOOKING_CONFIRM', 'BOOKING_RESCHEDULE'],
      }),
    }));
  });
});
