import { randomUUID } from 'node:crypto';

import {
  GatewayChargeListResponseSchema,
  PaymentGatewayChargePublicSchema,
  PaymentGatewayConfigPublicSchema,
  type CreateGatewayChargeRequest,
  type UpsertPaymentGatewayConfigRequest,
} from '@plataforma/shared';

import { type CredentialsCipher } from './credentials-cipher.js';
import { type PaymentGatewayProviderRegistry } from './provider-registry.js';
import {
  Prisma,
  type PaymentGatewayCharge,
  type PaymentGatewayConfig,
  type PrismaClient,
} from '../../../database-client/client.js';
import { AppError } from '../../../errors/AppError.js';
import { type DebtPixPaymentService } from '../../collections/debt-pix-payment.service.js';
import { type PaymentMethodService } from '../payment-method.service.js';
import { type PaymentService } from '../payment.service.js';

interface Actor {
  userId: bigint | null;
  sessionId: bigint | null;
}

const pubConfig = (config: PaymentGatewayConfig, providerImplemented: boolean) =>
  PaymentGatewayConfigPublicSchema.parse({
    publicId: config.publicId,
    provider: config.provider,
    active: config.active,
    environment: config.environment,
    hasCredentials: config.credentialsCiphertext !== null,
    providerImplemented,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  });

const pubCharge = (
  charge: PaymentGatewayCharge & {
    appointment: { publicId: string } | null;
    debt: { publicId: string } | null;
    payment: { publicId: string } | null;
  },
) =>
  PaymentGatewayChargePublicSchema.parse({
    publicId: charge.publicId,
    appointmentPublicId: charge.appointment?.publicId ?? null,
    debtPublicId: charge.debt?.publicId ?? null,
    paymentPublicId: charge.payment?.publicId ?? null,
    provider: charge.provider,
    environment: charge.environment,
    externalId: charge.externalId,
    status: charge.status,
    amountCents: charge.amountCents.toString(),
    currency: charge.currency,
    idempotencyKey: charge.idempotencyKey,
    lastCheckedAt: charge.lastCheckedAt?.toISOString() ?? null,
    canceledAt: charge.canceledAt?.toISOString() ?? null,
    canceledReason: charge.canceledReason,
    createdAt: charge.createdAt.toISOString(),
    kind: charge.kind,
    pixCopyPaste: charge.pixCopyPaste,
  });

