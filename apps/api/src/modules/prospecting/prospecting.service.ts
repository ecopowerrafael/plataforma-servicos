import { ProspectingRepository } from './prospecting.repository.js';
import { type PrismaClient } from '../../database-client/client.js';

export class ProspectingService {
  private repository: ProspectingRepository;

  public constructor(client: PrismaClient) {
    this.repository = new ProspectingRepository(client);
  }

  // Campaign management
  public async createCampaign(input: {
    name: string;
    categoryId?: bigint;
    state?: string;
    city?: string;
    dailyLimit?: number;
    sendingStartMinutes?: number;
    sendingEndMinutes?: number;
    minIntervalSeconds?: number;
    maxIntervalSeconds?: number;
    allowedWeekdays?: number[];
  }) {
    return this.repository.createCampaign(input);
  }

  public async getCampaign(publicId: string) {
    return this.repository.getCampaign(publicId);
  }

  public async listCampaigns() {
    return this.repository.listCampaigns();
  }

  public async updateCampaign(
    publicId: string,
    input: Record<string, unknown>,
  ) {
    return this.repository.updateCampaign(publicId, input);
  }

  public async startCampaign(publicId: string) {
    return this.repository.updateCampaign(publicId, {
      status: 'RUNNING',
      startedAt: new Date(),
    });
  }

  public async pauseCampaign(publicId: string) {
    return this.repository.updateCampaign(publicId, {
      status: 'PAUSED',
      pausedAt: new Date(),
    });
  }

  public async resumeCampaign(publicId: string) {
    return this.repository.updateCampaign(publicId, {
      status: 'RUNNING',
      pausedAt: null,
    });
  }

  public async completeCampaign(publicId: string) {
    return this.repository.updateCampaign(publicId, {
      status: 'COMPLETED',
      completedAt: new Date(),
    });
  }

  public async cancelCampaign(publicId: string) {
    return this.repository.updateCampaign(publicId, {
      status: 'CANCELED',
    });
  }

  // Lead materialization
  public async materializeLeads(
    campaignId: bigint,
    categoryId?: bigint,
    state?: string,
    city?: string,
  ) {
    return this.repository.materializeLeads(
      campaignId,
      categoryId,
      state,
      city,
    );
  }

  // Leads
  public async getLeads(campaignId: bigint, limit = 100) {
    return this.repository.getLeads(campaignId, limit);
  }

  public async getLead(publicId: string) {
    return this.repository.getLead(publicId);
  }

  public async updateLead(publicId: string, input: Record<string, unknown>) {
    return this.repository.updateLead(publicId, input);
  }

  // Suppressions
  public async addSuppression(
    campaignId: bigint,
    phone: string,
    reason: string,
  ) {
    const normalized = phone.replace(/\D/g, '');
    return this.repository.addSuppression(campaignId, normalized, reason);
  }
}
