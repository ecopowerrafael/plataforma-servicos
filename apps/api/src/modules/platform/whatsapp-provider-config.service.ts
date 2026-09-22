import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';
import { CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { EvolutionWhatsAppClient } from '../integrations/evolution-whatsapp-client.js';

const PROVIDERS = ['EVOLUTION', 'META', 'WAPI'] as const;
type Provider = typeof PROVIDERS[number];

export class WhatsAppProviderConfigService {
  public constructor(private readonly client: PrismaClient, private readonly cipher?: CredentialsCipher) {}
  private normalizeBaseUrl(value: string) {
    let parsed: URL;
    try { parsed = new URL(value.trim()); } catch { throw new Error('URL da Evolution inválida.'); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('URL da Evolution deve usar http ou https.');
    return parsed.toString().replace(/\/+$/u, '');
  }
  public async list() {
    const rows = await this.client.platformWhatsAppProviderSetting.findMany({ orderBy: { provider: 'asc' } });
    return { items: PROVIDERS.map((provider) => { const row = rows.find((item) => item.provider === provider); const baseUrl = provider === 'EVOLUTION' ? row?.baseUrl ?? null : null; const apiKeyConfigured = Boolean(row?.encryptedApiKey); return { provider, enabled: row?.enabled ?? (provider !== 'WAPI'), baseUrl, apiKeyConfigured, configured: provider !== 'EVOLUTION' || (baseUrl !== null && apiKeyConfigured), configurationStatus: provider === 'EVOLUTION' && (baseUrl === null || !apiKeyConfigured) ? 'INCOMPLETE' : 'READY', lastHealthStatus: row?.lastHealthStatus ?? null, lastHealthCheckAt: row?.lastHealthCheckAt?.toISOString() ?? null }; }) };
  }
  public async update(provider: Provider, input: { enabled: boolean; baseUrl?: string; apiKey?: string }) {
    if (provider === 'EVOLUTION' && input.apiKey !== undefined && !this.cipher) throw new Error('Criptografia de credenciais não configurada.');
    const current = await this.client.platformWhatsAppProviderSetting.findUnique({ where: { provider } });
    const baseUrl = input.baseUrl === undefined ? undefined : (input.baseUrl.trim() === '' ? null : this.normalizeBaseUrl(input.baseUrl));
    const newKey = input.apiKey?.trim();
    const row = await this.client.platformWhatsAppProviderSetting.upsert({ where: { provider }, create: { publicId: randomUUID(), provider, enabled: input.enabled, baseUrl: baseUrl ?? null, encryptedApiKey: newKey && this.cipher ? this.cipher.encrypt({ apiKey: newKey }) : null }, update: { enabled: input.enabled, ...(baseUrl === undefined ? {} : { baseUrl }), ...(newKey ? { encryptedApiKey: this.cipher!.encrypt({ apiKey: newKey }) } : {}) } });
    return { provider: row.provider, enabled: row.enabled, baseUrl: row.baseUrl, apiKeyConfigured: Boolean(row.encryptedApiKey), previousConfigured: Boolean(current?.encryptedApiKey) };
  }
  public async test(provider: Provider) {
    const row = await this.client.platformWhatsAppProviderSetting.findUnique({ where: { provider } });
    if (provider !== 'EVOLUTION' || !row?.baseUrl || !row.encryptedApiKey || !this.cipher) throw new Error('Evolution não configurada.');
    const secret = this.cipher.decrypt(row.encryptedApiKey).apiKey;
    try {
      await new EvolutionWhatsAppClient(row.baseUrl, String(secret)).listInstances();
      await this.client.platformWhatsAppProviderSetting.update({ where: { provider }, data: { lastHealthStatus: 'ONLINE', lastHealthCheckAt: new Date() } });
      return { provider, status: 'ONLINE' };
    } catch (error) {
      const status = error instanceof Error && /401|403|unauthorized|forbidden/iu.test(error.message) ? 'UNAUTHORIZED' : 'UNAVAILABLE';
      await this.client.platformWhatsAppProviderSetting.update({ where: { provider }, data: { lastHealthStatus: status, lastHealthCheckAt: new Date() } });
      return { provider, status };
    }
  }
}
