import { describe, expect, it, vi } from 'vitest';

import { NotificationTemplateService } from './notification-template.service.js';
import { type PrismaClient } from '../../database-client/client.js';

type StoredTemplate = {
  id: bigint;
  kind: string;
  subject: string;
  body: string;
  whatsappBody?: string | null;
  whatsappEnabled?: boolean;
  whatsappButtons?: unknown;
};

function buildService(seed: StoredTemplate[] = []) {
  const stored = new Map<string, StoredTemplate>(
    seed.map((item, index) => [item.kind, { ...item, id: item.id ?? BigInt(index + 1) }]),
  );
  const client = {
    notificationTemplate: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve([...stored.values()])),
      findFirst: vi.fn().mockImplementation(({ where }: { where?: { kind?: string } } = {}) => {
        if (where?.kind === undefined) return Promise.resolve([...stored.values()][0] ?? null);
        return Promise.resolve(stored.get(where.kind) ?? null);
      }),
      create: vi
        .fn()
        .mockImplementation(({ data }: { data: Omit<StoredTemplate, 'id'> }) => {
          stored.set(data.kind, { id: BigInt(stored.size + 1), ...data });
          return Promise.resolve();
        }),
      update: vi
        .fn()
        .mockImplementation(({ where, data }: { where: { id: bigint }; data: Partial<StoredTemplate> }) => {
          const current = [...stored.values()].find((item) => item.id === where.id);
          if (current !== undefined) stored.set(current.kind, { ...current, ...data });
          return Promise.resolve();
        }),
      deleteMany: vi.fn().mockImplementation(({ where }: { where: { kind?: string } }) => {
        if (where.kind === undefined) stored.clear();
        else stored.delete(where.kind);
        return Promise.resolve({ count: 1 });
      }),
    },
  } as unknown as PrismaClient;
  return { service: new NotificationTemplateService(client), stored, client };
}

describe('template editável de novo agendamento', () => {
  it('usa o padrão profissional quando o tenant não possui override', async () => {
    const { service } = buildService();
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
    const { service } = buildService();
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
    const { service } = buildService();
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
    const { service } = buildService();
    await expect(
      service.update(1n, 'appointment.booking_confirmed', {
        subject: 'Olá {{cliente_nome}}',
        body: 'Mensagem válida',
      }),
    ).rejects.toMatchObject({ code: 'NOTIFICATION_TEMPLATE_VARIABLE_UNKNOWN' });
  });

  it('lista defaults de e-mail para lembrete do dia anterior e lembrete antes do atendimento', async () => {
    const { service } = buildService();
    const result = await service.list(1n);
    const dayBefore = result.items.find((item) => item.kind === 'appointment.day_before_reminder');
    const upcoming = result.items.find((item) => item.kind === 'appointment.upcoming_reminder');

    expect(dayBefore).toMatchObject({
      subject: 'Lembrete do seu agendamento — {{tenantName}}',
      title: 'Seu agendamento é amanhã',
      intro:
        'Olá, {{customerName}}! Passando para lembrar que seu atendimento está marcado para amanhã.',
      afterText: 'Se precisar alterar o horário, acesse seus agendamentos pelo aplicativo.',
      isCustom: false,
    });
    expect(dayBefore?.body).toContain('Data/hora: {{when}}');
    expect(upcoming).toMatchObject({
      subject: 'Seu atendimento está próximo — {{tenantName}}',
      title: 'Seu atendimento está próximo',
      intro: 'Olá, {{customerName}}! Seu horário está chegando.',
      afterText: 'Se precisar de ajuda, consulte seus agendamentos pelo aplicativo.',
      isCustom: false,
    });
    expect(upcoming?.body).toContain('Esperamos você em breve.');
  });

  it('salva personalização completa do lembrete do dia anterior sem afetar customizações antigas', async () => {
    const { service, stored } = buildService([
      {
        id: 10n,
        kind: 'appointment.booking_confirmed',
        subject: 'Confirmado antigo',
        body: 'Corpo antigo',
        whatsappBody: 'WhatsApp antigo',
      },
    ]);
    await service.update(1n, 'appointment.day_before_reminder', {
      subject: 'Amanhã — {{tenantName}}',
      body: 'Oi {{customerName}}, amanhã: {{when}}',
      title: 'Amanhã tem {{serviceName}}',
      intro: 'Até amanhã, {{customerName}}.',
      afterText: 'Abra o app.',
      ctaLabel: 'Ver horário',
    });

    const rendered = await service.render(1n, 'appointment.day_before_reminder', {
      tenantName: 'Clínica',
      customerName: 'Bruna',
      serviceName: 'Consulta',
      when: '10/09 às 9:00',
    });
    expect(rendered).toMatchObject({
      subject: 'Amanhã — Clínica',
      body: 'Oi Bruna, amanhã: 10/09 às 9:00',
      title: 'Amanhã tem Consulta',
      intro: 'Até amanhã, Bruna.',
      afterText: 'Abra o app.',
      ctaLabel: 'Ver horário',
    });
    expect(stored.get('appointment.booking_confirmed')).toMatchObject({
      subject: 'Confirmado antigo',
      body: 'Corpo antigo',
      whatsappBody: 'WhatsApp antigo',
    });
  });

  it('salva personalização completa do lembrete antes do atendimento', async () => {
    const { service } = buildService();
    await service.update(1n, 'appointment.upcoming_reminder', {
      subject: 'Chegando — {{tenantName}}',
      body: 'Seu atendimento está próximo, {{customerName}}. {{when}}',
      title: 'Está chegando',
      intro: 'Prepare-se, {{customerName}}.',
      afterText: 'Esperamos você.',
      ctaLabel: 'Abrir app',
    });

    const rendered = await service.render(1n, 'appointment.upcoming_reminder', {
      tenantName: 'Studio',
      customerName: 'Ana',
      when: 'hoje às 14:00',
    });
    expect(rendered).toMatchObject({
      subject: 'Chegando — Studio',
      body: 'Seu atendimento está próximo, Ana. hoje às 14:00',
      title: 'Está chegando',
      intro: 'Prepare-se, Ana.',
      afterText: 'Esperamos você.',
      ctaLabel: 'Abrir app',
    });
  });

  it('mantém o corpo WhatsApp separado do template de e-mail', async () => {
    const { service } = buildService();
    await service.update(1n, 'appointment.day_before_reminder', {
      subject: 'Amanhã — {{tenantName}}',
      body: 'E-mail {{customerName}}',
      title: 'Título e-mail',
      intro: 'Intro e-mail',
      afterText: 'Final e-mail',
      ctaLabel: 'CTA e-mail',
    });

    const email = await service.render(1n, 'appointment.day_before_reminder', {
      tenantName: 'Studio',
      customerName: 'Ana',
    });
    const whatsapp = await service.renderWhatsApp(1n, 'appointment.day_before_reminder', {
      customerName: 'Ana',
      serviceName: 'Corte',
      professionalName: 'Rafael',
      time: '09:00',
    });
    expect(email.body).toBe('E-mail Ana');
    expect(whatsapp).toContain('Lembrete: seu agendamento de Corte com Rafael');
    expect(whatsapp).not.toContain('E-mail Ana');
    expect(whatsapp).not.toContain('Título e-mail');
  });
});
