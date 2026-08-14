import { isTransactionalNotification, NotificationKinds } from '@plataforma/shared';
import { describe, expect, it, vi } from 'vitest';

import { CustomerNotificationDispatcher } from './customer-notification-dispatcher.js';

import type { NotificationTemplateService } from './notification-template.service.js';
import type { NotificationService } from './notification.service.js';
import type { PrismaClient } from '../../database-client/client.js';

function build(acceptsCommunications: boolean, pushSubscriptions = 1) {
  const enqueue = vi.fn().mockResolvedValue(undefined);
  const client = {
    customer: {
      findUnique: vi.fn().mockResolvedValue({
        email: 'cliente@exemplo.com',
        whatsapp: '11999999999',
        acceptsCommunications,
      }),
    },
    pushSubscription: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: pushSubscriptions }, (_, index) => ({ publicId: `sub-${String(index)}` })),
        ),
    },
    tenantWhatsAppConfig: { findUnique: vi.fn().mockResolvedValue({ active: true }) },
    tenantSubscription: {
      findFirst: vi.fn().mockResolvedValue({ plan: { limits: [{ booleanValue: true }] } }),
    },
    tenant: {
      findUnique: vi.fn().mockResolvedValue({
        displayName: 'Barbearia Silva',
        slug: 'barbearia-silva',
        branding: { primaryColor: '#2457d6' },
        mediaAssets: [],
      }),
    },
  } as unknown as PrismaClient;
  const templates = {
    render: vi.fn().mockResolvedValue({ subject: 'Assunto', body: 'Corpo' }),
    renderWhatsApp: vi.fn().mockResolvedValue('Mensagem WhatsApp'),
  } as unknown as NotificationTemplateService;
  const dispatcher = new CustomerNotificationDispatcher(
    client,
    { enqueue } as unknown as NotificationService,
    templates,
  );
  return { dispatcher, enqueue };
}

const channelsOf = (enqueue: ReturnType<typeof vi.fn>) =>
  enqueue.mock.calls.map((call) => (call[1] as { channel: string }).channel);

describe('classificação de notificações', () => {
  it('trata como transacionais apenas os eventos do próprio agendamento', () => {
    const transactional = NotificationKinds.filter((kind) => isTransactionalNotification(kind));
    expect(transactional).toEqual([
      'appointment.booking_confirmed',
      'appointment.booking_canceled',
      'appointment.reminder',
    ]);
  });

  it('não classifica automações de marketing como transacionais', () => {
    for (const kind of NotificationKinds.filter((item) => item.startsWith('customer.recovery.')))
      expect(isTransactionalNotification(kind)).toBe(false);
  });
});

describe('envio com acceptsCommunications=false', () => {
  it('envia confirmação de agendamento em todos os canais', async () => {
    const { dispatcher, enqueue } = build(false);
    const dispatched = await dispatcher.dispatch(
      1n,
      2n,
      'appointment.booking_confirmed',
      'ap-1',
      {},
    );

    expect(dispatched).toBe(true);
    expect(channelsOf(enqueue)).toEqual(['EMAIL', 'PUSH', 'WHATSAPP']);
  });

  it('envia cancelamento e lembrete', async () => {
    for (const kind of ['appointment.booking_canceled', 'appointment.reminder'] as const) {
      const { dispatcher, enqueue } = build(false);
      await dispatcher.dispatch(1n, 2n, kind, 'ap-1', {});
      expect(channelsOf(enqueue)).toContain('EMAIL');
    }
  });

  it('bloqueia marketing em todos os canais', async () => {
    const { dispatcher, enqueue } = build(false);
    const dispatched = await dispatcher.dispatch(
      1n,
      2n,
      'customer.recovery.inactive',
      'cus-1',
      {},
      'customer',
    );

    expect(dispatched).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('envio com acceptsCommunications=true', () => {
  it('mantém o marketing funcionando como hoje', async () => {
    const { dispatcher, enqueue } = build(true);
    const dispatched = await dispatcher.dispatch(
      1n,
      2n,
      'customer.recovery.inactive',
      'cus-1',
      {},
      'customer',
    );

    expect(dispatched).toBe(true);
    expect(channelsOf(enqueue)).toEqual(['EMAIL', 'PUSH', 'WHATSAPP']);
  });
});
