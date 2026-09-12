import { type PrismaClient } from '../../database-client/client.js';

export class TreatmentPlanReminderRepository {
  public constructor(private readonly client: PrismaClient) {}

  async getConfig(tenantId: bigint) {
    return this.client.treatmentPlanReminderConfig.findUnique({
      where: { tenantId },
    });
  }

  async createConfig(tenantId: bigint, sequence: any[]) {
    return this.client.treatmentPlanReminderConfig.create({
      data: {
        tenantId,
        enabled: true,
        channel: 'WHATSAPP',
        sequence: JSON.parse(JSON.stringify(sequence)),
      },
    });
  }

  async updateConfig(tenantId: bigint, data: any) {
    return this.client.treatmentPlanReminderConfig.upsert({
      where: { tenantId },
      update: data,
      create: {
        tenantId,
        ...data,
      },
    });
  }

  async getByTreatmentPlanId(treatmentPlanId: bigint) {
    return this.client.treatmentPlanReminderState.findUnique({
      where: { treatmentPlanId },
    });
  }

  async createReminderState(data: any) {
    return this.client.treatmentPlanReminderState.create({
      data: {
        tenantId: data.tenantId,
        treatmentPlanId: data.treatmentPlanId,
        nextReminderAt: data.nextReminderAt,
        status: data.status ?? 'ACTIVE',
        channel: data.channel ?? 'WHATSAPP',
        currentStepIndex: data.currentStepIndex ?? 0,
      },
    });
  }

  async updateReminderState(reminderStateId: bigint, data: any) {
    return this.client.treatmentPlanReminderState.update({
      where: { id: reminderStateId },
      data,
    });
  }

  async getDueReminders() {
    const now = new Date();
    return this.client.treatmentPlanReminderState.findMany({
      where: {
        status: 'ACTIVE',
        nextReminderAt: {
          lte: now,
        },
      },
      orderBy: { nextReminderAt: 'asc' },
    });
  }

  async getTreatmentPlan(treatmentPlanId: bigint) {
    return this.client.treatmentPlan.findUnique({
      where: { id: treatmentPlanId },
      include: {
        customer: true,
        service: true,
        professional: true,
      },
    });
  }

  async getTenant(tenantId: bigint) {
    return this.client.tenant.findUnique({
      where: { id: tenantId },
      select: { displayName: true, currency: true },
    });
  }

  async getTenantTerminology(tenantId: bigint) {
    return this.client.tenantTerminology.findUnique({
      where: { tenantId },
      select: { treatmentPlanSingular: true },
    });
  }

  async createReminderLog(data: any) {
    return this.client.treatmentPlanReminderLog.create({
      data: {
        tenantId: data.tenantId,
        reminderStateId: data.reminderStateId,
        stepIndex: data.stepIndex,
        channel: data.channel,
        messageTemplate: data.messageTemplate,
        sentMessage: data.sentMessage,
        status: data.status,
        errorMessage: data.errorMessage,
      },
    });
  }

  async getReminderLogs(reminderStateId: bigint, limit: number = 10) {
    return this.client.treatmentPlanReminderLog.findMany({
      where: { reminderStateId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
