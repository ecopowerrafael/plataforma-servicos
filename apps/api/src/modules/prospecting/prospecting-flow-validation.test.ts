import { describe, expect, it } from 'vitest';
import { validateFlowGraph, validateFlowStepOptions } from './prospecting-flow-engine.service.js';

describe('Prospecting flow validation', () => {
  it('rejects NEXT_STEP without destination', () => {
    expect(validateFlowStepOptions({ stepType: 'MESSAGE_OPTIONS', message: 'menu', options: [{ actionType: 'NEXT_STEP', nextStepId: null }] })).toContain('Toda opção NEXT_STEP precisa de um destino.');
  });

  it('accepts six and ten WAPI buttons, but rejects the eleventh', () => {
    expect(validateFlowStepOptions({ stepType: 'MESSAGE_OPTIONS', message: 'menu', options: Array.from({ length: 6 }, () => ({ actionType: 'END' })) })).toEqual([]);
    expect(validateFlowStepOptions({ stepType: 'MESSAGE_OPTIONS', message: 'menu', options: Array.from({ length: 10 }, () => ({ actionType: 'END' })) })).toEqual([]);
    const options = Array.from({ length: 11 }, () => ({ actionType: 'END', nextStepId: null }));
    expect(validateFlowStepOptions({ stepType: 'MESSAGE_OPTIONS', message: 'menu', options })).toContain('MESSAGE_OPTIONS suporta no máximo 10 botões para WAPI.');
  });

  it('uses the Meta capability independently', () => {
    const options = Array.from({ length: 4 }, () => ({ actionType: 'END' }));
    expect(validateFlowStepOptions({ stepType: 'MESSAGE_OPTIONS', message: 'menu', options }, 'META')).toContain('MESSAGE_OPTIONS suporta no máximo 3 botões para META.');
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

  it('allows returning to the initial menu and cycles with END or MANUAL exits', () => {
    expect(validateFlowGraph([
      { id: 1n, isStart: true, stepType: 'MESSAGE_OPTIONS', options: [{ actionType: 'NEXT_STEP', nextStepId: 2n }] },
      { id: 2n, isStart: false, stepType: 'MESSAGE_OPTIONS', options: [{ actionType: 'NEXT_STEP', nextStepId: 1n }] },
    ])).not.toContain('Há ciclo no fluxo sem saída detectável.');
    expect(validateFlowGraph([
      { id: 1n, isStart: true, stepType: 'MESSAGE_OPTIONS', options: [{ actionType: 'NEXT_STEP', nextStepId: 2n }] },
      { id: 2n, isStart: false, stepType: 'MESSAGE_OPTIONS', options: [{ actionType: 'NEXT_STEP', nextStepId: 2n }, { actionType: 'END', nextStepId: null }] },
    ])).not.toContain('Há ciclo no fluxo sem saída detectável.');
  });

  it('rejects an options step without options and cross-flow destinations', () => {
    const errors = validateFlowGraph([
      { id: 1n, flowId: 10n, isStart: true, stepType: 'MESSAGE_OPTIONS', options: [{ actionType: 'NEXT_STEP', nextStepId: 2n }] },
      { id: 2n, flowId: 11n, isStart: false, stepType: 'MESSAGE_ONLY', options: [] },
      { id: 3n, flowId: 10n, isStart: false, stepType: 'MESSAGE_OPTIONS', options: [] },
    ]);
    expect(errors).toContain('A etapa 1 aponta para uma etapa inexistente ou de outro fluxo.');
    expect(errors).toContain('A etapa 3 MESSAGE_OPTIONS não possui opções.');
  });
});
