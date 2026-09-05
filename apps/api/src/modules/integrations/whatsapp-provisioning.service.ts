import { randomUUID } from 'node:crypto';

import {
  WApiMasterKeyMissingError,
  WApiProviderError,
  type WApiIntegrationService,
} from './wapi-integration.service.js';
import { whatsappWebhookPath } from './whatsapp-webhook.routes.js';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { PlanEntitlementService } from '../tenants/plan-entitlement.service.js';

/** Estados internos da conexão; o provedor só devolve conectado/não conectado. */
export type WhatsAppConnectionState =
  | 'NOT_CREATED'
  | 'CREATED'
  | 'WAITING_QR'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ERROR';

export interface WhatsAppConnectionView {
  available: boolean;
  provisioned: boolean;
  state: WhatsAppConnectionState;
  connectedPhone: string | null;
  connectedName: string | null;
  connectedAt: string | null;
  lastStatusCheckAt: string | null;
  /** Configuração anterior ao provisionamento automático. */
  legacy: boolean;
}

type ConfigRow = NonNullable<
  Awaited<ReturnType<PrismaClient['tenantWhatsAppConfig']['findUnique']>>
>;

function friendly(error: unknown): AppError {
  if (error instanceof WApiMasterKeyMissingError)
    return new AppError({
      code: 'WHATSAPP_PROVIDER_UNAVAILABLE',
      message: 'A conexão com o WhatsApp está indisponível no momento. Tente novamente mais tarde.',
      statusCode: 503,
    });
  if (error instanceof WApiProviderError)
    return new AppError({
      code: 'WHATSAPP_PROVIDER_ERROR',
      message: 'Não foi possível concluir a operação com o WhatsApp agora. Tente novamente.',
      statusCode: 502,
    });
  if (error instanceof AppError) return error;
  return new AppError({
    code: 'WHATSAPP_PROVIDER_ERROR',
    message: 'Não foi possível concluir a operação com o WhatsApp agora. Tente novamente.',
    statusCode: 502,
  });
}

/**
 * Provisionamento e conexão do WhatsApp do tenant. O tenant nunca informa
 * instanceId nem token: tudo é resolvido pela sessão autenticada, e o
 * segredo da instância é gravado cifrado com a mesma chave das demais
 * credenciais.
 */
