import { describe, expect, it, vi } from 'vitest';

import { NotificationTemplateService } from './notification-template.service.js';

describe('WhatsApp transactional templates', () => {
  const client = {
    notificationTemplate: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const service = new NotificationTemplateService(client as never);
  const variables = {
    customerName: 'Ana',
    serviceName: 'Corte',
    professionalName: 'Bia',
    date: '15/08',
    time: '10:30',
  };

  it.each([
    ['appointment.booking_confirmed', 'foi confirmado'],
    ['appointment.reminder', 'Lembrete'],
    ['appointment.booking_canceled', 'foi cancelado'],
  ] as const)('renders %s without leaking undefined values', async (kind, expected) => {
    const message = await service.renderWhatsApp(1n, kind, variables);
    expect(message).toContain(expected);
    expect(message).toContain('Ana');
    expect(message).not.toContain('undefined');
  });
});
