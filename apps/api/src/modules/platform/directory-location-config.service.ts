import { PrismaClient } from '../../database-client/client.js';

export class DirectoryLocationConfigService {
  private apiKeyBuffer: string | undefined;
  private source: 'DATABASE' | 'ENV' | 'NONE' = 'NONE';

  public constructor(
    private readonly client: PrismaClient,
    private readonly envGeoapifyApiKey?: string,
  ) {
    this.initialize();
  }

  private initialize() {
    if (this.envGeoapifyApiKey) {
      this.apiKeyBuffer = this.envGeoapifyApiKey;
      this.source = 'ENV';
    } else {
      this.source = 'NONE';
    }
  }

  public async loadFromDatabase() {
    const config = await this.client.directoryLocationConfig.findFirst({
      where: { id: 1 },
    });
    if (config?.geoapifyApiKeyEncrypted) {
      // TODO: Decrypt using existing encryption service
      this.apiKeyBuffer = config.geoapifyApiKeyEncrypted;
      this.source = 'DATABASE';
    } else if (this.envGeoapifyApiKey) {
      this.apiKeyBuffer = this.envGeoapifyApiKey;
      this.source = 'ENV';
    } else {
      this.apiKeyBuffer = undefined;
      this.source = 'NONE';
    }
  }

  public async getGeoapifyApiKey(): Promise<string | undefined> {
    // Always check DB first, fallback to ENV
    const config = await this.client.directoryLocationConfig.findFirst({
      where: { id: 1 },
    });
    if (config?.geoapifyApiKeyEncrypted) {
      // TODO: Decrypt
      return config.geoapifyApiKeyEncrypted;
    }
    return this.envGeoapifyApiKey;
  }

  public async saveGeoapifyApiKey(apiKey: string | null) {
    if (apiKey === null) {
      // Remove from database, keep ENV as fallback
      await this.client.directoryLocationConfig.updateMany(
        { data: { geoapifyApiKeyEncrypted: null } },
      );
      if (this.envGeoapifyApiKey) {
        this.apiKeyBuffer = this.envGeoapifyApiKey;
        this.source = 'ENV';
      } else {
        this.apiKeyBuffer = undefined;
        this.source = 'NONE';
      }
    } else {
      // TODO: Encrypt
      await this.client.directoryLocationConfig.upsert({
        where: { id: 1 },
        update: { geoapifyApiKeyEncrypted: apiKey },
        create: { id: 1, geoapifyApiKeyEncrypted: apiKey },
      });
      this.apiKeyBuffer = apiKey;
      this.source = 'DATABASE';
    }
  }

  public isConfigured(): boolean {
    return this.apiKeyBuffer !== undefined && this.apiKeyBuffer.length > 0;
  }

  public getMaskedKey(): string | null {
    if (!this.apiKeyBuffer) return null;
    const key = this.apiKeyBuffer;
    if (key.length < 8) return '••••••••';
    const visible = key.slice(-4);
    return '•'.repeat(Math.max(1, key.length - 4)) + visible;
  }

  public getSource(): 'DATABASE' | 'ENV' | 'NONE' {
    return this.source;
  }
}
