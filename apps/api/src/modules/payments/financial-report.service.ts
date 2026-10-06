import {
  FinancialReportResponseSchema,
  type FinancialReportQuery,
  type FinancialReportSummary,
} from '@plataforma/shared';

import { type DelinquencyService } from './delinquency.service.js';
import { type Prisma, type PrismaClient } from '../../database-client/client.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

interface BreakdownAccumulator {
  key: string;
  label: string;
  totalCents: bigint;
  count: number;
}

function addToBreakdown(
  map: Map<string, BreakdownAccumulator>,
  key: string,
  label: string,
  amountCents: bigint,
) {
  const existing = map.get(key);
  if (existing === undefined) {
    map.set(key, { key, label, totalCents: amountCents, count: 1 });
  } else {
    existing.totalCents += amountCents;
    existing.count += 1;
  }
}

function toBreakdownItems(map: Map<string, BreakdownAccumulator>) {
  return [...map.values()]
    .map((item) => ({
      key: item.key,
      label: item.label,
      totalCents: item.totalCents.toString(),
      count: item.count,
    }))
    .sort((a, b) => Number(BigInt(b.totalCents) - BigInt(a.totalCents)));
}

interface Filters {
  from: Date;
  to: Date;
  unitId: bigint | null;
  professionalId: bigint | null;
  unitPublicId: string | undefined;
  professionalPublicId: string | undefined;
  isUnitPartialView: boolean;
}

