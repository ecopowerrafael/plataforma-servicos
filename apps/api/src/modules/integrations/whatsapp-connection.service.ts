import { randomBytes, randomUUID } from 'node:crypto';

import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { type WhatsAppProviderCapabilities } from './whatsapp-provider.js';
import { type WhatsAppProviderResolver } from './whatsapp-provider-resolver.js';
import { type WhatsAppConnectionView } from './whatsapp-provisioning.service.js';

export type SupportedWhatsAppProviderId = 'WAPI' | 'META';

export interface WhatsAppProviderOption {
  provider: SupportedWhatsAppProviderId;
  label: string;
  description: string;
  available: boolean;
  capabilities: WhatsAppProviderCapabilities;
}

export class WhatsAppConnectionService {
  public constructor(
    private readonly resolver: WhatsAppProviderResolver,
    private readonly client: PrismaClient,
    private readonly cipher: CredentialsCipher | undefined,
  ) {}

  public providers(): { items: WhatsAppProviderOption[] } {
    return {
      items: [
        {
          provider: 'WAPI',
          label: 'WhatsApp por QR Code',
          description: 'Conexao rapida pelo aplicativo.',
          available: true,
          capabilities: this.resolver.capabilities('WAPI'),
        },
        {
          provider: 'META',
          label: 'WhatsApp Oficial',
          description: 'Integracao oficial da Meta Cloud API.',
          available: true,
          capabilities: this.resolver.capabilities('META'),
        },
      ],
    };
  }

  private async selectedProvider(tenantId: bigint): Promise<SupportedWhatsAppProviderId> {
    const settings = await this.client.tenantWhatsAppSettings?.findUnique({ where: { tenantId } });
    if (settings != null) return settings.selectedProvider as SupportedWhatsAppProviderId;
    const legacy = this.client.tenantWhatsAppConfig.findFirst === undefined
      ? await this.client.tenantWhatsAppConfig.findUnique?.({ where: { tenantId }, select: { provider: true } } as never)
      : await this.client.tenantWhatsAppConfig.findFirst({
      where: { tenantId },
      select: { provider: true },
      orderBy: { id: 'asc' },
    });
    return (legacy?.provider ?? 'WAPI') as SupportedWhatsAppProviderId;
  }

