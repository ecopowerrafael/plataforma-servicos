import { describe, expect, it } from 'vitest';

import {
  formatDueDate,
  formatMoneyCents,
  renderCollectionMessage,
} from './collection-attempt-templates.js';

describe('renderCollectionMessage', () => {
  it('substitui todos os placeholders conhecidos', () => {
    const message = renderCollectionMessage('collection.initial', {
      debtorName: 'Maria Silva',
      tenantName: 'Studio Bela',
      amount: 'R$ 50,00',
      dueDate: '01/09/2026',
    });
    expect(message).toBe(
      'Olá, Maria Silva. Identificamos um valor pendente de R$ 50,00 com Studio Bela, vencido em 01/09/2026. Podemos te ajudar a regularizar?',
    );
  });

  it('placeholder sem valor correspondente vira string vazia', () => {
    const message = renderCollectionMessage('collection.same_day_followup', {
      debtorName: 'Maria',
      tenantName: 'Studio Bela',
      amount: '',
      dueDate: '',
    });
    expect(message).toContain('valor de  com Studio Bela');
  });

  it('templateKey desconhecido retorna null', () => {
    expect(renderCollectionMessage('collection.unknown', {})).toBeNull();
  });

  it('cobre os 4 templateKeys que a Fase 3 produz', () => {
    for (const key of [
      'collection.initial',
      'collection.same_day_followup',
      'collection.next_day_followup',
      'collection.cycle_restart',
    ]) {
      expect(renderCollectionMessage(key, { debtorName: 'X', tenantName: 'Y', amount: 'Z', dueDate: 'W' })).not.toBeNull();
    }
  });

  it('cobre os templateKeys de promessa da Fase 5', () => {
    expect(
      renderCollectionMessage('collection.promise_due', { debtorName: 'Maria', tenantName: 'Studio Bela', amount: 'R$ 50,00', dueDate: '24/08/2026' }),
    ).toBe('Olá, Maria. Hoje é o dia combinado para regularizar o valor de R$ 50,00 com Studio Bela. Podemos contar com você?');

    expect(
      renderCollectionMessage('collection.promise_overdue', { debtorName: 'Maria', tenantName: 'Studio Bela', amount: 'R$ 50,00', dueDate: '' }),
    ).toBe('Olá, Maria. O valor combinado de R$ 50,00 com Studio Bela ainda não foi regularizado. Podemos te ajudar?');

    expect(renderCollectionMessage('collection.promise_confirmation', { dueDate: '27/08/2026' })).toBe(
      'Combinado! Vamos te lembrar em 27/08/2026.',
    );

    expect(renderCollectionMessage('collection.need_more_time_options', { debtorName: 'Maria' })).toBe(
      'Sem problema, Maria. Para quando você consegue pagar?',
    );
  });

  it('cobre os templateKeys de PIX da Fase 6', () => {
    expect(
      renderCollectionMessage('collection.pix_charge', { amount: 'R$ 50,00', tenantName: 'Studio Bela', pixCode: '00020126...copia-e-cola' }),
    ).toBe(
      'Aqui está o PIX para regularizar o valor de R$ 50,00 com Studio Bela. Copie o código abaixo e cole no app do seu banco:\n\n00020126...copia-e-cola',
    );

    expect(renderCollectionMessage('collection.debt_settled', { debtorName: 'Maria', tenantName: 'Studio Bela' })).toBe(
      'Recebemos seu pagamento, Maria! Sua dívida com Studio Bela está quitada. Obrigado!',
    );

    expect(
      renderCollectionMessage('collection.debt_already_settled', { debtorName: 'Maria', tenantName: 'Studio Bela' }),
    ).toBe('Olá, Maria. Já identificamos aqui que o valor com Studio Bela está regularizado — obrigado!');

    expect(renderCollectionMessage('collection.pix_unavailable', {})).toBe(
      'No momento não conseguimos gerar o PIX automaticamente. Nossa equipe vai entrar em contato para te ajudar.',
    );
  });
});

describe('formatMoneyCents', () => {
  it('formata centavos como moeda pt-BR', () => {
    expect(formatMoneyCents(5000n)).toBe('R$ 50,00');
  });

  it('formata valores com centavos fracionários', () => {
    expect(formatMoneyCents(123n)).toBe('R$ 1,23');
  });
});

describe('formatDueDate', () => {
  it('formata a data no timezone do tenant', () => {
    const formatted = formatDueDate(new Date('2026-09-01T00:00:00.000Z'), 'America/Sao_Paulo');
    expect(formatted).toBe('31/08/2026');
  });

  it('formata a data em UTC', () => {
    const formatted = formatDueDate(new Date('2026-09-01T00:00:00.000Z'), 'UTC');
    expect(formatted).toBe('01/09/2026');
  });
});