export class FinancialReportService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly delinquency: DelinquencyService,
  ) {}

  private async resolveUnitId(tenantId: bigint, unitPublicId: string | undefined) {
    if (unitPublicId === undefined) return null;
    const unit = await this.client.businessUnit.findFirst({
      where: { tenantId, publicId: unitPublicId },
      select: { id: true },
    });
    return unit?.id ?? null;
  }

  private async resolveProfessionalId(tenantId: bigint, professionalPublicId: string | undefined) {
    if (professionalPublicId === undefined) return null;
    const professional = await this.client.professional.findFirst({
      where: { tenantId, publicId: professionalPublicId },
      select: { id: true },
    });
    return professional?.id ?? null;
  }

  private async buildSummaryAndBreakdowns(tenantId: bigint, filters: Filters) {
    const appointmentFilter: Prisma.AppointmentWhereInput = {
      ...(filters.unitId === null ? {} : { unitId: filters.unitId }),
      ...(filters.professionalId === null ? {} : { professionalId: filters.professionalId }),
    };
    const registerFilter: Prisma.CashRegisterWhereInput =
      filters.unitId === null ? {} : { unitId: filters.unitId };
    const isUnitPartialView = filters.isUnitPartialView;
    const receivedPaymentScope: Prisma.PaymentWhereInput =
      filters.unitId === null && filters.professionalId === null
        ? {}
        : { appointment: appointmentFilter };

    const [
      paidPayments,
      receivedPayments,
      globalMembershipPayments,
      canceledPayments,
      manualMovements,
      globalManualMovements,
      allMovements,
      commissions,
      canceledAppointments,
      noShowAppointments,
      delinquencyResult,
    ] = await Promise.all([
      this.client.payment.findMany({
        where: {
          tenantId,
          status: 'PAID',
          createdAt: { gte: filters.from, lt: filters.to },
          appointment: appointmentFilter,
        },
        select: {
          amountCents: true,
          kind: true,
          paymentMethodId: true,
          paymentMethod: { select: { publicId: true, name: true } },
          appointment: {
            select: {
              serviceId: true,
              professionalId: true,
              unitId: true,
              service: { select: { publicId: true, name: true } },
              professional: { select: { publicId: true, name: true } },
              unit: { select: { publicId: true, name: true } },
            },
          },
        },
      }),
      this.client.payment.findMany({
        where: {
          tenantId,
          status: 'PAID',
          paidAt: { gte: filters.from, lt: filters.to },
          ...receivedPaymentScope,
        },
        select: { amountCents: true, originType: true },
      }),
      isUnitPartialView
        ? this.client.payment.findMany({
            where: {
              tenantId,
              originType: 'MEMBERSHIP_CHARGE',
              status: 'PAID',
              paidAt: { gte: filters.from, lt: filters.to },
            },
            select: { amountCents: true },
          })
        : Promise.resolve([] as Array<{ amountCents: bigint }>),
      this.client.payment.aggregate({
        where: {
          tenantId,
          status: 'CANCELED',
          canceledAt: { gte: filters.from, lt: filters.to },
          appointment: appointmentFilter,
        },
        _sum: { amountCents: true },
        _count: true,
      }),
      this.client.cashMovement.findMany({
        where: {
          tenantId,
          type: 'MANUAL',
          createdAt: { gte: filters.from, lt: filters.to },
          cashRegister: registerFilter,
        },
        select: { direction: true, amountCents: true, professionalPayoutId: true },
      }),
      isUnitPartialView
        ? this.client.cashMovement.findMany({
            where: {
              tenantId,
              type: 'MANUAL',
              createdAt: { gte: filters.from, lt: filters.to },
              cashRegister: { unitId: null },
            },
            select: { direction: true, amountCents: true, professionalPayoutId: true },
          })
        : Promise.resolve(
            [] as Array<{
              direction: 'IN' | 'OUT';
              amountCents: bigint;
              professionalPayoutId: bigint | null;
            }>,
          ),
      this.client.cashMovement.findMany({
        where: {
          tenantId,
          createdAt: { gte: filters.from, lt: filters.to },
          cashRegister: registerFilter,
        },
        select: { direction: true, amountCents: true },
      }),
      this.client.professionalCommission.aggregate({
        where: {
          tenantId,
          status: 'ACTIVE',
          createdAt: { gte: filters.from, lt: filters.to },
          appointment: appointmentFilter,
        },
        _sum: { commissionAmountCents: true },
        _count: true,
      }),
      // Filtra pela data em que o status mudou (updatedAt) e não pela data agendada
      // (startsAt) — mesmo raciocínio já usado para pagamentos cancelados (filtrados por
      // canceledAt): o relatório de um período deve refletir os cancelamentos/faltas que
      // de fato ocorreram nele, não agendamentos futuros que só serão cancelados depois.
      this.client.appointment.aggregate({
        where: {
          tenantId,
          status: 'CANCELED',
          updatedAt: { gte: filters.from, lt: filters.to },
          ...appointmentFilter,
        },
        _sum: { priceCents: true },
        _count: true,
      }),
      this.client.appointment.aggregate({
        where: {
          tenantId,
          status: 'NO_SHOW',
          updatedAt: { gte: filters.from, lt: filters.to },
          ...appointmentFilter,
        },
        _sum: { priceCents: true },
        _count: true,
      }),
      // Saldo pendente/inadimplência reflete a exposição financeira atual (independente do
      // período do relatório) — um agendamento agendado fora do período ainda pode ter saldo
      // em aberto hoje, e é isso que este número deve responder.
      this.delinquency.list(tenantId, {
        ...(filters.unitPublicId === undefined ? {} : { unitPublicId: filters.unitPublicId }),
        ...(filters.professionalPublicId === undefined
          ? {}
          : { professionalPublicId: filters.professionalPublicId }),
      }),
    ]);

    const grossRevenueCents = paidPayments.reduce((total, item) => total + item.amountCents, 0n);
    const depositPayments = paidPayments.filter((item) => item.kind === 'DEPOSIT');
    const depositsCents = depositPayments.reduce((total, item) => total + item.amountCents, 0n);
    const commissionsCents = commissions._sum.commissionAmountCents ?? 0n;
    const netRevenueCents = grossRevenueCents - commissionsCents;
    const revenueByOrigin = (originType: 'APPOINTMENT' | 'MEMBERSHIP_CHARGE' | 'DEBT') =>
      receivedPayments
        .filter((item) => item.originType === originType)
        .reduce((total, item) => total + item.amountCents, 0n);
    const receivedRevenueCents = receivedPayments.reduce(
      (total, item) => total + item.amountCents,
      0n,
    );
    const appointmentRevenueCents = revenueByOrigin('APPOINTMENT');
    const membershipRevenueCents = revenueByOrigin('MEMBERSHIP_CHARGE');
    const debtRevenueCents = revenueByOrigin('DEBT');
    const manualInCents = manualMovements
      .filter((item) => item.direction === 'IN')
      .reduce((total, item) => total + item.amountCents, 0n);
    const manualOutCents = manualMovements
      .filter((item) => item.direction === 'OUT')
      .reduce((total, item) => total + item.amountCents, 0n);
    const professionalPayoutsOutCents = manualMovements
      .filter((item) => item.direction === 'OUT' && item.professionalPayoutId !== null)
      .reduce((total, item) => total + item.amountCents, 0n);
    const professionalPayoutReversalInCents = manualMovements
      .filter((item) => item.direction === 'IN' && item.professionalPayoutId !== null)
      .reduce((total, item) => total + item.amountCents, 0n);
    const professionalPayoutsCents =
      professionalPayoutsOutCents - professionalPayoutReversalInCents;
    const otherManualOutCents = manualOutCents - professionalPayoutsOutCents;
    const otherManualInCents = manualInCents - professionalPayoutReversalInCents;
    const operatingResultCents =
      receivedRevenueCents - commissionsCents - professionalPayoutsCents - otherManualOutCents;
    const globalUnallocatedMembershipRevenueCents = globalMembershipPayments.reduce(
      (total, item) => total + item.amountCents,
      0n,
    );
    const globalUnallocatedProfessionalPayoutsCents = globalManualMovements
      .filter((item) => item.professionalPayoutId !== null)
      .reduce(
        (total, item) =>
          item.direction === 'IN' ? total - item.amountCents : total + item.amountCents,
        0n,
      );
    const globalUnallocatedManualOutCents = globalManualMovements
      .filter((item) => item.direction === 'OUT' && item.professionalPayoutId === null)
      .reduce((total, item) => total + item.amountCents, 0n);
    const cashMovementsNetCents = allMovements.reduce(
      (total, item) =>
        item.direction === 'IN' ? total + item.amountCents : total - item.amountCents,
      0n,
    );

    const byPaymentMethod = new Map<string, BreakdownAccumulator>();
    const byService = new Map<string, BreakdownAccumulator>();
    const byProfessional = new Map<string, BreakdownAccumulator>();
    const byUnit = new Map<string, BreakdownAccumulator>();
    for (const payment of paidPayments) {
      if (payment.appointment === null) continue;
      addToBreakdown(
        byPaymentMethod,
        payment.paymentMethod.publicId,
        payment.paymentMethod.name,
        payment.amountCents,
      );
      if (payment.appointment.service)
        addToBreakdown(
          byService,
          payment.appointment.service.publicId,
          payment.appointment.service.name,
          payment.amountCents,
        );
      addToBreakdown(
        byProfessional,
        payment.appointment.professional.publicId,
        payment.appointment.professional.name,
        payment.amountCents,
      );
      addToBreakdown(
        byUnit,
        payment.appointment.unit?.publicId ?? 'none',
        payment.appointment.unit?.name ?? 'Sem unidade',
        payment.amountCents,
      );
    }

    const summary: FinancialReportSummary = {
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
      isUnitPartialView,
      grossRevenueCents: grossRevenueCents.toString(),
      netRevenueCents: netRevenueCents.toString(),
      paymentsReceivedCents: grossRevenueCents.toString(),
      paymentsReceivedCount: paidPayments.length,
      paymentsCanceledCents: (canceledPayments._sum.amountCents ?? 0n).toString(),
      paymentsCanceledCount: canceledPayments._count,
      depositsCents: depositsCents.toString(),
      depositsCount: depositPayments.length,
      pendingBalanceCents: delinquencyResult.totalBalanceCents,
      pendingBalanceCount: delinquencyResult.items.length,
      cashManualInCents: manualInCents.toString(),
      cashManualOutCents: manualOutCents.toString(),
      cashMovementsNetCents: cashMovementsNetCents.toString(),
      receivedRevenueCents: receivedRevenueCents.toString(),
      appointmentRevenueCents: appointmentRevenueCents.toString(),
      membershipRevenueCents: membershipRevenueCents.toString(),
      debtRevenueCents: debtRevenueCents.toString(),
      traditionalCommissionsCents: commissionsCents.toString(),
      professionalPayoutsCents: professionalPayoutsCents.toString(),
      professionalPayoutReversalInCents: professionalPayoutReversalInCents.toString(),
      otherManualOutCents: otherManualOutCents.toString(),
      otherManualInCents: otherManualInCents.toString(),
      operatingResultCents: operatingResultCents.toString(),
      cashResultCents: cashMovementsNetCents.toString(),
      globalUnallocatedMembershipRevenueCents: globalUnallocatedMembershipRevenueCents.toString(),
      globalUnallocatedProfessionalPayoutsCents:
        globalUnallocatedProfessionalPayoutsCents.toString(),
      globalUnallocatedManualOutCents: globalUnallocatedManualOutCents.toString(),
      commissionsCents: commissionsCents.toString(),
      commissionsCount: commissions._count,
      canceledAppointmentsCount: canceledAppointments._count,
      canceledAppointmentsLostRevenueCents: (canceledAppointments._sum.priceCents ?? 0n).toString(),
      noShowAppointmentsCount: noShowAppointments._count,
      noShowAppointmentsLostRevenueCents: (noShowAppointments._sum.priceCents ?? 0n).toString(),
    };

    return {
      summary,
      byPaymentMethod: toBreakdownItems(byPaymentMethod),
      byService: toBreakdownItems(byService),
      byProfessional: toBreakdownItems(byProfessional),
      byUnit: toBreakdownItems(byUnit),
    };
  }

  public async get(tenantId: bigint, query: FinancialReportQuery) {
    await new PlanEntitlementService().assertFeatureEnabledForTenant(
      this.client,
      tenantId,
      'advanced_reports.enabled',
    );
    const [unitId, professionalId] = await Promise.all([
      this.resolveUnitId(tenantId, query.unitPublicId),
      this.resolveProfessionalId(tenantId, query.professionalPublicId),
    ]);
    const from = new Date(query.from);
    const to = new Date(query.to);
    const filters: Filters = {
      from,
      to,
      unitId,
      professionalId,
      unitPublicId: query.unitPublicId,
      professionalPublicId: query.professionalPublicId,
      isUnitPartialView: query.unitPublicId !== undefined,
    };

    const current = await this.buildSummaryAndBreakdowns(tenantId, filters);

    let comparison = null;
    if (query.compareWithPrevious) {
      const durationMs = to.getTime() - from.getTime();
      const previousFilters: Filters = {
        from: new Date(from.getTime() - durationMs),
        to: from,
        unitId,
        professionalId,
        unitPublicId: query.unitPublicId,
        professionalPublicId: query.professionalPublicId,
        isUnitPartialView: query.unitPublicId !== undefined,
      };
      const previous = await this.buildSummaryAndBreakdowns(tenantId, previousFilters);
      const currentGross = BigInt(current.summary.grossRevenueCents);
      const previousGross = BigInt(previous.summary.grossRevenueCents);
      const deltaGrossRevenueCents = currentGross - previousGross;
      const deltaGrossRevenuePercent =
        previousGross === 0n
          ? null
          : (Number(deltaGrossRevenueCents) / Number(previousGross)) * 100;
      comparison = {
        previous: previous.summary,
        deltaGrossRevenueCents: deltaGrossRevenueCents.toString(),
        deltaGrossRevenuePercent,
      };
    }

    return FinancialReportResponseSchema.parse({ ...current, comparison });
  }

  public toCsv(report: Awaited<ReturnType<FinancialReportService['get']>>): string {
    const money = (cents: string) => {
      const value = BigInt(cents);
      const negative = value < 0n;
      const absolute = negative ? -value : value;
      const whole = absolute / 100n;
      const fraction = (absolute % 100n).toString().padStart(2, '0');
      return `${negative ? '-' : ''}${whole.toString()}.${fraction}`;
    };
    const lines: string[] = [];
    lines.push('Relatório financeiro');
    lines.push(`Período,${report.summary.from},${report.summary.to}`);
    lines.push(`Visão,${report.summary.isUnitPartialView ? 'Unitária parcial' : 'Consolidada'}`);
    lines.push('');
    lines.push('Métrica,Valor');
    lines.push(`Receita bruta,${money(report.summary.grossRevenueCents)}`);
    lines.push(`Receita recebida,${money(report.summary.receivedRevenueCents)}`);
    lines.push(`Receita de atendimentos,${money(report.summary.appointmentRevenueCents)}`);
    lines.push(`Receita de mensalidades,${money(report.summary.membershipRevenueCents)}`);
    lines.push(`Receita de dívidas,${money(report.summary.debtRevenueCents)}`);
    lines.push(`Comissões tradicionais,${money(report.summary.traditionalCommissionsCents)}`);
    lines.push(`Repasses líquidos,${money(report.summary.professionalPayoutsCents)}`);
    lines.push(`Outras saídas manuais,${money(report.summary.otherManualOutCents)}`);
    lines.push(`Resultado operacional,${money(report.summary.operatingResultCents)}`);
    lines.push(`Resultado de caixa,${money(report.summary.cashResultCents)}`);
    if (report.summary.isUnitPartialView) {
      lines.push(
        `Mensalidades globais não atribuídas,${money(report.summary.globalUnallocatedMembershipRevenueCents)}`,
      );
      lines.push(
        `Repasses líquidos globais não atribuídos,${money(report.summary.globalUnallocatedProfessionalPayoutsCents)}`,
      );
      lines.push(
        `Outras saídas globais não atribuídas,${money(report.summary.globalUnallocatedManualOutCents)}`,
      );
    }
    lines.push(
      `Pagamentos recebidos,${money(report.summary.paymentsReceivedCents)},${String(report.summary.paymentsReceivedCount)}`,
    );
    lines.push(
      `Pagamentos cancelados/estornados,${money(report.summary.paymentsCanceledCents)},${String(report.summary.paymentsCanceledCount)}`,
    );
    lines.push(
      `Sinais,${money(report.summary.depositsCents)},${String(report.summary.depositsCount)}`,
    );
    lines.push(
      `Saldo pendente (inadimplência),${money(report.summary.pendingBalanceCents)},${String(report.summary.pendingBalanceCount)}`,
    );
    lines.push(`Entradas manuais de caixa,${money(report.summary.cashManualInCents)}`);
    lines.push(`Saídas manuais de caixa,${money(report.summary.cashManualOutCents)}`);
    lines.push(`Movimentação líquida de caixa,${money(report.summary.cashMovementsNetCents)}`);
    lines.push(
      `Comissões geradas,${money(report.summary.commissionsCents)},${String(report.summary.commissionsCount)}`,
    );
    lines.push(
      `Cancelamentos (receita perdida),${money(report.summary.canceledAppointmentsLostRevenueCents)},${String(report.summary.canceledAppointmentsCount)}`,
    );
    lines.push(
      `Faltas (receita perdida),${money(report.summary.noShowAppointmentsLostRevenueCents)},${String(report.summary.noShowAppointmentsCount)}`,
    );
    if (report.comparison !== null) {
      lines.push('');
      lines.push('Comparação com período anterior');
      lines.push(
        `Receita bruta período anterior,${money(report.comparison.previous.grossRevenueCents)}`,
      );
      lines.push(`Variação de receita bruta,${money(report.comparison.deltaGrossRevenueCents)}`);
      lines.push(
        `Variação percentual,${report.comparison.deltaGrossRevenuePercent === null ? 'N/D' : report.comparison.deltaGrossRevenuePercent.toFixed(2)}`,
      );
    }

    const section = (title: string, items: typeof report.byPaymentMethod) => {
      lines.push('');
      lines.push(title);
      lines.push('Item,Valor,Quantidade');
      for (const item of items)
        lines.push(`${item.label},${money(item.totalCents)},${String(item.count)}`);
    };
    section('Receita por forma de pagamento', report.byPaymentMethod);
    section('Receita por serviço', report.byService);
    section('Receita por profissional', report.byProfessional);
    section('Receita por unidade', report.byUnit);

    return lines.join('\n');
  }
}
