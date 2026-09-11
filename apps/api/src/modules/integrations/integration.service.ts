import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

import { type WhatsAppDelivery } from './integration-delivery.js';
import { type IntegrationRepository } from './integration.repository.js';
import { WhatsAppAssistantService } from './whatsapp-assistant.service.js';
import {
  maskPhone,
  normalizeWApiWebhook,
  type NormalizedWhatsAppEvent,
} from './whatsapp-inbound.js';
import {
  advanceStatus,
  statusFromEvent,
  timestampColumn,
  type WhatsAppMessageStatus,
} from './whatsapp-message-status.js';
import { normalizeWhatsAppPhone } from './whatsapp-phone.js';
import { type WhatsAppProviderResolver } from './whatsapp-provider-resolver.js';
import { type WhatsAppProviderId } from './whatsapp-provider.js';
import { MetaInboundNormalizer } from './meta-whatsapp-inbound.js';
import { type Prisma } from '../../database-client/client.js';
import { type Environment } from '../../config/environment.js';
import { AppError } from '../../errors/AppError.js';
import { type AppointmentService } from '../appointments/appointment.service.js';
import { type AvailabilityService } from '../calendar/availability.service.js';
import { type CollectionAttemptExecutionService } from '../collections/collection-attempt-execution.service.js';
import { type CustomerAuthService } from '../customers/customer-auth.service.js';
import { type CustomerService } from '../customers/customer.service.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { type TenantPaymentOptionsService } from '../payments/gateway/tenant-payment-options.service.js';
import { type PaymentService } from '../payments/payment.service.js';
import { type ProfessionalServiceLinkService } from '../professionals/professional-service.service.js';
import { ProspectingInboundService } from '../prospecting/prospecting-inbound.service.js';
import { type ProspectingWhatsAppConfigService } from '../prospecting/prospecting-whatsapp-config.service.js';
import { PlanEntitlementService, type PlanFeatureKey } from '../tenants/plan-entitlement.service.js';
import { type TenantWhiteLabelService } from '../tenants/tenant-white-label.service.js';

interface Actor {
  userId: bigint;
  // null quando a ação vem de um contexto sem sessão de tenant real — ex.:
  // um admin da plataforma agindo em nome do tenant (AuditLog.sessionId é
  // uma FK nullable; nunca inventar um id de sessão que não exista).
  sessionId: bigint | null;
}
type WhatsAppConfigByInstance = NonNullable<
  Awaited<ReturnType<IntegrationRepository['whatsappByInstanceId']>>
>;
const whatsappPublic = (
  item: {
    active: boolean;
    phoneNumberId: string;
    encryptedAccessToken: string;
    lastValidationStatus: string | null;
    lastValidatedAt: Date | null;
  } | null,
  available: boolean,
) => {
  const storedStatus = item?.lastValidationStatus;
  const connectionStatus: 'NOT_CONFIGURED' | 'INACTIVE' | 'CONNECTED' | 'ERROR' | null =
    item === null
      ? 'NOT_CONFIGURED'
      : storedStatus === 'CONNECTED' || storedStatus === 'ERROR'
        ? storedStatus
        : item.active
          ? null
          : 'INACTIVE';
  return ({
  available,
  configured: item !== null,
  active: item?.active ?? false,
  instanceId: item?.phoneNumberId ?? null,
  tokenConfigured: item !== null && item.encryptedAccessToken.length > 0,
  connectionStatus,
  lastValidatedAt: item?.lastValidatedAt?.toISOString() ?? null,
  });
};
const externalPublic = (item: {
  publicId: string;
  name: string;
  endpoint: string;
  events: unknown;
  active: boolean;
  encryptedSecret: string | null;
}) => ({
  publicId: item.publicId,
  name: item.name,
  endpoint: item.endpoint,
  events: Array.isArray(item.events) ? item.events : [],
  active: item.active,
  hasSecret: item.encryptedSecret !== null,
});

export class IntegrationService {
  private readonly assistant: WhatsAppAssistantService;
  private readonly prospectingInbound: ProspectingInboundService;

