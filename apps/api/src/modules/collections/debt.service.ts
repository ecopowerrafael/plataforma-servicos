import { randomUUID } from 'node:crypto';

import {
  type CancelDebtRequest,
  type CreateDebtFromAppointmentRequest,
  type CreateManualDebtRequest,
  DebtListResponseSchema,
  DebtPublicSchema,
  type PauseDebtRequest,
  type UpdateDebtRequest,
} from '@plataforma/shared';

import { type CollectionRuleService } from './collection-rule.service.js';
import { calculateDebtBalance } from './debt-balance.js';
import { withoutUndefined } from './prisma-patch.js';
import { Prisma, type DebtStatus, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}

const CLOSED_STATUSES: DebtStatus[] = ['PAID', 'CANCELED'];

const debtInclude = {
  originAppointment: { select: { publicId: true } },
  customer: { select: { publicId: true } },
  unit: { select: { publicId: true } },
  collectionRule: { select: { publicId: true } },
} as const;

type DebtWithRelations = {
  publicId: string;
  originType: string;
  originAppointment: { publicId: string } | null;
  customer: { publicId: string } | null;
  unit: { publicId: string } | null;
  debtorName: string;
  debtorWhatsapp: string;
  debtorEmail: string | null;
  debtorDocument: string | null;
  description: string;
  originalAmountCents: bigint;
  currentBalanceCents: bigint;
  dueDate: Date;
  status: string;
  collectionRule: { publicId: string };
  collectionPausedAt: Date | null;
  collectionPausedReason: string | null;
  canceledAt: Date | null;
  canceledReason: string | null;
  paidAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const pubDebt = (debt: DebtWithRelations) =>
  DebtPublicSchema.parse({
    publicId: debt.publicId,
    originType: debt.originType,
    originAppointmentPublicId: debt.originAppointment?.publicId ?? null,
    customerPublicId: debt.customer?.publicId ?? null,
    unitPublicId: debt.unit?.publicId ?? null,
    debtorName: debt.debtorName,
    debtorWhatsapp: debt.debtorWhatsapp,
    debtorEmail: debt.debtorEmail,
    debtorDocument: debt.debtorDocument,
    description: debt.description,
    originalAmountCents: debt.originalAmountCents.toString(),
    currentBalanceCents: debt.currentBalanceCents.toString(),
    dueDate: debt.dueDate.toISOString().slice(0, 10),
    status: debt.status,
    collectionRulePublicId: debt.collectionRule.publicId,
    collectionPausedAt: debt.collectionPausedAt?.toISOString() ?? null,
    collectionPausedReason: debt.collectionPausedReason,
    canceledAt: debt.canceledAt?.toISOString() ?? null,
    canceledReason: debt.canceledReason,
    paidAt: debt.paidAt?.toISOString() ?? null,
    notes: debt.notes,
    createdAt: debt.createdAt.toISOString(),
    updatedAt: debt.updatedAt.toISOString(),
  });

export class DebtService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly collectionRules: CollectionRuleService,
  ) {}

  public async list(tenantId: bigint) {
    const debts = await this.client.debt.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: debtInclude,
    });
    return DebtListResponseSchema.parse({ items: debts.map(pubDebt) });
  }

  public async detail(tenantId: bigint, publicId: string) {
    const debt = await this.client.debt.findFirst({
      where: { tenantId, publicId },
      include: debtInclude,
    });
    if (debt === null) throw this.debtNotFound();
    return pubDebt(debt);
  }

  public async createManual(tenantId: bigint, input: CreateManualDebtRequest, actor: Actor) {
    const collectionRuleId = await this.collectionRules.resolveActiveRuleId(
      tenantId,
      input.collectionRulePublicId,
    );

    let customerId: bigint | null = null;
    if (input.customerPublicId !== undefined && input.customerPublicId !== null) {
      const customer = await this.client.customer.findFirst({
        where: { tenantId, publicId: input.customerPublicId },
        select: { id: true },
      });
      if (customer === null)
        throw new AppError({
          code: 'CUSTOMER_NOT_FOUND',
          message: 'Cliente não encontrado.',
          statusCode: 404,
        });
      customerId = customer.id;
    }

    let unitId: bigint | null = null;
    if (input.unitPublicId !== undefined && input.unitPublicId !== null) {
      const unit = await this.client.businessUnit.findFirst({
        where: { tenantId, publicId: input.unitPublicId },
        select: { id: true },
      });
      if (unit === null)
        throw new AppError({
          code: 'BUSINESS_UNIT_NOT_FOUND',
          message: 'Unidade não encontrada.',
          statusCode: 404,
        });
      unitId = unit.id;
    }

    const amountCents = BigInt(input.amountCents);
    const balance = await calculateDebtBalance(this.client, tenantId, {
      originType: 'MANUAL',
      amountCents,
    });

    const debt = await this.client.debt.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        unitId,
        originType: 'MANUAL',
        originAppointmentId: null,
        customerId,
        debtorName: input.debtorName,
        debtorWhatsapp: input.debtorWhatsapp,
        debtorEmail: input.debtorEmail ?? null,
        debtorDocument: input.debtorDocument ?? null,
        description: input.description,
        originalAmountCents: balance,
        currentBalanceCents: balance,
        dueDate: new Date(input.dueDate),
        collectionRuleId,
        notes: input.notes ?? null,
        createdByUserId: actor.userId,
      },
      include: debtInclude,
    });
    await this.recordEvent(tenantId, debt.id, 'DEBT_CREATED', { originType: 'MANUAL' });
    await this.audit(tenantId, actor, 'debt.created', debt.publicId);
    return pubDebt(debt);
  }

  public async createFromAppointment(
    tenantId: bigint,
    input: CreateDebtFromAppointmentRequest,
    actor: Actor,
  ) {
    const appointment = await this.client.appointment.findFirst({
      where: { tenantId, publicId: input.appointmentPublicId },
      select: {
        id: true,
        publicId: true,
        protocol: true,
        priceCents: true,
        unitId: true,
        service: { select: { name: true } },
        customer: {
          select: { id: true, name: true, whatsapp: true, phone: true, email: true, document: true },
        },
      },
    });
    if (appointment === null)
      throw new AppError({
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'Agendamento não encontrado.',
        statusCode: 404,
      });

    const existingActiveDebt = await this.client.debt.findFirst({
      where: { tenantId, originAppointmentId: appointment.id, status: { notIn: CLOSED_STATUSES } },
      select: { id: true },
    });
    if (existingActiveDebt !== null)
      throw new AppError({
        code: 'ACTIVE_DEBT_ALREADY_EXISTS',
        message: 'Já existe uma dívida ativa para este agendamento.',
        statusCode: 409,
      });

    const collectionRuleId =
      input.collectionRulePublicId === undefined
        ? await this.collectionRules.resolveOrCreateDefaultRuleId(tenantId)
        : await this.collectionRules.resolveActiveRuleId(tenantId, input.collectionRulePublicId);

    const balance = await calculateDebtBalance(this.client, tenantId, {
      originType: 'APPOINTMENT',
      appointmentId: appointment.id,
      priceCents: appointment.priceCents,
    });
    if (balance <= 0n)
      throw new AppError({
        code: 'APPOINTMENT_NO_OPEN_BALANCE',
        message: 'Este agendamento não possui saldo em aberto.',
        statusCode: 409,
      });

    const debtorWhatsapp = appointment.customer.whatsapp ?? appointment.customer.phone;
    if (debtorWhatsapp === null)
      throw new AppError({
        code: 'CUSTOMER_WHATSAPP_MISSING',
        message: 'O cliente deste agendamento não possui WhatsApp ou telefone cadastrado.',
        statusCode: 409,
      });

    const description = `Saldo em aberto do atendimento ${appointment.protocol}${
      appointment.service !== null ? ` - ${appointment.service.name}` : ''
    }`;

    const debt = await this.client.debt.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        unitId: appointment.unitId,
        originType: 'APPOINTMENT',
        originAppointmentId: appointment.id,
        customerId: appointment.customer.id,
        debtorName: appointment.customer.name,
        debtorWhatsapp,
        debtorEmail: appointment.customer.email,
        debtorDocument: appointment.customer.document,
        description,
        originalAmountCents: balance,
        currentBalanceCents: balance,
        dueDate: new Date(input.dueDate ?? new Date().toISOString().slice(0, 10)),
        collectionRuleId,
        createdByUserId: actor.userId,
      },
      include: debtInclude,
    });
    await this.recordEvent(tenantId, debt.id, 'DEBT_CREATED', {
      originType: 'APPOINTMENT',
      appointmentPublicId: appointment.publicId,
    });
    await this.audit(tenantId, actor, 'debt.created', debt.publicId);
    return pubDebt(debt);
  }

  public async update(tenantId: bigint, publicId: string, input: UpdateDebtRequest, actor: Actor) {
    const existing = await this.findOwned(tenantId, publicId);

    let collectionRuleId: bigint | undefined;
    if (input.collectionRulePublicId !== undefined) {
      collectionRuleId = await this.collectionRules.resolveActiveRuleId(
        tenantId,
        input.collectionRulePublicId,
      );
    }

    const updated = await this.client.debt.update({
      where: { id: existing.id },
      data: withoutUndefined({
        description: input.description,
        dueDate: input.dueDate === undefined ? undefined : new Date(input.dueDate),
        notes: input.notes,
        collectionRuleId,
      }),
      include: debtInclude,
    });
    await this.recordEvent(tenantId, updated.id, 'DEBT_UPDATED');
    await this.audit(tenantId, actor, 'debt.updated', updated.publicId);
    return pubDebt(updated);
  }

  public async pause(tenantId: bigint, publicId: string, input: PauseDebtRequest, actor: Actor) {
    const existing = await this.findOwned(tenantId, publicId);
    if (existing.status !== 'OPEN')
      throw new AppError({
        code: 'DEBT_INVALID_STATUS_TRANSITION',
        message: 'Só é possível pausar uma dívida em aberto.',
        statusCode: 409,
      });

    const updated = await this.client.debt.update({
      where: { id: existing.id },
      data: {
        status: 'PAUSED',
        collectionPausedAt: new Date(),
        collectionPausedReason: input.reason ?? null,
      },
      include: debtInclude,
    });
    await this.recordEvent(tenantId, updated.id, 'DEBT_PAUSED', { reason: input.reason ?? null });
    await this.audit(tenantId, actor, 'debt.paused', updated.publicId);
    return pubDebt(updated);
  }

  public async resume(tenantId: bigint, publicId: string, actor: Actor) {
    const existing = await this.findOwned(tenantId, publicId);
    if (existing.status !== 'PAUSED')
      throw new AppError({
        code: 'DEBT_INVALID_STATUS_TRANSITION',
        message: 'Só é possível retomar uma dívida pausada.',
        statusCode: 409,
      });

    const updated = await this.client.debt.update({
      where: { id: existing.id },
      data: { status: 'OPEN', collectionPausedAt: null, collectionPausedReason: null },
      include: debtInclude,
    });
    await this.recordEvent(tenantId, updated.id, 'DEBT_RESUMED');
    await this.audit(tenantId, actor, 'debt.resumed', updated.publicId);
    return pubDebt(updated);
  }

  public async cancel(tenantId: bigint, publicId: string, input: CancelDebtRequest, actor: Actor) {
    const existing = await this.findOwned(tenantId, publicId);
    if (existing.status !== 'OPEN' && existing.status !== 'PAUSED')
      throw new AppError({
        code: 'DEBT_INVALID_STATUS_TRANSITION',
        message: 'Só é possível cancelar uma dívida em aberto ou pausada.',
        statusCode: 409,
      });

    const updated = await this.client.debt.update({
      where: { id: existing.id },
      data: { status: 'CANCELED', canceledAt: new Date(), canceledReason: input.reason },
      include: debtInclude,
    });
    await this.recordEvent(tenantId, updated.id, 'DEBT_CANCELED', { reason: input.reason });
    await this.audit(tenantId, actor, 'debt.canceled', updated.publicId);
    return pubDebt(updated);
  }

  private async findOwned(tenantId: bigint, publicId: string) {
    const debt = await this.client.debt.findFirst({ where: { tenantId, publicId } });
    if (debt === null) throw this.debtNotFound();
    return debt;
  }

  /** Transição automática (webhook do Bot Cobra) — sem audit(), que é para ações humanas no painel. */
  public async markHumanSupport(tenantId: bigint, debtId: bigint): Promise<void> {
    const existing = await this.client.debt.findFirst({ where: { tenantId, id: debtId } });
    if (existing === null) return;
    if (existing.status === 'HUMAN_SUPPORT' || existing.status === 'PAID' || existing.status === 'CANCELED')
      return;

    await this.client.debt.update({
      where: { id: existing.id },
      data: { status: 'HUMAN_SUPPORT', humanSupportAt: new Date() },
    });
    await this.recordEvent(tenantId, existing.id, 'HUMAN_SUPPORT_REQUESTED');
  }

  public async recordEvent(
    tenantId: bigint,
    debtId: bigint,
    eventType: string,
    metadata?: Record<string, unknown>,
  ) {
    if (metadata === undefined) {
      await this.client.debtEvent.create({
        data: { publicId: randomUUID(), tenantId, debtId, eventType },
      });
      return;
    }
    await this.client.debtEvent.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        debtId,
        eventType,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private async audit(tenantId: bigint, actor: Actor, action: string, targetPublicId: string) {
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action,
        targetType: 'debt',
        targetPublicId,
      },
    });
  }

  private debtNotFound() {
    return new AppError({
      code: 'DEBT_NOT_FOUND',
      message: 'Dívida não encontrada.',
      statusCode: 404,
    });
  }
}
