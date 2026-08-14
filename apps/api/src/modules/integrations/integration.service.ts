import { randomUUID } from 'node:crypto';

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
import { type Prisma } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type AppointmentService } from '../appointments/appointment.service.js';
import { type AvailabilityService } from '../calendar/availability.service.js';
import { type CustomerService } from '../customers/customer.service.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { type TenantPaymentOptionsService } from '../payments/gateway/tenant-payment-options.service.js';
import { type PaymentService } from '../payments/payment.service.js';
import { type ProfessionalServiceLinkService } from '../professionals/professional-service.service.js';
import { PlanEntitlementService, type PlanFeatureKey } from '../tenants/plan-entitlement.service.js';
import { type TenantWhiteLabelService } from '../tenants/tenant-white-label.service.js';

interface Actor {
  userId: bigint;
  sessionId: bigint;
}
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
    );
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
    });
    await this.audit(tenantId, actor, 'integration.whatsapp.updated', result.publicId);
    return whatsappPublic(result, true);
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
   */
  public async ingestWhatsappInbound(raw: unknown) {
    const event = normalizeWApiWebhook(raw);
    if (event.instanceId === null) return { accepted: false, reason: 'INSTANCE_MISSING' } as const;
    const config = await this.repository.whatsappByInstanceId(event.instanceId);
    if (config === null) return { accepted: false, reason: 'INSTANCE_UNKNOWN' } as const;
    const tenantId = config.tenantId;
    const existing = await this.repository.inboundEventByFingerprint(tenantId, event.fingerprint);
    if (existing !== null) return { accepted: true, duplicated: true } as const;

    const actionId = await this.resolveActionId(tenantId, event);
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
    if (event.referencedMessageId === null || event.selectedIndex === null) return null;
    const outbound = await this.repository.outboundByExternalMessageId(
      tenantId,
      event.referencedMessageId,
    );
    const actionIds = Array.isArray(outbound?.actionIds) ? outbound.actionIds : [];
    const matched = actionIds[event.selectedIndex];
    return typeof matched === 'string' ? matched : null;
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
