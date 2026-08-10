import { randomUUID } from 'node:crypto';

import {
  AutomationListResponseSchema,
  AutomationPublicSchema,
  type UpdateAutomationRequest,
} from '@plataforma/shared';

import { type CustomerNotificationDispatcher } from './customer-notification-dispatcher.js';
import { type PrismaClient } from '../../database-client/client.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

type AutomationTrigger =
  'APPOINTMENT_REMINDER' | 'POST_APPOINTMENT' | 'INACTIVE_CUSTOMER' | 'CUSTOMER_BIRTHDAY';
export class AutomationService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly dispatcher: CustomerNotificationDispatcher,
  ) {}
  private assertEnabled(tenantId: bigint) { return new PlanEntitlementService().assertFeatureEnabledForTenant(this.client, tenantId, 'automations.enabled'); }
  public async list(tenantId: bigint) {
    await this.assertEnabled(tenantId);
    const rows = await this.client.tenantAutomation.findMany({
      where: { tenantId },
      orderBy: { trigger: 'asc' },
    });
    return AutomationListResponseSchema.parse({
      items: rows.map((row) =>
        AutomationPublicSchema.parse({
          publicId: row.publicId,
          trigger: row.trigger,
          active: row.active,
          offsetMinutes: row.offsetMinutes,
          updatedAt: row.updatedAt.toISOString(),
        }),
      ),
    });
  }
  public async update(
    tenantId: bigint,
    trigger: AutomationTrigger,
    input: UpdateAutomationRequest,
    actor: { userId: bigint; sessionId: bigint },
  ) {
    await this.assertEnabled(tenantId);
    const row = await this.client.tenantAutomation.upsert({
      where: { tenantId_trigger: { tenantId, trigger } },
      create: { publicId: randomUUID(), tenantId, trigger, ...input },
      update: input,
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'automation.updated',
        targetType: 'automation',
        targetPublicId: row.publicId,
      },
    });
    return AutomationPublicSchema.parse({
      publicId: row.publicId,
      trigger: row.trigger,
      active: row.active,
      offsetMinutes: row.offsetMinutes,
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  public async run(): Promise<void> {
    const automations = await this.client.tenantAutomation.findMany({
      where: {
        active: true,
        trigger: { in: ['POST_APPOINTMENT', 'INACTIVE_CUSTOMER', 'CUSTOMER_BIRTHDAY'] },
      },
    });
    const now = new Date();
    for (const automation of automations) {
      const cutoff = new Date(now.getTime() - automation.offsetMinutes * 60_000);
      if (automation.trigger === 'POST_APPOINTMENT') {
        const appointments = await this.client.appointment.findMany({
          where: { tenantId: automation.tenantId, status: 'COMPLETED', updatedAt: { lte: cutoff } },
          select: { publicId: true, customerId: true, protocol: true },
        });
        for (const appointment of appointments)
          await this.execute(automation, appointment.publicId, appointment.customerId, {
            customerName: '',
            protocol: appointment.protocol,
            serviceName: '',
            professionalName: '',
            when: '',
            canceledReasonLine: '',
          });
      }
    }
  }
  private async execute(
    automation: { id: bigint; tenantId: bigint; trigger: string },
    targetPublicId: string,
    customerId: bigint,
    variables: Record<string, string>,
  ) {
    try {
      await this.client.automationExecution.create({
        data: {
          publicId: randomUUID(),
          tenantId: automation.tenantId,
          automationId: automation.id,
          targetType: 'appointment',
          targetPublicId,
          status: 'SKIPPED',
        },
      });
    } catch {
      return;
    }
    try {
      const sent = await this.dispatcher.dispatch(
        automation.tenantId,
        customerId,
        'appointment.reminder',
        targetPublicId,
        variables,
      );
      await this.client.automationExecution.updateMany({
        where: { automationId: automation.id, targetPublicId },
        data: { status: sent ? 'SENT' : 'SKIPPED' },
      });
    } catch (error) {
      await this.client.automationExecution.updateMany({
        where: { automationId: automation.id, targetPublicId },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message.slice(0, 500) : 'Falha desconhecida.',
        },
      });
    }
  }
}
