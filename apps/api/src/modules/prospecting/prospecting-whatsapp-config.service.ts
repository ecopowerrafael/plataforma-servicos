import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { type WApiIntegrationService } from '../integrations/wapi-integration.service.js';
import { canonicalWapiWhatsAppWebhookPath } from '../integrations/whatsapp-webhook.routes.js';

export interface ProspectingWhatsAppConfigData {
  instanceId: string;
  token: string;
  phoneNumber?: string | null | undefined;
  instanceName?: string | null | undefined;
  isActive?: boolean | undefined;
  attendantEnabled?: boolean | undefined;
  attendantFlowId?: bigint | null | undefined;
  greetingMessage?: string | null | undefined;
  fallbackMessage?: string | null | undefined;
  mediaFallbackMessage?: string | null | undefined;
  realtimeRepliesEnabled?: boolean | undefined;
}

export interface ProspectingWhatsAppConfigResponse {
  publicId: string;
  instanceId: string;
  phoneNumber?: string;
  instanceName?: string;
  isActive: boolean;
  lastConnectionStatus?: string;
  lastCheckedAt?: string;
  tokenMasked: string;
  configured: boolean;
  attendantEnabled: boolean;
  attendantFlowId?: string;
  greetingMessage?: string;
  fallbackMessage?: string;
  mediaFallbackMessage?: string;
  realtimeRepliesEnabled: boolean;
  webhookUrl: string;
}

export class ProspectingWhatsAppConfigService {
  constructor(
    private readonly client: PrismaClient,
    private readonly cipher: CredentialsCipher,
    private readonly wapi?: WApiIntegrationService,
    private readonly appWebUrl = process.env.APP_WEB_URL?.trim() || 'https://agendei.site',
  ) {}

  async reconfigureWebhooks(): Promise<void> {
    if (!this.wapi) throw new Error('Cliente W-API não configurado.');
    const config = await this.client.prospectingWhatsAppConfig.findFirst({ where: { isActive: true } });
    if (!config) throw new Error('Nenhuma configuração ativa de WhatsApp da prospecção.');
    const token = this.cipher.decrypt(config.tokenCiphertext) as { token?: string } | string;
    const accessToken = typeof token === 'string' ? token : token.token;
    if (!accessToken) throw new Error('Token da instância não pode ser descriptografado.');
    const secret = process.env.WAPI_WEBHOOK_SECRET?.trim();
    const base = `${this.appWebUrl.replace(/\/+$/u, '')}${canonicalWapiWhatsAppWebhookPath}`;
    const webhookUrl = secret ? `${base}?webhookSecret=${encodeURIComponent(secret)}` : base;
    await this.wapi.configureWebhooks(config.instanceId, accessToken, webhookUrl);
    await this.updateConnectionStatus('CONNECTED');
  }

  async getConfig(): Promise<ProspectingWhatsAppConfigResponse | null> {
    const config = await this.client.prospectingWhatsAppConfig.findFirst();
    if (!config) return null;
    return this.toResponse(config);
  }

  async updateConfig(data: ProspectingWhatsAppConfigData): Promise<ProspectingWhatsAppConfigResponse> {
    const tokenCiphertext = this.cipher.encrypt({ token: data.token });

    const config = await this.client.prospectingWhatsAppConfig.findFirst();

    if (!config) {
      const newConfig = await this.client.prospectingWhatsAppConfig.create({
        data: {
          publicId: randomUUID(),
          instanceId: data.instanceId,
          tokenCiphertext,
          phoneNumber: data.phoneNumber ?? null,
          instanceName: data.instanceName ?? null,
          isActive: data.isActive ?? true,
          attendantEnabled: data.attendantEnabled ?? true,
          attendantFlowId: data.attendantFlowId ?? null,
          greetingMessage: data.greetingMessage ?? null,
          fallbackMessage: data.fallbackMessage ?? null,
          mediaFallbackMessage: data.mediaFallbackMessage ?? null,
          realtimeRepliesEnabled: data.realtimeRepliesEnabled ?? true,
        },
      });
      return this.toResponse(newConfig);
    }

    const updated = await this.client.prospectingWhatsAppConfig.update({
      where: { id: config.id },
      data: {
        instanceId: data.instanceId,
        tokenCiphertext,
        phoneNumber: data.phoneNumber ?? config.phoneNumber,
        instanceName: data.instanceName ?? config.instanceName,
        isActive: data.isActive ?? config.isActive,
        attendantEnabled: data.attendantEnabled ?? config.attendantEnabled,
        attendantFlowId: data.attendantFlowId ?? config.attendantFlowId,
        greetingMessage: data.greetingMessage ?? config.greetingMessage,
        fallbackMessage: data.fallbackMessage ?? config.fallbackMessage,
        mediaFallbackMessage: data.mediaFallbackMessage ?? config.mediaFallbackMessage,
        realtimeRepliesEnabled: data.realtimeRepliesEnabled ?? config.realtimeRepliesEnabled,
      },
    });

    return this.toResponse(updated);
  }

