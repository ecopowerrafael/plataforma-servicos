import { describe, expect, it } from 'vitest';
import { validateFlowStepOptions } from './prospecting-flow-engine.service.js';

describe('Prospecting flow validation', () => {
  it('rejects NEXT_STEP without destination', () => {
    expect(validateFlowStepOptions({ stepType: 'MESSAGE_OPTIONS', message: 'menu', options: [{ actionType: 'NEXT_STEP', nextStepId: null }] })).toContain('Toda opção NEXT_STEP precisa de um destino.');
  });

  it('rejects more than three buttons', () => {
    const options = Array.from({ length: 4 }, () => ({ actionType: 'END', nextStepId: null }));
    expect(validateFlowStepOptions({ stepType: 'MESSAGE_OPTIONS', message: 'menu', options })).toContain('MESSAGE_OPTIONS suporta no máximo três botões.');
  });

  it('requires a final message for END', () => {
    expect(validateFlowStepOptions({ stepType: 'MESSAGE_OPTIONS', message: ' ', options: [{ actionType: 'END' }] })).toContain('Toda opção END precisa de uma mensagem final.');
  });
});
