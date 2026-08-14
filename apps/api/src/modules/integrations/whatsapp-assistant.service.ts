import { type WhatsAppDelivery, type WhatsAppInteractiveButton } from './integration-delivery.js';
import { type IntegrationRepository } from './integration.repository.js';
import { routeAction } from './whatsapp-action-router.js';
import {
  conversationExpiresAt,
  conversationIsUsable,
  greetingMessage,
  MAIN_MENU_ACTIONS,
} from './whatsapp-assistant.js';
import { type NormalizedWhatsAppEvent } from './whatsapp-inbound.js';

/** Motivo pelo qual o assistente não respondeu — usado só em log/diagnóstico. */
export type AssistantSkipReason =
  | 'NOT_A_CUSTOMER_MESSAGE'
  | 'FROM_ME'
  | 'GROUP'
  | 'NO_PHONE'
  | 'NOT_ENTITLED'
  | 'HUMAN_SUPPORT'
  | 'DELIVERY_UNAVAILABLE';

export interface AssistantResult {
  replied: boolean;
  reason?: AssistantSkipReason;
  conversationPublicId?: string;
}

const menuButtons: WhatsAppInteractiveButton[] = MAIN_MENU_ACTIONS.map((action) => ({
  buttonId: action.actionId,
  label: action.label,
}));
const menuActionIds = MAIN_MENU_ACTIONS.map((action) => action.actionId);

/**
 * Assistente do WhatsApp: abre a sessão, saúda e apresenta o menu principal.
 * Nenhuma funcionalidade de agenda é executada aqui — o roteador apenas
 * reconhece a ação escolhida.
 */
export class WhatsAppAssistantService {
  public constructor(
    private readonly repository: IntegrationRepository,
    private readonly delivery: WhatsAppDelivery | undefined,
  ) {}

  /**
   * Só mensagens do cliente movimentam o assistente. Eventos de status e as
   * nossas próprias mensagens são ignorados, o que evita o laço de uma resposta
   * disparar outra.
   */
  public async handleInbound(input: {
    tenantId: bigint;
    instanceId: string;
    event: NormalizedWhatsAppEvent;
    customerId: bigint | null;
    actionId: string | null;
    entitled: boolean;
  }): Promise<AssistantResult> {
    const { event } = input;
    if (event.eventType !== 'MESSAGE_RECEIVED' && event.eventType !== 'MESSAGE_ACTION')
      return { replied: false, reason: 'NOT_A_CUSTOMER_MESSAGE' };
    if (event.fromMe) return { replied: false, reason: 'FROM_ME' };
    if (event.isGroup) return { replied: false, reason: 'GROUP' };
    if (event.phone === null) return { replied: false, reason: 'NO_PHONE' };
    // Sem o recurso no plano o webhook continua sendo persistido, mas a
    // automação não roda e nada é apagado.
    if (!input.entitled) return { replied: false, reason: 'NOT_ENTITLED' };
    if (this.delivery === undefined) return { replied: false, reason: 'DELIVERY_UNAVAILABLE' };

    const now = new Date();
    const phone = event.phone;
    const existing = await this.repository.conversationFor(input.tenantId, phone);

    if (existing === null || !conversationIsUsable(existing, now)) {
      if (existing !== null && existing.status !== 'CLOSED')
        await this.repository.closeConversation(existing.id);
      const conversation = await this.repository.createConversation({
        tenantId: input.tenantId,
        customerId: input.customerId,
        phone,
        lastInboundAt: now,
        expiresAt: conversationExpiresAt(now),
      });
      await this.sendGreetingWithMenu(input, phone, conversation.id);
      return { replied: true, conversationPublicId: conversation.publicId };
    }

    const conversation = existing;
    await this.repository.updateConversation(conversation.id, {
      lastInboundAt: now,
      expiresAt: conversationExpiresAt(now),
      ...(conversation.customerId === null && input.customerId !== null
        ? { customerId: input.customerId }
        : {}),
    });

    // Em atendimento humano o inbound é apenas persistido: nada automático sai.
    if (conversation.status === 'HUMAN_SUPPORT')
      return {
        replied: false,
        reason: 'HUMAN_SUPPORT',
        conversationPublicId: conversation.publicId,
      };

    const outcome = routeAction(input.actionId);
    if (outcome.resendMenu) {
      await this.dispatchButtons(input, phone, outcome.reply, conversation.id);
    } else {
      await this.dispatchText(input, phone, outcome.reply, conversation.id);
    }
    if (outcome.nextStatus !== conversation.status)
      await this.repository.updateConversation(conversation.id, { status: outcome.nextStatus });
    return { replied: true, conversationPublicId: conversation.publicId };
  }

  private async sendGreetingWithMenu(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    phone: string,
    conversationId: bigint,
  ) {
    const [tenant, customer] = await Promise.all([
      this.repository.tenantName(input.tenantId),
      input.customerId === null
        ? Promise.resolve(null)
        : this.repository.customerName(input.customerId),
    ]);
    const greeting = greetingMessage(tenant?.displayName ?? 'nossa equipe', customer?.name ?? null);
    await this.dispatchButtons(input, phone, greeting, conversationId);
  }

  /** Menu principal. O envio e o rastreio passam pelo mesmo caminho de sempre. */
  private async dispatchButtons(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    phone: string,
    message: string,
    conversationId: bigint,
  ) {
    const delivery = this.delivery;
    if (delivery === undefined) return;
    const result = await delivery.sendInteractiveButtons(input.tenantId, phone, message, menuButtons);
    await this.trackOutbound(input, phone, result, menuActionIds, conversationId);
  }

  private async dispatchText(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    phone: string,
    message: string,
    conversationId: bigint,
  ) {
    const delivery = this.delivery;
    if (delivery === undefined) return;
    const result = await delivery.sendPlainText(input.tenantId, phone, message);
    await this.trackOutbound(input, phone, result, [], conversationId);
  }

  private async trackOutbound(
    input: { tenantId: bigint; instanceId: string; customerId: bigint | null },
    phone: string,
    result: { externalMessageId: string | null; status: string; errorCode: string | null },
    actionIds: string[],
    conversationId: bigint,
  ) {
    await this.repository.createOutboundMessage({
      tenantId: input.tenantId,
      instanceId: input.instanceId,
      phone,
      externalMessageId: result.externalMessageId,
      actionIds,
      status: result.status,
      customerId: input.customerId,
      errorCode: result.errorCode,
    });
    await this.repository.updateConversation(conversationId, { lastOutboundAt: new Date() });
  }
}
