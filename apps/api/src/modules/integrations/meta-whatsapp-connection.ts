import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { MetaWhatsAppClient } from './meta-whatsapp-client.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { type WhatsAppProvisioningProvider } from './whatsapp-provider.js';
import { type WhatsAppConnectionView } from './whatsapp-provisioning.service.js';

export const META_WHATSAPP_CAPABILITIES = {
  qrCode: false,
  autoProvision: false,
  interactiveMessages: true,
  templates: false,
  official: true,
} as const;

type MetaConfig = NonNullable<Awaited<ReturnType<PrismaClient['tenantWhatsAppConfig']['findUnique']>>>;

export class MetaWhatsAppConnection implements WhatsAppProvisioningProvider {
  public readonly provider = 'META' as const;
  public readonly capabilities = META_WHATSAPP_CAPABILITIES;

  public constructor(
    private readonly client: PrismaClient,
    private readonly cipher: CredentialsCipher | undefined,
    private readonly metaClient = new MetaWhatsAppClient(),
  ) {}

  private view(config: MetaConfig | null): WhatsAppConnectionView {
    if (config === null || config.provider !== 'META') {
      return {
        provider: 'META',
        available: true,
        provisioned: false,
        state: 'NOT_CREATED',
        connectedPhone: null,
        connectedName: null,
        connectedAt: null,
        lastStatusCheckAt: null,
        legacy: false,
      };
    }
    return {
      provider: 'META',
      available: true,
      provisioned: true,
      state: (config.connectionStatus as WhatsAppConnectionView['state']) ?? 'CREATED',
      phoneNumberId: config.phoneNumberId,
      businessAccountId: config.businessAccountId,
      apiVersion: config.apiVersion,
      connectedPhone: config.connectedPhone,
      connectedName: config.connectedName,
      connectedAt: config.connectedAt?.toISOString() ?? null,
      lastStatusCheckAt: config.lastStatusCheckAt?.toISOString() ?? null,
      legacy: false,
      webhookUrl: config.webhookPublicId === null ? null : `${(process.env.APP_WEB_URL?.trim() || 'https://agendei.site').replace(/\/$/u, '')}/webhooks/whatsapp/meta/${config.webhookPublicId}`,
      verifyToken: this.verifyToken(config),
      tokenConfigured: config.encryptedAccessToken.trim() !== '',
      appSecretConfigured: config.encryptedAppSecret !== null && config.encryptedAppSecret.trim() !== '',
    };
  }

  private verifyToken(config: MetaConfig) {
    if (this.cipher === undefined || config.encryptedVerifyToken === null) return null;
    const stored = this.cipher.decrypt(config.encryptedVerifyToken);
    return typeof stored.verifyToken === 'string' ? stored.verifyToken : null;
  }

  private async config(tenantId: bigint): Promise<MetaConfig> {
    const config = await this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId_provider: { tenantId, provider: 'META' } } });
    if (config === null || config.provider !== 'META') {
      throw new AppError({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'Configure a Meta Cloud API antes de continuar.',
        statusCode: 400,
      });
    }
    return config;
  }

  private credentials(config: MetaConfig): { accessToken: string } {
    if (this.cipher === undefined) {
      throw new AppError({
        code: 'WHATSAPP_PROVIDER_UNAVAILABLE',
        message: 'A criptografia de credenciais nao esta configurada.',
        statusCode: 503,
      });
    }
    const stored = this.cipher.decrypt(config.encryptedAccessToken);
    const accessToken = stored.accessToken ?? stored.token;
    if (typeof accessToken !== 'string' || accessToken.trim() === '') {
      throw new AppError({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'Configure o token de acesso da Meta.',
        statusCode: 400,
      });
    }
    return { accessToken };
  }

  public async current(tenantId: bigint): Promise<WhatsAppConnectionView> {
    return this.view(await this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId_provider: { tenantId, provider: 'META' } } }));
  }

  public connect(tenantId: bigint): Promise<WhatsAppConnectionView> {
    return this.refreshStatus(tenantId);
  }

  public async refreshStatus(tenantId: bigint): Promise<WhatsAppConnectionView> {
    const config = await this.config(tenantId);
    const { accessToken } = this.credentials(config);
    const now = new Date();
    try {
      const response = await this.metaClient.phoneNumber(config.apiVersion, config.phoneNumberId, accessToken);
      if (!response.ok) {
        const updated = await this.client.tenantWhatsAppConfig.update({
          where: { tenantId_provider: { tenantId, provider: 'META' } },
          data: {
            active: false,
            connectionStatus: 'ERROR',
            lastValidationStatus: 'ERROR',
            lastValidatedAt: now,
            lastStatusCheckAt: now,
          },
        });
        return this.view(updated);
      }
      const updated = await this.client.tenantWhatsAppConfig.update({
        where: { tenantId_provider: { tenantId, provider: 'META' } },
        data: {
          active: true,
          connectionStatus: 'CONNECTED',
          connectedPhone: typeof response.payload.display_phone_number === 'string' ? response.payload.display_phone_number : config.connectedPhone,
          connectedName: typeof response.payload.verified_name === 'string' ? response.payload.verified_name : config.connectedName,
          connectedAt: config.connectedAt ?? now,
          lastValidationStatus: 'CONNECTED',
          lastValidatedAt: now,
          lastStatusCheckAt: now,
        },
      });
      return this.view(updated);
    } catch {
      const updated = await this.client.tenantWhatsAppConfig.update({
        where: { tenantId_provider: { tenantId, provider: 'META' } },
        data: {
          active: false,
          connectionStatus: 'ERROR',
          lastValidationStatus: 'ERROR',
          lastValidatedAt: now,
          lastStatusCheckAt: now,
        },
      });
      return this.view(updated);
    }
  }

  public async disconnect(tenantId: bigint): Promise<WhatsAppConnectionView> {
    const config = await this.config(tenantId);
    const updated = await this.client.tenantWhatsAppConfig.update({
      where: { tenantId_provider: { tenantId, provider: 'META' } },
      data: {
        active: false,
        connectionStatus: 'DISCONNECTED',
        lastStatusCheckAt: new Date(),
      },
    });
    return this.view({ ...config, ...updated });
  }
}