  public constructor(
    private readonly repository: IntegrationRepository,
    private readonly cipher: CredentialsCipher | undefined,
    private readonly whatsappDelivery?: WhatsAppDelivery,
    appointmentService?: AppointmentService,
    availabilityService?: AvailabilityService,
    tenantWhiteLabel?: TenantWhiteLabelService,
    professionalServices?: ProfessionalServiceLinkService,
    customerService?: CustomerService,
    paymentOptions?: TenantPaymentOptionsService,
    payments?: PaymentService,
    customerAuth?: CustomerAuthService,
    private readonly collectionAttemptExecution?: CollectionAttemptExecutionService,
    client?: any, // PrismaClient
    prospectingConfigService?: ProspectingWhatsAppConfigService,
    private readonly environment?: Environment | null,
    private readonly providerResolver?: WhatsAppProviderResolver,
  ) {
    this.assistant = new WhatsAppAssistantService(
      repository,
      whatsappDelivery,
      appointmentService,
      availabilityService,
      tenantWhiteLabel,
      professionalServices,
      customerService,
      paymentOptions,
      payments,
      customerAuth,
    );

    this.prospectingInbound = client && prospectingConfigService
      ? new ProspectingInboundService(client, prospectingConfigService, this.environment)
      : new ProspectingInboundService();
  }
  private assertEnabled(tenantId: bigint, key: PlanFeatureKey) {
    return new PlanEntitlementService().assertFeatureEnabledForTenant(this.repository.client, tenantId, key);
  }
  public async whatsapp(tenantId: bigint) {
    const available = await new PlanEntitlementService().featureEnabledForTenant(
      this.repository.client,
      tenantId,
      'whatsapp.enabled',
    );
    return whatsappPublic(await this.repository.whatsapp(tenantId), available);
  }
  public async updateWhatsapp(
    tenantId: bigint,
    input: {
      active: boolean;
      instanceId: string;
      token?: string | undefined;
      instanceName?: string | undefined;
      phoneNumber?: string | undefined;
    },
    actor: Actor,
  ) {
    await this.assertEnabled(tenantId, 'whatsapp.enabled');
    const old = await this.repository.whatsapp(tenantId);
    const encryptedAccessToken =
      input.token === undefined
        ? old?.encryptedAccessToken
        : this.encrypt({ token: input.token });
    if (encryptedAccessToken === undefined)
      throw new AppError({
        code: 'WHATSAPP_TOKEN_REQUIRED',
        message: 'Informe o token de acesso para configurar o WhatsApp.',
        statusCode: 400,
      });
    const result = await this.repository.upsertWhatsapp(tenantId, {
      active: input.active,
      instanceId: input.instanceId,
      encryptedAccessToken,
      instanceName: input.instanceName,
      phoneNumber: input.phoneNumber,
    });
    await this.audit(tenantId, actor, 'integration.whatsapp.updated', result.publicId);
    return whatsappPublic(result, true);
  }
  /**
   * Visão administrativa (suporte/plataforma) da instância do WhatsApp do
   * tenant — nunca devolve o token, só se ele está configurado.
   */
  public async whatsappAdminView(tenantId: bigint) {
    const available = await new PlanEntitlementService().featureEnabledForTenant(
      this.repository.client,
      tenantId,
      'whatsapp.enabled',
    );
    const config = await this.repository.whatsapp(tenantId);
    return {
      available,
      configured: config !== null,
      active: config?.active ?? false,
      instanceId: config?.phoneNumberId ?? null,
      instanceName: config?.instanceName ?? null,
      phoneNumber: config?.connectedPhone ?? null,
      tokenConfigured: config !== null && config.encryptedAccessToken.length > 0,
      connectionStatus: config?.connectionStatus ?? 'NOT_CONFIGURED',
      lastCheckedAt: config?.lastStatusCheckAt?.toISOString() ?? null,
    };
  }
  public async testWhatsapp(tenantId: bigint,input: {instanceId?:string|undefined;token?:string|undefined}) {
    await this.assertEnabled(tenantId, 'whatsapp.enabled');
    if (this.whatsappDelivery === undefined)
      throw new AppError({ code: 'WHATSAPP_UNAVAILABLE', message: 'Teste indisponivel.', statusCode: 503 });
    const configured = await this.repository.whatsapp(tenantId);
    if (configured === null && (input.instanceId===undefined||input.token===undefined))
      throw new AppError({ code: 'WHATSAPP_NOT_CONFIGURED', message: 'Configure o WhatsApp primeiro.', statusCode: 400 });
    const result=await this.whatsappDelivery.testConnection(tenantId,input);
    if(configured!==null)await this.repository.updateWhatsappValidation(tenantId,result.connected?'CONNECTED':'ERROR',new Date());
    return result;
  }
  /** IDs usados só na prova de integração — nenhuma decisão vem do texto do botão. */
  public static readonly testActionIds = ['TEST_CONFIRM', 'TEST_CANCEL'] as const;
  // Mensagem em uma única linha: o exemplo da documentação não usa quebra de
  // linha em mensagem com botões, e isso já foi descartado como variável.
  private static readonly testMessage =
    'Teste do Assistente Agendei. Clique em uma opção para validar a integração.';

