import { FinanceOverviewResponseSchema, type FinanceOverviewResponse } from '@plataforma/shared';

import { discountsByAppointment, netPriceCents } from './appointment-balance.js';
import { type DelinquencyService } from './delinquency.service.js';
import { type Prisma, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import {
  addDaysToDay,
  daysBetweenDays,
  resolveTimezone,
  zonedDayKey,
  zonedDayStart,
  zonedMonthKey,
} from '../tenants/timezone.js';

export interface FinanceOverviewInput {
  /** Dias civis no fuso do estabelecimento; `toDate` e inclusivo. */
  fromDate: string;
  toDate: string;
  unitPublicId?: string | undefined;
  professionalPublicId?: string | undefined;
}

export interface FinanceOverviewScope {
  /** Comissões e caixa têm permissões próprias no domínio. */
  includeCommissions: boolean;
  includeCash: boolean;
}

/** Cobranca online criada e ainda sem desfecho: aguarda confirmacao. */
const AWAITING_GATEWAY_STATUSES = ['PENDING', 'PROCESSING'] as const;
/** Cobranca online que terminou sem pagamento: exige nova acao, nao e espera. */
const FAILED_GATEWAY_STATUSES = ['FAILED', 'EXPIRED'] as const;

const ticket = (billed: bigint, count: number) => (count === 0 ? 0n : billed / BigInt(count));

/**
 * Etapas do painel, usadas apenas para diagnostico. Sao rotulos fixos e seguros:
 * nenhum dado do tenant, da consulta ou do ambiente entra nesses nomes.
 */
export type FinanceOverviewStage =
  | 'context'
  | 'period'
  | 'billedAppointments'
  | 'billedDiscounts'
  | 'receivedPayments'
  | 'previousPeriod'
  | 'paymentMethods'
  | 'canceledPayments'
  | 'cashMovementsActivity'
  | 'receivables'
  | 'gatewayCharges'
  | 'professionals'
  | 'commissions'
  | 'cash'
  | 'series'
  | 'response';

export const FINANCE_OVERVIEW_STAGE_FAILED = 'FINANCE_OVERVIEW_STAGE_FAILED';

/**
 * Converte uma falha inesperada de um bloco em um erro conhecido que identifica apenas
 * a etapa. A causa original fica em `cause` para log/teste e nunca vai para a resposta.
 */
const stageError = (stage: FinanceOverviewStage, cause: unknown) =>
  new AppError({
    code: FINANCE_OVERVIEW_STAGE_FAILED,
    message: 'Não foi possível processar uma etapa do financeiro.',
    statusCode: 500,
    details: [{ path: 'stage', message: stage }],
    cause,
  });

/** Erros conhecidos do domínio continuam subindo intactos. */
async function runStage<T>(stage: FinanceOverviewStage, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw stageError(stage, error);
  }
}

function runStageSync<T>(stage: FinanceOverviewStage, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw stageError(stage, error);
  }
}

