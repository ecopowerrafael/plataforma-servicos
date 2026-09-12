import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';

export interface ProspectingWhatsAppConfigData {
  instanceId: string;
  token: string;
  phoneNumber?: string | null | undefined;
  instanceName?: string | null | undefined;
  isActive?: boolean | undefined;
}

export interface ProspectingWhatsAppConfigResponse {
  publicId: string;
  instanceId: string;
  phoneNumber?: string;
  instanceName?: string;
  isActive: boolean;
  lastConnectionStatus?: string;
  lastCheckedAt?: string;
  tokenMasked: string;
  configured: boolean;
}

export class ProspectingWhatsAppConfigService {
  constructor(
    private readonly client: PrismaClient,
    private readonly cipher: CredentialsCipher,
  ) {}

  async getConfig(): Promise<ProspectingWhatsAppConfigResponse | null> {
    const config = await this.client.prospectingWhatsAppConfig.findFirst();
    if (!config) return null;
    return this.toResponse(config);
  }

  async updateConfig(data: ProspectingWhatsAppConfigData): Promise<ProspectingWhatsAppConfigResponse> {
    const tokenCiphertext = this.cipher.encrypt({ token: data.token });

    const config = await this.client.prospectingWhatsAppConfig.findFirst();

    if (!config) {
      const newConfig = await this.client.prospectingWhatsAppConfig.create({
        data: {
          publicId: randomUUID(),
          instanceId: data.instanceId,
          tokenCiphertext,
          phoneNumber: data.phoneNumber ?? null,
          instanceName: data.instanceName ?? null,
          isActive: data.isActive ?? true,
        },
      });
      return this.toResponse(newConfig);
    }

    const updated = await this.client.prospectingWhatsAppConfig.update({
      where: { id: config.id },
      data: {
        instanceId: data.instanceId,
        tokenCiphertext,
        phoneNumber: data.phoneNumber ?? config.phoneNumber,
        instanceName: data.instanceName ?? config.instanceName,
        isActive: data.isActive ?? config.isActive,
      },
    });

    return this.toResponse(updated);
  }

  async getDecryptedToken(): Promise<string | null> {
    const config = await this.client.prospectingWhatsAppConfig.findFirst({
      where: { isActive: true },
    });
    if (!config) return null;
    const decrypted = this.cipher.decrypt(config.tokenCiphertext) as { token: string };
    return decrypted.token;
  }

  async updateConnectionStatus(status: string, phoneNumber?: string, instanceName?: string): Promise<void> {
    const config = await this.client.prospectingWhatsAppConfig.findFirst();
    if (!config) return;

    await this.client.prospectingWhatsAppConfig.update({
      where: { id: config.id },
      data: {
        lastConnectionStatus: status,
        lastCheckedAt: new Date(),
        ...(phoneNumber && { phoneNumber }),
        ...(instanceName && { instanceName }),
      },
    });
  }

  private toResponse(config: {
    publicId: string;
    instanceId: string;
    phoneNumber: string | null;
    instanceName: string | null;
    isActive: boolean;
    lastConnectionStatus: string | null;
    lastCheckedAt: Date | null;
    tokenCiphertext: string;
  }): ProspectingWhatsAppConfigResponse {
    const result: ProspectingWhatsAppConfigResponse = {
      publicId: config.publicId,
      instanceId: config.instanceId,
      isActive: config.isActive,
      tokenMasked: this.maskToken(config.tokenCiphertext),
      configured: true,
    };

    if (config.phoneNumber) result.phoneNumber = config.phoneNumber;
    if (config.instanceName) result.instanceName = config.instanceName;
    if (config.lastConnectionStatus) result.lastConnectionStatus = config.lastConnectionStatus;
    if (config.lastCheckedAt) result.lastCheckedAt = config.lastCheckedAt.toISOString();

    return result;
  }

  private maskToken(ciphertext: string): string {
    if (ciphertext.length <= 8) return '•'.repeat(ciphertext.length);
    return '•'.repeat(ciphertext.length - 4) + ciphertext.slice(-4);
  }
}
