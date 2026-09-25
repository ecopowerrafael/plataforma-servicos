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
  private webhookUrl(webhookPublicId: string | null) { if (!webhookPublicId) throw new AppError({ code: 'EVOLUTION_WEBHOOK_UNAVAILABLE', message: 'Webhook público da Evolution não configurado.', statusCode: 503 }); const base = process.env.APP_WEB_URL?.trim() || 'http://localhost:3000'; return `${base.replace(/\/$/u, '')}/public/webhooks/whatsapp/evolution/${webhookPublicId}`; }
  private config(tenantId: bigint) { return this.client.tenantWhatsAppConfig.findUnique({ where: { tenantId_provider: { tenantId, provider: 'EVOLUTION' } } }); }
  private token(row: { encryptedAccessToken: string }) { if (!this.cipher) throw new AppError({ code: 'EVOLUTION_PROVIDER_UNAVAILABLE', message: 'A criptografia de credenciais não está configurada.', statusCode: 503 }); const value = this.cipher.decrypt(row.encryptedAccessToken).token; if (typeof value !== 'string' || value.trim() === '') throw new AppError({ code: 'EVOLUTION_PROVIDER_UNAVAILABLE', message: 'Token da instância Evolution ausente.', statusCode: 503 }); return value; }
  private view(row: any): WhatsAppConnectionView { return { provider: 'EVOLUTION', available: true, provisioned: row !== null, state: row?.connectionStatus ?? 'NOT_CREATED', phoneNumberId: row?.phoneNumberId ?? null, businessAccountId: null, apiVersion: null, connectedPhone: row?.connectedPhone ?? null, connectedName: row?.connectedName ?? null, connectedAt: row?.connectedAt?.toISOString() ?? null, lastStatusCheckAt: row?.lastStatusCheckAt?.toISOString() ?? null, legacy: false }; }
  private async ensureInstanceSettings(row: { phoneNumberId: string; encryptedAccessToken: string }) {
    const token = this.token(row);
    const saved = await this.evolution.updateAdvancedSettings(row.phoneNumberId, token);
    const current = await this.evolution.getAdvancedSettings(row.phoneNumberId, token);
    const valid = current.readMessages === true && current.ignoreGroups === true && current.ignoreStatus === true && current.alwaysOnline === false && current.rejectCall === false;
    console.info('[EVOLUTION_INSTANCE_SETTINGS]', JSON.stringify({ readMessages: current.readMessages === true, ignoreGroups: current.ignoreGroups === true, ignoreStatus: current.ignoreStatus === true, alwaysOnline: current.alwaysOnline === true, rejectCall: current.rejectCall === true, persisted: valid, responseKeys: Object.keys(saved ?? {}).slice(0, 12) }));
    if (!valid) throw new AppError({ code: 'EVOLUTION_SETTINGS_NOT_PERSISTED', message: 'A Evolution não confirmou as configurações avançadas da instância.', statusCode: 502 });
  }
  private async ensureWebhookAndSettings(row: { phoneNumberId: string; webhookPublicId: string | null; encryptedAccessToken: string }) {
    const token = this.token(row);
    const webhookUrl = this.webhookUrl(row.webhookPublicId);
    const webhook = await this.evolution.connect(token, webhookUrl);
    const webhookConfirmed = webhook.webhookUrl === undefined || webhook.webhookUrl === webhookUrl;
    if (!webhookConfirmed) throw new AppError({ code: 'EVOLUTION_WEBHOOK_NOT_PERSISTED', message: 'A Evolution não confirmou a URL do webhook.', statusCode: 502 });
    await this.ensureInstanceSettings(row);
    console.info('[EVOLUTION_WEBHOOK_SETTINGS]', JSON.stringify({ message: true, all: false, presence: false, chatPresence: false, connection: false, readReceipt: false, historySync: false, call: false, qrcode: false, persisted: webhookConfirmed, responseKeys: Object.keys(webhook ?? {}).slice(0, 12) }));
  }
  public async current(tenantId: bigint) { return this.view(await this.config(tenantId)); }
  public async qrCode(tenantId: bigint) { return this.qr(tenantId); }
  public async connect(tenantId: bigint) {
    const existing = await this.config(tenantId); if (existing) return this.view(existing);
    const tenant = await this.client.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    const name = `tenant-${tenantId.toString()}-${tenant?.slug ?? 'whatsapp'}`.slice(0, 120);
    if (!this.cipher) throw new AppError({ code: 'EVOLUTION_PROVIDER_UNAVAILABLE', message: 'A criptografia de credenciais não está configurada.', statusCode: 503 });
    const instanceToken = randomUUID();
    const created = await this.evolution.createInstance(name, instanceToken); const instanceId = created.instanceId ?? created.id ?? created.instanceName ?? created.name;
    if (!instanceId) throw new AppError({ code: 'EVOLUTION_PROVIDER_ERROR', message: 'A Evolution não retornou o identificador da instância.', statusCode: 502 });
    const row = await this.client.tenantWhatsAppConfig.create({ data: { publicId: randomUUID(), webhookPublicId: randomUUID(), tenantId, provider: 'EVOLUTION', phoneNumberId: instanceId, instanceName: name, businessAccountId: 'evolution', encryptedAccessToken: this.cipher.encrypt({ token: instanceToken }), apiVersion: '0.7.2', connectionStatus: 'CREATED' } });
    await this.ensureInstanceSettings(row);
    return this.view(row);
  }
  public async qr(tenantId: bigint) { const row = await this.config(tenantId); if (!row) throw new AppError({ code: 'WHATSAPP_NOT_CONFIGURED', message: 'Crie a conexão antes de solicitar o QR Code.', statusCode: 400 }); const token = this.token(row); if (row.connectionStatus !== 'WAITING_QR') await this.ensureWebhookAndSettings(row); const result = await this.evolution.qr(token); const qrCode = result.qrCode ?? result.qrcode ?? result.code ?? result.Qrcode ?? result.Code; if (!qrCode) throw new AppError({ code: 'EVOLUTION_PROVIDER_ERROR', message: 'A Evolution não retornou o QR Code.', statusCode: 502 }); return { qrCode: qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`, view: this.view(await this.client.tenantWhatsAppConfig.update({ where: { tenantId_provider: { tenantId, provider: 'EVOLUTION' } }, data: { connectionStatus: 'WAITING_QR' } })) }; }
  public async refreshStatus(tenantId: bigint) { const row = await this.config(tenantId); if (!row) return this.view(null); const result = await this.evolution.status(this.token(row)); const rawState = String(result.status ?? result.state ?? '').trim().toUpperCase().replace(/[\s-]+/gu, '_'); const connectedFlag = result.connected ?? result.Connected; const loggedInFlag = result.loggedIn ?? result.LoggedIn; const connected = connectedFlag === true || (loggedInFlag === true && connectedFlag !== false) || ['OPEN', 'CONNECTED', 'ONLINE', 'LOGGED_IN', 'LOGGEDIN'].includes(rawState) || rawState.includes('CONNECTED'); const state = connected ? 'CONNECTED' : 'DISCONNECTED'; const jid = result.jid; const jidPhone = typeof jid === 'string' ? jid.split('@', 1)[0]?.replace(/\D/gu, '') : undefined; const connectedPhone = result.connectedPhone ?? result.phone ?? result.number ?? (jidPhone || undefined); const connectedName = result.connectedName ?? result.name ?? result.Name ?? result.pushName; return this.view(await this.client.tenantWhatsAppConfig.update({ where: { tenantId_provider: { tenantId, provider: 'EVOLUTION' } }, data: { active: connected, connectionStatus: state, lastStatusCheckAt: new Date(), ...(connected && row.connectedAt === null ? { connectedAt: new Date() } : {}), ...(connectedPhone !== undefined ? { connectedPhone } : {}), ...(connectedName !== undefined ? { connectedName } : {}) } })); }
  public async disconnect(tenantId: bigint) { const row = await this.config(tenantId); if (row) { await this.evolution.disconnect(this.token(row)); await this.client.tenantWhatsAppConfig.update({ where: { tenantId_provider: { tenantId, provider: 'EVOLUTION' } }, data: { connectionStatus: 'DISCONNECTED', active: false } }); } return this.current(tenantId); }
  public async reconnect(tenantId: bigint) { const row = await this.config(tenantId); if (!row) throw new AppError({ code: 'WHATSAPP_NOT_CONFIGURED', message: 'Conexão Evolution não configurada.', statusCode: 400 }); const token = this.token(row); await this.evolution.reconnect(token); await this.ensureWebhookAndSettings(row); const result = await this.evolution.qr(token); const qrCode = result.qrCode ?? result.qrcode ?? result.code ?? result.Qrcode ?? result.Code ?? ''; if (!qrCode) throw new AppError({ code: 'EVOLUTION_QR_UNAVAILABLE', message: 'A Evolution não disponibilizou um novo QR Code.', statusCode: 502 }); const saved = await this.client.tenantWhatsAppConfig.update({ where: { tenantId_provider: { tenantId, provider: 'EVOLUTION' } }, data: { connectionStatus: 'WAITING_QR', active: false } }); return { qrCode: qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`, view: this.view(saved) }; }
  public async reconfigureWebhooks(tenantId: bigint): Promise<{ success: true }> { const row = await this.config(tenantId); if (!row) throw new AppError({ code: 'WHATSAPP_NOT_CONFIGURED', message: 'Conexão Evolution não configurada.', statusCode: 400 }); await this.ensureWebhookAndSettings(row); return { success: true }; }
}
