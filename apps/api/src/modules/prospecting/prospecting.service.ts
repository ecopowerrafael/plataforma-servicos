import { ProspectingRepository } from './prospecting.repository.js';
import { type PrismaClient } from '../../database-client/client.js';

export class ProspectingService {
  private repository: ProspectingRepository;
  public readonly client: PrismaClient;

  public constructor(client: PrismaClient) {
    this.client = client;
    this.repository = new ProspectingRepository(client);
  }

  // Campaign management
  public async createCampaign(input: any) {
    // Resolver flowPublicId → flowId se fornecido
    const campaignInput = { ...input };
    if (input.flowPublicId) {
      campaignInput.flowId = await this.resolveFlowId(input.flowPublicId);
      delete campaignInput.flowPublicId;
    } else if (input.flowPublicId === null) {
      campaignInput.flowId = null;
      delete campaignInput.flowPublicId;
    }
    return this.repository.createCampaign(campaignInput);
  }

  public async getCampaign(publicId: string) {
    return this.repository.getCampaign(publicId);
  }

  public async listCampaigns() {
    return this.repository.listCampaigns();
  }

  public async updateCampaign(publicId: string, input: any) {
    // Resolver flowPublicId → flowId se fornecido
    const updateInput = { ...input };
    if ('flowPublicId' in input) {
      if (input.flowPublicId) {
        updateInput.flowId = await this.resolveFlowId(input.flowPublicId);
      } else {
        updateInput.flowId = null;
      }
      delete updateInput.flowPublicId;
    }
    return this.repository.updateCampaign(publicId, updateInput);
  }

  private async resolveFlowId(flowPublicId: string | null | undefined): Promise<bigint | null> {
    if (!flowPublicId) return null;

    const flow = await this.client.prospectingFlow.findUnique({
      where: { publicId: flowPublicId },
      select: {
        id: true,
        isActive: true,
        steps: { where: { isStart: true }, select: { id: true } },
      },
    });

    if (!flow) throw new Error('FLOW_NOT_FOUND');
    if (!flow.isActive) throw new Error('FLOW_NOT_ACTIVE');
    if (flow.steps.length !== 1) throw new Error('FLOW_INVALID_START_STEPS');

    // Validar NEXT_STEP options
    const invalidOptions = await this.client.prospectingFlowOption.findMany({
      where: {
        step: { flowId: flow.id },
        actionType: 'NEXT_STEP',
        OR: [
          { nextStepId: null },
        ],
      },
    });

    if (invalidOptions.length > 0) throw new Error('FLOW_INVALID_NEXT_STEP');

    // Validar destinos pertencem ao mesmo flow
    const externalDestinations = await this.client.prospectingFlowOption.findMany({
      where: {
        step: { flowId: flow.id },
        actionType: 'NEXT_STEP',
        nextStep: { flowId: { not: flow.id } },
      },
    });

    if (externalDestinations.length > 0) throw new Error('FLOW_INVALID_DESTINATION_FLOW');

    return flow.id;
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
