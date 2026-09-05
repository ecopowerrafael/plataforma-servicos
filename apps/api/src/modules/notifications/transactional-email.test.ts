import { describe, expect, it } from 'vitest';

import { renderPushTemplate, renderTemplate } from './notification-template.service.js';
import { renderTransactionalEmail } from './transactional-email.js';

describe('copies transacionais de push', () => {
  const variables = {
    serviceName: 'Corte',
    professionalName: 'Rafael',
    date: '14 de agosto',
    time: '14:15',
    protocol: 'AGD-000014',
  };

  it('confirma sem protocolo e preserva a copy curta', () => {
    const result = renderPushTemplate('appointment.booking_confirmed', variables);
    expect(result).toEqual({
      subject: 'Agendamento confirmado',
      body: 'Seu horário para Corte com Rafael está confirmado para 14 de agosto às 14:15.',
    });
    expect(`${result.subject}${result.body}`).not.toContain('AGD-');
  });

  it('lembra usando agendamento, nunca atendimento ou protocolo', () => {
    const result = renderPushTemplate('appointment.reminder', { ...variables, isToday: 'true' });
    expect(result.subject).toBe('Lembrete de agendamento');
    expect(result.body).toContain('é hoje às 14:15');
    expect(`${result.subject}${result.body}`).not.toMatch(/atendimento|AGD-/u);
  });

  it('cancela sem protocolo', () => {
    const result = renderPushTemplate('appointment.booking_canceled', variables);
    expect(result.subject).toBe('Agendamento cancelado');
    expect(result.body).toBe('Seu agendamento de Corte para 14 de agosto às 14:15 foi cancelado.');
  });
});

describe('e-mail transacional white-label', () => {
  const base = {
    tenantName: 'Barbearia Silva',
    logoUrl: 'https://agendei.site/public/media/logo',
    primaryColor: '#2457d6',
    title: 'Seu agendamento está confirmado',
    intro: 'Olá, Cliente!',
    details: [{ label: 'Serviço', value: 'Corte' }],
    afterText: 'Acompanhe pelo aplicativo.',
    ctaLabel: 'Ver meu agendamento',
    ctaUrl: 'https://agendei.site/public/silva/conta/agendamentos',
    protocol: 'AGD-000014',
  };

  it('inclui logo, CTA e protocolo apenas no corpo', () => {
    const html = renderTransactionalEmail(base);
    expect(html).toContain('https://agendei.site/public/media/logo');
    expect(html).toContain('https://agendei.site/public/silva/conta/agendamentos');
    expect(html).toContain('Protocolo: AGD-000014');
  });

  it('mantém fallback legível sem logo e escapa todo conteúdo', () => {
    const html = renderTransactionalEmail({
      ...base,
      tenantName: '<script>alert(1)</script>',
      logoUrl: null,
      intro: '<img src=x onerror=alert(1)>',
    });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>');
  });

  it('trata variável desconhecida como texto vazio', () => {
    expect(renderTemplate({ subject: 'Oi {{unknown}}', body: '{{known}}' }, { known: 'seguro' }))
      .toEqual({ subject: 'Oi ', body: 'seguro' });
  });
});
