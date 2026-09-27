import { type PrismaClient } from '../../database-client/client.js';
import { CredentialsCipher } from '../payments/gateway/credentials-cipher.js';

export interface WapiMasterCredential {
  masterApiKey: string;
  source: 'database' | 'environment' | 'none';
}

export class WapiMasterCredentialProvider {
  public constructor(
    private readonly client: PrismaClient,
    private readonly envMasterApiKey: string | undefined,
    private readonly cipher: CredentialsCipher | undefined,
  ) {}

  async resolve(): Promise<WapiMasterCredential> {
    if (this.cipher === undefined)
      return { masterApiKey: '', source: 'none' };

    const config = await this.client.platformWapiConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (config !== null) {
      try {
        const decrypted = this.cipher.decrypt(config.masterApiKeyCiphertext);
        const masterApiKey = (decrypted as Record<string, unknown>)
          .masterApiKey as string | undefined;
        if (masterApiKey) return { masterApiKey, source: 'database' };
      } catch (e) {
        // fallthrough
      }
    }

    if (this.envMasterApiKey && this.envMasterApiKey.trim() !== '')
      return { masterApiKey: this.envMasterApiKey, source: 'environment' };

    return { masterApiKey: '', source: 'none' };
  }
}
