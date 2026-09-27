import { treatmentAmountLabel, type TreatmentPlanPublic } from '@plataforma/shared';

import { type CustomerNotificationDispatcher } from './customer-notification-dispatcher.js';
import { type NotificationService } from './notification.service.js';
import { type PrismaClient } from '../../database-client/client.js';

const money = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Notificações transacionais do orçamento. Reutiliza o dispatcher do cliente
 * (e-mail, push e WhatsApp já configurados) e a fila idempotente do
 * NotificationService — nenhum canal ou provedor novo, nenhuma campanha.
 * Falhar aqui nunca desfaz o orçamento: quem chama trata o erro.
 */
export class TreatmentPlanNotificationService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly dispatcher: CustomerNotificationDispatcher,
    private readonly notifications: NotificationService,
    private readonly appWebUrl = process.env.APP_WEB_URL ?? 'http://localhost:5173',
  ) {}

  /** Linhas de valor conforme a forma de cobrança — nunca as duas juntas. */
  private lines(plan: TreatmentPlanPublic) {
    const sessionsLine =
      plan.sessionsPlanned === null
        ? ''
        : `\n${String(plan.sessionsPlanned)} sessões previstas`;
    const estimatedTotalLine =
      plan.estimatedTotalCents === null
        ? ''
        : `\nTotal estimado: ${money(plan.estimatedTotalCents)}`;
    const intervalLine =
      plan.returnIntervalDays === null
        ? ''
        : `\nIntervalo entre sessões: ${String(plan.returnIntervalDays)} dias`;
    return {
      amountLine: treatmentAmountLabel(plan),
      sessionsLine,
      estimatedTotalLine,
      intervalLine,
    };
  }

  private async treatmentUrl(tenantId: bigint, planPublicId: string) {
    const tenant = await this.client.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    const base = this.appWebUrl.replace(/\/+$/u, '');
    return tenant === null
      ? base
      : `${base}/public/${tenant.slug}/conta/tratamentos/${planPublicId}`;
  }

  /** Avisa o cliente de que o orçamento está pronto para revisão e aprovação. */
  public async notifyQuoteReady(tenantId: bigint, plan: TreatmentPlanPublic): Promise<void> {
    const customer = await this.client.customer.findFirst({
      where: { tenantId, publicId: plan.customerPublicId },
      select: { id: true },
    });
    if (customer === null) return;
    const lines = this.lines(plan);
    await this.dispatcher.dispatch(
      tenantId,
      customer.id,
      'treatment_plan.quote_ready',
      plan.publicId,
      {
        customerName: plan.customerName,
        treatmentTitle: plan.title,
        professionalName: plan.professionalName,
        ...lines,
      },
      'treatment_plan',
      {
        ctaUrl: await this.treatmentUrl(tenantId, plan.publicId),
        details: [
          { label: 'Tratamento', value: plan.title },
          { label: 'Profissional', value: plan.professionalName },
          { label: 'Valor', value: lines.amountLine },
          {
            label: 'Sessões previstas',
            value: plan.sessionsPlanned === null ? '' : String(plan.sessionsPlanned),
          },
          {
            label: 'Total estimado',
            value: plan.estimatedTotalCents === null ? '' : money(plan.estimatedTotalCents),
          },
        ],
      },
    );
  }

  /**
   * Avisa o profissional responsável de que o cliente aprovou. Usa o e-mail já
   * cadastrado do profissional; sem e-mail, nada é enfileirado.
   */
  public async notifyApproved(tenantId: bigint, plan: TreatmentPlanPublic): Promise<void> {
    const professional = await this.client.professional.findFirst({
      where: { tenantId, publicId: plan.professionalPublicId },
      select: { email: true },
    });
    if (professional?.email == null) return;
    const lines = this.lines(plan);
    // A fila é idempotente por (tenant, kind, target, canal, destinatário):
    // aprovar duas vezes não gera duas mensagens.
    await this.notifications.enqueue(tenantId, {
      channel: 'EMAIL',
      kind: 'treatment_plan.approved',
      targetType: 'treatment_plan',
      targetPublicId: plan.publicId,
      recipient: professional.email,
      subject: `Orçamento aprovado — ${plan.title}`,
      body: `${plan.customerName} aprovou o orçamento '${plan.title}'.\n\n${lines.amountLine}${lines.sessionsLine}\n\nPrimeira sessão ainda não agendada.`,
    });
  }
}