  getWebhookUrl(): string {
    return `${this.appWebUrl.replace(/\/+$/u, '')}${canonicalWapiWhatsAppWebhookPath}`;
  }

  async getDecryptedToken(): Promise<string | null> {
    const config = await this.client.prospectingWhatsAppConfig.findFirst({
      where: { isActive: true },
    });
    if (!config) return null;
    const decrypted = this.cipher.decrypt(config.tokenCiphertext) as { token?: string } | string;
    return typeof decrypted === 'string' ? decrypted : (decrypted.token ?? null);
  }

  async updateConnectionStatus(status: string, phoneNumber?: string, instanceName?: string): Promise<void> {
    const config = await this.client.prospectingWhatsAppConfig.findFirst();
    if (!config) return;

    await this.client.prospectingWhatsAppConfig.update({
      where: { id: config.id },
      data: {
        lastConnectionStatus: status,
        lastCheckedAt: new Date(),
        ...(phoneNumber && { phoneNumber }),
        ...(instanceName && { instanceName }),
      },
    });
  }

  private toResponse(config: {
    publicId: string;
    instanceId: string;
    phoneNumber: string | null;
    instanceName: string | null;
    isActive: boolean;
    lastConnectionStatus: string | null;
    lastCheckedAt: Date | null;
    tokenCiphertext: string;
    attendantEnabled: boolean;
    attendantFlowId: bigint | null;
    greetingMessage: string | null;
    fallbackMessage: string | null;
    mediaFallbackMessage: string | null;
    realtimeRepliesEnabled: boolean;
  }): ProspectingWhatsAppConfigResponse {
    const result: ProspectingWhatsAppConfigResponse = {
      publicId: config.publicId,
      instanceId: config.instanceId,
      isActive: config.isActive,
      tokenMasked: this.maskToken(config.tokenCiphertext ?? ''),
      configured: true,
      webhookUrl: this.getWebhookUrl(),
      attendantEnabled: config.attendantEnabled ?? true,
      realtimeRepliesEnabled: config.realtimeRepliesEnabled ?? true,
    };

    if (config.attendantFlowId != null) result.attendantFlowId = String(config.attendantFlowId);
    if (config.greetingMessage) result.greetingMessage = config.greetingMessage;
    if (config.fallbackMessage) result.fallbackMessage = config.fallbackMessage;
    if (config.mediaFallbackMessage) result.mediaFallbackMessage = config.mediaFallbackMessage;

    if (config.phoneNumber) result.phoneNumber = config.phoneNumber;
    if (config.instanceName) result.instanceName = config.instanceName;
    if (config.lastConnectionStatus) result.lastConnectionStatus = config.lastConnectionStatus;
    if (config.lastCheckedAt instanceof Date) result.lastCheckedAt = config.lastCheckedAt.toISOString();

    return result;
  }

  private maskToken(ciphertext: string): string {
    if (ciphertext.length <= 8) return '•'.repeat(ciphertext.length);
    return '•'.repeat(ciphertext.length - 4) + ciphertext.slice(-4);
  }
}
