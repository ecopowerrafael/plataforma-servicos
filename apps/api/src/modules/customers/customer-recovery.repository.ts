import { randomUUID } from 'node:crypto';

import { Prisma, type PrismaClient } from '../../database-client/client.js';

export const recoveryRules = [
  'INACTIVE',
  'CANCELED_NO_REBOOK',
  'NO_SHOW_NO_REBOOK',
  'POST_SERVICE_NO_RETURN',
  'BIRTHDAY',
] as const;
export type RecoveryRule = (typeof recoveryRules)[number];

export class CustomerRecoveryRepository {
  public constructor(private readonly client: PrismaClient) {}

  public listRules(tenantId: bigint) {
    return this.client.customerRecoveryRule.findMany({
      where: { tenantId },
      orderBy: { rule: 'asc' },
    });
  }

  public async ensureRules(tenantId: bigint): Promise<void> {
    await this.client.customerRecoveryRule.createMany({
      data: recoveryRules.map((rule) => ({
        publicId: randomUUID(),
        tenantId,
        rule,
        active: false,
        days:
          rule === 'INACTIVE'
            ? 90
            : rule === 'BIRTHDAY'
              ? 1
              : rule === 'POST_SERVICE_NO_RETURN'
                ? 30
                : 7,
      })),
      skipDuplicates: true,
    });
  }

  public upsertRule(
    tenantId: bigint,
    rule: RecoveryRule,
    input: { active: boolean; days: number },
  ) {
    return this.client.customerRecoveryRule.upsert({
      where: { tenantId_rule: { tenantId, rule } },
      create: { publicId: randomUUID(), tenantId, rule, ...input },
      update: input,
    });
  }

  public listActiveRules() {
    return this.client.customerRecoveryRule.findMany({ where: { active: true } });
  }

  public listCustomers(tenantId: bigint) {
    return this.client.customer.findMany({
      where: { tenantId, status: 'ACTIVE', acceptsCommunications: true },
      select: {
        id: true,
        publicId: true,
        name: true,
        phone: true,
        birthDate: true,
        email: true,
        whatsapp: true,
        pushSubscriptions: { where: { tenantId, active: true }, select: { id: true }, take: 1 },
        appointments: {
          orderBy: { startsAt: 'desc' },
          // Serviço e profissional vêm no mesmo join: a lista de elegíveis não faz N+1.
          select: {
            publicId: true,
            startsAt: true,
            status: true,
            service: { select: { name: true } },
            professional: { select: { publicName: true } },
          },
        },
      },
    });
  }

  public listExecutions(tenantId: bigint) {
    return this.client.customerRecoveryExecution.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        rule: { select: { rule: true } },
        customer: { select: { publicId: true, name: true } },
      },
    });
  }

  public async claim(tenantId: bigint, ruleId: bigint, customerId: bigint, periodKey: string) {
    try {
      return await this.client.customerRecoveryExecution.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          ruleId,
          customerId,
          periodKey,
          status: 'SKIPPED',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return null;
      throw error;
    }
  }

  public finish(publicId: string, status: 'SENT' | 'SKIPPED' | 'FAILED', error: string | null) {
    return this.client.customerRecoveryExecution.update({
      where: { publicId },
      data: { status, error },
    });
  }

  public audit(data: {
    tenantId: bigint;
    userId?: bigint;
    sessionId?: bigint;
    action: string;
    targetType: string;
    targetPublicId: string;
  }) {
    return this.client.auditLog.create({ data: { publicId: randomUUID(), ...data } });
  }
}
