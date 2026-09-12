import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';

export class ProspectingWhatsAppConfigRepository {
  constructor(private readonly client: PrismaClient) {}

  async getConfig() {
    return this.client.prospectingWhatsAppConfig.findFirst();
  }

  async getActiveConfig() {
    return this.client.prospectingWhatsAppConfig.findFirst({
      where: { isActive: true },
    });
  }

  async upsertConfig(data: {
    instanceId: string;
    tokenCiphertext: string;
    phoneNumber?: string | null;
    instanceName?: string | null;
    isActive?: boolean;
  }) {
    const existing = await this.client.prospectingWhatsAppConfig.findFirst();

    if (!existing) {
      return this.client.prospectingWhatsAppConfig.create({
        data: {
          publicId: randomUUID(),
          instanceId: data.instanceId,
          tokenCiphertext: data.tokenCiphertext,
          phoneNumber: data.phoneNumber ?? null,
          instanceName: data.instanceName ?? null,
          isActive: data.isActive ?? true,
        },
      });
    }

    return this.client.prospectingWhatsAppConfig.update({
      where: { id: existing.id },
      data: {
        instanceId: data.instanceId,
        tokenCiphertext: data.tokenCiphertext,
        ...(data.phoneNumber !== undefined && { phoneNumber: data.phoneNumber || null }),
        ...(data.instanceName !== undefined && { instanceName: data.instanceName || null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async updateConnectionStatus(status: string, phoneNumber?: string, instanceName?: string) {
    const config = await this.client.prospectingWhatsAppConfig.findFirst();
    if (!config) return null;

    return this.client.prospectingWhatsAppConfig.update({
      where: { id: config.id },
      data: {
        lastConnectionStatus: status,
        lastCheckedAt: new Date(),
        ...(phoneNumber && { phoneNumber }),
        ...(instanceName && { instanceName }),
      },
    });
  }
}
