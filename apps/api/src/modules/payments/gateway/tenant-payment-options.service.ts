import { randomUUID } from 'node:crypto';

import {
  AppointmentPaymentOptionsResponseSchema,
  PixChargeResponseSchema,
  QrCodeResponseSchema,
  TenantPaymentOptionsOverviewSchema,
  type CreateOnlineChargeRequest,
  type UpsertMercadoPagoConfigRequest,
  type UpsertPayLocalOptionRequest,
  type UpsertPixLocalConfigRequest,
} from '@plataforma/shared';
import QRCode from 'qrcode';

import { type PaymentGatewayService } from './payment-gateway.service.js';
import { type PrismaClient } from '../../../database-client/client.js';
import { AppError } from '../../../errors/AppError.js';
import { type TenantWhiteLabelRepository } from '../../tenants/tenant-white-label.repository.js';
import { type PaymentService } from '../payment.service.js';

interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}

const PIX_LOCAL_PROVIDER = 'pix-local';
const MERCADOPAGO_PROVIDER = 'mercadopago';
const PUBLIC_ACTOR: Actor = { userId: null, sessionId: null };

function publicTenantNotFound(): AppError {
  return new AppError({
    code: 'PUBLIC_TENANT_NOT_FOUND',
    message: 'Estabelecimento não encontrado.',
    statusCode: 404,
  });
}

