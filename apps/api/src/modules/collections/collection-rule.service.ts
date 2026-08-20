import { randomUUID } from 'node:crypto';

import {
  CollectionRuleListResponseSchema,
  CollectionRulePublicSchema,
  type CreateCollectionRuleRequest,
  type UpdateCollectionRuleRequest,
} from '@plataforma/shared';

import { withoutUndefined } from './prisma-patch.js';
import { type CollectionRule, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}

const pubCollectionRule = (rule: CollectionRule) =>
  CollectionRulePublicSchema.parse({
    publicId: rule.publicId,
    name: rule.name,
    active: rule.active,
    cadenceType: rule.cadenceType,
    cadenceDays: rule.cadenceDays,
    allowedStartHour: rule.allowedStartHour,
    allowedEndHour: rule.allowedEndHour,
    maxAttemptsPerDay: rule.maxAttemptsPerDay,
    consecutiveDays: rule.consecutiveDays,
    pauseDaysAfterCycle: rule.pauseDaysAfterCycle,
    maxCycles: rule.maxCycles,
    skipSundays: rule.skipSundays,
    partialPaymentEnabled: rule.partialPaymentEnabled,
    partialOfferPercentages: rule.partialOfferPercentages as number[],
    partialMinimumCents: rule.partialMinimumCents.toString(),
    partialRoundingStepCents: rule.partialRoundingStepCents.toString(),
    promiseQuickOptionsDays: rule.promiseQuickOptionsDays as number[],
  });

export class CollectionRuleService {
  public constructor(private readonly client: PrismaClient) {}

  public async list(tenantId: bigint) {
    const rules = await this.client.collectionRule.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return CollectionRuleListResponseSchema.parse({ items: rules.map(pubCollectionRule) });
  }

  public async create(tenantId: bigint, input: CreateCollectionRuleRequest, actor: Actor) {
    const rule = await this.client.collectionRule.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        name: input.name,
        active: input.active,
        cadenceType: input.cadenceType,
        cadenceDays: input.cadenceDays ?? null,
        preferredWeekday: input.preferredWeekday ?? null,
        monthlyDay: input.monthlyDay ?? null,
        allowedStartHour: input.allowedStartHour,
        allowedEndHour: input.allowedEndHour,
        maxAttemptsPerDay: input.maxAttemptsPerDay,
        consecutiveDays: input.consecutiveDays,
        pauseDaysAfterCycle: input.pauseDaysAfterCycle,
        maxCycles: input.maxCycles ?? null,
        skipSundays: input.skipSundays,
        partialPaymentEnabled: input.partialPaymentEnabled,
        partialOfferPercentages: input.partialOfferPercentages,
        partialMinimumCents: BigInt(input.partialMinimumCents ?? 0),
        partialRoundingStepCents: BigInt(input.partialRoundingStepCents ?? 1),
        askPromiseAfterPartialPayment: input.askPromiseAfterPartialPayment,
        promiseQuickOptionsDays: input.promiseQuickOptionsDays,
        noResponseFollowupNextDay: input.noResponseFollowupNextDay,
      },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'collection_rule.created',
        targetType: 'collection_rule',
        targetPublicId: rule.publicId,
      },
    });
    return pubCollectionRule(rule);
  }

  public async update(
    tenantId: bigint,
    publicId: string,
    input: UpdateCollectionRuleRequest,
    actor: Actor,
  ) {
    const existing = await this.client.collectionRule.findFirst({ where: { tenantId, publicId } });
    if (existing === null) throw this.notFound();

    const rule = await this.client.collectionRule.update({
      where: { id: existing.id },
      data: withoutUndefined({
        name: input.name,
        active: input.active,
        cadenceType: input.cadenceType,
        cadenceDays: input.cadenceDays,
        preferredWeekday: input.preferredWeekday,
        monthlyDay: input.monthlyDay,
        allowedStartHour: input.allowedStartHour,
        allowedEndHour: input.allowedEndHour,
        maxAttemptsPerDay: input.maxAttemptsPerDay,
        consecutiveDays: input.consecutiveDays,
        pauseDaysAfterCycle: input.pauseDaysAfterCycle,
        maxCycles: input.maxCycles,
        skipSundays: input.skipSundays,
        partialPaymentEnabled: input.partialPaymentEnabled,
        partialOfferPercentages: input.partialOfferPercentages,
        partialMinimumCents:
          input.partialMinimumCents === undefined ? undefined : BigInt(input.partialMinimumCents),
        partialRoundingStepCents:
          input.partialRoundingStepCents === undefined
            ? undefined
            : BigInt(input.partialRoundingStepCents),
        askPromiseAfterPartialPayment: input.askPromiseAfterPartialPayment,
        promiseQuickOptionsDays: input.promiseQuickOptionsDays,
        noResponseFollowupNextDay: input.noResponseFollowupNextDay,
      }),
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'collection_rule.updated',
        targetType: 'collection_rule',
        targetPublicId: rule.publicId,
      },
    });
    return pubCollectionRule(rule);
  }

  /**
   * Resolve publicId -> id interno garantindo isolamento de tenant e que a régua
   * esteja ativa. Usado pelo DebtService ao criar/atualizar uma Debt.
   */
  public async resolveActiveRuleId(tenantId: bigint, publicId: string): Promise<bigint> {
    const rule = await this.client.collectionRule.findFirst({
      where: { tenantId, publicId },
      select: { id: true, active: true },
    });
    if (rule === null) throw this.notFound();
    if (!rule.active)
      throw new AppError({
        code: 'COLLECTION_RULE_INACTIVE',
        message: 'A régua de cobrança selecionada está inativa.',
        statusCode: 409,
      });
    return rule.id;
  }

  private notFound() {
    return new AppError({
      code: 'COLLECTION_RULE_NOT_FOUND',
      message: 'Régua de cobrança não encontrada.',
      statusCode: 404,
    });
  }
}
