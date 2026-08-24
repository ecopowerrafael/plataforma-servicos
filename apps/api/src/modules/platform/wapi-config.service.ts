import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';
import { CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { WapiIntegrationService } from '../integrations/wapi-integration.service.js';
import { WapiMasterCredentialProvider } from '../integrations/wapi-master-credential-provider.js';

export class WapiConfigService {
  private provider: WapiMasterCredentialProvider;

  public constructor(
    private readonly client: PrismaClient,
    private readonly cipher: CredentialsCipher | undefined,
    envMasterApiKey: string | undefined,
  ) {
    this.provider = new WapiMasterCredentialProvider(client, envMasterApiKey, cipher);
  }

  async getConfig() {
    const credential = await this.provider.resolve();
    const config = await this.client.platformWapiConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      configured: credential.source !== 'none',
      source: credential.source,
      active: config?.isActive ?? false,
      updatedAt: config?.updatedAt.toISOString(),
    };
  }

  async setConfig(masterApiKey: string) {
    if (!this.cipher) throw new Error('Encryption not configured');

    const ciphertext = this.cipher.encrypt({ masterApiKey });
    const existing = await this.client.platformWapiConfig.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      await this.client.platformWapiConfig.update({
        where: { id: existing.id },
        data: { masterApiKeyCiphertext: ciphertext, updatedAt: new Date() },
      });
    } else {
      await this.client.platformWapiConfig.create({
        data: {
          publicId: randomUUID(),
          masterApiKeyCiphertext: ciphertext,
          isActive: true,
        },
      });
    }

    return { configured: true, source: 'database' };
  }

  async testConfig() {
    const credential = await this.provider.resolve();
    if (credential.source === 'none') throw new Error('W-API not configured');

    const wapi = new WapiIntegrationService(
      credential.masterApiKey,
      'https://api.w-api.app',
    );

    if (!wapi.configured) throw new Error('W-API configuration invalid');

    return { valid: true, source: credential.source };
  }
}
