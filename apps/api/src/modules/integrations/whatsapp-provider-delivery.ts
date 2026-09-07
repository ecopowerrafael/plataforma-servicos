import {
  type WhatsAppControlTest,
  type WhatsAppDelivery,
  type WhatsAppInstanceDiagnostics,
  type WhatsAppInteractiveButton,
  type WhatsAppOperationResult,
  type WhatsAppReplyButtonType,
  type WhatsAppSendOutcome,
} from './integration-delivery.js';
import { type WhatsAppConnectionResult } from './whatsapp-connection.js';
import { type WhatsAppProviderResolver } from './whatsapp-provider-resolver.js';
import { WAPI_WHATSAPP_CAPABILITIES } from './whatsapp-provider.js';

export class ProviderResolvedWhatsAppDelivery implements WhatsAppDelivery {
  public readonly provider = 'WAPI' as const;
  public readonly capabilities = WAPI_WHATSAPP_CAPABILITIES;

  public constructor(private readonly resolver: WhatsAppProviderResolver) {}

  private delivery(tenantId: bigint) {
    return this.resolver.deliveryForTenant(tenantId) as Promise<WhatsAppDelivery>;
  }

  public async send(tenantId: bigint, to: string, text: string): Promise<void> {
    return (await this.delivery(tenantId)).send(tenantId, to, text);
  }

  public async sendPlainText(
    tenantId: bigint,
    to: string,
    message: string,
  ): Promise<WhatsAppSendOutcome> {
    return (await this.delivery(tenantId)).sendPlainText(tenantId, to, message);
  }

  public async sendInteractiveButtons(
    tenantId: bigint,
    to: string,
    message: string,
    buttons: WhatsAppInteractiveButton[],
    replyType?: WhatsAppReplyButtonType,
  ): Promise<WhatsAppSendOutcome> {
    return (await this.delivery(tenantId)).sendInteractiveButtons(
      tenantId,
      to,
      message,
      buttons,
      replyType,
    );
  }

  public async testConnection(
    tenantId: bigint,
    draft?: { instanceId?: string | undefined; token?: string | undefined },
  ): Promise<WhatsAppConnectionResult> {
    return (await this.delivery(tenantId)).testConnection(tenantId, draft);
  }

  public async configureReceivedWebhook(
    tenantId: bigint,
    url: string,
  ): Promise<WhatsAppOperationResult> {
    return (await this.delivery(tenantId)).configureReceivedWebhook(tenantId, url);
  }

  public async configureStatusWebhook(
    tenantId: bigint,
    url: string,
  ): Promise<WhatsAppOperationResult> {
    return (await this.delivery(tenantId)).configureStatusWebhook(tenantId, url);
  }

  public async inspectInstance(tenantId: bigint): Promise<WhatsAppInstanceDiagnostics> {
    return (await this.delivery(tenantId)).inspectInstance(tenantId);
  }

  public async runControlTest(
    tenantId: bigint,
    to: string,
    message: string,
  ): Promise<WhatsAppControlTest> {
    return (await this.delivery(tenantId)).runControlTest(tenantId, to, message);
  }
}
