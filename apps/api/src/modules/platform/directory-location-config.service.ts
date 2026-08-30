import { PrismaClient } from '../../database-client/client.js';

export class DirectoryLocationConfigService {
  public constructor(
    private readonly client: PrismaClient,
    private readonly envGeoapifyApiKey?: string,
  ) {}

  public async getGeoapifyApiKey(): Promise<string | undefined> {
    // Always check DB first, fallback to ENV
    const config = await this.client.directoryLocationConfig.findFirst({
      where: { id: 1 },
    });
    if (config?.geoapifyApiKeyEncrypted) {
      // TODO: Decrypt using existing encryption service
      return config.geoapifyApiKeyEncrypted;
    }
    return this.envGeoapifyApiKey;
  }

  public async getStatus(): Promise<{
    geoapifyConfigured: boolean;
    geoapifyMaskedKey: string | null;
    source: 'DATABASE' | 'ENV' | 'NONE';
  }> {
    const config = await this.client.directoryLocationConfig.findFirst({
      where: { id: 1 },
    });

    if (config?.geoapifyApiKeyEncrypted) {
      const key = config.geoapifyApiKeyEncrypted;
      return {
        geoapifyConfigured: true,
        geoapifyMaskedKey: this.maskKey(key),
        source: 'DATABASE',
      };
    }

    if (this.envGeoapifyApiKey) {
      return {
        geoapifyConfigured: true,
        geoapifyMaskedKey: this.maskKey(this.envGeoapifyApiKey),
        source: 'ENV',
      };
    }

    return {
      geoapifyConfigured: false,
      geoapifyMaskedKey: null,
      source: 'NONE',
    };
  }

  public async saveGeoapifyApiKey(apiKey: string | null): Promise<{
    geoapifyConfigured: boolean;
    geoapifyMaskedKey: string | null;
    source: 'DATABASE' | 'ENV' | 'NONE';
  }> {
    if (apiKey === null) {
      // Remove from database, fallback to ENV
      await this.client.directoryLocationConfig.updateMany({
        data: { geoapifyApiKeyEncrypted: null },
      });
    } else {
      // TODO: Encrypt before saving
      await this.client.directoryLocationConfig.upsert({
        where: { id: 1 },
        update: { geoapifyApiKeyEncrypted: apiKey },
        create: { id: 1, geoapifyApiKeyEncrypted: apiKey },
      });
    }

    return this.getStatus();
  }

  private maskKey(key: string): string {
    if (key.length < 8) return '••••••••';
    const visible = key.slice(-4);
    return '•'.repeat(Math.max(1, key.length - 4)) + visible;
  }
}