  private whatsappDeliveryOrFail() {
    if (this.whatsappDelivery === undefined)
      throw new AppError({
        code: 'WHATSAPP_UNAVAILABLE',
        message: 'Envio indisponível.',
        statusCode: 503,
      });
    return this.whatsappDelivery;
  }

  /** Envia a mensagem de teste com os dois botões de prova. */
  public async sendWhatsappButtonTest(tenantId: bigint, phone: string, actor: Actor) {
    await this.assertEnabled(tenantId, 'whatsapp.enabled');
    const delivery = this.whatsappDeliveryOrFail();
    const configured = await this.repository.whatsapp(tenantId);
    if (configured === null)
      throw new AppError({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'Configure o WhatsApp primeiro.',
        statusCode: 400,
      });
    const buttons = [
      { buttonId: 'TEST_CONFIRM', label: 'Confirmar teste' },
      { buttonId: 'TEST_CANCEL', label: 'Cancelar teste' },
    ];
    const result = await delivery.sendInteractiveButtons(
      tenantId,
      phone,
      IntegrationService.testMessage,
      buttons,
    );
    const actionIds = buttons.map((button) => button.buttonId);
    // A ordem enviada é o que permite traduzir o `selectedIndex` do clique de
    // volta para a nossa ação, então ela precisa ser persistida com o envio.
    await this.repository.createOutboundMessage({
      tenantId,
      instanceId: configured.phoneNumberId,
      phone,
      externalMessageId: result.externalMessageId,
      actionIds,
      status: result.status,
      customerId: await this.customerIdForPhone(tenantId, phone),
      errorCode: result.errorCode,
    });
    await this.audit(tenantId, actor, 'integration.whatsapp.button_test_sent', configured.publicId);
    return { ...result, actionIds };
  }

  /** Registra as duas URLs de webhook na instância: mensagens recebidas e status. */
  public async configureWhatsappWebhook(tenantId: bigint, url: string, actor: Actor) {
    await this.assertEnabled(tenantId, 'whatsapp.enabled');
    const delivery = this.whatsappDeliveryOrFail();
    const configured = await this.repository.whatsapp(tenantId);
    if (configured === null)
      throw new AppError({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'Configure o WhatsApp primeiro.',
        statusCode: 400,
      });
    const received = await delivery.configureReceivedWebhook(tenantId, url);
    const status = await delivery.configureStatusWebhook(tenantId, url);
    await this.audit(tenantId, actor, 'integration.whatsapp.webhook_configured', configured.publicId);
    return { received, status, webhookUrl: url };
  }

  /** Cliente do tenant correspondente ao telefone, ou `null`. Não cria cadastro. */
  private async customerIdForPhone(tenantId: bigint, phone: string | null) {
    if (phone === null) return null;
    const normalized = normalizeWhatsAppPhone(phone);
    if (normalized === null) return null;
    const withoutCountry = normalized.startsWith('55') ? normalized.slice(2) : normalized;
    const candidates = [...new Set([normalized, withoutCountry, phone])];
    const customer = await this.repository.customerByPhone(tenantId, candidates);
    return customer?.id ?? null;
  }

