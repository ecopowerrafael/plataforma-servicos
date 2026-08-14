import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startNotificationWorker } from './notification-worker.js';

import type { AppointmentReminderService } from './appointment-reminder.service.js';
import type { NotificationService } from './notification.service.js';

function build(processed = 0) {
  const processPending = vi.fn().mockResolvedValue({ processed });
  const scheduleUpcomingReminders = vi.fn().mockResolvedValue(undefined);
  const logger = { info: vi.fn(), error: vi.fn() };
  const stop = startNotificationWorker(
    {
      reminders: { scheduleUpcomingReminders } as unknown as AppointmentReminderService,
      notifications: { processPending } as unknown as NotificationService,
    },
    { intervalMs: 60_000, logger },
  );
  return { processPending, logger, stop };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('worker de notificações', () => {
  it('registra o início e processa a fila imediatamente', async () => {
    const { processPending, logger, stop } = build();

    expect(logger.info).toHaveBeenCalledWith(
      { intervalMs: 60_000 },
      'Worker de notificações iniciado',
    );
    // Sem o ciclo imediato, nada sairia da fila no primeiro minuto.
    await vi.advanceTimersByTimeAsync(0);
    expect(processPending).toHaveBeenCalledOnce();
    stop();
  });

  it('continua processando a cada intervalo e só loga lotes com trabalho', async () => {
    const { processPending, logger, stop } = build(3);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(processPending).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith({ processed: 3 }, 'Lote de notificações processado');
    stop();
  });

  it('não loga ticks ociosos', async () => {
    const { logger, stop } = build(0);
    await vi.advanceTimersByTimeAsync(60_000);

    const messages = logger.info.mock.calls.map((call) => String(call[1] ?? ''));
    expect(messages.filter((message) => message.includes('Lote'))).toHaveLength(0);
    stop();
  });

  it('registra a falha do lote sem derrubar o worker', async () => {
    const processPending = vi.fn().mockRejectedValue(new Error('banco fora'));
    const logger = { info: vi.fn(), error: vi.fn() };
    const stop = startNotificationWorker(
      {
        reminders: {
          scheduleUpcomingReminders: vi.fn().mockResolvedValue(undefined),
        } as unknown as AppointmentReminderService,
        notifications: { processPending } as unknown as NotificationService,
      },
      { intervalMs: 1000, logger },
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(logger.error).toHaveBeenCalled();
    expect(processPending).toHaveBeenCalledTimes(2);
    stop();
  });

  it('para de processar depois do stop', async () => {
    const { processPending, stop } = build();
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(180_000);

    expect(processPending).toHaveBeenCalledOnce();
  });
});
