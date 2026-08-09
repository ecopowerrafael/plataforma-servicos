import { randomUUID } from 'node:crypto';

import {
  FinancialClosingListResponseSchema,
  FinancialClosingPublicSchema,
  type CreateFinancialClosingRequest,
  type FinancialClosingQuery,
} from '@plataforma/shared';

import {
  type FinancialClosing,
  type Prisma,
  type PrismaClient,
} from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}

type ClosingWithUser = FinancialClosing & {
  unit: { publicId: string } | null;
  closedByUser: { email: string } | null;
};

const pub = (closing: ClosingWithUser) =>
  FinancialClosingPublicSchema.parse({
    publicId: closing.publicId,
    unitPublicId: closing.unit?.publicId ?? null,
    periodFrom: closing.periodFrom.toISOString(),
    periodTo: closing.periodTo.toISOString(),
    totalReceivedCents: closing.totalReceivedCents.toString(),
    totalCanceledCents: closing.totalCanceledCents.toString(),
    depositTotalCents: closing.depositTotalCents.toString(),
    manualInCents: closing.manualInCents.toString(),
    manualOutCents: closing.manualOutCents.toString(),
    cashMovementsNetCents: closing.cashMovementsNetCents.toString(),
    commissionsTotalCents: closing.commissionsTotalCents.toString(),
    balanceCents: closing.balanceCents.toString(),
    paymentMethodBreakdown: closing.paymentMethodBreakdown,
    status: closing.status,
    closedAt: closing.closedAt.toISOString(),
    closedByEmail: closing.closedByUser?.email ?? null,
    canceledAt: closing.canceledAt?.toISOString() ?? null,
    canceledReason: closing.canceledReason,
  });

const include = {
  unit: { select: { publicId: true } },
  closedByUser: { select: { email: true } },
} as const;

export class FinancialClosingService {
  public constructor(private readonly client: PrismaClient) {}

  private async resolveUnitId(
    tenantId: bigint,
    unitPublicId: string | null | undefined,
  ): Promise<bigint | null> {
    if (unitPublicId === undefined || unitPublicId === null) return null;
    const unit = await this.client.businessUnit.findFirst({
      where: { tenantId, publicId: unitPublicId },
      select: { id: true },
    });
    if (unit === null)
      throw new AppError({
        code: 'BUSINESS_UNIT_NOT_FOUND',
        message: 'Unidade não encontrada.',
        statusCode: 404,
      });
    return unit.id;
  }

