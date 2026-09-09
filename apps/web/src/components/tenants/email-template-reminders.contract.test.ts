import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const emailTemplateSource = readFileSync(new URL('./EmailTemplateModule.tsx', import.meta.url), 'utf8');

describe('email reminder template UI contract', () => {
  it('shows reminder e-mail templates together with existing e-mail templates in the intended order', () => {
    const confirmed = emailTemplateSource.indexOf("'appointment.booking_confirmed'");
    const dayBefore = emailTemplateSource.indexOf("'appointment.day_before_reminder'");
    const upcoming = emailTemplateSource.indexOf("'appointment.upcoming_reminder'");
    const canceled = emailTemplateSource.indexOf("'appointment.booking_canceled'");

    expect(confirmed).toBeGreaterThan(-1);
    expect(dayBefore).toBeGreaterThan(confirmed);
    expect(upcoming).toBeGreaterThan(dayBefore);
    expect(canceled).toBeGreaterThan(upcoming);
    expect(emailTemplateSource).toContain('Lembrete do dia anterior');
    expect(emailTemplateSource).toContain('Lembrete antes do atendimento');
  });

  it('describes reminder timing without creating timing controls on the e-mail page', () => {
    expect(emailTemplateSource).toContain(
      'Enviada no dia anterior ao atendimento, no horário configurado.',
    );
    expect(emailTemplateSource).toContain('Enviada alguns minutos antes do horário marcado.');
    expect(emailTemplateSource).not.toContain('dayBeforeHour');
    expect(emailTemplateSource).not.toContain('upcomingMinutesBefore');
  });

  it('keeps the editor scoped to e-mail content fields', () => {
    expect(emailTemplateSource).toContain('<strong>Canal:</strong> E-mail');
    expect(emailTemplateSource).toContain('Fallback em texto simples');
    expect(emailTemplateSource).toContain('Título principal');
    expect(emailTemplateSource).toContain('Texto introdutório');
    expect(emailTemplateSource).toContain('Texto após os dados');
    expect(emailTemplateSource).not.toContain('WhatsAppMessageEditor');
    expect(emailTemplateSource).not.toContain('Meta');
  });
});
