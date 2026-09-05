import { randomUUID } from 'node:crypto';

import {
  type CreateTreatmentPlanRequest,
  estimatedTotalCents,
  recommendedNextDate,
  TreatmentPlanListResponseSchema,
  TreatmentPlanPublicSchema,
  type UpdateTreatmentPlanRequest,
} from '@plataforma/shared';

import {
  type TreatmentPlanRecord,
  type TreatmentPlanRepository,
} from './treatment-plan.repository.js';
import { type TreatmentPlanReminderService } from './treatment-plan-reminder.service.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}

/** Sessões canceladas e não comparecidas não contam como realizadas. */
const isCompleted = (status: string) => status === 'COMPLETED';
const isLive = (status: string) => status !== 'CANCELED' && status !== 'NO_SHOW';

function planNotFound(): AppError {
  return new AppError({
    code: 'TREATMENT_PLAN_NOT_FOUND',
    message: 'Orçamento não encontrado.',
    statusCode: 404,
  });
}

export class TreatmentPlanService {
  private reminderService?: TreatmentPlanReminderService;

  public constructor(private readonly repo: TreatmentPlanRepository) {}

  public setReminderService(service: TreatmentPlanReminderService): void {
    this.reminderService = service;
  }

  private async toPublic(tenantId: bigint, plan: TreatmentPlanRecord) {
    const paidByAppointment = await this.repo.paidCentsByAppointment(
      tenantId,
      plan.sessions.map((session) => session.id),
    );
    const completed = plan.sessions.filter((session) => isCompleted(session.status));
    // A referência do intervalo é sempre a última sessão realmente concluída.
    const lastCompletedAt = completed.reduce<Date | null>(
      (latest, session) =>
        latest === null || session.startsAt > latest ? session.startsAt : latest,
      null,
    );
    const paidCents = plan.sessions.reduce(
      (total, session) => total + (paidByAppointment.get(session.id) ?? 0n),
      0n,
    );
    return TreatmentPlanPublicSchema.parse({
      publicId: plan.publicId,
      // Planos criados antes do campo caem no nome do serviço.
      title: plan.title ?? plan.service.name,
      status: plan.status,
      billingMode: plan.billingMode,
      amountCents: plan.amountCents.toString(),
      estimatedTotalCents:
        estimatedTotalCents(
          plan.billingMode,
          plan.amountCents,
          plan.sessionsPlanned,
        )?.toString() ?? null,
      sessionsPlanned: plan.sessionsPlanned,
      sessionsCompleted: completed.length,
      returnIntervalDays: plan.returnIntervalDays,
      notes: plan.notes,
      customerPublicId: plan.customer.publicId,
      customerName: plan.customer.name,
      servicePublicId: plan.service.publicId,
      serviceName: plan.service.name,
      professionalPublicId: plan.professional.publicId,
      professionalName: plan.professional.publicName,
      originAppointmentPublicId: plan.originAppointment.publicId,
      recommendedNextDate:
        recommendedNextDate(lastCompletedAt, plan.returnIntervalDays)?.toISOString() ?? null,
      lastCompletedSessionAt: lastCompletedAt?.toISOString() ?? null,
      paidCents: paidCents.toString(),
      sessions: plan.sessions.map((session) => {
        const paid = paidByAppointment.get(session.id) ?? 0n;
        return {
          appointmentPublicId: session.publicId,
          sessionNumber: session.sessionNumber ?? 1,
          startsAt: session.startsAt.toISOString(),
          status: session.status,
          priceCents: session.priceCents.toString(),
          paidCents: paid.toString(),
          balanceCents: (session.priceCents > paid ? session.priceCents - paid : 0n).toString(),
        };
      }),
      approvedAt: plan.approvedAt?.toISOString() ?? null,
      startedAt: plan.startedAt?.toISOString() ?? null,
      completedAt: plan.completedAt?.toISOString() ?? null,
      canceledAt: plan.canceledAt?.toISOString() ?? null,
      canceledReason: plan.canceledReason,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    });
  }