export class PaymentGatewayService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly registry: PaymentGatewayProviderRegistry,
    private readonly cipher: CredentialsCipher | undefined,
    private readonly paymentMethods: PaymentMethodService,
    private readonly payments: PaymentService,
    private readonly debtPixPayments?: DebtPixPaymentService,
  ) {}

  public async getConfig(tenantId: bigint, provider: string) {
    const config = await this.client.paymentGatewayConfig.findFirst({
      where: { tenantId, provider },
    });
    if (config === null) return null;
    return pubConfig(config, this.registry.get(config.provider) !== undefined);
  }

  public async upsertConfig(
    tenantId: bigint,
    input: UpsertPaymentGatewayConfigRequest,
    actor: Actor,
  ) {
    let credentialsCiphertext: string | undefined;
    if (input.credentials !== undefined) {
      if (this.cipher === undefined)
        throw new AppError({
          code: 'GATEWAY_ENCRYPTION_NOT_CONFIGURED',
          message:
            'Não é possível armazenar credenciais: a chave de criptografia do servidor não está configurada.',
          statusCode: 503,
        });
      credentialsCiphertext = this.cipher.encrypt(input.credentials);
    }

    const existing = await this.client.paymentGatewayConfig.findFirst({
      where: { tenantId, provider: input.provider },
    });
    const config = await this.client.paymentGatewayConfig.upsert({
      where: { tenantId_provider: { tenantId, provider: input.provider } },
      create: {
        publicId: randomUUID(),
        tenantId,
        provider: input.provider,
        active: input.active,
        environment: input.environment,
        ...(credentialsCiphertext === undefined ? {} : { credentialsCiphertext }),
      },
      update: {
        provider: input.provider,
        active: input.active,
        environment: input.environment,
        ...(credentialsCiphertext === undefined ? {} : { credentialsCiphertext }),
      },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action:
          existing === null ? 'payment_gateway.config_created' : 'payment_gateway.config_updated',
        targetType: 'payment_gateway_config',
        targetPublicId: config.publicId,
      },
    });
    return pubConfig(config, this.registry.get(config.provider) !== undefined);
  }

  /**
   * Descriptografa credenciais apenas para uso interno na composição de telas de configuração
   * (nunca expõe segredos: os chamadores devem repassar somente campos não sensíveis, como
   * tipo de chave PIX, nome do recebedor e cidade).
   */
  public decryptForOverview(ciphertext: string): Record<string, unknown> {
    if (this.cipher === undefined) return {};
    try {
      return this.cipher.decrypt(ciphertext);
    } catch {
      return {};
    }
  }

  private async requireActiveAdapter(tenantId: bigint, provider: string) {
    const config = await this.client.paymentGatewayConfig.findFirst({
      where: { tenantId, provider },
    });
    if (!config?.active)
      throw new AppError({
        code: 'GATEWAY_NOT_CONFIGURED',
        message: 'Nenhum gateway de pagamento ativo está configurado para este estabelecimento.',
        statusCode: 409,
      });
    const adapter = this.registry.get(config.provider);
    if (adapter === undefined)
      throw new AppError({
        code: 'GATEWAY_PROVIDER_NOT_IMPLEMENTED',
        message: `O provedor "${config.provider}" ainda não possui uma integração implementada.`,
        statusCode: 501,
      });
    if (config.credentialsCiphertext === null || this.cipher === undefined)
      throw new AppError({
        code: 'GATEWAY_CREDENTIALS_NOT_CONFIGURED',
        message: 'As credenciais do gateway ainda não foram configuradas.',
        statusCode: 409,
      });
    const credentials = this.cipher.decrypt(config.credentialsCiphertext);
    return { config, adapter, credentials };
  }

  private async logEvent(input: {
    tenantId: bigint;
    chargeId: bigint | null;
    provider: string;
    direction: 'OUTBOUND' | 'INBOUND';
    eventType: string;
    externalEventId?: string | null;
    payload?: unknown;
    statusCode?: number | null;
    success: boolean;
    errorMessage?: string | null;
  }) {
    await this.client.paymentGatewayEvent.create({
      data: {
        publicId: randomUUID(),
        tenantId: input.tenantId,
        chargeId: input.chargeId,
        provider: input.provider,
        direction: input.direction,
        eventType: input.eventType,
        externalEventId: input.externalEventId ?? null,
        payload: input.payload === undefined ? Prisma.JsonNull : (input.payload as object),
        statusCode: input.statusCode ?? null,
        success: input.success,
        errorMessage: input.errorMessage ?? null,
      },
    });
  }

  public async createCharge(
    tenantId: bigint,
    appointmentPublicId: string,
    provider: string,
    input: CreateGatewayChargeRequest,
    actor: Actor,
  ) {
    const appointment = await this.client.appointment.findFirst({
      where: { tenantId, publicId: appointmentPublicId },
      select: { id: true, publicId: true },
    });
    if (appointment === null)
      throw new AppError({
        code: 'APPOINTMENT_NOT_FOUND',
        message: 'Agendamento não encontrado.',
        statusCode: 404,
      });

    const existing = await this.client.paymentGatewayCharge.findFirst({
      where: { tenantId, idempotencyKey: input.idempotencyKey },
      include: {
        appointment: { select: { publicId: true } },
        debt: { select: { publicId: true } },
        payment: { select: { publicId: true } },
      },
    });
    if (existing !== null) return pubCharge(existing);

    const { config, adapter, credentials } = await this.requireActiveAdapter(tenantId, provider);
    const amountCents = BigInt(input.amountCents);

    let result;
    try {
      result = await adapter.createCharge(credentials, config.environment, {
        amountCents,
        currency: input.currency,
        description: input.description ?? null,
        idempotencyKey: input.idempotencyKey,
      });
      await this.logEvent({
        tenantId,
        chargeId: null,
        provider: config.provider,
        direction: 'OUTBOUND',
        eventType: 'charge.create',
        success: true,
      });
    } catch (error) {
      await this.logEvent({
        tenantId,
        chargeId: null,
        provider: config.provider,
        direction: 'OUTBOUND',
        eventType: 'charge.create',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Erro desconhecido.',
      });
      throw error;
    }

    const created = await this.client.paymentGatewayCharge.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        appointmentId: appointment.id,
        provider: config.provider,
        environment: config.environment,
        externalId: result.externalId,
        status: result.status,
        amountCents,
        currency: input.currency,
        idempotencyKey: input.idempotencyKey,
        kind: input.kind,
        pixCopyPaste: result.pixCopyPaste ?? null,
      },
      include: {
        appointment: { select: { publicId: true } },
        debt: { select: { publicId: true } },
        payment: { select: { publicId: true } },
      },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'payment_gateway.charge_created',
        targetType: 'payment_gateway_charge',
        targetPublicId: created.publicId,
      },
    });

    if (created.status === 'PAID') await this.reconcilePaidCharge(created);
    return pubCharge(created);
  }

  /**
   * Cria (ou reaproveita) uma cobrança PIX de uma Debt do Bot Cobra — chamada
   * automática (WhatsApp), não uma rota HTTP: falhas viram `null` em vez de
   * exceção, para o chamador decidir a mensagem de fallback ao devedor.
   * `amountCents` ausente = saldo integral; informado = valor parcial (Fase
   * 7), sempre validado contra o saldo ATUAL (nunca acima dele). A
   * idempotência real é a checagem de cobrança ativa abaixo — agora também
   * pelo VALOR: uma cobrança pendente de R$ 50 não é reaproveitada quando o
   * devedor pede R$ 30 — não a idempotencyKey (gerada nova a cada chamada,
   * uma chave fixa reaproveitada travaria o devedor num PIX expirado).
   */
  public async createDebtCharge(
    tenantId: bigint,
    debtId: bigint,
    amountCents?: bigint,
  ): Promise<{ publicId: string; status: string; pixCopyPaste: string | null } | null> {
    const debt = await this.client.debt.findUnique({
      where: { id: debtId },
      select: { id: true, publicId: true, currentBalanceCents: true },
    });
    if (debt === null || debt.currentBalanceCents <= 0n) return null;

    const chargeAmount = amountCents ?? debt.currentBalanceCents;
    if (chargeAmount <= 0n || chargeAmount > debt.currentBalanceCents) return null;

    const existing = await this.client.paymentGatewayCharge.findFirst({
      where: {
        tenantId,
        debtId: debt.id,
        originType: 'DEBT',
        status: { in: ['PENDING', 'PROCESSING'] },
        amountCents: chargeAmount,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing !== null)
      return { publicId: existing.publicId, status: existing.status, pixCopyPaste: existing.pixCopyPaste };

    const provider = await this.resolveActiveDebtProvider(tenantId);
    if (provider === null) return null;

    const idempotencyKey = `debt-pix:${debt.publicId}:${randomUUID()}`;
    let adapterResult;
    let config;
    try {
      const resolved = await this.requireActiveAdapter(tenantId, provider);
      config = resolved.config;
      adapterResult = await resolved.adapter.createCharge(resolved.credentials, resolved.config.environment, {
        amountCents: chargeAmount,
        currency: 'BRL',
        description: 'Cobrança de dívida em aberto',
        idempotencyKey,
      });
      await this.logEvent({
        tenantId,
        chargeId: null,
        provider,
        direction: 'OUTBOUND',
        eventType: 'charge.create',
        success: true,
      });
    } catch (error) {
      await this.logEvent({
        tenantId,
        chargeId: null,
        provider,
        direction: 'OUTBOUND',
        eventType: 'charge.create',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Erro desconhecido.',
      });
      return null;
    }

    const created = await this.client.paymentGatewayCharge.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        originType: 'DEBT',
        debtId: debt.id,
        provider: config.provider,
        environment: config.environment,
        externalId: adapterResult.externalId,
        status: adapterResult.status,
        amountCents: chargeAmount,
        currency: 'BRL',
        idempotencyKey,
        kind: 'PAYMENT',
        pixCopyPaste: adapterResult.pixCopyPaste ?? null,
      },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: null,
        sessionId: null,
        action: 'payment_gateway.charge_created',
        targetType: 'payment_gateway_charge',
        targetPublicId: created.publicId,
      },
    });

    if (created.status === 'PAID') await this.reconcilePaidCharge({ ...created, appointment: null });
    return { publicId: created.publicId, status: created.status, pixCopyPaste: created.pixCopyPaste };
  }

  private async resolveActiveDebtProvider(tenantId: bigint): Promise<string | null> {
    const configs = await this.client.paymentGatewayConfig.findMany({
      where: { tenantId, active: true },
      select: { provider: true },
    });
    const active = new Set(configs.map((c) => c.provider));
    if (active.has('mercadopago')) return 'mercadopago';
    if (active.has('pix-local')) return 'pix-local';
    return null;
  }

  public async listForAppointment(tenantId: bigint, appointmentPublicId: string) {
    const items = await this.client.paymentGatewayCharge.findMany({
      where: { tenantId, appointment: { publicId: appointmentPublicId } },
      orderBy: { createdAt: 'desc' },
      include: {
        appointment: { select: { publicId: true } },
        debt: { select: { publicId: true } },
        payment: { select: { publicId: true } },
      },
    });
    return GatewayChargeListResponseSchema.parse({ items: items.map(pubCharge) });
  }

  public async getCharge(tenantId: bigint, chargePublicId: string, refresh: boolean) {
    let charge = await this.findChargeOrThrow(tenantId, chargePublicId);

    if (refresh && charge.externalId !== null) {
      const { config, adapter, credentials } = await this.requireActiveAdapter(
        tenantId,
        charge.provider,
      );
      try {
        const result = await adapter.getCharge(credentials, config.environment, charge.externalId);
        await this.logEvent({
          tenantId,
          chargeId: charge.id,
          provider: config.provider,
          direction: 'OUTBOUND',
          eventType: 'charge.query',
          success: true,
        });
        charge = await this.client.paymentGatewayCharge.update({
          where: { id: charge.id },
          data: { status: result.status, lastCheckedAt: new Date() },
          include: {
            appointment: { select: { publicId: true } },
            debt: { select: { publicId: true } },
            payment: { select: { publicId: true } },
          },
        });
        if (charge.status === 'PAID' && charge.paymentId === null) {
          await this.reconcilePaidCharge(charge);
          charge = await this.findChargeOrThrow(tenantId, chargePublicId);
        }
      } catch (error) {
        await this.logEvent({
          tenantId,
          chargeId: charge.id,
          provider: config.provider,
          direction: 'OUTBOUND',
          eventType: 'charge.query',
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Erro desconhecido.',
        });
        throw error;
      }
    }

    return pubCharge(charge);
  }

  public async cancelCharge(
    tenantId: bigint,
    chargePublicId: string,
    reason: string,
    actor: Actor,
  ) {
    const charge = await this.findChargeOrThrow(tenantId, chargePublicId);
    if (['PAID', 'CANCELED', 'REFUNDED'].includes(charge.status))
      throw new AppError({
        code: 'GATEWAY_CHARGE_NOT_CANCELABLE',
        message: 'Esta cobrança não pode mais ser cancelada.',
        statusCode: 409,
      });

    const { config, adapter, credentials } = await this.requireActiveAdapter(
      tenantId,
      charge.provider,
    );
    if (adapter.cancelCharge === undefined)
      throw new AppError({
        code: 'GATEWAY_CANCEL_NOT_SUPPORTED',
        message: 'Este provedor não suporta cancelamento de cobrança.',
        statusCode: 409,
      });
    if (charge.externalId === null)
      throw new AppError({
        code: 'GATEWAY_CHARGE_NOT_CANCELABLE',
        message: 'Esta cobrança não pode mais ser cancelada.',
        statusCode: 409,
      });

    try {
      await adapter.cancelCharge(credentials, config.environment, charge.externalId);
      await this.logEvent({
        tenantId,
        chargeId: charge.id,
        provider: config.provider,
        direction: 'OUTBOUND',
        eventType: 'charge.cancel',
        success: true,
      });
    } catch (error) {
      await this.logEvent({
        tenantId,
        chargeId: charge.id,
        provider: config.provider,
        direction: 'OUTBOUND',
        eventType: 'charge.cancel',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Erro desconhecido.',
      });
      throw error;
    }

    const updated = await this.client.paymentGatewayCharge.update({
      where: { id: charge.id },
      data: { status: 'CANCELED', canceledAt: new Date(), canceledReason: reason },
      include: {
        appointment: { select: { publicId: true } },
        debt: { select: { publicId: true } },
        payment: { select: { publicId: true } },
      },
    });
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'payment_gateway.charge_canceled',
        targetType: 'payment_gateway_charge',
        targetPublicId: updated.publicId,
      },
    });
    return pubCharge(updated);
  }

  /**
   * Recebe o webhook de um provedor. tenantPublicId identifica o tenant diretamente na URL
   * (o webhook não carrega sessão) — a assinatura verificada pelo adapter é a real barreira
   * de segurança contra eventos forjados.
   */
  public async handleWebhook(
    tenantPublicId: string,
    provider: string,
    rawBody: string,
    headers: Record<string, string>,
  ) {
    const tenant = await this.client.tenant.findFirst({
      where: { publicId: tenantPublicId },
      select: { id: true },
    });
    if (tenant === null)
      throw new AppError({
        code: 'TENANT_NOT_FOUND',
        message: 'Tenant não encontrado.',
        statusCode: 404,
      });

    const config = await this.client.paymentGatewayConfig.findFirst({
      where: { tenantId: tenant.id, provider },
    });
    if (!config?.active) {
      await this.logEvent({
        tenantId: tenant.id,
        chargeId: null,
        provider,
        direction: 'INBOUND',
        eventType: 'webhook.received',
        success: false,
        errorMessage: 'Gateway não configurado, inativo ou provedor divergente.',
      });
      throw new AppError({
        code: 'GATEWAY_NOT_CONFIGURED',
        message: 'Gateway não configurado para este estabelecimento.',
        statusCode: 404,
      });
    }

    const adapter = this.registry.get(provider);
    if (
      adapter === undefined ||
      config.credentialsCiphertext === null ||
      this.cipher === undefined
    ) {
      await this.logEvent({
        tenantId: tenant.id,
        chargeId: null,
        provider,
        direction: 'INBOUND',
        eventType: 'webhook.received',
        success: false,
        errorMessage: 'Provedor não implementado ou credenciais ausentes.',
      });
      throw new AppError({
        code: 'GATEWAY_PROVIDER_NOT_IMPLEMENTED',
        message: `O provedor "${provider}" ainda não possui uma integração implementada.`,
        statusCode: 501,
      });
    }

    const credentials = this.cipher.decrypt(config.credentialsCiphertext);
    const validSignature = adapter.verifyWebhookSignature(
      credentials,
      config.environment,
      rawBody,
      headers,
    );
    if (!validSignature) {
      await this.logEvent({
        tenantId: tenant.id,
        chargeId: null,
        provider,
        direction: 'INBOUND',
        eventType: 'webhook.received',
        success: false,
        errorMessage: 'Assinatura do webhook inválida.',
      });
      throw new AppError({
        code: 'GATEWAY_WEBHOOK_SIGNATURE_INVALID',
        message: 'Assinatura do webhook inválida.',
        statusCode: 401,
      });
    }

    const event = adapter.parseWebhookEvent(rawBody);

    if (event.externalEventId !== null) {
      const duplicate = await this.client.paymentGatewayEvent.findFirst({
        where: { tenantId: tenant.id, provider, externalEventId: event.externalEventId },
      });
      if (duplicate !== null) return { deduplicated: true };
    }

    const charge =
      event.externalId === null
        ? null
        : await this.client.paymentGatewayCharge.findFirst({
            where: { tenantId: tenant.id, provider, externalId: event.externalId },
            include: {
              appointment: { select: { publicId: true } },
              debt: { select: { publicId: true } },
              payment: { select: { publicId: true } },
            },
          });

    await this.logEvent({
      tenantId: tenant.id,
      chargeId: charge?.id ?? null,
      provider,
      direction: 'INBOUND',
      eventType: 'webhook.received',
      externalEventId: event.externalEventId,
      payload: event.raw,
      success: true,
    });

    if (charge === null) return { deduplicated: false, matched: false };

    const updated = await this.client.paymentGatewayCharge.update({
      where: { id: charge.id },
      data: { status: event.status },
      include: {
        appointment: { select: { publicId: true } },
        debt: { select: { publicId: true } },
        payment: { select: { publicId: true } },
      },
    });
    if (updated.status === 'PAID' && updated.paymentId === null)
      await this.reconcilePaidCharge(updated);

    return { deduplicated: false, matched: true };
  }

  /**
   * Materializa a cobrança confirmada como um Payment real, reaproveitando integralmente
   * PaymentService.create() — mesmas regras de saldo, mesmo reflexo em caixa/comissão que
   * qualquer outro pagamento, sem duplicar lógica de negócio. Cobranças originadas do Bot
   * Cobra (originType DEBT) são inteiramente delegadas a DebtPixPaymentService — a Debt
   * pode ter vindo de um Agendamento (precisa virar Payment de Agendamento de verdade,
   * para não divergir do saldo canônico) ou ser MANUAL (Payment isolado, originType DEBT).
   */
  private async reconcilePaidCharge(
    charge: PaymentGatewayCharge & { appointment: { publicId: string } | null },
    actor: Actor = { userId: null, sessionId: null },
  ) {
    if (charge.originType === 'DEBT') {
      await this.debtPixPayments?.reconcile(charge.id);
      return;
    }
    if (charge.appointment === null) return; // nunca deveria acontecer p/ originType APPOINTMENT

    const methodName = `Gateway (${charge.provider})`;
    const methods = await this.paymentMethods.list(charge.tenantId);
    let method = methods.items.find((item) => item.name === methodName);
    method ??= await this.paymentMethods.create(charge.tenantId, {
      name: methodName,
      type: 'OTHER',
      sortOrder: 999,
      active: true,
    });

    const payment = await this.payments.create(
      charge.tenantId,
      charge.appointment.publicId,
      {
        paymentMethodPublicId: method.publicId,
        kind: charge.kind,
        amountCents: Number(charge.amountCents),
        notes: `Pago via gateway ${charge.provider}${charge.externalId === null ? '' : ` (${charge.externalId})`}.`,
      },
      actor,
    );

    const paymentRecord = await this.client.payment.findFirst({
      where: { tenantId: charge.tenantId, publicId: payment.publicId },
      select: { id: true },
    });
    if (paymentRecord !== null)
      await this.client.paymentGatewayCharge.update({
        where: { id: charge.id },
        data: { paymentId: paymentRecord.id },
      });
  }

  /**
   * Confirmação manual de uma cobrança (usada pelo PIX local, que não possui autoridade
   * externa para confirmar pagamento automaticamente). Reaproveita reconcilePaidCharge, que
   * por sua vez reaproveita PaymentService.create() — nenhuma lógica de saldo é duplicada.
   */
  public async confirmManualCharge(tenantId: bigint, chargePublicId: string, actor: Actor) {
    const charge = await this.findChargeOrThrow(tenantId, chargePublicId);
    if (charge.status === 'PAID')
      throw new AppError({
        code: 'GATEWAY_CHARGE_ALREADY_PAID',
        message: 'Esta cobrança já foi confirmada.',
        statusCode: 409,
      });
    if (['CANCELED', 'REFUNDED', 'EXPIRED'].includes(charge.status))
      throw new AppError({
        code: 'GATEWAY_CHARGE_NOT_CONFIRMABLE',
        message: 'Esta cobrança não pode mais ser confirmada.',
        statusCode: 409,
      });

    const updated = await this.client.paymentGatewayCharge.update({
      where: { id: charge.id },
      data: { status: 'PAID', lastCheckedAt: new Date() },
      include: {
        appointment: { select: { publicId: true } },
        debt: { select: { publicId: true } },
        payment: { select: { publicId: true } },
      },
    });
    await this.reconcilePaidCharge(updated, actor);
    await this.client.auditLog.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        userId: actor.userId,
        sessionId: actor.sessionId,
        action: 'payment_gateway.charge_manually_confirmed',
        targetType: 'payment_gateway_charge',
        targetPublicId: updated.publicId,
      },
    });
    return pubCharge(await this.findChargeOrThrow(tenantId, chargePublicId));
  }

  private async findChargeOrThrow(tenantId: bigint, chargePublicId: string) {
    const charge = await this.client.paymentGatewayCharge.findFirst({
      where: { tenantId, publicId: chargePublicId },
      include: {
        appointment: { select: { publicId: true } },
        debt: { select: { publicId: true } },
        payment: { select: { publicId: true } },
      },
    });
    if (charge === null)
      throw new AppError({
        code: 'GATEWAY_CHARGE_NOT_FOUND',
        message: 'Cobrança não encontrada.',
        statusCode: 404,
      });
    return charge;
  }
}