  private providerConfig(tenantId: bigint, provider: SupportedWhatsAppProviderId) {
    return this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId_provider: { tenantId, provider } } }).catch?.(() =>
      this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId } } as never),
    ) ?? this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId_provider: { tenantId, provider } } });
  }

  private async setSelectedProvider(tenantId: bigint, provider: SupportedWhatsAppProviderId) {
    if (this.client.tenantWhatsAppSettings === undefined) return null;
    return this.client.tenantWhatsAppSettings.upsert({
      where: { tenantId },
      create: { publicId: randomUUID(), tenantId, selectedProvider: provider },
      update: { selectedProvider: provider },
    });
  }

  public async selectProvider(
    tenantId: bigint,
    input: {
      provider: 'WAPI' | 'META';
      phoneNumberId?: string | undefined;
      businessAccountId?: string | undefined;
      accessToken?: string | undefined;
      appSecret?: string | undefined;
      apiVersion?: string | undefined;
    },
  ): Promise<{ provider: SupportedWhatsAppProviderId; capabilities: WhatsAppProviderCapabilities; connection: WhatsAppConnectionView }> {
    const selectedProvider = await this.selectedProvider(tenantId);
    const current = await this.providerConfig(tenantId, selectedProvider);
    if (
      current !== null &&
      selectedProvider !== input.provider &&
      (current.active || current.connectionStatus === 'CONNECTED')
    ) {
      throw new AppError({
        code: 'PROVIDER_SWITCH_REQUIRES_DISCONNECT',
        message: 'Desconecte o WhatsApp atual antes de trocar o metodo de conexao.',
        statusCode: 409,
      });
    }

    if (input.provider === 'WAPI') {
      await this.setSelectedProvider(tenantId, 'WAPI');
      return {
        provider: 'WAPI',
        capabilities: this.resolver.capabilities('WAPI'),
        connection: await this.current(tenantId),
      };
    }

    if (this.cipher === undefined) {
      throw new AppError({
        code: 'WHATSAPP_PROVIDER_UNAVAILABLE',
        message: 'A criptografia de credenciais nao esta configurada.',
        statusCode: 503,
      });
    }

    const phoneNumberId = input.phoneNumberId?.trim();
    const businessAccountId = input.businessAccountId?.trim();
    const accessToken = input.accessToken?.trim();
    const appSecret = input.appSecret?.trim();
    const apiVersion = input.apiVersion?.trim() ?? 'v23.0';
    const existingMeta = await this.providerConfig(tenantId, 'META');
    if (existingMeta === null && (phoneNumberId === undefined || businessAccountId === undefined || accessToken === undefined || appSecret === undefined)) {
      throw new AppError({
        code: 'META_WHATSAPP_CREDENTIALS_REQUIRED',
        message: 'Informe Phone Number ID, WhatsApp Business Account ID, Access Token e App Secret.',
        statusCode: 400,
      });
    }
    if (existingMeta !== null && existingMeta.encryptedAppSecret === null && appSecret === undefined) {
      throw new AppError({
        code: 'META_WHATSAPP_CREDENTIALS_REQUIRED',
        message: 'Informe o App Secret da Meta.',
        statusCode: 400,
      });
    }

    const webhookPublicId = existingMeta?.webhookPublicId ?? randomUUID();
    const verifyToken = existingMeta?.encryptedVerifyToken === null || existingMeta === null
      ? randomBytes(32).toString('hex')
      : this.decryptString(existingMeta.encryptedVerifyToken, 'verifyToken');

    const saved = await this.client.tenantWhatsAppConfig.upsert({
      where: { tenantId_provider: { tenantId, provider: 'META' } },
      create: {
        publicId: randomUUID(),
        tenantId,
        active: false,
        provider: 'META',
        phoneNumberId: phoneNumberId!,
        businessAccountId: businessAccountId!,
        encryptedAccessToken: this.cipher.encrypt({ accessToken }),
        encryptedAppSecret: this.cipher.encrypt({ appSecret }),
        encryptedVerifyToken: this.cipher.encrypt({ verifyToken }),
        webhookPublicId,
        apiVersion,
        connectionStatus: 'CREATED',
      },
      update: {
        active: false,
        ...(phoneNumberId === undefined ? {} : { phoneNumberId }),
        ...(businessAccountId === undefined ? {} : { businessAccountId }),
        ...(accessToken === undefined ? {} : { encryptedAccessToken: this.cipher.encrypt({ accessToken }) }),
        ...(appSecret === undefined ? {} : { encryptedAppSecret: this.cipher.encrypt({ appSecret }) }),
        encryptedVerifyToken: existingMeta?.encryptedVerifyToken ?? this.cipher.encrypt({ verifyToken }),
        webhookPublicId,
        apiVersion,
        connectionStatus: 'CREATED',
      },
    });
    await this.setSelectedProvider(tenantId, 'META');

    return {
      provider: 'META',
      capabilities: this.resolver.capabilities('META'),
      connection: {
        provider: 'META',
        available: true,
        provisioned: true,
        state: (saved.connectionStatus as WhatsAppConnectionView['state']) ?? 'CREATED',
        connectedPhone: saved.connectedPhone,
        connectedName: saved.connectedName,
        connectedAt: saved.connectedAt?.toISOString() ?? null,
        lastStatusCheckAt: saved.lastStatusCheckAt?.toISOString() ?? null,
        legacy: false,
        webhookUrl: this.metaWebhookUrl(saved.webhookPublicId),
        verifyToken,
        tokenConfigured: saved.encryptedAccessToken.trim() !== '',
        appSecretConfigured: saved.encryptedAppSecret !== null && saved.encryptedAppSecret.trim() !== '',
      },
    };
  }

  private decryptString(ciphertext: string, key: string) {
    if (this.cipher === undefined) return '';
    const stored = this.cipher.decrypt(ciphertext);
    const value = stored[key];
    return typeof value === 'string' ? value : '';
  }

  private metaWebhookUrl(webhookPublicId: string | null) {
    if (webhookPublicId === null) return null;
    const base = process.env.APP_WEB_URL?.trim() || 'https://agendei.site';
    return `${base.replace(/\/$/u, '')}/webhooks/whatsapp/meta/${webhookPublicId}`;
  }

  public async current(tenantId: bigint): Promise<WhatsAppConnectionView> {
    return this.resolver.provisioningForTenant(tenantId).then((provider) => provider.current(tenantId));
  }

  public async connect(tenantId: bigint): Promise<WhatsAppConnectionView> {
    return this.resolver.provisioningForTenant(tenantId).then((provider) => provider.connect(tenantId));
  }

  public async qrCode(tenantId: bigint): Promise<{ qrCode: string; view: WhatsAppConnectionView }> {
    const provider = await this.resolver.provisioningForTenant(tenantId);
    if (!provider.capabilities.qrCode || provider.qrCode === undefined) {
      throw new AppError({
        code: 'WHATSAPP_PROVIDER_CAPABILITY_UNAVAILABLE',
        message: 'Este provedor de WhatsApp nao usa QR Code.',
        statusCode: 400,
      });
    }
    return provider.qrCode(tenantId);
  }

  public async refreshStatus(tenantId: bigint): Promise<WhatsAppConnectionView> {
    return this.resolver.provisioningForTenant(tenantId).then((provider) => provider.refreshStatus(tenantId));
  }

  public async disconnect(tenantId: bigint): Promise<WhatsAppConnectionView> {
    return this.resolver.provisioningForTenant(tenantId).then((provider) => provider.disconnect(tenantId));
  }

  public async reconnect(tenantId: bigint): Promise<{ qrCode: string; view: WhatsAppConnectionView }> {
    const provider = await this.resolver.provisioningForTenant(tenantId);
    if (!provider.capabilities.qrCode || provider.reconnect === undefined) {
      throw new AppError({
        code: 'WHATSAPP_PROVIDER_CAPABILITY_UNAVAILABLE',
        message: 'Este provedor de WhatsApp nao usa reconexao por QR Code.',
        statusCode: 400,
      });
    }
    return provider.reconnect(tenantId);
  }
}
