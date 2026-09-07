import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { WApiInboundNormalizer } from './whatsapp-inbound.js';
import { MetaInboundNormalizer } from './meta-whatsapp-inbound.js';
import { META_WHATSAPP_CAPABILITIES } from './meta-whatsapp-connection.js';
import {
  type WhatsAppDeliveryProvider,
  type WhatsAppInboundNormalizer,
  type WhatsAppProviderCapabilities,
  type WhatsAppProviderId,
  type WhatsAppProvisioningProvider,
  WAPI_WHATSAPP_CAPABILITIES,
} from './whatsapp-provider.js';

export class WhatsAppProviderNotSupportedError extends AppError {
  public constructor(provider: string) {
    super({
      code: 'WHATSAPP_PROVIDER_NOT_SUPPORTED',
      message: `Provider de WhatsApp nao suportado: ${provider}.`,
      statusCode: 400,
    });
  }
}

export class WhatsAppProviderResolver {
  private readonly wapiInbound = new WApiInboundNormalizer();
  private readonly providers: Record<
    string,
    {
      delivery: WhatsAppDeliveryProvider;
      provisioning: WhatsAppProvisioningProvider;
      inbound?: WhatsAppInboundNormalizer;
      capabilities?: WhatsAppProviderCapabilities;
    }
  >;

  public constructor(
    private readonly client: PrismaClient,
    wapi: {
      delivery: WhatsAppDeliveryProvider;
      provisioning: WhatsAppProvisioningProvider;
    },
    meta?: {
      delivery: WhatsAppDeliveryProvider;
      provisioning: WhatsAppProvisioningProvider;
    },
    additionalProviders: Record<
      string,
      {
        delivery: WhatsAppDeliveryProvider;
        provisioning: WhatsAppProvisioningProvider;
        inbound: WhatsAppInboundNormalizer;
        capabilities: WhatsAppProviderCapabilities;
      }
    > = {},
  ) {
    this.providers = {
      WAPI: {
        ...wapi,
        inbound: this.wapiInbound,
        capabilities: WAPI_WHATSAPP_CAPABILITIES,
      },
      ...(meta === undefined
        ? {}
        : {
            META: {
              ...meta,
              inbound: new MetaInboundNormalizer(),
              capabilities: META_WHATSAPP_CAPABILITIES,
            },
          }),
      ...additionalProviders,
    };
  }

  public async providerForTenant(tenantId: bigint): Promise<WhatsAppProviderId> {
    const settings = await this.client.tenantWhatsAppSettings?.findUnique({
      where: { tenantId },
      select: { selectedProvider: true },
    });
    if (settings != null) return settings.selectedProvider;
    const legacy = this.client.tenantWhatsAppConfig.findFirst === undefined
      ? await this.client.tenantWhatsAppConfig.findUnique?.({ where: { tenantId }, select: { provider: true } } as never)
      : await this.client.tenantWhatsAppConfig.findFirst({
      where: { tenantId },
      select: { provider: true },
      orderBy: { id: 'asc' },
    });
    return legacy?.provider ?? 'WAPI';
  }

  public async deliveryForTenant(tenantId: bigint): Promise<WhatsAppDeliveryProvider> {
    return this.delivery(await this.providerForTenant(tenantId));
  }

  public async provisioningForTenant(tenantId: bigint): Promise<WhatsAppProvisioningProvider> {
    return this.provisioning(await this.providerForTenant(tenantId));
  }

  public delivery(provider: WhatsAppProviderId): WhatsAppDeliveryProvider {
    const registered = this.providers[provider];
    if (registered !== undefined) return registered.delivery;
    throw new WhatsAppProviderNotSupportedError(provider);
  }

  public provisioning(provider: WhatsAppProviderId): WhatsAppProvisioningProvider {
    const registered = this.providers[provider];
    if (registered !== undefined) return registered.provisioning;
    throw new WhatsAppProviderNotSupportedError(provider);
  }

  public inbound(provider: WhatsAppProviderId): WhatsAppInboundNormalizer {
    const registered = this.providers[provider];
    if (registered?.inbound !== undefined) return registered.inbound;
    if (provider === 'META') return new MetaInboundNormalizer();
    throw new WhatsAppProviderNotSupportedError(provider);
  }

  public capabilities(provider: WhatsAppProviderId): WhatsAppProviderCapabilities {
    const registered = this.providers[provider];
    if (registered?.capabilities !== undefined) return registered.capabilities;
    if (provider === 'META') return META_WHATSAPP_CAPABILITIES;
    throw new WhatsAppProviderNotSupportedError(provider);
  }
}