export class WhatsAppProvisioningService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly provider: WApiIntegrationService,
    private readonly cipher: CredentialsCipher | undefined,
    private readonly appWebUrl = process.env.APP_WEB_URL ?? 'http://localhost:5173',
  ) {}

  private async assertFeature(tenantId: bigint) {
    await new PlanEntitlementService().assertFeatureEnabledForTenant(
      this.client,
      tenantId,
      'whatsapp.enabled',
    );
  }

  private config(tenantId: bigint) {
    return this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId } });
  }

  /** Credencial da instância do próprio tenant — nunca vinda do frontend. */
  private credentials(config: ConfigRow) {
    if (this.cipher === undefined)
      throw new AppError({
        code: 'WHATSAPP_PROVIDER_UNAVAILABLE',
        message: 'A conexão com o WhatsApp está indisponível no momento.',
        statusCode: 503,
      });
    const stored = this.cipher.decrypt(config.encryptedAccessToken);
    const token = stored.token ?? stored.accessToken;
    if (typeof token !== 'string' || token.trim() === '')
      throw new AppError({
        code: 'WHATSAPP_NOT_CONFIGURED',
        message: 'Conecte o WhatsApp para continuar.',
        statusCode: 400,
      });
    return { instanceId: config.phoneNumberId, token };
  }

  private view(config: ConfigRow | null, available: boolean): WhatsAppConnectionView {
    if (config === null)
      return {
        available,
        provisioned: false,
        state: 'NOT_CREATED',
        connectedPhone: null,
        connectedName: null,
        connectedAt: null,
        lastStatusCheckAt: null,
        legacy: false,
      };
    return {
      available,
      provisioned: true,
      state: (config.connectionStatus as WhatsAppConnectionState | null) ?? 'CREATED',
      connectedPhone: config.connectedPhone,
      connectedName: config.connectedName,
      connectedAt: config.connectedAt?.toISOString() ?? null,
      lastStatusCheckAt: config.lastStatusCheckAt?.toISOString() ?? null,
      // Instâncias anteriores ao provisionamento automático não têm nome.
      legacy: config.instanceName === null,
    };
  }

  public async current(tenantId: bigint): Promise<WhatsAppConnectionView> {
    const available = await new PlanEntitlementService().featureEnabledForTenant(
      this.client,
      tenantId,
      'whatsapp.enabled',
    );
    return this.view(await this.config(tenantId), available);
  }

  /**
   * Cria a instância do tenant, uma única vez. A trava por tenant impede que
   * dois cliques simultâneos criem duas instâncias; se já existir uma, nada é
   * criado e o estado atual é devolvido.
   */
  public async connect(tenantId: bigint): Promise<WhatsAppConnectionView> {
    await this.assertFeature(tenantId);
    const existing = await this.config(tenantId);
    if (existing !== null) return this.view(existing, true);
    const created = await this.withTenantLock(tenantId, async () => {
      const concurrent = await this.config(tenantId);
      if (concurrent !== null) return concurrent;
      if (this.cipher === undefined)
        throw new AppError({
          code: 'WHATSAPP_PROVIDER_UNAVAILABLE',
          message: 'A conexão com o WhatsApp está indisponível no momento.',
          statusCode: 503,
        });
      const tenant = await this.client.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true, displayName: true },
      });
      const instance = await this.provider.createInstance({
        instanceName: `agendei-${tenant?.slug ?? tenantId.toString()}`,
        webhookUrl: `${this.appWebUrl.replace(/\/+$/u, '')}${whatsappWebhookPath}`,
      });
      return this.client.tenantWhatsAppConfig.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          active: false,
          provider: 'WAPI',
          phoneNumberId: instance.instanceId,
          instanceName: instance.instanceName,
          businessAccountId: 'internal',
          encryptedAccessToken: this.cipher.encrypt({ token: instance.token }),
          apiVersion: 'v1',
          connectionStatus: 'CREATED',
        },
      });
    }).catch((error: unknown) => {
      throw friendly(error);
    });
    return this.view(created, true);
  }

  /**
   * QR da instância existente. Nunca cria instância nova: sem instância, o
   * tenant precisa passar por `connect` primeiro.
   */
  public async qrCode(tenantId: bigint): Promise<{ qrCode: string; view: WhatsAppConnectionView }> {
    await this.assertFeature(tenantId);
    const config = await this.requireConfig(tenantId);
    const { instanceId, token } = this.credentials(config);
    try {
      const qrCode = await this.provider.getQrCode(instanceId, token);
      const updated = await this.client.tenantWhatsAppConfig.update({
        where: { tenantId },
        data: { connectionStatus: 'WAITING_QR' },
      });
      // O QR é temporário: vai direto para a resposta, sem persistência.
      return { qrCode, view: this.view(updated, true) };
    } catch (error) {
      throw friendly(error);
    }
  }

  /** Consulta o provedor e persiste o estado real da conexão. */
  public async refreshStatus(tenantId: bigint): Promise<WhatsAppConnectionView> {
    await this.assertFeature(tenantId);
    const config = await this.requireConfig(tenantId);
    const { instanceId, token } = this.credentials(config);
    const now = new Date();
    try {
      const status = await this.provider.getInstanceStatus(instanceId, token);
      if (!status.connected) {
        const updated = await this.client.tenantWhatsAppConfig.update({
          where: { tenantId },
          data: {
            // Instância que nunca conectou continua apenas criada/aguardando.
            connectionStatus: config.connectedAt === null ? config.connectionStatus : 'DISCONNECTED',
            active: false,
            lastStatusCheckAt: now,
          },
        });
        return this.view(updated, true);
      }
      const device = await this.provider.getDevice(instanceId, token).catch(() => ({
        connectedPhone: null,
        name: null,
      }));
      const updated = await this.client.tenantWhatsAppConfig.update({
        where: { tenantId },
        data: {
          connectionStatus: 'CONNECTED',
          active: true,
          connectedPhone: device.connectedPhone,
          connectedName: device.name,
          connectedAt: config.connectedAt ?? now,
          lastStatusCheckAt: now,
          lastValidationStatus: 'CONNECTED',
          lastValidatedAt: now,
        },
      });
      return this.view(updated, true);
    } catch (error) {
      throw friendly(error);
    }
  }

  /**
   * Desconecta o aparelho. Mantém a instância, as credenciais e todo o
   * histórico (conversas, eventos, mensagens, agendamentos).
   */
  public async disconnect(tenantId: bigint): Promise<WhatsAppConnectionView> {
    await this.assertFeature(tenantId);
    const config = await this.requireConfig(tenantId);
    const { instanceId, token } = this.credentials(config);
    try {
      await this.provider.disconnect(instanceId, token);
    } catch (error) {
      // Já desconectado no provedor: o estado local ainda precisa refletir.
      if (!(error instanceof WApiProviderError)) throw friendly(error);
    }
    const updated = await this.client.tenantWhatsAppConfig.update({
      where: { tenantId },
      data: {
        connectionStatus: 'DISCONNECTED',
        active: false,
        lastStatusCheckAt: new Date(),
      },
    });
    return this.view(updated, true);
  }

  /** Reconecta reutilizando a mesma instância: só gera um novo QR. */
  public reconnect(tenantId: bigint) {
    return this.qrCode(tenantId);
  }

  private async requireConfig(tenantId: bigint) {
    const config = await this.config(tenantId);
    if (config === null)
      throw new AppError({
        code: 'WHATSAPP_NOT_PROVISIONED',
        message: 'Crie a conexão do WhatsApp antes de continuar.',
        statusCode: 400,
      });
    return config;
  }

  /** Mesma trava usada na agenda: serializa a criação por tenant. */
  private async withTenantLock<T>(tenantId: bigint, run: () => Promise<T>): Promise<T> {
    const lockName = `whatsapp-instance:${tenantId.toString()}`;
    const lock = await this.client.$queryRaw<{ acquired: number | bigint | null }[]>`
      SELECT GET_LOCK(${lockName}, 5) AS acquired
    `;
    if (lock[0]?.acquired !== 1 && lock[0]?.acquired !== 1n) return run();
    try {
      return await run();
    } finally {
      await this.client.$queryRaw`SELECT RELEASE_LOCK(${lockName})`;
    }
  }
}
