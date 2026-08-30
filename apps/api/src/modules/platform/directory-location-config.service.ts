import { PrismaClient } from '../../database-client/client.js';
import { GeoapifyKeyCipher } from './geoapify-key-cipher.js';

export class DirectoryLocationConfigService {
  private readonly cipher: GeoapifyKeyCipher | undefined;

  public constructor(
    private readonly client: PrismaClient,
    private readonly envGeoapifyApiKey?: string,
    encryptionKey?: string,
  ) {
    this.cipher = encryptionKey ? new GeoapifyKeyCipher(encryptionKey) : undefined;
  }

  public async getGeoapifyApiKey(): Promise<string | undefined> {
    // Always check DB first, fallback to ENV
    const config = await this.client.directoryLocationConfig.findFirst({
      where: { id: 1 },
    });
    if (config?.geoapifyApiKeyEncrypted) {
      if (!this.cipher) return undefined;
      try {
        return this.cipher.decrypt(config.geoapifyApiKeyEncrypted);
      } catch {
        return undefined;
      }
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
      if (!this.cipher) {
        return {
          geoapifyConfigured: false,
          geoapifyMaskedKey: null,
          source: 'NONE',
        };
      }
      try {
        const decrypted = this.cipher.decrypt(config.geoapifyApiKeyEncrypted);
        return {
          geoapifyConfigured: true,
          geoapifyMaskedKey: this.maskKey(decrypted),
          source: 'DATABASE',
        };
      } catch {
        return {
          geoapifyConfigured: false,
          geoapifyMaskedKey: null,
          source: 'NONE',
        };
      }
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
      if (!this.cipher) {
        throw new Error('Encryption key not configured. Cannot save Geoapify API key.');
      }
      const encrypted = this.cipher.encrypt(apiKey);
      await this.client.directoryLocationConfig.upsert({
        where: { id: 1 },
        update: { geoapifyApiKeyEncrypted: encrypted },
        create: { id: 1, geoapifyApiKeyEncrypted: encrypted },
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
