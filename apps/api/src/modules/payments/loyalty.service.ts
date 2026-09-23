import { randomUUID } from 'node:crypto';

import {
  LoyaltyAccountSummarySchema,
  LoyaltyLedgerEntryPublicSchema,
  LoyaltyLedgerListResponseSchema,
  LoyaltyRuleListResponseSchema,
  LoyaltyRulePublicSchema,
  type UpsertLoyaltyRuleRequest,
} from '@plataforma/shared';

import { type CouponService } from './coupon.service.js';
import { Prisma, type LoyaltyRule, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}

type LoyaltyType = 'POINTS' | 'CASHBACK';

const LOYALTY_TYPES: LoyaltyType[] = ['POINTS', 'CASHBACK'];

const ledgerInclude = {
  sourcePayment: { select: { publicId: true } },
  sourceAppointment: { select: { publicId: true } },
} as const;

interface LedgerEntryWithRelations {
  publicId: string;
  type: LoyaltyType;
  direction: 'CREDIT' | 'DEBIT';
  reason: 'EARNED' | 'REDEEMED' | 'EXPIRED' | 'REVERSED';
  amount: bigint;
  discountCentsApplied: bigint | null;
  expiresAt: Date | null;
  createdAt: Date;
  sourcePayment: { publicId: string } | null;
  sourceAppointment: { publicId: string } | null;
}

const pubRule = (rule: LoyaltyRule) =>
  LoyaltyRulePublicSchema.parse({
    publicId: rule.publicId,
    type: rule.type,
    active: rule.active,
    earnRate: rule.earnRate,
    minEligibleAmountCents: rule.minEligibleAmountCents.toString(),
    redeemRateCentsPerPoint: rule.redeemRateCentsPerPoint,
    expirationDays: rule.expirationDays,
    updatedAt: rule.updatedAt.toISOString(),
  });

const pubEntry = (entry: LedgerEntryWithRelations) =>
  LoyaltyLedgerEntryPublicSchema.parse({
    publicId: entry.publicId,
    type: entry.type,
    direction: entry.direction,
    reason: entry.reason,
    amount: entry.amount.toString(),
    discountCentsApplied: entry.discountCentsApplied?.toString() ?? null,
    sourcePaymentPublicId: entry.sourcePayment?.publicId ?? null,
    sourceAppointmentPublicId: entry.sourceAppointment?.publicId ?? null,
    expiresAt: entry.expiresAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
  });

