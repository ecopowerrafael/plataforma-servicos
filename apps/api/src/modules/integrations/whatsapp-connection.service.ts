import { randomUUID } from 'node:crypto';

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

  public async selectProvider(
    tenantId: bigint,
    input: {
      provider: 'WAPI' | 'META';
      phoneNumberId?: string | undefined;
      businessAccountId?: string | undefined;
      accessToken?: string | undefined;
      apiVersion?: string | undefined;
    },
  ): Promise<{ provider: SupportedWhatsAppProviderId; capabilities: WhatsAppProviderCapabilities; connection: WhatsAppConnectionView }> {
    const current = await this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId } });
    if (
      current !== null &&
      current.provider !== input.provider &&
      (current.active || current.connectionStatus === 'CONNECTED')
    ) {
      throw new AppError({
        code: 'PROVIDER_SWITCH_REQUIRES_DISCONNECT',
        message: 'Desconecte o WhatsApp atual antes de trocar o metodo de conexao.',
        statusCode: 409,
      });
    }

    if (input.provider === 'WAPI') {
      if (current !== null && current.provider !== 'WAPI') {
        const saved = await this.client.tenantWhatsAppConfig.update({
          where: { tenantId },
          data: {
            active: false,
            provider: 'WAPI',
            businessAccountId: 'internal',
            apiVersion: 'v1',
            connectionStatus: 'NOT_CREATED',
            connectedPhone: null,
            connectedName: null,
            connectedAt: null,
            lastStatusCheckAt: new Date(),
          },
        });
        return {
          provider: 'WAPI',
          capabilities: this.resolver.capabilities('WAPI'),
          connection: {
            provider: 'WAPI',
            available: true,
            provisioned: false,
            state: (saved.connectionStatus as WhatsAppConnectionView['state']) ?? 'NOT_CREATED',
            connectedPhone: null,
            connectedName: null,
            connectedAt: null,
            lastStatusCheckAt: saved.lastStatusCheckAt?.toISOString() ?? null,
            legacy: false,
          },
        };
      }
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
    const apiVersion = input.apiVersion?.trim() ?? 'v23.0';
    if (
      (current === null || current.provider !== 'META') &&
      (phoneNumberId === undefined || businessAccountId === undefined || accessToken === undefined)
    ) {
      throw new AppError({
        code: 'META_WHATSAPP_CREDENTIALS_REQUIRED',
        message: 'Informe Phone Number ID, WhatsApp Business Account ID e Access Token.',
        statusCode: 400,
      });
    }

    const saved = await this.client.tenantWhatsAppConfig.upsert({
      where: { tenantId },
      create: {
        publicId: randomUUID(),
        tenantId,
        active: false,
        provider: 'META',
        phoneNumberId: phoneNumberId!,
        businessAccountId: businessAccountId!,
        encryptedAccessToken: this.cipher.encrypt({ accessToken }),
        apiVersion,
        connectionStatus: 'CREATED',
      },
      update: {
        active: false,
        provider: 'META',
        ...(phoneNumberId === undefined ? {} : { phoneNumberId }),
        ...(businessAccountId === undefined ? {} : { businessAccountId }),
        ...(accessToken === undefined ? {} : { encryptedAccessToken: this.cipher.encrypt({ accessToken }) }),
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
        connectedPhone: saved.connectedPhone,
        connectedName: saved.connectedName,
        connectedAt: saved.connectedAt?.toISOString() ?? null,
        lastStatusCheckAt: saved.lastStatusCheckAt?.toISOString() ?? null,
        legacy: false,
      },
    };
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
