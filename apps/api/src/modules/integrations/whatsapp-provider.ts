import { type WhatsAppConnectionResult } from './whatsapp-connection.js';
import {
  type WhatsAppControlTest,
  type WhatsAppInstanceDiagnostics,
  type WhatsAppInteractiveButton,
  type WhatsAppOperationResult,
  type WhatsAppReplyButtonType,
  type WhatsAppSendOutcome,
} from './integration-delivery.js';
import { type NormalizedWhatsAppEvent } from './whatsapp-inbound.js';
import { type WhatsAppConnectionView } from './whatsapp-provisioning.service.js';

export type WhatsAppProviderId = 'WAPI' | 'META' | (string & {});

export interface WhatsAppProviderCapabilities {
  qrCode: boolean;
  autoProvision: boolean;
  interactiveMessages: boolean;
  templates: boolean;
  official: boolean;
}

export interface WhatsAppProvider {
  readonly provider: WhatsAppProviderId;
  readonly capabilities: WhatsAppProviderCapabilities;
}

export interface WhatsAppDeliveryProvider extends WhatsAppProvider {
  send(tenantId: bigint, to: string, text: string): Promise<void>;
  sendPlainText(tenantId: bigint, to: string, message: string): Promise<WhatsAppSendOutcome>;
  sendInteractiveButtons(
    tenantId: bigint,
    to: string,
    message: string,
    buttons: WhatsAppInteractiveButton[],
    replyType?: WhatsAppReplyButtonType,
  ): Promise<WhatsAppSendOutcome>;
  testConnection(
    tenantId: bigint,
    input?: { instanceId?: string | undefined; token?: string | undefined },
  ): Promise<WhatsAppConnectionResult>;
  configureReceivedWebhook(tenantId: bigint, url: string): Promise<WhatsAppOperationResult>;
  configureStatusWebhook(tenantId: bigint, url: string): Promise<WhatsAppOperationResult>;
  inspectInstance(tenantId: bigint): Promise<WhatsAppInstanceDiagnostics>;
  runControlTest(tenantId: bigint, to: string, message: string): Promise<WhatsAppControlTest>;
}

export interface WhatsAppProvisioningProvider extends WhatsAppProvider {
  current(tenantId: bigint): Promise<WhatsAppConnectionView>;
  connect(tenantId: bigint): Promise<WhatsAppConnectionView>;
  qrCode?(tenantId: bigint): Promise<{ qrCode: string; view: WhatsAppConnectionView }>;
  refreshStatus(tenantId: bigint): Promise<WhatsAppConnectionView>;
  disconnect(tenantId: bigint): Promise<WhatsAppConnectionView>;
  reconnect?(tenantId: bigint): Promise<{ qrCode: string; view: WhatsAppConnectionView }>;
}

export interface WhatsAppInboundNormalizer extends WhatsAppProvider {
  normalize(raw: unknown): NormalizedWhatsAppEvent;
}

export const WAPI_WHATSAPP_CAPABILITIES: WhatsAppProviderCapabilities = {
  qrCode: true,
  autoProvision: true,
  interactiveMessages: true,
  templates: false,
  official: false,
};
