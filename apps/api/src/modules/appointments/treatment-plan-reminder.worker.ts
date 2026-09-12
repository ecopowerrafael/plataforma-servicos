import { type TreatmentPlanReminderService } from './treatment-plan-reminder.service.js';

interface WorkerLogger {
  info: (payload: unknown, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
}

interface WorkerDeps {
  reminders: TreatmentPlanReminderService;
}

interface WorkerOptions {
  intervalMs: number;
  logger: WorkerLogger;
}

export function startTreatmentPlanReminderWorker(
  deps: WorkerDeps,
  options: WorkerOptions,
): () => void {
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await deps.reminders.processDueReminders();
    } catch (error) {
      options.logger.error(
        { err: error },
        'Falha ao processar lembretes de orçamentos.',
      );
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, options.intervalMs);

  options.logger.info(
    { intervalMs: options.intervalMs },
    'Worker de lembretes de orçamentos iniciado',
  );
  void tick();

  return () => {
    clearInterval(timer);
  };
}
