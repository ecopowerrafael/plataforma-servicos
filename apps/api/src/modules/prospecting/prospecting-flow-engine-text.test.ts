import { describe, expect, it, vi } from 'vitest';
import { ProspectingFlowEngine } from './prospecting-flow-engine.service.js';

function fixture(patternType: string, pattern: string) {
  const client: any = {
    prospectingFlowResponse: { create: vi.fn() },
    prospectingFlowExecution: { update: vi.fn() },
    prospectingFlowStep: { findUnique: vi.fn().mockResolvedValue({ id: 2n, flowId: 1n }) },
    prospectingLead: { update: vi.fn() },
  };
  const execution = { id: 1n, flowId: 1n, leadId: 7n, status: 'WAITING' };
  const step = {
    id: 3n,
    stepType: 'MESSAGE_OPTIONS',
    options: [{ id: 4n, publicId: 'option-1', position: 0, actionType: 'NEXT_STEP', nextStepId: 2n, patterns: [{ id: 5n, patternType, pattern, priority: 10 }] }],
  };
  return { client, execution, step };
}

describe('ProspectingFlowEngine - text option patterns', () => {
  it.each([
    ['EXACT', 'sim'],
    ['STARTS_WITH', 'sim'],
    ['ENDS_WITH', 'sim'],
    ['CONTAINS', 'sim'],
  ])('%s respeita normalização e avança o fluxo', async (patternType, pattern) => {
    const { client, execution, step } = fixture(patternType, pattern);
    const result = await new ProspectingFlowEngine(client).processStepResponse({
      execution,
      step,
      inboundMessage: { id: 8n, body: patternType === 'EXACT' ? '  SÍM  ' : patternType === 'STARTS_WITH' ? 'SÍM, posso continuar' : patternType === 'ENDS_WITH' ? 'respondo SÍM' : 'uma resposta SÍM agora' },
    });

    expect(result.executionAdvanced).toBe(true);
    expect(client.prospectingFlowResponse.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ matchedOptionId: 4n }) }));
    expect(client.prospectingFlowExecution.update).toHaveBeenCalled();
  });
});