  public async create(tenantId: bigint, input: CreateFinancialClosingRequest, actor: Actor) {
    const unitId = await this.resolveUnitId(tenantId, input.unitPublicId);
    const periodFrom = new Date(input.periodFrom);
    const periodTo = new Date(input.periodTo);

    const overlapping = await this.client.financialClosing.findFirst({
      where: {
        tenantId,
        unitId,
        status: 'ACTIVE',
        periodFrom: { lt: periodTo },
        periodTo: { gt: periodFrom },
      },
      select: { id: true },
    });
    if (overlapping !== null)
      throw new AppError({
        code: 'FINANCIAL_CLOSING_PERIOD_OVERLAPS',
        message: 'Já existe um fechamento ativo que se sobrepõe a este período para esta unidade.',
        statusCode: 409,
      });

    const appointmentUnitFilter: Prisma.AppointmentWhereInput = unitId === null ? {} : { unitId };
    const registerUnitFilter: Prisma.CashRegisterWhereInput = unitId === null ? {} : { unitId };

    const [
      receivedPayments,
      canceledPayments,
      depositPayments,
      manualMovements,
      allMovements,
      commissions,
    ] = await Promise.all([
      this.client.payment.findMany({
        where: {
          tenantId,
          status: 'PAID',
          createdAt: { gte: periodFrom, lt: periodTo },
          appointment: appointmentUnitFilter,
        },
        select: {
          amountCents: true,
          paymentMethodId: true,
          paymentMethod: { select: { publicId: true, name: true } },
        },
      }),
      this.client.payment.aggregate({
        where: {
          tenantId,
          status: 'CANCELED',
          canceledAt: { gte: periodFrom, lt: periodTo },
          appointment: appointmentUnitFilter,
        },
        _sum: { amountCents: true },
      }),
      this.client.payment.aggregate({
        where: {
          tenantId,
          status: 'PAID',
          kind: 'DEPOSIT',
          createdAt: { gte: periodFrom, lt: periodTo },
          appointment: appointmentUnitFilter,
        },
        _sum: { amountCents: true },
      }),
      this.client.cashMovement.findMany({
        where: {
          tenantId,
          type: 'MANUAL',
          createdAt: { gte: periodFrom, lt: periodTo },
          cashRegister: registerUnitFilter,
        },
        select: { direction: true, amountCents: true },
      }),
      this.client.cashMovement.findMany({
        where: {
          tenantId,
          createdAt: { gte: periodFrom, lt: periodTo },
          cashRegister: registerUnitFilter,
        },
        select: { direction: true, amountCents: true },
      }),
      this.client.professionalCommission.aggregate({
        where: {
          tenantId,
          status: 'ACTIVE',
          createdAt: { gte: periodFrom, lt: periodTo },
          appointment: appointmentUnitFilter,
        },
        _sum: { commissionAmountCents: true },
      }),
    ]);

    const totalReceivedCents = receivedPayments.reduce(
      (total, item) => total + item.amountCents,
      0n,
    );
    const totalCanceledCents = canceledPayments._sum.amountCents ?? 0n;
    const depositTotalCents = depositPayments._sum.amountCents ?? 0n;
    const manualInCents = manualMovements
      .filter((item) => item.direction === 'IN')
      .reduce((total, item) => total + item.amountCents, 0n);
    const manualOutCents = manualMovements
      .filter((item) => item.direction === 'OUT')
      .reduce((total, item) => total + item.amountCents, 0n);
    const cashMovementsNetCents = allMovements.reduce(
      (total, item) =>
        item.direction === 'IN' ? total + item.amountCents : total - item.amountCents,
      0n,
    );
    const commissionsTotalCents = commissions._sum.commissionAmountCents ?? 0n;
    const balanceCents = totalReceivedCents + manualInCents - manualOutCents;

    const breakdown = new Map<
      string,
      {
        paymentMethodPublicId: string;
        paymentMethodName: string;
        totalCents: bigint;
        count: number;
      }
    >();
    for (const item of receivedPayments) {
      const key = item.paymentMethodId.toString();
      const existing = breakdown.get(key);
      if (existing === undefined) {
        breakdown.set(key, {
          paymentMethodPublicId: item.paymentMethod.publicId,
          paymentMethodName: item.paymentMethod.name,
          totalCents: item.amountCents,
          count: 1,
        });
      } else {
        existing.totalCents += item.amountCents;
        existing.count += 1;
      }
    }
    const paymentMethodBreakdown = [...breakdown.values()].map((item) => ({
      paymentMethodPublicId: item.paymentMethodPublicId,
      paymentMethodName: item.paymentMethodName,
      totalCents: item.totalCents.toString(),
      count: item.count,
    }));

    const created = await this.client.financialClosing.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        unitId,
        periodFrom,
        periodTo,
        totalReceivedCents,
        totalCanceledCents,
        depositTotalCents,
        manualInCents,
        manualOutCents,
        cashMovementsNetCents,
        commissionsTotalCents,
        balanceCents,
        paymentMethodBreakdown,
        closedByUserId: actor.userId,
        closedBySessionId: actor.sessionId,
      },
      include,
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'financial_closing.created',
        targetType: 'financial_closing',
        targetPublicId: created.publicId,
      },
    });
    return pub(created);
  }

  public async cancel(tenantId: bigint, publicId: string, reason: string, actor: Actor) {
    const closing = await this.client.financialClosing.findFirst({
      where: { tenantId, publicId },
      select: { id: true, status: true },
    });
    if (closing === null)
      throw new AppError({
        code: 'FINANCIAL_CLOSING_NOT_FOUND',
        message: 'Fechamento não encontrado.',
        statusCode: 404,
      });
    if (closing.status === 'CANCELED')
      throw new AppError({
        code: 'FINANCIAL_CLOSING_ALREADY_CANCELED',
        message: 'Este fechamento já está cancelado.',
        statusCode: 409,
      });

    const updated = await this.client.financialClosing.update({
      where: { id: closing.id },
      data: { status: 'CANCELED', canceledAt: new Date(), canceledReason: reason },
      include,
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'financial_closing.canceled',
        targetType: 'financial_closing',
        targetPublicId: updated.publicId,
      },
    });
    return pub(updated);
  }

  public async get(tenantId: bigint, publicId: string) {
    const closing = await this.client.financialClosing.findFirst({
      where: { tenantId, publicId },
      include,
    });
    if (closing === null)
      throw new AppError({
        code: 'FINANCIAL_CLOSING_NOT_FOUND',
        message: 'Fechamento não encontrado.',
        statusCode: 404,
      });
    return pub(closing);
  }

  public async list(tenantId: bigint, query: FinancialClosingQuery) {
    const unitId = await this.resolveUnitId(tenantId, query.unitPublicId);
    const items = await this.client.financialClosing.findMany({
      where: {
        tenantId,
        ...(query.unitPublicId === undefined ? {} : { unitId }),
        ...(query.from === undefined && query.to === undefined
          ? {}
          : {
              periodFrom: {
                ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
              },
              periodTo: {
                ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
              },
            }),
      },
      orderBy: { periodFrom: 'desc' },
      include,
    });
    return FinancialClosingListResponseSchema.parse({ items: items.map(pub) });
  }
}