  /**
   * Cria o orçamento a partir da avaliação. `professionalId` vem da identidade
   * do backend quando a chamada é do Professional App: nunca do corpo.
   */
  public async createFromEvaluation(
    tenantId: bigint,
    input: CreateTreatmentPlanRequest,
    actor: Actor,
    professionalId?: bigint,
  ) {
    const appointment = await this.repo.evaluationAppointment(tenantId, input.appointmentPublicId);
    if (appointment === null)
      throw new AppError({
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'Agendamento não encontrado.',
        statusCode: 404,
      });
    if (professionalId !== undefined && appointment.professionalId !== professionalId)
      throw planNotFound();
    if (appointment.serviceId === null)
      throw new AppError({
        code: 'TREATMENT_PLAN_COMBO_NOT_SUPPORTED',
        message: 'Planos de tratamento para agendamentos de combos não são suportados nesta versão.',
        statusCode: 400,
      });
    if (appointment.kind !== 'EVALUATION' || appointment.service!.pricingMode !== 'QUOTE')
      throw new AppError({
        code: 'TREATMENT_PLAN_REQUIRES_EVALUATION',
        message: 'Só é possível definir orçamento a partir de uma avaliação.',
        statusCode: 400,
      });
    const existing = await this.repo.findByOriginAppointment(tenantId, appointment.id);
    if (existing !== null)
      throw new AppError({
        code: 'TREATMENT_PLAN_ALREADY_EXISTS',
        message: 'Esta avaliação já possui um orçamento.',
        statusCode: 409,
      });
    const plan = await this.repo.create({
      publicId: randomUUID(),
      tenantId,
      customerId: appointment.customerId,
      serviceId: appointment.serviceId,
      professionalId: appointment.professionalId,
      originAppointmentId: appointment.id,
      title: input.title,
      status: 'PENDING',
      billingMode: input.billingMode,
      amountCents: BigInt(input.amountCents),
      sessionsPlanned: input.sessionsPlanned ?? null,
      returnIntervalDays: input.returnIntervalDays ?? null,
      notes: input.notes ?? null,
    });
    await this.audit(tenantId, plan.publicId, 'treatment_plan.created', actor);
    try {
      await this.reminderService?.initializeForPendingPlan(tenantId, plan.id);
    } catch {
      /* falha na inicialização de reminders não impede a criação do plano */
    }
    return this.toPublic(tenantId, plan);
  }

  public async get(tenantId: bigint, publicId: string, professionalId?: bigint) {
    const plan = await this.requirePlan(tenantId, publicId, professionalId);
    return this.toPublic(tenantId, plan);
  }

  public async getByAppointment(tenantId: bigint, appointmentPublicId: string, professionalId?: bigint) {
    const appointment = await this.repo.evaluationAppointment(tenantId, appointmentPublicId);
    if (appointment === null) throw planNotFound();
    if (professionalId !== undefined && appointment.professionalId !== professionalId)
      throw planNotFound();
    const plan = await this.repo.findByOriginAppointment(tenantId, appointment.id);
    if (plan === null) return null;
    return this.toPublic(tenantId, plan);
  }

  /**
   * Aprovação pelo próprio cliente. `customerId` vem da sessão autenticada —
   * o publicId do corpo/rota nunca autoriza nada. Idempotente: aprovar de
   * novo devolve o estado atual sem novo `approvedAt` nem novo evento.
   */
  public async approveForCustomer(tenantId: bigint, customerId: bigint, publicId: string) {
    const plan = await this.repo.find(tenantId, publicId);
    if (plan?.customerId !== customerId) throw planNotFound();
    if (plan.status !== 'PENDING')
      return { plan: await this.toPublic(tenantId, plan), changed: false };
    const updated = await this.repo.update(plan.id, {
      status: 'APPROVED',
      approvedAt: new Date(),
    });
    await this.audit(tenantId, publicId, 'treatment_plan.approved_by_customer', {
      userId: null,
      sessionId: null,
    });
    try {
      await this.reminderService?.cancelReminder(plan.id);
    } catch {
      /* falha no cancelamento de reminders não impede a aprovação */
    }
    return { plan: await this.toPublic(tenantId, updated), changed: true };
  }

  /** Detalhe de um plano do próprio cliente autenticado. */
  public async getForCustomer(tenantId: bigint, customerId: bigint, publicId: string) {
    const plan = await this.repo.find(tenantId, publicId);
    if (plan?.customerId !== customerId) throw planNotFound();
    return this.toPublic(tenantId, plan);
  }

  public async listForCustomer(tenantId: bigint, customerId: bigint) {
    const plans = await this.repo.list(tenantId, { customerId });
    return TreatmentPlanListResponseSchema.parse({
      items: await Promise.all(plans.map((plan) => this.toPublic(tenantId, plan))),
    });
  }