export class FinanceOverviewService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly delinquency: DelinquencyService,
  ) {}

  /**
   * Painel executivo do financeiro: fatura, recebimento, exposição em aberto,
   * formas de pagamento, desempenho por profissional, caixa, comissões e atividade.
   * Tudo agregado no servidor e sempre restrito ao tenant do contexto.
   */
  public async overview(
    tenantId: bigint,
    input: FinanceOverviewInput,
    scope: FinanceOverviewScope,
  ): Promise<FinanceOverviewResponse> {
    const context = await runStage('context', async () => {
      const [unit, professional] = await Promise.all([
        this.resolveUnit(tenantId, input.unitPublicId),
        this.resolveProfessional(tenantId, input.professionalPublicId),
      ]);
      // Fuso da unidade filtrada, senao o do estabelecimento: o dia civil e o do negocio.
      const zone = resolveTimezone(unit?.timezone ?? (await this.tenantTimezone(tenantId)));
      return { unitId: unit?.id ?? null, professionalId: professional, timezone: zone };
    });
    const { unitId, professionalId, timezone } = context;

    // `toDate` e inclusivo para o usuario; internamente o fim e exclusivo.
    const period = runStageSync('period', () => {
      const exclusiveEnd = addDaysToDay(input.toDate, 1);
      const total = daysBetweenDays(input.fromDate, exclusiveEnd);
      const previousStart = addDaysToDay(input.fromDate, -total);
      return {
        days: total,
        previousFromDate: previousStart,
        from: zonedDayStart(input.fromDate, timezone),
        to: zonedDayStart(exclusiveEnd, timezone),
        previousFrom: zonedDayStart(previousStart, timezone),
      };
    });
    const { days, previousFromDate, from, to, previousFrom } = period;
    const previousTo = from;
    const appointmentScope: Prisma.AppointmentWhereInput = {
      ...(unitId === null ? {} : { unitId }),
      ...(professionalId === null ? {} : { professionalId }),
    };

    const [current, previous, methodsAndActivity, receivables, commissions, cash] =
      await Promise.all([
        this.periodTotals(tenantId, from, to, appointmentScope),
        runStage('previousPeriod', () =>
          this.periodTotals(tenantId, previousFrom, previousTo, appointmentScope, true),
        ),
        this.paymentsBreakdown(tenantId, from, to, appointmentScope),
        runStage('receivables', () => this.receivables(tenantId, input)),
        scope.includeCommissions
          ? runStage('commissions', () => this.commissions(tenantId, from, to, appointmentScope))
          : Promise.resolve(null),
        scope.includeCash
          ? runStage('cash', () => this.cash(tenantId, from, to, unitId))
          : Promise.resolve(null),
      ]);

    const useMonths = days > 62;
    const series = runStageSync('series', () => this.buildSeries(current, useMonths, timezone));
    const professionals = await runStage('professionals', () =>
      this.professionals(
        tenantId,
        current,
        methodsAndActivity.receivedByProfessional,
        commissions?.byProfessional ?? null,
      ),
    );

    return runStageSync('response', () =>
      FinanceOverviewResponseSchema.parse({
        timezone,
        period: {
          fromDate: input.fromDate,
          toDate: input.toDate,
          from: from.toISOString(),
          to: to.toISOString(),
        },
        previousPeriod: {
          fromDate: previousFromDate,
          toDate: addDaysToDay(input.fromDate, -1),
          from: previousFrom.toISOString(),
          to: previousTo.toISOString(),
        },
        totals: {
          billedCents: current.billedCents.toString(),
          receivedCents: current.receivedCents.toString(),
          completedAppointments: current.completed.length,
          ticketAverageCents: ticket(current.billedCents, current.completed.length).toString(),
        },
        previousTotals:
          previous.completed.length === 0 && previous.receivedCents === 0n
            ? null
            : {
                billedCents: previous.billedCents.toString(),
                receivedCents: previous.receivedCents.toString(),
                completedAppointments: previous.completed.length,
                ticketAverageCents: ticket(
                  previous.billedCents,
                  previous.completed.length,
                ).toString(),
              },
        series,
        paymentMethods: methodsAndActivity.methods,
        professionals,
        receivables,
        commissions:
          commissions === null
            ? null
            : {
                generatedCents: commissions.generatedCents.toString(),
                generatedCount: commissions.generatedCount,
                canceledCents: commissions.canceledCents.toString(),
              },
        cash,
        recentActivity: methodsAndActivity.activity,
      }),
    );
  }

  private async resolveUnit(tenantId: bigint, publicId: string | undefined) {
    if (publicId === undefined) return null;
    return this.client.businessUnit.findFirst({
      where: { tenantId, publicId },
      select: { id: true, timezone: true },
    });
  }

  private async tenantTimezone(tenantId: bigint) {
    const tenant = await this.client.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    return tenant?.timezone ?? 'UTC';
  }

  private async resolveProfessional(tenantId: bigint, publicId: string | undefined) {
    if (publicId === undefined) return null;
    const professional = await this.client.professional.findFirst({
      where: { tenantId, publicId },
      select: { id: true },
    });
    return professional?.id ?? null;
  }

  /**
   * Faturado = preço líquido (descontos de cupom e fidelidade aplicados, a mesma base do
   * PaymentService) dos atendimentos concluídos no período.
   * Recebido = pagamentos com status PAID registrados no período.
   */
  private async periodTotals(
    tenantId: bigint,
    from: Date,
    to: Date,
    scope: Prisma.AppointmentWhereInput,
    /** O periodo anterior ja e envolvido por um estagio proprio. */
    inner = false,
  ) {
    const wrap = async <T>(stage: FinanceOverviewStage, run: () => Promise<T>) =>
      inner ? run() : runStage(stage, run);
    const completed = await wrap('billedAppointments', () =>
      this.client.appointment.findMany({
        where: { tenantId, status: 'COMPLETED', startsAt: { gte: from, lt: to }, ...scope },
        select: { id: true, startsAt: true, priceCents: true, professionalId: true },
      }),
    );
    const ids = completed.map((item) => item.id);
    const [discounts, payments] = await Promise.all([
      wrap('billedDiscounts', () => discountsByAppointment(this.client, tenantId, ids)),
      wrap('receivedPayments', () =>
        this.client.payment.findMany({
          where: {
            tenantId,
            status: 'PAID',
            createdAt: { gte: from, lt: to },
            appointment: scope,
          },
          select: { amountCents: true, createdAt: true },
        }),
      ),
    ]);

    const priced = completed.map((appointment) => ({
      ...appointment,
      netCents: netPriceCents(appointment.priceCents, discounts.get(appointment.id) ?? 0n),
    }));

    return {
      completed: priced,
      billedCents: priced.reduce((total, item) => total + item.netCents, 0n),
      receivedCents: payments.reduce((total, item) => total + item.amountCents, 0n),
      payments,
    };
  }

  /** Formas de pagamento, recebimento por profissional e atividade recente vêm da mesma leitura. */
  private async paymentsBreakdown(
    tenantId: bigint,
    from: Date,
    to: Date,
    scope: Prisma.AppointmentWhereInput,
  ) {
    const [paid, canceled, movements] = await Promise.all([
      runStage('paymentMethods', () =>
        this.client.payment.findMany({
          where: { tenantId, status: 'PAID', createdAt: { gte: from, lt: to }, appointment: scope },
          orderBy: { createdAt: 'desc' },
          select: {
            amountCents: true,
            kind: true,
            createdAt: true,
            paymentMethod: { select: { publicId: true, name: true } },
            appointment: {
              select: {
                publicId: true,
                professionalId: true,
                customer: { select: { name: true } },
                service: { select: { name: true } },
              },
            },
          },
        }),
      ),
      runStage('canceledPayments', () =>
        this.client.payment.findMany({
          where: {
            tenantId,
            status: 'CANCELED',
            canceledAt: { gte: from, lt: to },
            appointment: scope,
          },
          orderBy: { canceledAt: 'desc' },
          take: 5,
          select: {
            amountCents: true,
            canceledAt: true,
            canceledReason: true,
            appointment: { select: { publicId: true, customer: { select: { name: true } } } },
          },
        }),
      ),
      runStage('cashMovementsActivity', () =>
        this.client.cashMovement.findMany({
          where: { tenantId, type: 'MANUAL', createdAt: { gte: from, lt: to } },
          orderBy: { createdAt: 'desc' },
          take: 10,
          // O campo textual do movimento de caixa e `reason`, nao `description`.
          select: { direction: true, amountCents: true, createdAt: true, reason: true },
        }),
      ),
    ]);

    const methods = new Map<
      string,
      { publicId: string; name: string; total: bigint; count: number }
    >();
    const receivedByProfessional = new Map<bigint, bigint>();
    for (const payment of paid) {
      const current = methods.get(payment.paymentMethod.publicId);
      methods.set(payment.paymentMethod.publicId, {
        publicId: payment.paymentMethod.publicId,
        name: payment.paymentMethod.name,
        total: (current?.total ?? 0n) + payment.amountCents,
        count: (current?.count ?? 0) + 1,
      });
      receivedByProfessional.set(
        payment.appointment.professionalId,
        (receivedByProfessional.get(payment.appointment.professionalId) ?? 0n) +
          payment.amountCents,
      );
    }

    const activity = [
      ...paid.slice(0, 10).map((payment) => ({
        kind: 'PAYMENT' as const,
        at: payment.createdAt.toISOString(),
        title: payment.kind === 'DEPOSIT' ? 'Sinal recebido' : 'Pagamento recebido',
        description: `${payment.appointment.customer.name} · ${payment.paymentMethod.name}`,
        amountCents: payment.amountCents.toString(),
        direction: 'IN' as const,
        appointmentPublicId: payment.appointment.publicId,
      })),
      ...canceled.map((payment) => ({
        kind: 'PAYMENT_CANCELED' as const,
        at: (payment.canceledAt ?? new Date()).toISOString(),
        title: 'Pagamento estornado',
        description: payment.canceledReason ?? payment.appointment.customer.name,
        amountCents: payment.amountCents.toString(),
        direction: 'OUT' as const,
        appointmentPublicId: payment.appointment.publicId,
      })),
      ...movements.map((movement) => ({
        kind: movement.direction === 'IN' ? ('CASH_IN' as const) : ('CASH_OUT' as const),
        at: movement.createdAt.toISOString(),
        title: movement.direction === 'IN' ? 'Entrada de caixa' : 'Saída de caixa',
        description: movement.reason,
        amountCents: movement.amountCents.toString(),
        direction: movement.direction === 'IN' ? ('IN' as const) : ('OUT' as const),
        appointmentPublicId: null,
      })),
    ]
      .sort((left, right) => right.at.localeCompare(left.at))
      .slice(0, 10);

    return {
      methods: [...methods.values()]
        .map((item) => ({
          publicId: item.publicId,
          name: item.name,
          totalCents: item.total.toString(),
          count: item.count,
        }))
        .sort((left, right) => Number(BigInt(right.totalCents) - BigInt(left.totalCents))),
      receivedByProfessional,
      activity,
    };
  }

  /** A receber usa a regra de inadimplência já existente no domínio. */
  private async receivables(tenantId: bigint, input: FinanceOverviewInput) {
    const result = await this.delinquency.list(tenantId, {
      ...(input.unitPublicId === undefined ? {} : { unitPublicId: input.unitPublicId }),
      ...(input.professionalPublicId === undefined
        ? {}
        : { professionalPublicId: input.professionalPublicId }),
    });
    const publicIds = result.items.map((item) => item.appointmentPublicId);
    const openCharges =
      publicIds.length === 0
        ? []
        : await runStage('gatewayCharges', () =>
            this.client.paymentGatewayCharge.findMany({
              where: {
                tenantId,
                appointment: { publicId: { in: publicIds } },
                status: { in: [...AWAITING_GATEWAY_STATUSES, ...FAILED_GATEWAY_STATUSES] },
              },
              select: { status: true, appointment: { select: { publicId: true } } },
            }),
          );
    const awaiting = new Set(
      openCharges
        .filter((charge) =>
          (AWAITING_GATEWAY_STATUSES as readonly string[]).includes(charge.status),
        )
        .map((charge) => charge.appointment.publicId),
    );
    const failed = new Set(
      openCharges
        .filter(
          (charge) =>
            !awaiting.has(charge.appointment.publicId) &&
            (FAILED_GATEWAY_STATUSES as readonly string[]).includes(charge.status),
        )
        .map((charge) => charge.appointment.publicId),
    );
    let onlinePending = 0n;
    let onlineFailed = 0n;
    let onSite = 0n;
    const items = result.items.map((item) => {
      const state = awaiting.has(item.appointmentPublicId)
        ? 'ONLINE_PENDING'
        : failed.has(item.appointmentPublicId)
          ? 'ONLINE_FAILED'
          : 'ON_SITE';
      if (state === 'ONLINE_PENDING') onlinePending += BigInt(item.balanceCents);
      else if (state === 'ONLINE_FAILED') onlineFailed += BigInt(item.balanceCents);
      else onSite += BigInt(item.balanceCents);
      return {
        appointmentPublicId: item.appointmentPublicId,
        protocol: item.protocol,
        customerPublicId: item.customerPublicId,
        customerName: item.customerName,
        startsAt: item.startsAt,
        priceCents: item.priceCents,
        balanceCents: item.balanceCents,
        state,
      };
    });
    return {
      totalCents: result.totalBalanceCents,
      count: items.length,
      onlinePendingCents: onlinePending.toString(),
      onlineFailedCents: onlineFailed.toString(),
      onSiteCents: onSite.toString(),
      top: [...items]
        .sort((left, right) => Number(BigInt(right.balanceCents) - BigInt(left.balanceCents)))
        .slice(0, 5),
    };
  }

  private async commissions(
    tenantId: bigint,
    from: Date,
    to: Date,
    scope: Prisma.AppointmentWhereInput,
  ) {
    // Uma leitura simples cobre total, contagem e rateio por profissional.
    const [activeEntries, canceled] = await Promise.all([
      this.client.professionalCommission.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          createdAt: { gte: from, lt: to },
          appointment: scope,
        },
        select: { professionalId: true, commissionAmountCents: true },
      }),
      this.client.professionalCommission.aggregate({
        where: {
          tenantId,
          status: 'CANCELED',
          createdAt: { gte: from, lt: to },
          appointment: scope,
        },
        _sum: { commissionAmountCents: true },
      }),
    ]);
    const byProfessional = new Map<bigint, bigint>();
    let generatedCents = 0n;
    for (const entry of activeEntries) {
      generatedCents += entry.commissionAmountCents;
      byProfessional.set(
        entry.professionalId,
        (byProfessional.get(entry.professionalId) ?? 0n) + entry.commissionAmountCents,
      );
    }
    return {
      generatedCents,
      generatedCount: activeEntries.length,
      canceledCents: canceled._sum.commissionAmountCents ?? 0n,
      byProfessional,
    };
  }

  private async cash(tenantId: bigint, from: Date, to: Date, unitId: bigint | null) {
    const registerScope: Prisma.CashRegisterWhereInput = unitId === null ? {} : { unitId };
    const [movements, openRegister] = await Promise.all([
      this.client.cashMovement.findMany({
        where: { tenantId, createdAt: { gte: from, lt: to }, cashRegister: registerScope },
        select: { direction: true, amountCents: true, type: true },
      }),
      this.client.cashRegister.findFirst({
        where: { tenantId, status: 'OPEN', ...(unitId === null ? {} : { unitId }) },
        select: { id: true, openingBalanceCents: true },
      }),
    ]);
    const sum = (list: typeof movements, direction: 'IN' | 'OUT', manualOnly = false) =>
      list
        .filter((item) => item.direction === direction && (!manualOnly || item.type === 'MANUAL'))
        .reduce((total, item) => total + item.amountCents, 0n);
    const inCents = sum(movements, 'IN');
    const outCents = sum(movements, 'OUT');
    let openBalance: bigint | null = null;
    if (openRegister !== null) {
      const registerMovements = await this.client.cashMovement.findMany({
        where: { tenantId, cashRegisterId: openRegister.id },
        select: { direction: true, amountCents: true },
      });
      openBalance = registerMovements.reduce(
        (total, item) =>
          item.direction === 'IN' ? total + item.amountCents : total - item.amountCents,
        openRegister.openingBalanceCents,
      );
    }
    return {
      inCents: inCents.toString(),
      outCents: outCents.toString(),
      netCents: (inCents - outCents).toString(),
      manualInCents: sum(movements, 'IN', true).toString(),
      manualOutCents: sum(movements, 'OUT', true).toString(),
      // Pagamentos ja contam em `receivedCents`; o caixa apenas os reflete.
      paymentInCents: movements
        .filter((item) => item.direction === 'IN' && item.type === 'PAYMENT')
        .reduce((total, item) => total + item.amountCents, 0n)
        .toString(),
      openRegisterBalanceCents:
        openBalance === null ? null : (openBalance < 0n ? 0n : openBalance).toString(),
    };
  }

  private async professionals(
    tenantId: bigint,
    current: { completed: { professionalId: bigint; netCents: bigint }[] },
    receivedByProfessional: Map<bigint, bigint>,
    commissionsByProfessional: Map<bigint, bigint> | null,
  ) {
    const billed = new Map<bigint, { billed: bigint; count: number }>();
    for (const appointment of current.completed) {
      const entry = billed.get(appointment.professionalId);
      billed.set(appointment.professionalId, {
        billed: (entry?.billed ?? 0n) + appointment.netCents,
        count: (entry?.count ?? 0) + 1,
      });
    }
    const ids = [...new Set([...billed.keys(), ...receivedByProfessional.keys()])];
    if (ids.length === 0) return [];
    const professionals = await this.client.professional.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, publicId: true, name: true },
    });
    return professionals
      .map((professional) => {
        const entry = billed.get(professional.id);
        const billedCents = entry?.billed ?? 0n;
        const count = entry?.count ?? 0;
        return {
          publicId: professional.publicId,
          name: professional.name,
          billedCents: billedCents.toString(),
          receivedCents: (receivedByProfessional.get(professional.id) ?? 0n).toString(),
          completedAppointments: count,
          ticketAverageCents: ticket(billedCents, count).toString(),
          commissionsCents:
            commissionsByProfessional === null
              ? null
              : (commissionsByProfessional.get(professional.id) ?? 0n).toString(),
        };
      })
      .sort((left, right) => Number(BigInt(right.billedCents) - BigInt(left.billedCents)));
  }

  /** Série temporal por dia (períodos curtos) ou por mês, com faturado e recebido lado a lado. */
  private buildSeries(
    current: {
      completed: { startsAt: Date; netCents: bigint }[];
      payments: { createdAt: Date; amountCents: bigint }[];
    },
    useMonths: boolean,
    timezone: string,
  ) {
    const points = new Map<string, { billed: bigint; received: bigint }>();
    const keyOf = (date: Date) =>
      useMonths ? zonedMonthKey(date, timezone) : zonedDayKey(date, timezone);
    const add = (key: string, field: 'billed' | 'received', value: bigint) => {
      const entry = points.get(key) ?? { billed: 0n, received: 0n };
      entry[field] += value;
      points.set(key, entry);
    };
    for (const appointment of current.completed)
      add(keyOf(appointment.startsAt), 'billed', appointment.netCents);
    for (const payment of current.payments)
      add(keyOf(payment.createdAt), 'received', payment.amountCents);
    return [...points.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([key, value]) => ({
        key,
        label: useMonths
          ? `${key.slice(5)}/${key.slice(2, 4)}`
          : `${key.slice(8)}/${key.slice(5, 7)}`,
        billedCents: value.billed.toString(),
        receivedCents: value.received.toString(),
      }));
  }
}