  /**
   * Grupo de controle: confirma o número e envia um texto simples. Isola se a
   * falha é do recurso de botões ou de qualquer envio para aquele destinatário.
   */
  public async sendWhatsappControlTest(tenantId: bigint, phone: string, actor: Actor) {
    await this.assertEnabled(tenantId, 'whatsapp.enabled');
    const delivery = this.whatsappDeliveryOrFail();
    const configured = await this.repository.whatsapp(tenantId);
    if (configured === null)
      throw new AppError({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'Configure o WhatsApp primeiro.',
        statusCode: 400,
      });
    const result = await delivery.runControlTest(
      tenantId,
      phone,
      'Teste do Assistente Agendei — mensagem de controle, sem botões.',
    );
    await this.audit(tenantId, actor, 'integration.whatsapp.control_test_sent', configured.publicId);
    return result;
  }

  /** Dados da instância + fila pendente, para saber se a mensagem realmente saiu. */
  public async whatsappInstanceDiagnostics(tenantId: bigint) {
    await this.assertEnabled(tenantId, 'whatsapp.enabled');
    const delivery = this.whatsappDeliveryOrFail();
    const configured = await this.repository.whatsapp(tenantId);
    if (configured === null)
      throw new AppError({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'Configure o WhatsApp primeiro.',
        statusCode: 400,
      });
    return delivery.inspectInstance(tenantId);
  }

  public async lastWhatsappInboundEvent(tenantId: bigint) {
    await this.assertEnabled(tenantId, 'whatsapp.enabled');
    const [event, outbound, conversation] = await Promise.all([
      this.repository.lastInboundEvent(tenantId),
      this.repository.lastOutboundMessage(tenantId),
      this.repository.lastConversation(tenantId),
    ]);
    const lastConversation =
      conversation === null
        ? null
        : {
            maskedPhone: maskPhone(conversation.phone),
            status: conversation.status,
            currentFlow: conversation.currentFlow,
            lastInboundAt: conversation.lastInboundAt.toISOString(),
          };
    const lastMessage =
      outbound === null
        ? null
        : {
            externalMessageId: outbound.externalMessageId,
            status: outbound.status as WhatsAppMessageStatus,
            maskedPhone: maskPhone(outbound.phone),
            sentAt: outbound.sentAt.toISOString(),
            deliveredAt: outbound.deliveredAt?.toISOString() ?? null,
            readAt: outbound.readAt?.toISOString() ?? null,
            failedAt: outbound.failedAt?.toISOString() ?? null,
            errorCode: outbound.errorCode,
          };
    if (event === null) return { event: null, lastMessage, lastConversation };
    return {
      lastMessage,
      lastConversation,
      event: {
        publicId: event.publicId,
        eventType: event.eventType,
        messageType: event.messageType,
        maskedPhone: maskPhone(event.phone),
        externalMessageId: event.externalMessageId,
        actionId: event.actionId,
        text: event.text,
        receivedAt: event.receivedAt.toISOString(),
        payload: event.payload ?? null,
      },
    };
  }

