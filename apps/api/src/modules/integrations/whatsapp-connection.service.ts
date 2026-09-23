import { randomBytes, randomUUID } from 'node:crypto';

import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { type WhatsAppProviderCapabilities } from './whatsapp-provider.js';
import { type WhatsAppProviderResolver } from './whatsapp-provider-resolver.js';
import { type WhatsAppConnectionView } from './whatsapp-provisioning.service.js';

export type SupportedWhatsAppProviderId = 'WAPI' | 'META' | 'EVOLUTION';

export interface WhatsAppProviderOption {
  provider: SupportedWhatsAppProviderId;
  label: string;
  description: string;
  available: boolean;
  configured?: boolean;
  phoneNumberId?: string | null;
  businessAccountId?: string | null;
  apiVersion?: string | null;
  webhookUrl?: string | null;
  verifyToken?: string | null;
  tokenConfigured?: boolean;
  appSecretConfigured?: boolean;
  capabilities: WhatsAppProviderCapabilities;
}

export class WhatsAppConnectionService {
  public constructor(
    private readonly resolver: WhatsAppProviderResolver,
    private readonly client: PrismaClient,
    private readonly cipher: CredentialsCipher | undefined,
  ) {}

  public async providers(tenantId: bigint): Promise<{ items: WhatsAppProviderOption[] }> {
    const [wapiConfig, metaConfig, evolutionConfig] = await Promise.all([
      this.providerConfig(tenantId, 'WAPI'),
      this.providerConfig(tenantId, 'META'),
      this.providerConfig(tenantId, 'EVOLUTION'),
    ]);
    const selected = await this.selectedProvider(tenantId);
    const enabled = await this.enabledProviders();
    const selectedConfig = selected === 'WAPI' ? wapiConfig : selected === 'META' ? metaConfig : evolutionConfig;
    return {
      items: [
        {
          provider: 'WAPI',
          label: 'API não oficial',
          description: 'Conexão por QR Code.',
          available: enabled.has('WAPI') || (selected === 'WAPI' && selectedConfig !== null),
          availableForNew: enabled.has('WAPI'),
          configured: wapiConfig !== null,
          capabilities: this.resolver.capabilities('WAPI'),
        },
        {
          provider: 'META',
          label: 'API Oficial',
          description: 'Meta Cloud API.',
          available: enabled.has('META') || (selected === 'META' && selectedConfig !== null),
          availableForNew: enabled.has('META'),
          configured: metaConfig !== null,
          phoneNumberId: metaConfig?.phoneNumberId ?? null,
          businessAccountId: metaConfig?.businessAccountId ?? null,
          apiVersion: metaConfig?.apiVersion ?? null,
          webhookUrl: metaConfig === null ? null : this.metaWebhookUrl(metaConfig.webhookPublicId),
          verifyToken: metaConfig?.encryptedVerifyToken == null ? null : this.decryptString(metaConfig.encryptedVerifyToken, 'verifyToken'),
          tokenConfigured: Boolean(metaConfig?.encryptedAccessToken?.trim()),
          appSecretConfigured: Boolean(metaConfig?.encryptedAppSecret?.trim()),
          capabilities: this.resolver.capabilities('META'),
        },
        {
          provider: 'EVOLUTION',
          label: 'Conexão por QR Code',
          description: 'Conecte o WhatsApp escaneando um QR Code.',
          available: enabled.has('EVOLUTION') || (selected === 'EVOLUTION' && selectedConfig !== null),
          availableForNew: enabled.has('EVOLUTION'),
          configured: evolutionConfig !== null,
          phoneNumberId: evolutionConfig?.phoneNumberId ?? null,
          capabilities: this.resolver.capabilities('EVOLUTION'),
        },
      ],
    };
  }

  private async enabledProviders(): Promise<Set<SupportedWhatsAppProviderId>> {
    const rows = await (this.client as any).platformWhatsAppProviderSetting?.findMany?.({ where: { enabled: true }, select: { provider: true, enabled: true, baseUrl: true, encryptedApiKey: true } }) ?? [];
    if (rows.length === 0) return new Set(['WAPI', 'META', 'EVOLUTION']);
    return new Set(rows.filter((row: { provider: string; enabled?: boolean; baseUrl?: string | null; encryptedApiKey?: string | null }) => row.enabled !== false && (row.provider === 'WAPI' || row.provider === 'META' || row.provider === 'EVOLUTION') && (row.provider !== 'EVOLUTION' || (row.baseUrl?.trim() !== '' && row.baseUrl != null && row.encryptedApiKey?.trim() !== '' && row.encryptedApiKey != null))).map((row: { provider: string }) => row.provider as SupportedWhatsAppProviderId));
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
      provider: 'WAPI' | 'META' | 'EVOLUTION';
      phoneNumberId?: string | undefined;
      businessAccountId?: string | undefined;
      accessToken?: string | undefined;
      appSecret?: string | undefined;
      apiVersion?: string | undefined;
    },
  ): Promise<{ provider: SupportedWhatsAppProviderId; capabilities: WhatsAppProviderCapabilities; connection: WhatsAppConnectionView }> {
    const enabled = await this.enabledProviders();
    const currentSelected = await this.selectedProvider(tenantId);
    const currentSelectedConfig = await this.providerConfig(tenantId, currentSelected);
    if (!enabled.has(input.provider) && (currentSelected !== input.provider || currentSelectedConfig === null)) {
      throw new AppError({ code: 'WHATSAPP_PROVIDER_DISABLED', message: 'Este provedor não está disponível para novos tenants.', statusCode: 409 });
    }
    const selectedProvider = await this.selectedProvider(tenantId);
    const current = currentSelectedConfig;
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

    if (input.provider === 'EVOLUTION') {
      await this.setSelectedProvider(tenantId, 'EVOLUTION');
      return { provider: 'EVOLUTION', capabilities: this.resolver.capabilities('EVOLUTION'), connection: await this.current(tenantId) };
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
    if (phoneNumberId !== undefined && typeof this.client.tenantWhatsAppConfig.findFirst === 'function') {
      const duplicate = await this.client.tenantWhatsAppConfig.findFirst({
        where: { provider: 'META', phoneNumberId, NOT: { tenantId } },
        select: { id: true, tenantId: true },
      });
      if (duplicate !== null && duplicate.tenantId !== tenantId) {
        throw new AppError({ code: 'WHATSAPP_INSTANCE_ALREADY_LINKED', message: 'Esta instância WhatsApp já está vinculada a outro contexto da plataforma.', statusCode: 409 });
      }
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
    return {
      provider: 'META',
      capabilities: this.resolver.capabilities('META'),
      connection: {
        provider: 'META',
        available: true,
        provisioned: true,
        state: (saved.connectionStatus as WhatsAppConnectionView['state']) ?? 'CREATED',
        phoneNumberId: saved.phoneNumberId,
        businessAccountId: saved.businessAccountId,
        apiVersion: saved.apiVersion,
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

  public async reconfigureWebhooks(tenantId: bigint): Promise<{ success: true }> {
    const provider = await this.resolver.provisioningForTenant(tenantId);
    if (provider.provider !== 'WAPI' || provider.reconfigureWebhooks === undefined) {
      throw new AppError({ code: 'WHATSAPP_PROVIDER_CAPABILITY_UNAVAILABLE', message: 'Reconfiguração de webhooks indisponível para este provedor.', statusCode: 400 });
    }
    return provider.reconfigureWebhooks(tenantId);
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