  /** Cliente 360: planos de um cliente, ou todos do tenant sem filtro. */
  public async listForCustomerPublicId(tenantId: bigint, customerPublicId?: string) {
    const plans = await this.repo.list(
      tenantId,
      customerPublicId === undefined ? {} : { customer: { publicId: customerPublicId } },
    );
    return TreatmentPlanListResponseSchema.parse({
      items: await Promise.all(plans.map((plan) => this.toPublic(tenantId, plan))),
    });
  }

  public async listForProfessional(tenantId: bigint, professionalId: bigint) {
    const plans = await this.repo.list(tenantId, { professionalId });
    return TreatmentPlanListResponseSchema.parse({
      items: await Promise.all(plans.map((plan) => this.toPublic(tenantId, plan))),
    });
  }

  public async update(
    tenantId: bigint,
    publicId: string,
    input: UpdateTreatmentPlanRequest,
    actor: Actor,
    professionalId?: bigint,
  ) {
    const plan = await this.requirePlan(tenantId, publicId, professionalId);
    if (plan.status === 'COMPLETED' || plan.status === 'CANCELED')
      throw new AppError({
        code: 'TREATMENT_PLAN_LOCKED',
        message: 'Este orçamento não pode mais ser alterado.',
        statusCode: 409,
      });
    const paid = await this.repo.paidCentsByAppointment(
      tenantId,
      plan.sessions.map((session) => session.id),
    );
    const hasPayments = [...paid.values()].some((amount) => amount > 0n);
    const hasCompletedSession = plan.sessions.some((session) => isCompleted(session.status));
    const changesMoney =
      BigInt(input.amountCents) !== plan.amountCents || input.billingMode !== plan.billingMode;
    // Histórico financeiro não é reescrito: com pagamento real ou sessão já
    // realizada o valor e a forma de cobrança travam.
    if ((hasPayments || hasCompletedSession) && changesMoney)
      throw new AppError({
        code: 'TREATMENT_PLAN_AMOUNT_LOCKED',
        message: hasPayments
          ? 'Já existe pagamento neste tratamento. O valor e a forma de cobrança não podem ser alterados.'
          : 'Já existe sessão realizada neste tratamento. O valor e a forma de cobrança não podem ser alterados.',
        statusCode: 409,
      });
    const updated = await this.repo.update(plan.id, {
      title: input.title,
      billingMode: input.billingMode,
      amountCents: BigInt(input.amountCents),
      sessionsPlanned: input.sessionsPlanned ?? null,
      returnIntervalDays: input.returnIntervalDays ?? null,
      notes: input.notes ?? null,
    });
    await this.audit(tenantId, publicId, 'treatment_plan.updated', actor);
    return this.toPublic(tenantId, updated);
  }

  public async approve(tenantId: bigint, publicId: string, actor: Actor, professionalId?: bigint) {
    const plan = await this.requirePlan(tenantId, publicId, professionalId);
    if (plan.status !== 'PENDING')
      throw new AppError({
        code: 'TREATMENT_PLAN_NOT_PENDING',
        message: 'Este orçamento não está aguardando aprovação.',
        statusCode: 409,
      });
    const updated = await this.repo.update(plan.id, {
      status: 'APPROVED',
      approvedAt: new Date(),
    });
    await this.audit(tenantId, publicId, 'treatment_plan.approved', actor);
    try {
      await this.reminderService?.cancelReminder(plan.id);
    } catch {
      /* falha no cancelamento de reminders não impede a aprovação */
    }
    return this.toPublic(tenantId, updated);
  }

  public async cancel(
    tenantId: bigint,
    publicId: string,
    reason: string | undefined,
    actor: Actor,
    professionalId?: bigint,
  ) {
    const plan = await this.requirePlan(tenantId, publicId, professionalId);
    if (plan.status === 'CANCELED') return this.toPublic(tenantId, plan);
    // Cancelar preserva avaliações, sessões concluídas e pagamentos.
    const updated = await this.repo.update(plan.id, {
      status: 'CANCELED',
      canceledAt: new Date(),
      canceledReason: reason ?? null,
    });
    await this.audit(tenantId, publicId, 'treatment_plan.canceled', actor);
    try {
      await this.reminderService?.cancelReminder(plan.id);
    } catch {
      /* falha no cancelamento de reminders não impede o cancelamento */
    }
    return this.toPublic(tenantId, updated);
  }

