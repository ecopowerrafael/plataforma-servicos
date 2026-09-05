import { describe, expect, it, vi } from 'vitest';

import { NotificationTemplateService } from './notification-template.service.js';
import { type PrismaClient } from '../../database-client/client.js';

function buildService() {
  let stored: { subject: string; body: string } | null = null;
  const client = {
    notificationTemplate: {
      findMany: vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            stored === null ? [] : [{ kind: 'appointment.booking_confirmed', ...stored }],
          ),
        ),
      findFirst: vi.fn().mockImplementation(() => Promise.resolve(stored)),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: { subject: string; body: string } }) => {
          stored = { subject: data.subject, body: data.body };
          return Promise.resolve();
        }),
      update: vi
        .fn()
        .mockImplementation(({ data }: { data: { subject: string; body: string } }) => {
          stored = { subject: data.subject, body: data.body };
          return Promise.resolve();
        }),
      deleteMany: vi.fn().mockImplementation(() => {
        stored = null;
        return Promise.resolve({ count: 1 });
      }),
    },
  } as unknown as PrismaClient;
  return new NotificationTemplateService(client);
}

describe('template editável de novo agendamento', () => {
  it('usa o padrão profissional quando o tenant não possui override', async () => {
    const service = buildService();
    const rendered = await service.render(1n, 'appointment.booking_confirmed', {
      tenantName: 'Barbearia Silva',
      customerName: 'Maria',
      serviceName: 'Corte',
      professionalName: 'Rafael',
      when: '14 de agosto às 14:15',
      protocol: 'AGD-1',
    });
    expect(rendered.subject).toBe('Seu agendamento foi confirmado — Barbearia Silva');
    expect(rendered.title).toBe('Seu agendamento está confirmado');
    expect(rendered.body).toContain('Protocolo: AGD-1');
  });

  it('salva e aplica assunto, título, introdução, texto final e CTA personalizados', async () => {
    const service = buildService();
    await service.update(1n, 'appointment.booking_confirmed', {
      subject: 'Reserva confirmada — {{tenantName}}',
      body: 'Oi {{customerName}}. Protocolo: {{protocol}}',
      title: 'Tudo certo, {{customerName}}',
      intro: 'Seu {{serviceName}} está reservado.',
      afterText: 'Esperamos você.',
      ctaLabel: 'Abrir reserva',
    });
    const rendered = await service.render(1n, 'appointment.booking_confirmed', {
      tenantName: 'Studio',
      customerName: 'Ana',
      serviceName: 'Massagem',
      protocol: 'AGD-2',
    });
    expect(rendered).toMatchObject({
      subject: 'Reserva confirmada — Studio',
      body: 'Oi Ana. Protocolo: AGD-2',
      title: 'Tudo certo, Ana',
      intro: 'Seu Massagem está reservado.',
      afterText: 'Esperamos você.',
      ctaLabel: 'Abrir reserva',
    });
  });

  it('nunca expõe protocolo no assunto personalizado', async () => {
    const service = buildService();
    await service.update(1n, 'appointment.booking_confirmed', {
      subject: 'Confirmado {{protocol}}',
      body: 'Protocolo: {{protocol}}',
    });
    const rendered = await service.render(1n, 'appointment.booking_confirmed', {
      protocol: 'AGD-99',
    });
    expect(rendered.subject).toBe('Confirmado ');
    expect(rendered.body).toBe('Protocolo: AGD-99');
  });

  it('rejeita variáveis que não pertencem ao renderer do evento', async () => {
    const service = buildService();
    await expect(
      service.update(1n, 'appointment.booking_confirmed', {
        subject: 'Olá {{cliente_nome}}',
        body: 'Mensagem válida',
      }),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_TEMPLATE_VARIABLE_UNKNOWN' });
  });
});
