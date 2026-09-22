import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { EVOLUTION_WHATSAPP_CAPABILITIES, type WhatsAppProvisioningProvider } from './whatsapp-provider.js';
import { type WhatsAppConnectionView } from './whatsapp-provisioning.service.js';
import { EvolutionWhatsAppClient } from './evolution-whatsapp-client.js';

export class EvolutionWhatsAppProvisioning implements WhatsAppProvisioningProvider {
  public readonly provider = 'EVOLUTION' as const;
  public readonly capabilities = EVOLUTION_WHATSAPP_CAPABILITIES;
  public constructor(private readonly client: PrismaClient, private readonly evolution: EvolutionWhatsAppClient, private readonly cipher?: CredentialsCipher) {}
  private config(tenantId: bigint) { return this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId_provider: { tenantId, provider: 'EVOLUTION' } } }); }
  private token(row: { encryptedAccessToken: string }) { if (!this.cipher) throw new AppError({ code: 'EVOLUTION_PROVIDER_UNAVAILABLE', message: 'A criptografia de credenciais não está configurada.', statusCode: 503 }); const value = this.cipher.decrypt(row.encryptedAccessToken).token; if (typeof value !== 'string' || value.trim() === '') throw new AppError({ code: 'EVOLUTION_PROVIDER_UNAVAILABLE', message: 'Token da instância Evolution ausente.', statusCode: 503 }); return value; }
  private view(row: any): WhatsAppConnectionView { return { provider: 'EVOLUTION', available: true, provisioned: row !== null, state: row?.connectionStatus ?? 'NOT_CREATED', phoneNumberId: row?.phoneNumberId ?? null, businessAccountId: null, apiVersion: null, connectedPhone: row?.connectedPhone ?? null, connectedName: row?.connectedName ?? null, connectedAt: row?.connectedAt?.toISOString() ?? null, lastStatusCheckAt: row?.lastStatusCheckAt?.toISOString() ?? null, legacy: false }; }
  public async current(tenantId: bigint) { return this.view(await this.config(tenantId)); }
  public async connect(tenantId: bigint) {
    const existing = await this.config(tenantId); if (existing) return this.view(existing);
    const tenant = await this.client.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    const name = `tenant-${tenantId.toString()}-${tenant?.slug ?? 'whatsapp'}`.slice(0, 120);
    if (!this.cipher) throw new AppError({ code: 'EVOLUTION_PROVIDER_UNAVAILABLE', message: 'A criptografia de credenciais não está configurada.', statusCode: 503 });
    const instanceToken = randomUUID();
    const created = await this.evolution.createInstance(name, instanceToken); const instanceId = created.instanceId ?? created.id ?? created.instanceName ?? created.name;
    if (!instanceId) throw new AppError({ code: 'EVOLUTION_PROVIDER_ERROR', message: 'A Evolution não retornou o identificador da instância.', statusCode: 502 });
    const row = await this.client.tenantWhatsAppConfig.create({ data: { publicId: randomUUID(), tenantId, provider: 'EVOLUTION', phoneNumberId: instanceId, instanceName: name, businessAccountId: 'evolution', encryptedAccessToken: this.cipher.encrypt({ token: instanceToken }), apiVersion: '0.7.2', connectionStatus: 'CREATED' } });
    return this.view(row);
  }
  public async qr(tenantId: bigint) { const row = await this.config(tenantId); if (!row) throw new AppError({ code: 'WHATSAPP_NOT_CONFIGURED', message: 'Crie a conexão antes de solicitar o QR Code.', statusCode: 400 }); const result = await this.evolution.qr(this.token(row)); const qrCode = result.qrCode ?? result.code ?? result.Qrcode ?? result.Code; if (!qrCode) throw new AppError({ code: 'EVOLUTION_PROVIDER_ERROR', message: 'A Evolution não retornou o QR Code.', statusCode: 502 }); return { qrCode: qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`, view: this.view(await this.client.tenantWhatsAppConfig.update({ where: { tenantId_provider: { tenantId, provider: 'EVOLUTION' } }, data: { connectionStatus: 'WAITING_QR' } })) }; }
  public async refreshStatus(tenantId: bigint) { const row = await this.config(tenantId); if (!row) return this.view(null); const result = await this.evolution.status(this.token(row)); const state = result.connected === true && result.loggedIn !== false ? 'CONNECTED' : String(result.status ?? result.state ?? '').toUpperCase().includes('CONNECT') ? 'CONNECTED' : 'DISCONNECTED'; return this.view(await this.client.tenantWhatsAppConfig.update({ where: { tenantId_provider: { tenantId, provider: 'EVOLUTION' } }, data: { active: state === 'CONNECTED', connectionStatus: state, lastStatusCheckAt: new Date(), ...(state === 'CONNECTED' && row.connectedAt === null ? { connectedAt: new Date() } : {}) } })); }
  public async disconnect(tenantId: bigint) { const row = await this.config(tenantId); if (row) { await this.evolution.disconnect(this.token(row)); await this.client.tenantWhatsAppConfig.update({ where: { tenantId_provider: { tenantId, provider: 'EVOLUTION' } }, data: { connectionStatus: 'DISCONNECTED', active: false } }); } return this.current(tenantId); }
  public async reconnect(tenantId: bigint) { const row = await this.config(tenantId); if (!row) throw new AppError({ code: 'WHATSAPP_NOT_CONFIGURED', message: 'Conexão Evolution não configurada.', statusCode: 400 }); const result = await this.evolution.reconnect(this.token(row)); const qrCode = result.qrCode ?? result.code ?? result.Qrcode ?? result.Code ?? ''; return { qrCode: qrCode.startsWith('data:') || qrCode === '' ? qrCode : `data:image/png;base64,${qrCode}`, view: this.view(row) }; }
}
