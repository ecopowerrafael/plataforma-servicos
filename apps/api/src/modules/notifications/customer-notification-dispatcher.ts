import { isTransactionalNotification } from '@plataforma/shared';

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
 * só lugar a checagem de consentimento e o fan-out para os canais
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
      select: { email: true, whatsapp: true, acceptsCommunications: true },
    });
    if (customer === null) return false;
    // Transacionais (confirmação, cancelamento, lembrete) fazem parte do
    // serviço e são enviadas mesmo sem opt-in; marketing e automações
    // continuam exigindo `acceptsCommunications`. A regra vale igualmente
    // para e-mail, push e WhatsApp — nenhum canal a reavalia.
    if (!customer.acceptsCommunications && !isTransactionalNotification(kind)) return false;

    const subscriptions = await this.client.pushSubscription.findMany({
      where: { tenantId, customerId, active: true },
      select: { publicId: true },
    });
    const whatsappConfigured =
      customer.whatsapp === null
        ? false
        : (
            await this.client.tenantWhatsAppConfig.findUnique({
              where: { tenantId },
              select: { active: true },
            })
          )?.active === true;
    if (customer.email === null && subscriptions.length === 0 && !whatsappConfigured) return false;

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
    if (whatsappConfigured && customer.whatsapp !== null) {
      await this.notifications.enqueue(tenantId, {
        channel: 'WHATSAPP',
        kind,
        targetType,
        targetPublicId,
        recipient: customer.whatsapp.replace(/\D/gu, ''),
        subject,
        body,
      });
    }

    return true;
  }
}