export class LoyaltyService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly coupons?: CouponService,
  ) {}
  private assertEnabled(tenantId: bigint) { return new PlanEntitlementService().assertFeatureEnabledForTenant(this.client, tenantId, 'loyalty.enabled'); }

  /**
   * Lista as regras de fidelidade do tenant (pontos e cashback), provisionando as duas na
   * primeira consulta — desativadas por padrão, mesmo padrão de provisionamento preguiçoso já
   * usado em PaymentMethodService.list()/CustomerRecoveryRepository.ensureRules().
   */
  public async listRules(tenantId: bigint) {
    await this.assertEnabled(tenantId);
    await this.client.loyaltyRule
      .createMany({
        data: LOYALTY_TYPES.map((type) => ({
          publicId: randomUUID(),
          tenantId,
          type,
          active: false,
          earnRate: type === 'POINTS' ? 1 : 100,
          redeemRateCentsPerPoint: type === 'POINTS' ? 1 : null,
        })),
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
        throw error;
      });
    const items = await this.client.loyaltyRule.findMany({
      where: { tenantId },
      orderBy: { type: 'asc' },
    });
    return LoyaltyRuleListResponseSchema.parse({ items: items.map(pubRule) });
  }

  public async updateRule(
    tenantId: bigint,
    type: LoyaltyType,
    input: UpsertLoyaltyRuleRequest,
    actor: Actor,
  ) {
    await this.assertEnabled(tenantId);
    const rule = await this.client.loyaltyRule.upsert({
      where: { tenantId_type: { tenantId, type } },
      create: {
        publicId: randomUUID(),
        tenantId,
        type,
        active: input.active,
        earnRate: input.earnRate,
        minEligibleAmountCents: input.minEligibleAmountCents,
        redeemRateCentsPerPoint: input.redeemRateCentsPerPoint ?? null,
        expirationDays: input.expirationDays ?? null,
      },
      update: {
        active: input.active,
        earnRate: input.earnRate,
        minEligibleAmountCents: input.minEligibleAmountCents,
        redeemRateCentsPerPoint: input.redeemRateCentsPerPoint ?? null,
        expirationDays: input.expirationDays ?? null,
      },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'loyalty.rule_updated',
        targetType: 'loyalty_rule',
        targetPublicId: rule.publicId,
      },
    });
    return pubRule(rule);
  }

  /**
   * Gera crédito de pontos e/ou cashback a partir de um pagamento real elegível — reaproveita
   * o mesmo gancho de PaymentService.create() já usado por CashRegisterService/
   * ProfessionalCommissionService. Idempotente por natureza: o índice único
   * (tenantId, type, sourcePaymentId, direction) impede que o mesmo pagamento gere crédito
   * duas vezes, mesmo sob nova tentativa/retry.
   */
  public async recordForPayment(
    tenantId: bigint,
    payment: { id: bigint; amountCents: bigint },
    customerId: bigint,
    actor: Actor,
  ) {
    const rules = await this.client.loyaltyRule.findMany({
      where: { tenantId, active: true },
    });
    for (const rule of rules) {
      if (payment.amountCents < rule.minEligibleAmountCents) continue;
      const amount =
        rule.type === 'POINTS'
          ? (payment.amountCents / 100n) * BigInt(rule.earnRate)
          : (payment.amountCents * BigInt(rule.earnRate)) / 10_000n;
      if (amount <= 0n) continue;

      const expiresAt =
        rule.expirationDays === null
          ? null
          : new Date(Date.now() + rule.expirationDays * 86_400_000);

      try {
        const created = await this.client.loyaltyLedgerEntry.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            customerId,
            type: rule.type,
            direction: 'CREDIT',
            reason: 'EARNED',
            amount,
            sourcePaymentId: payment.id,
            expiresAt,
            userId: actor.userId,
            sessionId: actor.sessionId,
          },
        });
        await this.client.auditLog.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            userId: actor.userId,
            sessionId: actor.sessionId,
            action: 'loyalty.earned',
            targetType: 'loyalty_ledger_entry',
            targetPublicId: created.publicId,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          continue;
        throw error;
      }
    }
  }

  /**
   * Estorna o crédito gerado por um pagamento cancelado — nunca deixa o saldo negativo: o
   * valor estornado é limitado ao saldo atualmente disponível (se o cliente já resgatou o
   * crédito, o estorno reduz o que ainda existir, sem gerar débito além do saldo real).
   */
  public async cancelForPayment(tenantId: bigint, paymentId: bigint, actor: Actor) {
    const earnedEntries = await this.client.loyaltyLedgerEntry.findMany({
      where: {
        tenantId,
        sourcePaymentId: paymentId,
        reason: 'EARNED',
        direction: 'CREDIT',
        closesEntry: null,
      },
    });
    for (const entry of earnedEntries) {
      const balance = await this.balance(tenantId, entry.customerId, entry.type);
      const reversedAmount = entry.amount > balance ? balance : entry.amount;
      if (reversedAmount <= 0n) continue;

      const reversal = await this.client.loyaltyLedgerEntry.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          customerId: entry.customerId,
          type: entry.type,
          direction: 'DEBIT',
          reason: 'REVERSED',
          amount: reversedAmount,
          relatedEntryId: entry.id,
          userId: actor.userId,
          sessionId: actor.sessionId,
        },
      });
      await this.client.auditLog.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          userId: actor.userId,
          sessionId: actor.sessionId,
          action: 'loyalty.reversed',
          targetType: 'loyalty_ledger_entry',
          targetPublicId: reversal.publicId,
        },
      });
    }
  }

  public async resolveCustomerId(tenantId: bigint, customerPublicId: string): Promise<bigint> {
    const customer = await this.client.customer.findFirst({
      where: { tenantId, publicId: customerPublicId },
      select: { id: true },
    });
    if (customer === null)
      throw new AppError({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Cliente não encontrado.',
        statusCode: 404,
      });
    return customer.id;
  }

  /** Saldo atual (créditos menos débitos) de um tipo de fidelidade para o cliente. */
  public async balance(tenantId: bigint, customerId: bigint, type: LoyaltyType): Promise<bigint> {
    const [credit, debit] = await Promise.all([
      this.client.loyaltyLedgerEntry.aggregate({
        where: { tenantId, customerId, type, direction: 'CREDIT' },
        _sum: { amount: true },
      }),
      this.client.loyaltyLedgerEntry.aggregate({
        where: { tenantId, customerId, type, direction: 'DEBIT' },
        _sum: { amount: true },
      }),
    ]);
    return (credit._sum.amount ?? 0n) - (debit._sum.amount ?? 0n);
  }

  public async accountSummary(tenantId: bigint, customerId: bigint) {
    await this.assertEnabled(tenantId);
    const [pointsBalance, cashbackBalance, recentEntries] = await Promise.all([
      this.balance(tenantId, customerId, 'POINTS'),
      this.balance(tenantId, customerId, 'CASHBACK'),
      this.client.loyaltyLedgerEntry.findMany({
        where: { tenantId, customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: ledgerInclude,
      }),
    ]);
    return LoyaltyAccountSummarySchema.parse({
      balances: [
        { type: 'POINTS', balance: pointsBalance.toString() },
        { type: 'CASHBACK', balance: cashbackBalance.toString() },
      ],
      recentEntries: recentEntries.map(pubEntry),
    });
  }

  /** Soma dos descontos de resgate ainda ativos (não cancelados) aplicados a um agendamento. */
  public async discountForAppointment(tenantId: bigint, appointmentId: bigint): Promise<bigint> {
    const redemptions = await this.client.loyaltyLedgerEntry.findMany({
      where: {
        tenantId,
        sourceAppointmentId: appointmentId,
        reason: 'REDEEMED',
        closesEntry: null,
      },
      select: { discountCentsApplied: true },
    });
    return redemptions.reduce((total, item) => total + (item.discountCentsApplied ?? 0n), 0n);
  }

  public async listForAppointment(tenantId: bigint, appointmentPublicId: string) {
    await this.assertEnabled(tenantId);
    const items = await this.client.loyaltyLedgerEntry.findMany({
      where: { tenantId, sourceAppointment: { publicId: appointmentPublicId } },
      orderBy: { createdAt: 'desc' },
      include: ledgerInclude,
    });
    return LoyaltyLedgerListResponseSchema.parse({ items: items.map(pubEntry) });
  }

  /**
   * Resgata pontos ou cashback aplicando um desconto ao saldo do agendamento — nenhum
   * pagamento fictício é criado; PaymentService.listForAppointment() já soma este desconto ao
   * de cupons ao calcular balanceCents, mesmo mecanismo já usado para cupons.
   */
  public async redeem(
    tenantId: bigint,
    appointmentPublicId: string,
    type: LoyaltyType,
    amount: bigint,
    actor: Actor,
  ) {
    await this.assertEnabled(tenantId);
    const appointment = await this.client.appointment.findFirst({
      where: { tenantId, publicId: appointmentPublicId },
      select: { id: true, customerId: true, priceCents: true, status: true },
    });
    if (appointment === null)
      throw new AppError({
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'Agendamento não encontrado.',
        statusCode: 404,
      });
    if (appointment.status === 'CANCELED')
      throw new AppError({
        code: 'LOYALTY_NOT_ALLOWED_FOR_CANCELED_APPOINTMENT',
        message: 'Não é possível resgatar fidelidade em um agendamento cancelado.',
        statusCode: 409,
      });

    const rule = await this.client.loyaltyRule.findFirst({ where: { tenantId, type } });
    if (!rule?.active)
      throw new AppError({
        code: 'LOYALTY_RULE_NOT_ACTIVE',
        message: 'Este tipo de fidelidade não está ativo para este estabelecimento.',
        statusCode: 409,
      });

    const balance = await this.balance(tenantId, appointment.customerId, type);
    if (amount > balance)
      throw new AppError({
        code: 'LOYALTY_INSUFFICIENT_BALANCE',
        message: 'Saldo de fidelidade insuficiente para este resgate.',
        statusCode: 409,
      });

    const discountCentsApplied =
      type === 'CASHBACK'
        ? amount
        : (() => {
            if (rule.redeemRateCentsPerPoint === null)
              throw new AppError({
                code: 'LOYALTY_REDEEM_RATE_NOT_CONFIGURED',
                message: 'A taxa de resgate de pontos não está configurada.',
                statusCode: 409,
              });
            return amount * BigInt(rule.redeemRateCentsPerPoint);
          })();

    const [couponDiscount, loyaltyDiscount] = await Promise.all([
      this.coupons?.discountForAppointment(tenantId, appointment.id) ?? Promise.resolve(0n),
      this.discountForAppointment(tenantId, appointment.id),
    ]);
    const currentDiscount = couponDiscount + loyaltyDiscount;
    const remainingCents = appointment.priceCents - currentDiscount;
    if (remainingCents <= 0n)
      throw new AppError({
        code: 'LOYALTY_NO_BALANCE_TO_DISCOUNT',
        message: 'O agendamento não possui saldo para aplicar desconto.',
        statusCode: 409,
      });
    if (discountCentsApplied > remainingCents)
      throw new AppError({
        code: 'LOYALTY_DISCOUNT_EXCEEDS_BALANCE',
        message: 'O valor resgatado excede o saldo em aberto do agendamento.',
        statusCode: 409,
      });

    const created = await this.client.loyaltyLedgerEntry.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        customerId: appointment.customerId,
        type,
        direction: 'DEBIT',
        reason: 'REDEEMED',
        amount,
        discountCentsApplied,
        sourceAppointmentId: appointment.id,
        userId: actor.userId,
        sessionId: actor.sessionId,
      },
      include: ledgerInclude,
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'loyalty.redeemed',
        targetType: 'loyalty_ledger_entry',
        targetPublicId: created.publicId,
      },
    });
    return pubEntry(created);
  }

  public async cancelRedemption(
    tenantId: bigint,
    appointmentPublicId: string,
    entryPublicId: string,
    actor: Actor,
  ) {
    const entry = await this.client.loyaltyLedgerEntry.findFirst({
      where: {
        tenantId,
        publicId: entryPublicId,
        reason: 'REDEEMED',
        sourceAppointment: { publicId: appointmentPublicId },
      },
      include: { closesEntry: { select: { id: true } } },
    });
    if (entry === null)
      throw new AppError({
        code: 'LOYALTY_REDEMPTION_NOT_FOUND',
        message: 'Resgate de fidelidade não encontrado.',
        statusCode: 404,
      });
    if (entry.closesEntry !== null)
      throw new AppError({
        code: 'LOYALTY_REDEMPTION_ALREADY_CANCELED',
        message: 'Este resgate já foi cancelado.',
        statusCode: 409,
      });

    const reversal = await this.client.loyaltyLedgerEntry.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        customerId: entry.customerId,
        type: entry.type,
        direction: 'CREDIT',
        reason: 'REVERSED',
        amount: entry.amount,
        relatedEntryId: entry.id,
        userId: actor.userId,
        sessionId: actor.sessionId,
      },
      include: ledgerInclude,
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'loyalty.redemption_canceled',
        targetType: 'loyalty_ledger_entry',
        targetPublicId: reversal.publicId,
      },
    });
    return pubEntry(reversal);
  }

  /**
   * Expira créditos vencidos (EARNED com expiresAt no passado, ainda não estornados/expirados).
   * O valor expirado é sempre limitado ao saldo atual do cliente naquele tipo — nunca gera
   * saldo negativo, mesmo se parte do crédito já tiver sido resgatada.
   */
  public async expireDue(now = new Date()): Promise<number> {
    const dueEntries = await this.client.loyaltyLedgerEntry.findMany({
      where: {
        reason: 'EARNED',
        direction: 'CREDIT',
        expiresAt: { lte: now },
        closesEntry: null,
      },
    });
    let processed = 0;
    for (const entry of dueEntries) {
      const balance = await this.balance(entry.tenantId, entry.customerId, entry.type);
      const expiredAmount = entry.amount > balance ? balance : entry.amount;
      if (expiredAmount <= 0n) continue;

      const expiry = await this.client.loyaltyLedgerEntry.create({
        data: {
          publicId: randomUUID(),
          tenantId: entry.tenantId,
          customerId: entry.customerId,
          type: entry.type,
          direction: 'DEBIT',
          reason: 'EXPIRED',
          amount: expiredAmount,
          relatedEntryId: entry.id,
        },
      });
      await this.client.auditLog.create({
        data: {
          publicId: randomUUID(),
          tenantId: entry.tenantId,
          userId: null,
          sessionId: null,
          action: 'loyalty.expired',
          targetType: 'loyalty_ledger_entry',
          targetPublicId: expiry.publicId,
        },
      });
      processed += 1;
    }
    return processed;
  }
}
