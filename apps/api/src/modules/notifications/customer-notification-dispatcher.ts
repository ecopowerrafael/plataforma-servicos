import {
  type NotificationKind,
  type NotificationTemplateService,
} from './notification-template.service.js';
import { type NotificationService } from './notification.service.js';
import { type PrismaClient } from '../../database-client/client.js';

/**
 * Ponto único de decisão para notificar um cliente sobre um evento de
 * agendamento, reaproveitado por AppointmentNotificationService (confirmação
 * e cancelamento) e AppointmentReminderService (lembrete). Concentra em um
 * só lugar a checagem de acceptsCommunications e o fan-out para os canais
 * disponíveis (e-mail sempre que houver endereço cadastrado; push para cada
 * dispositivo ativo do cliente) — evita duplicar essa lógica entre os dois
 * chamadores e mantém a mesma preferência de comunicação valendo para
 * ambos os canais, sem introduzir uma granularidade por canal que não foi
 * pedida.
 */
export class CustomerNotificationDispatcher {
  public constructor(
    private readonly client: PrismaClient,
    private readonly notifications: NotificationService,
    private readonly templates: NotificationTemplateService,
  ) {}

  /** Retorna true se ao menos um canal foi enfileirado (útil para contadores de agendamento em lote). */
  public async dispatch(
    tenantId: bigint,
    customerId: bigint,
    kind: NotificationKind,
    targetPublicId: string,
    variables: Record<string, string>,
    targetType = 'appointment',
  ): Promise<boolean> {
    const customer = await this.client.customer.findUnique({
      where: { id: customerId },
      select: { email: true, acceptsCommunications: true },
    });
    if (!customer?.acceptsCommunications) return false;

    const subscriptions = await this.client.pushSubscription.findMany({
      where: { tenantId, customerId, active: true },
      select: { publicId: true },
    });
    if (customer.email === null && subscriptions.length === 0) return false;

    const { subject, body } = await this.templates.render(tenantId, kind, variables);

    if (customer.email !== null) {
      await this.notifications.enqueue(tenantId, {
        channel: 'EMAIL',
        kind,
        targetType,
        targetPublicId,
        recipient: customer.email,
        subject,
        body,
      });
    }

    for (const subscription of subscriptions) {
      await this.notifications.enqueue(tenantId, {
        channel: 'PUSH',
        kind,
        targetType,
        targetPublicId,
        recipient: subscription.publicId,
        subject,
        body,
      });
    }

    return true;
  }
}
