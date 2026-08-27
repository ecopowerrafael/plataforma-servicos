import { randomUUID } from 'node:crypto';
import { type PrismaClient } from '../../database-client/client.js';
import type {
  ProspectingFlow,
  ProspectingFlowStep,
  ProspectingFlowOption,
  ProspectingFlowExecution,
} from '../../database-client/client.js';

export interface CreateFlowInput {
  name: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateFlowInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface CreateFlowStepInput {
  flowId: bigint;
  name: string;
  message: string;
  stepType: string;
  position: number;
  nextStepId?: bigint;
  isStart?: boolean;
}

export interface CreateFlowOptionInput {
  stepId: bigint;
  label: string;
  nextStepId?: bigint;
  actionType: string;
  position: number;
}

export interface CreateFlowOptionPatternInput {
  optionId: bigint;
  pattern: string;
  patternType: string;
  priority?: number;
}

export class ProspectingFlowService {
  constructor(private readonly client: PrismaClient) {}

  // Flow CRUD
  async createFlow(data: CreateFlowInput): Promise<ProspectingFlow> {
    return this.client.prospectingFlow.create({
      data: {
        publicId: randomUUID(),
        name: data.name,
        description: data.description ?? null,
        isActive: data.isActive ?? true,
      },
    });
  }

  async getFlow(publicId: string): Promise<ProspectingFlow | null> {
    return this.client.prospectingFlow.findUnique({
      where: { publicId },
    });
  }

  async listFlows(isActive?: boolean): Promise<ProspectingFlow[]> {
    const where = isActive !== undefined ? { isActive } : {};
    return this.client.prospectingFlow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateFlow(publicId: string, data: UpdateFlowInput): Promise<ProspectingFlow> {
    return this.client.prospectingFlow.update({
      where: { publicId },
      data,
    });
  }

  async deleteFlow(publicId: string): Promise<void> {
    await this.client.prospectingFlow.delete({
      where: { publicId },
    });
  }

  // Flow Step CRUD
  async createStep(data: CreateFlowStepInput): Promise<ProspectingFlowStep> {
    return this.client.prospectingFlowStep.create({
      data: {
        publicId: randomUUID(),
        flowId: data.flowId,
        name: data.name,
        message: data.message,
        stepType: data.stepType as any,
        position: data.position,
        nextStepId: data.nextStepId ?? null,
        isStart: data.isStart ?? false,
      },
    });
  }

  async getStep(publicId: string): Promise<ProspectingFlowStep | null> {
    return this.client.prospectingFlowStep.findUnique({
      where: { publicId },
      include: { options: { include: { patterns: true } } },
    });
  }

  async getFlowSteps(flowId: bigint): Promise<ProspectingFlowStep[]> {
    return this.client.prospectingFlowStep.findMany({
      where: { flowId },
      include: { options: { include: { patterns: true } } },
      orderBy: { position: 'asc' },
    });
  }

  async updateStep(
    publicId: string,
    data: Partial<CreateFlowStepInput>,
  ): Promise<ProspectingFlowStep> {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.message !== undefined) updateData.message = data.message;
    if (data.stepType !== undefined) updateData.stepType = data.stepType;
    if (data.position !== undefined) updateData.position = data.position;
    if (data.nextStepId !== undefined) updateData.nextStepId = data.nextStepId;
    if (data.isStart !== undefined) updateData.isStart = data.isStart;

    return this.client.prospectingFlowStep.update({
      where: { publicId },
      data: updateData,
    });
  }

  async deleteStep(publicId: string): Promise<void> {
    await this.client.prospectingFlowStep.delete({
      where: { publicId },
    });
  }

  // Flow Option CRUD
  async createOption(data: CreateFlowOptionInput): Promise<ProspectingFlowOption> {
    return this.client.prospectingFlowOption.create({
      data: {
        publicId: randomUUID(),
        stepId: data.stepId,
        label: data.label,
        nextStepId: data.nextStepId ?? null,
        actionType: data.actionType as any,
        position: data.position,
      },
    });
  }

  async getOption(publicId: string): Promise<ProspectingFlowOption | null> {
    return this.client.prospectingFlowOption.findUnique({
      where: { publicId },
      include: { patterns: true },
    });
  }

  async updateOption(
    publicId: string,
    data: Partial<CreateFlowOptionInput>,
  ): Promise<ProspectingFlowOption> {
    const updateData: any = {};
    if (data.label !== undefined) updateData.label = data.label;
    if (data.nextStepId !== undefined) updateData.nextStepId = data.nextStepId;
    if (data.actionType !== undefined) updateData.actionType = data.actionType;
    if (data.position !== undefined) updateData.position = data.position;

    return this.client.prospectingFlowOption.update({
      where: { publicId },
      data: updateData,
    });
  }

  async deleteOption(publicId: string): Promise<void> {
    await this.client.prospectingFlowOption.delete({
      where: { publicId },
    });
  }

  // Flow Option Pattern CRUD
  async createPattern(data: CreateFlowOptionPatternInput): Promise<any> {
    return this.client.prospectingFlowOptionPattern.create({
      data: {
        optionId: data.optionId,
        pattern: data.pattern,
        patternType: data.patternType,
        priority: data.priority ?? 0,
      },
    });
  }

  async deletePattern(patternId: bigint): Promise<void> {
    await this.client.prospectingFlowOptionPattern.delete({
      where: { id: patternId },
    });
  }

  // Flow Execution
  async startExecution(
    campaignId: bigint,
    leadId: bigint,
    flowId: bigint,
    currentStepId: bigint,
  ): Promise<ProspectingFlowExecution> {
    return this.client.prospectingFlowExecution.create({
      data: {
        publicId: randomUUID(),
        campaignId,
        leadId,
        flowId,
        currentStepId,
        status: 'ACTIVE',
      },
    });
  }

  async getExecution(publicId: string): Promise<ProspectingFlowExecution | null> {
    return this.client.prospectingFlowExecution.findUnique({
      where: { publicId },
    });
  }

  async getActiveExecution(
    campaignId: bigint,
    leadId: bigint,
  ): Promise<ProspectingFlowExecution | null> {
    return this.client.prospectingFlowExecution.findFirst({
      where: {
        campaignId,
        leadId,
        status: { in: ['ACTIVE', 'WAITING'] },
      },
    });
  }

  async updateExecutionStep(
    executionPublicId: string,
    currentStepId: bigint,
    status: string,
  ): Promise<ProspectingFlowExecution> {
    return this.client.prospectingFlowExecution.update({
      where: { publicId: executionPublicId },
      data: { currentStepId, status: status as any },
    });
  }

  async completeExecution(executionPublicId: string): Promise<ProspectingFlowExecution> {
    return this.client.prospectingFlowExecution.update({
      where: { publicId: executionPublicId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }
}
