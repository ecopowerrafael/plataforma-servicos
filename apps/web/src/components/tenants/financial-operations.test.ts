import { describe, expect, it } from 'vitest';

import { delinquencyDebtAction } from './financial-operations.js';

describe('delinquencyDebtAction', () => {
  it('11) sem Debt e sem permissão: nenhuma ação de cobrança', () => {
    expect(delinquencyDebtAction({ debtPublicId: null }, false)).toBe('none');
  });

  it('11) sem Debt e com permissão de gerenciar cobrança: oferece iniciar cobrança automática', () => {
    expect(delinquencyDebtAction({ debtPublicId: null }, true)).toBe('start_collection');
  });

  it('12) com Debt ativa: sempre "ver no Bot Cobra", nunca oferece iniciar de novo (não duplica)', () => {
    expect(delinquencyDebtAction({ debtPublicId: 'debt-uuid' }, true)).toBe('view_in_bot_cobra');
    // Mesmo sem permissão de gerenciar, quem já vê a pendência deve conseguir ver a dívida existente.
    expect(delinquencyDebtAction({ debtPublicId: 'debt-uuid' }, false)).toBe('view_in_bot_cobra');
  });
});
