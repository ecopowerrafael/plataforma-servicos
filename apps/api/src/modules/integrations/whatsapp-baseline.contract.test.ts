import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const routes = read('./integration.routes.ts');
const service = read('./integration.service.ts');
const delivery = read('./integration-delivery.ts');
const repository = read('./integration.repository.ts');
const provisioning = read('./whatsapp-provisioning.service.ts');
const wapi = read('./wapi-integration.service.ts');
const webhookRoutes = read('./whatsapp-webhook.routes.ts');
const connection = read('../../database/connection.ts');
const providerContracts = read('./whatsapp-provider.ts');
const providerResolver = read('./whatsapp-provider-resolver.ts');
const connectionService = read('./whatsapp-connection.service.ts');

const tenantWhatsappEndpoints = [
  "'/tenant/integrations/whatsapp'",
  "'/tenant/integrations/whatsapp/status'",
  "'/tenant/integrations/whatsapp/instance'",
  "'/tenant/integrations/whatsapp/qr'",
  "'/tenant/integrations/whatsapp/reconnect'",
  "'/tenant/integrations/whatsapp/disconnect'",
  "'/tenant/integrations/whatsapp/test'",
  "'/tenant/integrations/whatsapp/webhook-config'",
  "'/tenant/integrations/whatsapp/button-test'",
  "'/tenant/integrations/whatsapp/control-test'",
  "'/tenant/integrations/whatsapp/diagnostics'",
  "'/tenant/integrations/whatsapp/last-event'",
] as const;

describe('WhatsApp W-API baseline before provider abstraction', () => {
  it('documents every current tenant WhatsApp endpoint surface', () => {
    for (const endpoint of tenantWhatsappEndpoints) expect(routes).toContain(endpoint);
    expect(routes).toContain('whatsappAssistantConfigRoutes');
    expect(webhookRoutes).toContain("'/public/integrations/whatsapp/webhook'");
    expect(webhookRoutes).toContain("'/webhooks/whatsapp/wapi'");
    expect(webhookRoutes).toContain("'/webhooks/whatsapp/meta'");
    expect(routes).toContain('canonicalWapiWhatsAppWebhookPath');
  });

  it('keeps the current platform/support W-API surfaces mapped', () => {
    const platformRoutes = read('../platform/platform.routes.ts');
    const platformWapiRoutes = read('../platform/wapi-config.routes.ts');
    expect(platformRoutes).toContain("'/platform/tenants/:tenantPublicId/whatsapp'");
    expect(platformRoutes).toContain("'/platform/tenants/:tenantPublicId/whatsapp/test'");
    expect(platformWapiRoutes).toContain("'/platform/settings/wapi'");
    expect(platformWapiRoutes).toContain("'/platform/settings/wapi/test'");
  });

  it('lists the direct W-API coupling points that must be protected during refactor', () => {
    expect(connection).toContain('new WApiWhatsAppDelivery');
    expect(connection).toContain('new WApiIntegrationService');
    expect(connection).toContain('new WhatsAppProvisioningService');
    expect(connection).toContain('new WhatsAppProviderResolver');
    expect(connection).toContain('new WhatsAppConnectionService');
    expect(delivery).toContain('export class WApiWhatsAppDelivery implements WhatsAppDelivery');
    expect(provisioning).toContain('private readonly wapiProvider: WApiIntegrationService');
  });

  it('introduces generic provider contracts while W-API remains operational through an adapter', () => {
    expect(providerContracts).toContain('export interface WhatsAppProvider');
    expect(providerContracts).toContain('export interface WhatsAppDeliveryProvider');
    expect(providerContracts).toContain('export interface WhatsAppProvisioningProvider');
    expect(providerContracts).toContain('export interface WhatsAppInboundNormalizer');
    expect(providerContracts).toContain('qrCode: boolean');
    expect(delivery).toContain('export class WApiWhatsAppDelivery implements WhatsAppDelivery');
    expect(provisioning).toContain('implements WhatsAppProvisioningProvider');
    expect(read('./whatsapp-inbound.ts')).toContain('class WApiInboundNormalizer implements WhatsAppInboundNormalizer');
  });

  it('keeps provider resolution explicit with no silent fallback from META or unknown providers to WAPI', () => {
    expect(providerResolver).toContain('providerForTenant');
    expect(providerResolver).toContain("config?.provider ?? 'WAPI'");
    expect(providerResolver).toContain('WHATSAPP_PROVIDER_NOT_SUPPORTED');
    expect(providerResolver).toContain('private readonly providers: Record');
    expect(providerResolver).toContain('WAPI: {');
    expect(providerResolver).toContain('const registered = this.providers[provider]');
    expect(providerResolver).toContain('throw new WhatsAppProviderNotSupportedError(provider)');
  });

  it('routes tenant connection operations through a provider-aware connection service', () => {
    expect(connectionService).toContain('export class WhatsAppConnectionService');
    expect(connectionService).toContain('provisioningForTenant(tenantId)');
    expect(connectionService).toContain('WHATSAPP_PROVIDER_CAPABILITY_UNAVAILABLE');
    expect(connectionService).toContain("provider: 'META'");
    expect(read('./integration.routes.ts')).toContain('type WhatsAppConnectionService');
    expect(read('../../app.ts')).toContain('options.database.whatsappConnection');
  });

  it('covers W-API delivery operations used by notifications, assistant, jobs and diagnostics', () => {
    expect(delivery).toContain('sendPlainText(');
    expect(delivery).toContain('sendInteractiveButtons(');
    expect(delivery).toContain('testConnection(');
    expect(delivery).toContain('runControlTest(');
    expect(delivery).toContain('configureReceivedWebhook(');
    expect(delivery).toContain('configureStatusWebhook(');
    expect(delivery).toContain('inspectInstance(');
    expect(delivery).toContain('/v1/message/send-text');
    expect(delivery).toContain('/v1/message/send-button-actions');
  });

  it('covers W-API provisioning operations without exposing provider credentials', () => {
    expect(wapi).toContain('/v1/client/create-instance');
    expect(wapi).toContain('/v1/instance/qr-code');
    expect(wapi).toContain('/v1/instance/status-instance');
    expect(wapi).toContain('/v1/instance/device');
    expect(wapi).toContain('/v1/instance/disconnect');
    expect(provisioning).toContain("provider: 'WAPI'");
    expect(provisioning).toContain("businessAccountId: 'internal'");
    expect(provisioning).toContain("apiVersion: 'v1'");
    expect(routes).toContain('{ operation, tenantPublicId: request.tenant.publicId }');
  });

  it('keeps inbound normalization, message status and conversation creation on the tenant-safe path', () => {
    expect(service).toContain('const received = normalizeWApiWebhook(raw)');
    expect(service).toContain('whatsappByInstanceId(received.instanceId)');
    expect(service).toContain('this.providerResolver.inbound(provider).normalize(raw)');
    expect(service).toContain('inboundEventByFingerprint(tenantId, event.fingerprint)');
    expect(service).toContain('applyStatusEvent(tenantId, event)');
    expect(repository).toContain('where: { tenantId, externalMessageId }');
    expect(repository).toContain('createConversation(data');
    expect(repository).toContain("data: { publicId: randomUUID(), status: 'ACTIVE', currentFlow: 'MAIN_MENU', ...data }");
  });
});
