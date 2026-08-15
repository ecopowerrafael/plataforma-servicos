import { type AppointmentReminderService } from './appointment-reminder.service.js';
import { type AutomationService } from './automation.service.js';
import { type NotificationService } from './notification.service.js';
import { type NotificationCampaignService } from './notification-campaign.service.js';
import { type CustomerRecoveryService } from '../customers/customer-recovery.service.js';
import { type LoyaltyService } from '../payments/loyalty.service.js';
import { type TenantCommercialSweepService } from '../platform/tenant-commercial-sweep.service.js';

interface WorkerLogger {
  info: (payload: unknown, message?: string) => void;
  error: (payload: unknown, message?: string) => void;
}

interface WorkerDeps {
  reminders: AppointmentReminderService;
  notifications: NotificationService;
  campaigns?: NotificationCampaignService;
  automations?: AutomationService;
  customerRecovery?: CustomerRecoveryService;
  loyalty?: LoyaltyService;
  commercialSweep?: TenantCommercialSweepService;
}

interface WorkerOptions {
  intervalMs: number;
  logger: WorkerLogger;
}

/**
 * Worker de notificações em processo único, adequado à arquitetura atual
 * (sem broker/fila externa). A cada tick: agenda lembretes de agendamentos
 * que entraram na janela de lembrete e processa a fila pendente de envio.
 * Um lock booleano em memória impede sobreposição entre execuções da mesma
 * instância; o claim atômico em NotificationService.processPending()
 * impede processamento duplicado mesmo com múltiplas instâncias da API.
 * Ressalva: por ser em processo único, não há coordenação entre múltiplas
 * instâncias horizontais além do claim a nível de linha no banco.
 */
export function startNotificationWorker(deps: WorkerDeps, options: WorkerOptions): () => void {
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await deps.reminders.scheduleUpcomingReminders();
      await deps.automations?.run();
      await deps.customerRecovery?.run();
      await deps.loyalty?.expireDue();
      await deps.commercialSweep?.run();
      await deps.campaigns?.materializePending();
      const { processed } = await deps.notifications.processPending();
      await deps.campaigns?.reconcile();
      // Só registra lotes com trabalho real: ticks ociosos não geram log.
      if (processed > 0) options.logger.info({ processed }, 'Lote de notificações processado');
    } catch (error) {
      options.logger.error({ err: error }, 'Falha ao processar a fila de notificações.');
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, options.intervalMs);
  options.logger.info({ intervalMs: options.intervalMs }, 'Worker de notificações iniciado');
  // Primeiro ciclo imediato: sem ele, nada sai da fila no primeiro minuto de
  // vida do processo — e neste ambiente o processo é reciclado com frequência.
  void tick();

  return () => {
    clearInterval(timer);
  };
}