  /**
   * Ingestão do webhook: o tenant vem sempre da configuração local a partir do
   * instanceId — nunca de um tenantId recebido de fora.
   *
   * IMPORTANTE: Checar Prospecting ANTES de resolver tenant para evitar rotear
   * erroneamente para tenant quando instanceId pertence a Prospecting.
   */
  public async ingestWhatsappInbound(raw: unknown) {
    const received = normalizeWApiWebhook(raw);

    // Log de diagnóstico do webhook recebido
    console.log('[WebhookIngest]', {
      eventType: received.eventType,
      providerEvent: received.providerEvent,
      messageType: received.messageType,
      text: received.text ? received.text.slice(0, 50) : null,
      phone: received.phone,
      fromMe: received.fromMe,
      selectedIndex: received.selectedIndex,
      selectedDisplayText: received.selectedDisplayText,
    });

    if (received.instanceId === null) return { accepted: false, reason: 'INSTANCE_MISSING' } as const;

    // Connectivity callbacks are not message events and must never enter
    // prospecting/tenant message processing or mutate message status.
    if (received.providerEvent === 'webhookConnected') {
      return { accepted: true, connectionEvent: true } as const;
    }

    // ROTEAMENTO PROSPECTING: checar instância de Prospecting PRIMEIRO
    if (this.prospectingInbound) {
      // Verificar se instância pertence à Prospecção
      const prosConfig = await this.prospectingInbound.getConfig?.();
      const isProspectingInstance = prosConfig && prosConfig.instanceId === received.instanceId;

      console.log('[WebhookRoute]', {
        toProspecting: Boolean(isProspectingInstance),
        normalizedEventType: received.eventType,
        instanceId: received.instanceId,
        isProspectingInstance,
      });

      if (isProspectingInstance) {
        const prospectingResult = await this.prospectingInbound.processInbound({
          instanceId: received.instanceId || null,
          externalMessageId: received.externalMessageId || null,
          fromPhone: received.phone || null,
          body: received.text ?? received.selectedDisplayText ?? undefined,
          fromMe: received.fromMe,
          timestamp: received.timestamp || undefined,
          eventType: received.eventType || null,
          referencedMessageId: received.referencedMessageId ?? null,
          selectedIndex: received.selectedIndex ?? null,
        });

        // Se foi processado por Prospecting, retornar resultado
        if (prospectingResult.handled) {
          return { accepted: true, prospectingHandled: true, ...prospectingResult } as const;
        }

        // ⚠️ É instância de Prospecting mas não foi processado (LEAD_NOT_FOUND, etc)
        // NÃO continua para tenant flow — pertence à Prospecção
        console.log('[WebhookRoute]', {
          prospectingInstance: true,
          handled: false,
          prospectingReason: prospectingResult.reason,
        });

        return {
          accepted: true,
          prospectingHandled: false,
          prospectingReason: prospectingResult.reason,
        } as const;
      }
    }

    // FLUXO TENANT: continuar com comportamento anterior
    const config = await this.repository.whatsappByInstanceId(received.instanceId);
    if (config === null) return { accepted: false, reason: 'INSTANCE_UNKNOWN' } as const;
    const provider = typeof config.provider === 'string' ? config.provider : 'WAPI';
    const selectedProvider = this.repository.selectedWhatsappProvider === undefined
      ? provider
      : await this.repository.selectedWhatsappProvider(config.tenantId);
    if (provider !== selectedProvider) return { accepted: false, reason: 'PROVIDER_MISMATCH' } as const;
    const event =
      this.providerResolver === undefined
        ? received
        : this.providerResolver.inbound(provider).normalize(raw);
    if (event.instanceId === null) return { accepted: false, reason: 'INSTANCE_MISSING' } as const;
    return this.processTenantWhatsappInbound(config, event);
  }

  public async ingestWhatsappInboundForProvider(provider: WhatsAppProviderId, raw: unknown) {
    if (provider === 'WAPI') return this.ingestWhatsappInbound(raw);
    if (this.providerResolver === undefined)
      throw new AppError({
        code: 'WHATSAPP_PROVIDER_NOT_SUPPORTED',
        message: 'Resolver de provider de WhatsApp indisponivel.',
        statusCode: 400,
      });
    const normalizer = this.providerResolver.inbound(provider);
    const events = normalizer.normalizeMany?.(raw) ?? [normalizer.normalize(raw)];
    const summary = { received: true, processed: 0, duplicated: 0, rejected: 0 };
    for (const event of events) {
      if (event.instanceId === null) {
        summary.rejected += 1;
        continue;
      }
      const config = await this.repository.whatsappByInstanceId(event.instanceId);
      if (config === null) {
        summary.rejected += 1;
        continue;
      }
      const configuredProvider = typeof config.provider === 'string' ? config.provider : 'WAPI';
      const selectedProvider = this.repository.selectedWhatsappProvider === undefined
        ? configuredProvider
        : await this.repository.selectedWhatsappProvider(config.tenantId);
      if (configuredProvider !== provider || selectedProvider !== provider) {
        summary.rejected += 1;
        continue;
      }
      const result = await this.processTenantWhatsappInbound(config, event);
      if (result.accepted && result.duplicated) summary.duplicated += 1;
      else if (result.accepted) summary.processed += 1;
      else summary.rejected += 1;
    }
    return summary;
  }

