import { randomUUID } from 'node:crypto';

import { ReceiptPublicSchema } from '@plataforma/shared';

import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';

interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}

const include = {
  payment: {
    include: {
      paymentMethod: { select: { name: true } },
      appointment: {
        include: {
          customer: { select: { name: true } },
          service: { select: { name: true } },
        },
      },
    },
  },
} as const;

function pub(
  receipt: {
    publicId: string;
    number: string;
    issuedAt: Date;
    payment: {
      kind: 'PAYMENT' | 'DEPOSIT';
      amountCents: bigint;
      createdAt: Date;
      paymentMethod: { name: string };
      appointment: { protocol: string; customer: { name: string }; service: { name: string } | null } | null;
    };
  },
  tenant: { legalName: string; displayName: string },
) {
  if (receipt.payment.appointment === null)
    throw new AppError({
      code: 'RECEIPT_INVALID_PAYMENT_ORIGIN',
      message: 'Apenas pagamentos relacionados a agendamentos permitem recibo.',
      statusCode: 400,
    });
  if (receipt.payment.appointment.service === null)
    throw new AppError({
      code: 'RECEIPT_COMBO_NOT_SUPPORTED',
      message: 'Recibos para agendamentos de combos não são suportados nesta versão.',
      statusCode: 400,
    });
  return ReceiptPublicSchema.parse({
    publicId: receipt.publicId,
    number: receipt.number,
    issuedAt: receipt.issuedAt.toISOString(),
    tenantLegalName: tenant.legalName,
    tenantDisplayName: tenant.displayName,
    customerName: receipt.payment.appointment.customer.name,
    appointmentProtocol: receipt.payment.appointment.protocol,
    serviceName: receipt.payment.appointment.service.name,
    paymentMethodName: receipt.payment.paymentMethod.name,
    paymentKind: receipt.payment.kind,
    amountCents: receipt.payment.amountCents.toString(),
    paymentCreatedAt: receipt.payment.createdAt.toISOString(),
  });
}

export class ReceiptService {
  public constructor(private readonly client: PrismaClient) {}

  /** Gera (na primeira consulta) ou retorna o recibo já emitido para o pagamento. */
  public async getForPayment(
    tenantId: bigint,
    appointmentPublicId: string,
    paymentPublicId: string,
    actor: Actor,
  ) {
    const payment = await this.client.payment.findFirst({
      where: {
        tenantId,
        publicId: paymentPublicId,
        appointment: { publicId: appointmentPublicId },
      },
      select: { id: true, status: true },
    });
    if (payment === null)
      throw new AppError({
        code: 'PAYMENT_NOT_FOUND',
        message: 'Pagamento não encontrado.',
        statusCode: 404,
      });
    if (payment.status === 'CANCELED')
      throw new AppError({
        code: 'RECEIPT_NOT_ALLOWED_FOR_CANCELED_PAYMENT',
        message: 'Não é possível emitir recibo de um pagamento cancelado.',
        statusCode: 409,
      });

    const tenant = await this.client.tenant.findFirstOrThrow({
      where: { id: tenantId },
      select: { legalName: true, displayName: true },
    });

    const existing = await this.client.receipt.findFirst({
      where: { tenantId, paymentId: payment.id },
      include,
    });
    if (existing !== null) return pub(existing, tenant);

    const created = await this.client.$transaction(async (transaction) => {
      const lockName = `receipt-number:${tenantId.toString()}`;
      const lock = await transaction.$queryRaw<{ acquired: number | bigint | null }[]>`
        SELECT GET_LOCK(${lockName}, 5) AS acquired
      `;
      if (lock[0]?.acquired !== 1 && lock[0]?.acquired !== 1n)
        throw new AppError({
          code: 'RECEIPT_NUMBER_LOCK_TIMEOUT',
          message: 'Não foi possível gerar o número do recibo, tente novamente.',
          statusCode: 503,
        });
      try {
        const alreadyCreated = await transaction.receipt.findFirst({
          where: { tenantId, paymentId: payment.id },
          include,
        });
        if (alreadyCreated !== null) return alreadyCreated;
        const count = await transaction.receipt.count({ where: { tenantId } });
        const number = `REC-${String(count + 1).padStart(6, '0')}`;
        return await transaction.receipt.create({
          data: {
            publicId: randomUUID(),
            tenantId,
            paymentId: payment.id,
            number,
            issuedByUserId: actor.userId,
            issuedBySessionId: actor.sessionId,
          },
          include,
        });
      } finally {
        await transaction.$queryRaw`SELECT RELEASE_LOCK(${lockName})`;
      }
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'receipt.issued',
        targetType: 'receipt',
        targetPublicId: created.publicId,
      },
    });
    return pub(created, tenant);
  }
}
