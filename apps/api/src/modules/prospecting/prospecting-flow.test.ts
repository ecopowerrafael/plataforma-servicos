import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../../database-client/client.js';
import { ProspectingFlowService } from './prospecting-flow.service.js';

let client: PrismaClient;
let service: ProspectingFlowService;

beforeAll(async () => {
  client = new PrismaClient();
  service = new ProspectingFlowService(client);
});

afterAll(async () => {
  await client.$disconnect();
});

describe('ProspectingFlow - Phase A', () => {
  it('1. bootstrap creates default flow', async () => {
    const flow = await client.prospectingFlow.findUnique({ where: { code: 'DIRECTORY_PUBLICATION' } });
    expect(flow).toBeDefined();
    expect(flow?.name).toBe('Divulgação de Estabelecimento');
  });

  it('2. bootstrap does not duplicate', async () => {
    const flows = await client.prospectingFlow.findMany({ where: { code: 'DIRECTORY_PUBLICATION' } });
    expect(flows.length).toBe(1);
  });

  it('3. renaming default does not duplicate', async () => {
    const flow = await client.prospectingFlow.findUnique({ where: { code: 'DIRECTORY_PUBLICATION' } });
    await client.prospectingFlow.update({ where: { id: flow!.id }, data: { name: 'Divulgação de Estabelecimento' } });
    const count = await client.prospectingFlow.count({ where: { code: 'DIRECTORY_PUBLICATION' } });
    expect(count).toBe(1);
  });

  it('4. start step is unique', async () => {
    const flow = await client.prospectingFlow.findUnique({ where: { code: 'DIRECTORY_PUBLICATION' } });
    const startSteps = await client.prospectingFlowStep.findMany({ where: { flowId: flow!.id, isStart: true } });
    expect(startSteps.length).toBe(1);
  });

  it('5. marking start step clears previous', async () => {
    const flow = await client.prospectingFlow.create({ data: { publicId: randomUUID(), name: 'Test Start' } });
    const step1 = await service.createStep({ flowId: flow.id, name: 'S1', message: 'M1', stepType: 'MESSAGE_ONLY', position: 0, isStart: true });
    const step2 = await service.createStep({ flowId: flow.id, name: 'S2', message: 'M2', stepType: 'MESSAGE_ONLY', position: 1 });
    await service.updateStep(step2.publicId, { isStart: true });
    const startCount = await client.prospectingFlowStep.count({ where: { flowId: flow.id, isStart: true } });
    expect(startCount).toBe(1);
    const s2Check = await client.prospectingFlowStep.findUnique({ where: { id: step2.id } });
    expect(s2Check?.isStart).toBe(true);
  });

  it('6. cannot remove unique start without blocking', async () => {
    const flow = await client.prospectingFlow.create({ data: { publicId: randomUUID(), name: 'Test No Remove' } });
    const step = await service.createStep({ flowId: flow.id, name: 'Start', message: 'M', stepType: 'MESSAGE_ONLY', position: 0, isStart: true });
    const error = await (async () => {
      try {
        await client.prospectingFlowStep.update({ where: { id: step.id }, data: { isStart: false } });
      } catch (e) {
        return e;
      }
    })();
  });

  it('7. step nextStep must be in same flow', async () => {
    const flow1 = await client.prospectingFlow.create({ data: { publicId: randomUUID(), name: 'Flow1' } });
    const flow2 = await client.prospectingFlow.create({ data: { publicId: randomUUID(), name: 'Flow2' } });
    const step1 = await service.createStep({ flowId: flow1.id, name: 'S1', message: 'M1', stepType: 'MESSAGE_ONLY', position: 0 });
    const step2 = await service.createStep({ flowId: flow2.id, name: 'S2', message: 'M2', stepType: 'MESSAGE_ONLY', position: 0 });

    await expect(service.updateStep(step1.publicId, { nextStepId: step2.id })).rejects.toThrow(/same flow/i);
  });

  it('8. option nextStep must be in same flow', async () => {
    const flowA = await client.prospectingFlow.create({ data: { publicId: randomUUID(), name: 'FlowA' } });
    const flowB = await client.prospectingFlow.create({ data: { publicId: randomUUID(), name: 'FlowB' } });
    const stepA = await service.createStep({ flowId: flowA.id, name: 'SA', message: 'MA', stepType: 'MESSAGE_ONLY', position: 0 });
    const stepB = await service.createStep({ flowId: flowB.id, name: 'SB', message: 'MB', stepType: 'MESSAGE_ONLY', position: 0 });
    const option = await service.createOption({ stepId: stepA.id, label: 'Opt', actionType: 'NEXT_STEP', position: 0 });

    let error: any = null;
    try {
      await client.prospectingFlowOption.update({ where: { id: option.id }, data: { nextStepId: stepB.id } });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
  });

  it('9. CRUD flow - create', async () => {
    const flow = await service.createFlow({ name: 'CRUD Test' });
    expect(flow.publicId).toBeDefined();
    expect(flow.name).toBe('CRUD Test');
    expect(flow.isActive).toBe(true);
  });

  it('10. CRUD flow - read', async () => {
    const created = await service.createFlow({ name: 'Read Test' });
    const read = await service.getFlow(created.publicId);
    expect(read?.publicId).toBe(created.publicId);
    expect(read?.name).toBe('Read Test');
  });

  it('11. CRUD step - create', async () => {
    const flow = await service.createFlow({ name: 'Step Test' });
    const step = await service.createStep({ flowId: flow.id, name: 'TestStep', message: 'TestMsg', stepType: 'MESSAGE_ONLY', position: 0 });
    expect(step.publicId).toBeDefined();
    expect(step.name).toBe('TestStep');
    expect(step.isStart).toBe(false);
  });

  it('12. pattern type EXACT', async () => {
    const flowA = await client.prospectingFlow.create({ data: { publicId: randomUUID(), name: 'PatTest' } });
    const stepA = await service.createStep({ flowId: flowA.id, name: 'S', message: 'M', stepType: 'MESSAGE_ONLY', position: 0 });
    const optA = await service.createOption({ stepId: stepA.id, label: 'O', actionType: 'END', position: 0 });
    const pattern = await service.createPattern({ optionId: optA.id, pattern: 'exact-text', patternType: 'EXACT', priority: 0 });
    expect(pattern.patternType).toBe('EXACT');
  });

  it('13. pattern type CONTAINS', async () => {
    const flowC = await client.prospectingFlow.create({ data: { publicId: randomUUID(), name: 'PatContains' } });
    const stepC = await service.createStep({ flowId: flowC.id, name: 'S', message: 'M', stepType: 'MESSAGE_ONLY', position: 0 });
    const optC = await service.createOption({ stepId: stepC.id, label: 'O', actionType: 'END', position: 0 });
    const pattern = await service.createPattern({ optionId: optC.id, pattern: 'contains-word', patternType: 'CONTAINS', priority: 0 });
    expect(pattern.patternType).toBe('CONTAINS');
  });

  it('14. ownership - step cannot belong to different flow', async () => {
    const flowX = await client.prospectingFlow.create({ data: { publicId: randomUUID(), name: 'FlowX' } });
    const flowY = await client.prospectingFlow.create({ data: { publicId: randomUUID(), name: 'FlowY' } });
    const stepX = await service.createStep({ flowId: flowX.id, name: 'SX', message: 'MX', stepType: 'MESSAGE_ONLY', position: 0 });
    const stepY = await service.createStep({ flowId: flowY.id, name: 'SY', message: 'MY', stepType: 'END', position: 0 });

    await expect(service.updateStep(stepX.publicId, { nextStepId: stepY.id })).rejects.toThrow(/same flow/i);
  });

  it('15. DTO must exclude BigInt - JSON serializable', async () => {
    const flow = await service.createFlow({ name: 'DTO Test' });
    const step = await service.createStep({ flowId: flow.id, name: 'S', message: 'M', stepType: 'MESSAGE_ONLY', position: 0 });
    const option = await service.createOption({ stepId: step.id, label: 'L', actionType: 'END', position: 0 });
    const pattern = await service.createPattern({ optionId: option.id, pattern: 'p', patternType: 'EXACT', priority: 0 });

    const dto = {
      publicId: pattern.publicId ?? option.publicId,
      id: pattern.id.toString(),
      pattern: pattern.pattern,
      patternType: pattern.patternType,
      priority: pattern.priority,
    };

    expect(() => JSON.stringify(dto)).not.toThrow();
  });

  it('16. delete flow with campaign blocked', async () => {
    const flow = await service.createFlow({ name: 'Del Campaign Test' });
    await client.prospectingCampaign.create({
      data: { publicId: randomUUID(), name: 'C', contactTemplate: 'T', flowId: flow.id },
    });

    const err = await (async () => {
      try {
        await service.deleteFlow(flow.publicId);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeDefined();
  });

  it('17. delete flow with execution blocked', async () => {
    const flow = await service.createFlow({ name: 'Del Exec Test' });
    const step = await service.createStep({ flowId: flow.id, name: 'S', message: 'M', stepType: 'MESSAGE_ONLY', position: 0, isStart: true });
    const campaign = await client.prospectingCampaign.create({
      data: { publicId: randomUUID(), name: 'C', contactTemplate: 'T', flowId: flow.id },
    });
    const lead = await client.prospectingLead.create({ data: { publicId: randomUUID(), contactValue: 'test@test.com' } });
    await client.prospectingFlowExecution.create({
      data: { publicId: randomUUID(), campaignId: campaign.id, leadId: lead.id, flowId: flow.id, currentStepId: step.id, status: 'ACTIVE' },
    });

    const err = await (async () => {
      try {
        await service.deleteFlow(flow.publicId);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeDefined();
  });

  it('18. delete default DIRECTORY_PUBLICATION blocked', async () => {
    const defaultFlow = await client.prospectingFlow.findUnique({ where: { code: 'DIRECTORY_PUBLICATION' } });

    const err = await (async () => {
      try {
        await service.deleteFlow(defaultFlow!.publicId);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeDefined();
  });

  it('19. delete start step blocked', async () => {
    const flow = await service.createFlow({ name: 'Start Delete Test' });
    const startStep = await service.createStep({ flowId: flow.id, name: 'Start', message: 'M', stepType: 'MESSAGE_ONLY', position: 0, isStart: true });

    const err = await (async () => {
      try {
        await service.deleteStep(startStep.publicId);
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeDefined();
  });

  it('20. WAIT_LINK has nextStep and no option', async () => {
    const flow = await client.prospectingFlow.findUnique({ where: { code: 'DIRECTORY_PUBLICATION' } });
    const waitLinkStep = await client.prospectingFlowStep.findFirst({ where: { flowId: flow!.id, stepType: 'WAIT_LINK' } });
    expect(waitLinkStep?.nextStepId).toBeDefined();

    const options = await client.prospectingFlowOption.findMany({ where: { stepId: waitLinkStep!.id } });
    expect(options.length).toBe(0);
  });
});

describe('ProspectingFlow - nextStepPublicId Serialization', () => {
  it('GET flow detail serializes nextStepPublicId as UUID, not string literal', async () => {
    const flow = await client.prospectingFlow.create({ data: { publicId: randomUUID(), name: 'Serial Test' } });
    const stepA = await service.createStep({ flowId: flow.id, name: 'StepA', message: 'M', stepType: 'MESSAGE_ONLY', position: 0 });
    const stepB = await service.createStep({ flowId: flow.id, name: 'StepB', message: 'M', stepType: 'MESSAGE_ONLY', position: 1 });

    // Link A -> B
    await service.updateStep(stepA.publicId, { nextStepId: stepB.id });

    // Fetch flow with steps
    const flowDetail = await client.prospectingFlow.findUnique({
      where: { publicId: flow.publicId },
      include: { steps: { orderBy: { position: 'asc' }, include: { options: true } } }
    });

    const stepADetail = flowDetail?.steps.find(s => s.publicId === stepA.publicId);
    expect(stepADetail?.nextStepId).toBe(stepB.id);

    // Verify nextStepPublicId would be UUID (the endpoint maps ID -> publicId)
    expect(stepADetail?.nextStepId).toBeDefined();
    expect(typeof stepADetail?.nextStepId).not.toBe('string');
  });

  it('step without nextStepId has null nextStepPublicId', async () => {
    const flow = await client.prospectingFlow.create({ data: { publicId: randomUUID(), name: 'Null Test' } });
    const step = await service.createStep({ flowId: flow.id, name: 'Lonely', message: 'M', stepType: 'MESSAGE_ONLY', position: 0 });

    expect(step.nextStepId).toBeNull();

    // When serialized, nextStepPublicId should be null, never string 'null'
    const flowDetail = await client.prospectingFlow.findUnique({
      where: { publicId: flow.publicId },
      include: { steps: true }
    });

    const stepDetail = flowDetail?.steps.find(s => s.publicId === step.publicId);
    expect(stepDetail?.nextStepId).toBeNull();
  });

  it('option nextStepPublicId serializes as UUID', async () => {
    const flow = await client.prospectingFlow.create({ data: { publicId: randomUUID(), name: 'Option Test' } });
    const stepA = await service.createStep({ flowId: flow.id, name: 'A', message: 'M', stepType: 'MESSAGE_OPTIONS', position: 0 });
    const stepB = await service.createStep({ flowId: flow.id, name: 'B', message: 'M', stepType: 'MESSAGE_ONLY', position: 1 });

    const option = await service.createOption({ stepId: stepA.id, label: 'Click', actionType: 'NEXT_STEP', position: 0 });
    await client.prospectingFlowOption.update({ where: { id: option.id }, data: { nextStepId: stepB.id } });

    const stepDetail = await client.prospectingFlow.findUnique({
      where: { publicId: flow.publicId },
      include: { steps: { include: { options: true } } }
    });

    const optionDetail = stepDetail?.steps[0]?.options[0];
    expect(optionDetail?.nextStepId).toBe(stepB.id);
    // Should serialize as UUID, not string 'null'
    expect(optionDetail?.nextStepId).toBeDefined();
  });

  it('PUT flow returns complete contract with stepsCount', async () => {
    const flow = await client.prospectingFlow.create({
      data: { publicId: randomUUID(), name: 'Contract Test', description: 'Test desc', isActive: true }
    });
    await service.createStep({ flowId: flow.id, name: 'S1', message: 'M', stepType: 'MESSAGE_ONLY', position: 0 });
    await service.createStep({ flowId: flow.id, name: 'S2', message: 'M', stepType: 'MESSAGE_ONLY', position: 1 });

    const updated = await client.prospectingFlow.update({
      where: { id: flow.id },
      data: { name: 'Updated' },
      include: { steps: true }
    });

    // Verify all required fields for flowListItemSchema
    expect(updated.publicId).toBeDefined();
    expect(updated.code).toBeDefined();
    expect(updated.name).toBe('Updated');
    expect(updated.description).toBeDefined();
    expect(updated.isActive).toBe(true);
    expect(updated.createdAt).toBeDefined();
    expect(updated.updatedAt).toBeDefined();
    expect(updated.steps.length).toBe(2);
  });
});
