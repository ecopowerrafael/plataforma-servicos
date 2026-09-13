import { describe, expect, it } from 'vitest';
import { validateFlowGraph, validateFlowStepOptions } from './prospecting-flow-engine.service.js';

describe('Prospecting flow validation', () => {
  it('rejects NEXT_STEP without destination', () => {
    expect(validateFlowStepOptions({ stepType: 'MESSAGE_OPTIONS', message: 'menu', options: [{ actionType: 'NEXT_STEP', nextStepId: null }] })).toContain('Toda opção NEXT_STEP precisa de um destino.');
  });

  it('rejects more than three buttons', () => {
    const options = Array.from({ length: 11 }, () => ({ actionType: 'END', nextStepId: null }));
    expect(validateFlowStepOptions({ stepType: 'MESSAGE_OPTIONS', message: 'menu', options })).toContain('MESSAGE_OPTIONS suporta no máximo 10 botões para WAPI.');
  });

  it('requires a final message for END', () => {
    expect(validateFlowStepOptions({ stepType: 'MESSAGE_OPTIONS', message: ' ', options: [{ actionType: 'END' }] })).toContain('Toda opção END precisa de uma mensagem final.');
  });

  it('detects inaccessible steps and cycles', () => {
    const errors = validateFlowGraph([
      { id: 1n, isStart: true, stepType: 'MESSAGE_OPTIONS', options: [{ actionType: 'NEXT_STEP', nextStepId: 2n }] },
      { id: 2n, isStart: false, stepType: 'MESSAGE_OPTIONS', options: [{ actionType: 'NEXT_STEP', nextStepId: 2n }] },
      { id: 3n, isStart: false, stepType: 'END', options: [] },
    ]);
    expect(errors).toContain('Há etapas inacessíveis a partir da etapa inicial.');
    expect(errors).toContain('Há ciclo no fluxo sem saída detectável.');
  });
});