  /**
   * Dados da próxima sessão a agendar. O preço vem do plano: em `PER_SESSION`
   * cada sessão vale `amountCents`; em `TOTAL` o valor do tratamento é lançado
   * uma única vez, na primeira sessão.
   */
  public async nextSession(tenantId: bigint, publicId: string) {
    const plan = await this.repo.find(tenantId, publicId);
    if (plan === null) throw planNotFound();
    if (plan.status === 'CANCELED' || plan.status === 'COMPLETED')
      throw new AppError({
        code: 'TREATMENT_PLAN_CLOSED',
        message: 'Este tratamento não está mais em andamento.',
        statusCode: 409,
      });
    if (plan.status === 'PENDING')
      throw new AppError({
        code: 'TREATMENT_PLAN_NOT_APPROVED',
        message: 'O orçamento precisa ser aprovado antes de agendar a primeira sessão.',
        statusCode: 409,
      });
    // Canceladas e faltas não consomem numeração: a etapa é reagendada com o
    // mesmo número. Reagendar um horário não passa por aqui (preserva o seu).
    const live = plan.sessions.filter((session) => isLive(session.status));
    const sessionNumber =
      live.reduce((highest, session) => Math.max(highest, session.sessionNumber ?? 0), 0) + 1;
    let priceCents = plan.amountCents;
    if (plan.billingMode === 'TOTAL') {
      // O tratamento é cobrado uma única vez, na primeira sessão viva. Se ela
      // for cancelada depois de pagamentos, a nova primeira sessão carrega
      // apenas o saldo — o faturamento nunca é duplicado.
      if (sessionNumber > 1) priceCents = 0n;
      else {
        const paid = await this.repo.paidCentsByAppointment(
          tenantId,
          plan.sessions.map((session) => session.id),
        );
        const received = [...paid.values()].reduce((total, amount) => total + amount, 0n);
        priceCents = plan.amountCents > received ? plan.amountCents - received : 0n;
      }
    }
    return {
      planId: plan.id,
      customerId: plan.customerId,
      serviceId: plan.serviceId,
      professionalId: plan.professionalId,
      customerPublicId: plan.customer.publicId,
      servicePublicId: plan.service.publicId,
      professionalPublicId: plan.professional.publicId,
      sessionNumber,
      priceCents,
    };
  }

  /**
   * Executa a criação da sessão com a numeração serializada por plano.
   * `AppointmentService` chama por aqui para não abrir janela entre ler o
   * último número e gravar o agendamento.
   */
  public reserveSession<T>(planPublicId: string, run: () => Promise<T>): Promise<T> {
    return this.repo.withPlanLock(planPublicId, run);
  }

  /**
   * Recalcula o progresso quando uma sessão é concluída. É o único ponto que
   * move o plano para `IN_PROGRESS`/`COMPLETED`.
   */
  public async refreshProgress(tenantId: bigint, planId: bigint) {
    const plan = await this.repo.list(tenantId, { id: planId });
    const current = plan[0];
    if (current === undefined || current.status === 'CANCELED') return;
    const completed = current.sessions.filter((session) => isCompleted(session.status));
    if (completed.length === 0) return;
    const startedAt =
      current.startedAt ??
      completed.reduce<Date | null>(
        (earliest, session) =>
          earliest === null || session.startsAt < earliest ? session.startsAt : earliest,
        null,
      ) ??
      new Date();
    const finished =
      current.sessionsPlanned !== null && completed.length >= current.sessionsPlanned;
    await this.repo.update(current.id, {
      startedAt,
      status: finished ? 'COMPLETED' : 'IN_PROGRESS',
      completedAt: finished ? (current.completedAt ?? new Date()) : null,
    });
    if (finished) {
      try {
        await this.reminderService?.cancelReminder(current.id);
      } catch {
        /* falha no cancelamento de reminders não impede a conclusão */
      }
    }
  }

  private async requirePlan(tenantId: bigint, publicId: string, professionalId?: bigint) {
    const plan = await this.repo.find(tenantId, publicId);
    // Isolamento: fora do tenant ou de outro profissional, o plano não existe.
    if (plan === null || (professionalId !== undefined && plan.professionalId !== professionalId))
      throw planNotFound();
    return plan;
  }

  private async audit(tenantId: bigint, publicId: string, action: string, actor: Actor) {
    await this.repo.audit({
      publicId: randomUUID(),
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType: 'treatment_plan',
      targetPublicId: publicId,
    });
  }
}
