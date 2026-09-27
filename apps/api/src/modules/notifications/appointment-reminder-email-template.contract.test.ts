import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const reminderServiceSource = readFileSync(
  new URL('./appointment-reminder.service.ts', import.meta.url),
  'utf8',
);
const dispatcherSource = readFileSync(
  new URL('./customer-notification-dispatcher.ts', import.meta.url),
  'utf8',
);

describe('appointment reminder email template contract', () => {
  it('schedules day-before reminders with the day-before notification kind', () => {
    expect(reminderServiceSource).toContain('scheduleDayBeforeReminders');
    expect(reminderServiceSource).toContain("'appointment.day_before_reminder'");
  });

  it('schedules before-appointment reminders with the upcoming notification kind', () => {
    expect(reminderServiceSource).toContain('scheduleUpcomingReminders');
    expect(reminderServiceSource).toContain("'appointment.upcoming_reminder'");
  });

  it('uses the shared e-mail renderer for reminder delivery without bypassing templates', () => {
    expect(dispatcherSource).toContain('const email = await this.templates.render(tenantId, kind, renderedVariables)');
    expect(dispatcherSource).toContain("channel: 'EMAIL'");
    expect(dispatcherSource).toContain('subject: email.subject');
    expect(dispatcherSource).toContain('body: email.body');
    expect(dispatcherSource).toContain('renderWhatsApp(tenantId, kind, renderedVariables)');
  });
});
