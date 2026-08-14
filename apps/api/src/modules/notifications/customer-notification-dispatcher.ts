import { isTransactionalNotification } from '@plataforma/shared';

import {
  renderPushTemplate,
  type NotificationKind,
  type NotificationTemplateService,
} from './notification-template.service.js';
import { type NotificationService } from './notification.service.js';
import { renderTransactionalEmail } from './transactional-email.js';
import { type PrismaClient } from '../../database-client/client.js';
import { normalizeWhatsAppPhone } from '../integrations/whatsapp-phone.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

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
    private readonly appWebUrl = process.env.APP_WEB_URL ?? 'http://localhost:5173',
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
    const whatsappEntitled = await new PlanEntitlementService().featureEnabledForTenant(
      this.client,
      tenantId,
      'whatsapp.enabled',
    );
    const whatsappConfigured =
      customer.whatsapp === null || !whatsappEntitled
        ? false
        : (
            await this.client.tenantWhatsAppConfig.findUnique({
              where: { tenantId },
              select: { active: true },
            })
          )?.active === true;
    if (customer.email === null && subscriptions.length === 0 && !whatsappConfigured) return false;

    const tenant = await this.client.tenant.findUnique({
      where: { id: tenantId },
      select: {
        displayName: true,
        slug: true,
        branding: { select: { primaryColor: true } },
        mediaAssets: {
          where: { kind: 'LOGO', deletedAt: null },
          select: { publicId: true },
          take: 1,
        },
      },
    });
    const tenantName = tenant?.displayName ?? 'Agendei';
    const publicBase = this.appWebUrl.replace(/\/+$/u, '');
    const appointmentUrl =
      tenant === null ? publicBase : `${publicBase}/public/${tenant.slug}/conta/agendamentos`;
    const renderedVariables = { ...variables, tenantName, appointmentUrl };
    const email = await this.templates.render(tenantId, kind, renderedVariables);
    const push = kind.startsWith('appointment.')
      ? renderPushTemplate(kind, renderedVariables)
      : email;
    const whatsappBody = await this.templates.renderWhatsApp(tenantId, kind, renderedVariables);
    const logo = tenant?.mediaAssets[0];
    const html = renderTransactionalEmail({
      tenantName,
      logoUrl: logo === undefined ? null : `${publicBase}/public/media/${logo.publicId}`,
      primaryColor: tenant?.branding?.primaryColor ?? '#2457d6',
      title: email.title ?? email.subject,
      intro: email.intro ?? `Olá, ${variables.customerName ?? 'cliente'}.`,
      details: [
        { label: 'Serviço', value: variables.serviceName ?? '' },
        { label: 'Profissional', value: variables.professionalName ?? '' },
        { label: 'Data', value: variables.date ?? '' },
        { label: 'Horário', value: variables.time ?? '' },
        { label: 'Unidade', value: variables.unitName ?? '' },
        { label: 'Valor', value: variables.value ?? '' },
      ],
      afterText: email.afterText ?? '',
      ctaLabel: email.ctaLabel ?? 'Ver agendamento',
      ctaUrl: appointmentUrl,
      protocol: variables.protocol,
    });

    if (customer.email !== null) {
      await this.notifications.enqueue(tenantId, {
        channel: 'EMAIL',
        kind,
        targetType,
        targetPublicId,
        recipient: customer.email,
        subject: email.subject,
        body: email.body,
        ...(kind.startsWith('appointment.')
          ? { email: { html, fromName: tenant === null ? 'Agendei' : `${tenantName} via Agendei` } }
          : {}),
      });
    }

    for (const subscription of subscriptions) {
      await this.notifications.enqueue(tenantId, {
        channel: 'PUSH',
        kind,
        targetType,
        targetPublicId,
        recipient: subscription.publicId,
        subject: push.subject,
        body: push.body,
      });
    }
    if (whatsappConfigured && customer.whatsapp !== null) {
      const recipient = normalizeWhatsAppPhone(customer.whatsapp);
      if (recipient === null) return true;
      await this.notifications.enqueue(tenantId, {
        channel: 'WHATSAPP',
        kind,
        targetType,
        targetPublicId,
        recipient,
        subject: email.subject,
        body: whatsappBody,
      });
    }

    return true;
  }
}
