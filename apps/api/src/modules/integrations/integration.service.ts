import { randomUUID } from 'node:crypto';

import { type WhatsAppDelivery } from './integration-delivery.js';
import { type IntegrationRepository } from './integration.repository.js';
import { maskPhone, normalizeWhatsAppEvent } from './whatsapp-inbound.js';
import { AppError } from '../../errors/AppError.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { PlanEntitlementService, type PlanFeatureKey } from '../tenants/plan-entitlement.service.js';

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
  public constructor(
    private readonly repository: IntegrationRepository,
    private readonly cipher: CredentialsCipher | undefined,
    private readonly whatsappDelivery?: WhatsAppDelivery,
  ) {}
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
  public static readonly testActionIds = [
    'TEST_CONFIRM',
    'TEST_CANCEL',
    // Ids do exemplo da documentação, para capturar também o clique da variante
    // de comparação — a decisão nunca vem do texto visível do botão.
    'id1',
    'id2',
    'id3',
  ] as const;
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

  /**
   * Envia a mensagem de teste com botões.
   *
   * `variant: 'docs'` reproduz literalmente o corpo de exemplo da documentação
   * (ids curtos `id1`/`id2`/`id3`). Como todo o resto do corpo é idêntico ao
   * nosso, comparar os dois envios isola se o problema está nos valores de
   * `buttonId` que usamos.
   */
  public async sendWhatsappButtonTest(
    tenantId: bigint,
    phone: string,
    actor: Actor,
    variant: 'agendei' | 'docs' = 'agendei',
  ) {
    await this.assertEnabled(tenantId, 'whatsapp.enabled');
    const delivery = this.whatsappDeliveryOrFail();
    const configured = await this.repository.whatsapp(tenantId);
    if (configured === null)
      throw new AppError({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'Configure o WhatsApp primeiro.',
        statusCode: 400,
      });
    const payload =
      variant === 'docs'
        ? {
            message: 'Deseja algo mais?',
            buttons: [
              { buttonId: 'id1', label: 'SIM' },
              { buttonId: 'id2', label: 'NÃO' },
              { buttonId: 'id3', label: 'Voltar para o menu' },
            ],
          }
        : {
            message: IntegrationService.testMessage,
            buttons: [
              { buttonId: 'TEST_CONFIRM', label: 'Confirmar teste' },
              { buttonId: 'TEST_CANCEL', label: 'Cancelar teste' },
            ],
          };
    const result = await delivery.sendInteractiveButtons(
      tenantId,
      phone,
      payload.message,
      payload.buttons,
    );
    await this.audit(tenantId, actor, 'integration.whatsapp.button_test_sent', configured.publicId);
    return { ...result, actionIds: payload.buttons.map((button) => button.buttonId) };
  }

  /** Registra a URL pública deste ambiente como webhook de recebimento da instância. */
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
    const result = await delivery.configureReceivedWebhook(tenantId, url);
    await this.audit(tenantId, actor, 'integration.whatsapp.webhook_configured', configured.publicId);
    return { ...result, webhookUrl: url };
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
    const event = await this.repository.lastInboundEvent(tenantId);
    if (event === null) return { event: null };
    return {
      event: {
        publicId: event.publicId,
        eventType: event.eventType,
        messageType: event.messageType,
        maskedPhone: maskPhone(event.phone),
        externalMessageId: event.externalMessageId,
        actionId: event.actionId,
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
    const normalized = normalizeWhatsAppEvent(raw, IntegrationService.testActionIds);
    if (normalized.instanceId === null) return { accepted: false, reason: 'INSTANCE_MISSING' } as const;
    const config = await this.repository.whatsappByInstanceId(normalized.instanceId);
    if (config === null) return { accepted: false, reason: 'INSTANCE_UNKNOWN' } as const;
    const existing = await this.repository.inboundEventByFingerprint(
      config.tenantId,
      normalized.fingerprint,
    );
    if (existing !== null) return { accepted: true, duplicated: true } as const;
    try {
      await this.repository.createInboundEvent({
        tenantId: config.tenantId,
        instanceId: normalized.instanceId,
        externalMessageId: normalized.externalMessageId,
        phone: normalized.phone,
        eventType: normalized.eventType,
        messageType: normalized.messageType,
        actionId: normalized.action?.actionId ?? null,
        fingerprint: normalized.fingerprint,
        payload: {
          ...(normalized.payload as Record<string, unknown>),
          ...(normalized.action === null ? {} : { _actionIdPath: normalized.action.path }),
        },
      });
    } catch {
      // Corrida entre entregas simultâneas do mesmo evento: a unique key resolve.
      return { accepted: true, duplicated: true } as const;
    }
    return { accepted: true, duplicated: false } as const;
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