  public async verifyMetaWebhook(webhookPublicId: string, query: { mode?: string | undefined; verifyToken?: string | undefined; challenge?: string | undefined }) {
    if (query.mode !== 'subscribe') return null;
    const config = await this.repository.metaWhatsappByWebhookPublicId(webhookPublicId);
    if (config === null || config.encryptedVerifyToken === null || this.cipher === undefined) return null;
    const stored = this.cipher.decrypt(config.encryptedVerifyToken);
    const expected = typeof stored.verifyToken === 'string' ? stored.verifyToken : null;
    if (expected === null || query.verifyToken === undefined) return null;
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(query.verifyToken);
    if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) return null;
    return query.challenge ?? '';
  }

  public async ingestMetaWebhook(webhookPublicId: string, rawBody: string | undefined, body: unknown, signatureHeader: string | string[] | undefined) {
    const config = await this.repository.metaWhatsappByWebhookPublicId(webhookPublicId);
    if (config === null) return { statusCode: 404, body: { code: 'META_WEBHOOK_NOT_FOUND' } } as const;
    if (this.cipher === undefined || config.encryptedAppSecret === null) {
      return { statusCode: 403, body: { code: 'META_WEBHOOK_APP_SECRET_REQUIRED' } } as const;
    }
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
    if (signature === undefined || !signature.startsWith('sha256=')) {
      return { statusCode: 403, body: { code: 'META_WEBHOOK_SIGNATURE_REQUIRED' } } as const;
    }
    const stored = this.cipher.decrypt(config.encryptedAppSecret);
    const appSecret = typeof stored.appSecret === 'string' ? stored.appSecret : null;
    if (appSecret === null || appSecret.trim() === '') {
      return { statusCode: 403, body: { code: 'META_WEBHOOK_APP_SECRET_REQUIRED' } } as const;
    }
    const payload = rawBody ?? (typeof body === 'string' ? body : JSON.stringify(body ?? {}));
    const expected = createHmac('sha256', appSecret).update(payload).digest('hex');
    const received = signature.slice('sha256='.length);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(received, 'hex');
    if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
      return { statusCode: 403, body: { code: 'META_WEBHOOK_SIGNATURE_INVALID' } } as const;
    }
    const normalizer = new MetaInboundNormalizer();
    const events = normalizer.normalizeMany(body);
    if (events.length === 0 || events.some((event) => event.instanceId !== config.phoneNumberId)) {
      return { statusCode: 403, body: { code: 'META_WEBHOOK_PHONE_NUMBER_MISMATCH' } } as const;
    }
    const selectedProvider = this.repository.selectedWhatsappProvider === undefined
      ? 'META'
      : await this.repository.selectedWhatsappProvider(config.tenantId);
    if (selectedProvider !== 'META') {
      return { statusCode: 403, body: { code: 'META_WEBHOOK_PROVIDER_MISMATCH' } } as const;
    }
    const summary = { received: true, processed: 0, duplicated: 0, rejected: 0 };
    for (const event of events) {
      const result = await this.processTenantWhatsappInbound(config, event);
      if (result.accepted && result.duplicated) summary.duplicated += 1;
      else if (result.accepted) summary.processed += 1;
      else summary.rejected += 1;
    }
    return { statusCode: 200, body: summary } as const;
  }

  private async processTenantWhatsappInbound(
    config: WhatsAppConfigByInstance,
    event: NormalizedWhatsAppEvent,
  ) {
    if (event.instanceId === null) return { accepted: false, reason: 'INSTANCE_MISSING' } as const;
    if (event.phone === null) return { accepted: false, reason: 'PHONE_MISSING' } as const;
    const tenantId = config.tenantId;
    const existing = await this.repository.inboundEventByFingerprint(tenantId, event.fingerprint);
    if (existing !== null) return { accepted: true, duplicated: true } as const;

    const resolvedAction = await this.resolveActionId(tenantId, event);
    const actionId = resolvedAction?.actionId ?? null;
    await this.applyStatusEvent(tenantId, event);
    const customerId = await this.customerIdForPhone(tenantId, event.phone);

    try {
      await this.repository.createInboundEvent({
        tenantId,
        instanceId: event.instanceId,
        externalMessageId: event.externalMessageId,
        phone: event.phone,
        eventType: event.eventType,
        messageType: event.messageType,
        actionId,
        fingerprint: event.fingerprint,
        text: event.text,
        referencedMessageId: event.referencedMessageId,
        customerId,
        payload: event.payload as Prisma.InputJsonValue,
      });
    } catch {
      // Corrida entre entregas simultâneas do mesmo evento: a unique key resolve.
      return { accepted: true, duplicated: true } as const;
    }

    // Resposta de tentativa agendada (collection_attempt): rota para Bot Cobra
    if (resolvedAction?.collectionAttemptPublicId !== null && resolvedAction?.collectionAttemptPublicId !== undefined) {
      const result = await this.collectionAttemptExecution?.handleWhatsAppResponse(
        tenantId,
        resolvedAction.collectionAttemptPublicId,
        actionId,
      );
      return {
        accepted: true,
        duplicated: false,
        eventType: event.eventType,
        collectionResponseHandled: result?.handled ?? false,
      } as const;
    }

    // Resposta imediata de cobrança (collection_reply): rota para Bot Cobra
    if (resolvedAction?.collectionDebtPublicId !== null && resolvedAction?.collectionDebtPublicId !== undefined) {
      const result = await this.collectionAttemptExecution?.handleWhatsAppDebtResponse(
        tenantId,
        resolvedAction.collectionDebtPublicId,
        actionId,
      );
      return {
        accepted: true,
        duplicated: false,
        eventType: event.eventType,
        collectionResponseHandled: result?.handled ?? false,
      } as const;
    }

    // O evento já está persistido; a automação roda depois e só para mensagens
    // do cliente, de modo que uma falha aqui não perde o registro do webhook.
    const entitled = await new PlanEntitlementService().featureEnabledForTenant(
      this.repository.client,
      tenantId,
      'whatsapp.enabled',
    );
    const assistant = await this.assistant.handleInbound({
      tenantId,
      instanceId: event.instanceId,
      event,
      customerId,
      actionId,
      appointmentPublicId: resolvedAction?.appointmentPublicId ?? null,
      entitled,
    });
    return {
      accepted: true,
      duplicated: false,
      eventType: event.eventType,
      assistantReplied: assistant.replied,
      ...(assistant.reason === undefined ? {} : { assistantSkipped: assistant.reason }),
    } as const;
  }

  /**
   * O clique traz a posição do botão e o id da mensagem original. Cruzando com
   * o que foi enviado, chegamos ao nosso actionId — sem olhar o texto visível
   * nem o id gerado pelo provedor.
   */
  private async resolveActionId(tenantId: bigint, event: NormalizedWhatsAppEvent) {
    if (event.referencedMessageId === null) return null;
    const outbound = await this.repository.outboundByExternalMessageId(
      tenantId,
      event.referencedMessageId,
    );
    const actionIds = Array.isArray(outbound?.actionIds) ? outbound.actionIds : [];
    const matched = event.provider === 'META'
      ? actionIds.find((actionId): actionId is string => typeof actionId === 'string' && actionId === event.actionId)
      : event.selectedIndex === null
        ? null
        : actionIds[event.selectedIndex];
    if (typeof matched !== 'string') return null;
    const appointmentPublicId =
      outbound?.notification?.targetType === 'appointment' &&
      typeof outbound.notification.targetPublicId === 'string'
        ? outbound.notification.targetPublicId
        : null;
    const collectionAttemptPublicId =
      outbound?.notification?.targetType === 'collection_attempt' &&
      typeof outbound.notification.targetPublicId === 'string'
        ? outbound.notification.targetPublicId
        : null;
    const collectionDebtPublicId =
      outbound?.notification?.targetType === 'collection_reply' &&
      typeof outbound.notification.targetPublicId === 'string'
        ? outbound.notification.targetPublicId
        : null;
    return { actionId: matched, appointmentPublicId, collectionAttemptPublicId, collectionDebtPublicId };
  }

  /**
   * Avança o ciclo de vida da mensagem enviada. A busca é sempre por tenant, de
   * modo que um evento de um tenant nunca alcança a mensagem de outro, e a
   * transição é monotônica: webhook repetido ou fora de ordem não regride.
   */
  private async applyStatusEvent(tenantId: bigint, event: NormalizedWhatsAppEvent) {
    if (event.eventType === null || event.externalMessageId === null) return;
    const next = statusFromEvent(event.eventType);
    if (next === null) return;
    const outbound = await this.repository.outboundByExternalMessageId(
      tenantId,
      event.externalMessageId,
    );
    if (outbound === null) return;
    const current = outbound.status as WhatsAppMessageStatus;
    const advanced = advanceStatus(current, next);
    if (advanced === current) return;
    const column = timestampColumn(advanced);
    await this.repository.updateOutboundStatus(outbound.id, {
      status: advanced,
      ...(column === null ? {} : { [column]: event.timestamp ?? new Date() }),
    });
  }

  public async list(tenantId: bigint) {
    await this.assertEnabled(tenantId, 'integrations.enabled');
    return { items: (await this.repository.integrations(tenantId)).map(externalPublic) };
  }
  public async save(
    tenantId: bigint,
    publicId: string | null,
    input: {
      name: string;
      endpoint: string;
      secret?: string | null | undefined;
      events: string[];
      active: boolean;
    },
    actor: Actor,
  ) {
    await this.assertEnabled(tenantId, 'integrations.enabled');
    const old = publicId === null ? null : await this.repository.integration(tenantId, publicId);
    if (publicId !== null && old === null)
      throw new AppError({
        code: 'INTEGRATION_NOT_FOUND',
        message: 'Integração não encontrada.',
        statusCode: 404,
      });
    const encryptedSecret =
      input.secret === undefined
        ? (old?.encryptedSecret ?? null)
        : input.secret === null
          ? null
          : this.encrypt({ secret: input.secret });
    const result = await this.repository.upsertIntegration(tenantId, publicId, {
      name: input.name,
      endpoint: input.endpoint,
      encryptedSecret,
      events: input.events,
      active: input.active,
    });
    await this.audit(tenantId, actor, 'integration.external.updated', result.publicId);
    return externalPublic(result);
  }
  public async remove(tenantId: bigint, publicId: string, actor: Actor) {
    await this.assertEnabled(tenantId, 'integrations.enabled');
    const item = await this.repository.integration(tenantId, publicId);
    if (item === null)
      throw new AppError({
        code: 'INTEGRATION_NOT_FOUND',
        message: 'Integração não encontrada.',
        statusCode: 404,
      });
    await this.repository.removeIntegration(item.id);
    await this.audit(tenantId, actor, 'integration.external.removed', publicId);
  }
  private encrypt(value: Record<string, unknown>) {
    if (this.cipher === undefined)
      throw new AppError({
        code: 'CREDENTIAL_ENCRYPTION_NOT_CONFIGURED',
        message: 'A criptografia de credenciais não está configurada.',
        statusCode: 503,
      });
    return this.cipher.encrypt(value);
  }
  private async audit(tenantId: bigint, actor: Actor, action: string, targetPublicId: string) {
    await this.repository.audit({
      publicId: randomUUID(),
      tenantId,
      userId: actor.userId,
      sessionId: actor.sessionId,
      action,
      targetType: 'external_integration',
      targetPublicId,
    });
  }
}