export class TenantPaymentOptionsService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly gateway: PaymentGatewayService,
    private readonly payments: PaymentService,
    private readonly tenants: TenantWhiteLabelRepository,
  ) {}

  private async resolveTenantIdBySlug(slug: string) {
    const tenant = await this.tenants.findActiveTenantBySlug(slug);
    if (tenant === null) throw publicTenantNotFound();
    return tenant.id;
  }

  public async getPublicOptionsForAppointment(slug: string, appointmentPublicId: string) {
    const tenantId = await this.resolveTenantIdBySlug(slug);
    return this.getAvailableOptionsForAppointment(tenantId, appointmentPublicId);
  }

  public async createPublicPixCharge(
    slug: string,
    appointmentPublicId: string,
    input: CreateOnlineChargeRequest,
  ) {
    const tenantId = await this.resolveTenantIdBySlug(slug);
    return this.createPixCharge(tenantId, appointmentPublicId, input, PUBLIC_ACTOR);
  }

  public async createPublicMercadoPagoCharge(
    slug: string,
    appointmentPublicId: string,
    input: CreateOnlineChargeRequest,
  ) {
    const tenantId = await this.resolveTenantIdBySlug(slug);
    return this.createMercadoPagoCharge(tenantId, appointmentPublicId, input, PUBLIC_ACTOR);
  }

  public async getOverview(tenantId: bigint) {
    const [settings, pixConfig, mpConfig] = await Promise.all([
      this.client.tenantSettings.findFirst({
        where: { tenantId },
        select: { payLocalEnabled: true },
      }),
      this.client.paymentGatewayConfig.findFirst({
        where: { tenantId, provider: PIX_LOCAL_PROVIDER },
      }),
      this.gateway.getConfig(tenantId, MERCADOPAGO_PROVIDER),
    ]);

    let pixCredentials: Record<string, unknown> | null = null;
    if (
      pixConfig?.credentialsCiphertext !== null &&
      pixConfig?.credentialsCiphertext !== undefined
    ) {
      try {
        pixCredentials = this.gateway.decryptForOverview(pixConfig.credentialsCiphertext);
      } catch {
        pixCredentials = null;
      }
    }

    return TenantPaymentOptionsOverviewSchema.parse({
      payLocal: { active: settings?.payLocalEnabled ?? true },
      pixLocal: {
        active: pixConfig?.active ?? false,
        hasCredentials: pixConfig?.credentialsCiphertext !== null && pixConfig !== null,
        keyType: (pixCredentials?.keyType as string | undefined) ?? null,
        receiverName: (pixCredentials?.receiverName as string | undefined) ?? null,
        city: (pixCredentials?.city as string | undefined) ?? null,
      },
      mercadoPago: {
        active: mpConfig?.active ?? false,
        hasCredentials: mpConfig?.hasCredentials ?? false,
        environment: mpConfig?.environment ?? 'SANDBOX',
        providerImplemented: mpConfig?.providerImplemented ?? true,
      },
    });
  }

  public async updatePayLocal(tenantId: bigint, input: UpsertPayLocalOptionRequest, actor: Actor) {
    await this.client.tenantSettings.updateMany({
      where: { tenantId },
      data: { payLocalEnabled: input.active },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'tenant_payment_options.pay_local_updated',
        targetType: 'tenant_settings',
        targetPublicId: tenantId.toString(),
      },
    });
    return this.getOverview(tenantId);
  }

  public async upsertPixLocal(tenantId: bigint, input: UpsertPixLocalConfigRequest, actor: Actor) {
    await this.gateway.upsertConfig(
      tenantId,
      {
        provider: PIX_LOCAL_PROVIDER,
        active: input.active,
        environment: 'PRODUCTION',
        credentials: {
          keyType: input.keyType,
          key: input.key,
          receiverName: input.receiverName,
          city: input.city,
          description: input.description ?? null,
        },
      },
      actor,
    );
    return this.getOverview(tenantId);
  }

  public async upsertMercadoPago(
    tenantId: bigint,
    input: UpsertMercadoPagoConfigRequest,
    actor: Actor,
  ) {
    const credentials =
      input.accessToken === undefined && input.webhookSecret === undefined
        ? undefined
        : {
            ...(input.accessToken === undefined ? {} : { accessToken: input.accessToken }),
            ...(input.webhookSecret === undefined ? {} : { webhookSecret: input.webhookSecret }),
          };
    await this.gateway.upsertConfig(
      tenantId,
      {
        provider: MERCADOPAGO_PROVIDER,
        active: input.active,
        environment: input.environment,
        ...(credentials === undefined ? {} : { credentials }),
      },
      actor,
    );
    return this.getOverview(tenantId);
  }

  /**
   * Reaproveita PaymentService.listForAppointment (mesmo cálculo de sinal/saldo) — nenhuma
   * lógica de sinal é duplicada aqui.
   */
  public async getAvailableOptionsForAppointment(tenantId: bigint, appointmentPublicId: string) {
    const [settings, pixConfig, mpConfig, appointmentPayments] = await Promise.all([
      this.client.tenantSettings.findFirst({
        where: { tenantId },
        select: { payLocalEnabled: true },
      }),
      this.client.paymentGatewayConfig.findFirst({
        where: { tenantId, provider: PIX_LOCAL_PROVIDER },
      }),
      this.gateway.getConfig(tenantId, MERCADOPAGO_PROVIDER),
      this.payments.listForAppointment(tenantId, appointmentPublicId),
    ]);

    const { summary } = appointmentPayments;
    const depositAmountCents =
      summary.depositAmountCents === null ? null : BigInt(summary.depositAmountCents);
    const depositPaidCents = BigInt(summary.depositPaidCents);
    const depositRequired = depositAmountCents !== null && depositPaidCents < depositAmountCents;

    return AppointmentPaymentOptionsResponseSchema.parse({
      payLocalAvailable: (settings?.payLocalEnabled ?? true) && !depositRequired,
      pixLocalAvailable: (pixConfig?.active ?? false) && pixConfig?.credentialsCiphertext !== null,
      mercadoPagoAvailable: (mpConfig?.active ?? false) && (mpConfig?.hasCredentials ?? false),
      depositRequired,
      depositAmountCents: summary.depositAmountCents,
      depositPaidCents: summary.depositPaidCents,
      balanceCents: summary.balanceCents,
    });
  }

  public async createPixCharge(
    tenantId: bigint,
    appointmentPublicId: string,
    input: CreateOnlineChargeRequest,
    actor: Actor,
  ) {
    const amountCents = await this.resolveOnlineAmountCents(
      tenantId,
      appointmentPublicId,
      input.kind,
    );
    const charge = await this.gateway.createCharge(
      tenantId,
      appointmentPublicId,
      PIX_LOCAL_PROVIDER,
      {
        amountCents: Number(amountCents),
        currency: 'BRL',
        idempotencyKey: `pix-local:${appointmentPublicId}:${input.kind}`,
        kind: input.kind,
      },
      actor,
    );
    const qrCodeDataUrl =
      charge.pixCopyPaste === null ? '' : await QRCode.toDataURL(charge.pixCopyPaste);
    return PixChargeResponseSchema.parse({ charge, qrCodeDataUrl });
  }

  public async createMercadoPagoCharge(
    tenantId: bigint,
    appointmentPublicId: string,
    input: CreateOnlineChargeRequest,
    actor: Actor,
  ) {
    const amountCents = await this.resolveOnlineAmountCents(
      tenantId,
      appointmentPublicId,
      input.kind,
    );
    return this.gateway.createCharge(
      tenantId,
      appointmentPublicId,
      MERCADOPAGO_PROVIDER,
      {
        amountCents: Number(amountCents),
        currency: 'BRL',
        idempotencyKey: `mercadopago:${appointmentPublicId}:${input.kind}`,
        kind: input.kind,
      },
      actor,
    );
  }

  public async getPixQrCode(tenantId: bigint, chargePublicId: string) {
    const charge = await this.gateway.getCharge(tenantId, chargePublicId, false);
    if (charge.pixCopyPaste === null)
      throw new AppError({
        code: 'GATEWAY_CHARGE_HAS_NO_PIX_PAYLOAD',
        message: 'Esta cobrança não possui um payload PIX associado.',
        statusCode: 409,
      });
    const qrCodeDataUrl = await QRCode.toDataURL(charge.pixCopyPaste);
    return QrCodeResponseSchema.parse({ qrCodeDataUrl });
  }

  private async resolveOnlineAmountCents(
    tenantId: bigint,
    appointmentPublicId: string,
    kind: 'PAYMENT' | 'DEPOSIT',
  ) {
    const { summary } = await this.payments.listForAppointment(tenantId, appointmentPublicId);
    if (kind === 'DEPOSIT') {
      if (summary.depositAmountCents === null)
        throw new AppError({
          code: 'DEPOSIT_NOT_REQUIRED',
          message: 'Este agendamento não exige sinal.',
          statusCode: 409,
        });
      const remaining = BigInt(summary.depositAmountCents) - BigInt(summary.depositPaidCents);
      if (remaining <= 0n)
        throw new AppError({
          code: 'DEPOSIT_ALREADY_PAID',
          message: 'O sinal deste agendamento já foi pago.',
          statusCode: 409,
        });
      return remaining;
    }
    return BigInt(summary.balanceCents);
  }
}
