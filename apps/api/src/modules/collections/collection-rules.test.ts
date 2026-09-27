import { describe, expect, it } from 'vitest';

import { calculatePartialOffers, isPromiseValid } from './collection-rules.js';

describe('calculatePartialOffers', () => {
  it('calcula percentuais normais sobre o saldo', () => {
    const offers = calculatePartialOffers(50000n, [20, 50], 0n, 1n);
    expect(offers).toEqual([
      { percentage: 20, amountCents: 10000n },
      { percentage: 50, amountCents: 25000n },
    ]);
  });

  it('arredonda para o step configurado', () => {
    // 33% de 10000 = 3300, step de 500 -> arredonda para 3500
    const offers = calculatePartialOffers(10000n, [33], 0n, 500n);
    expect(offers).toEqual([{ percentage: 33, amountCents: 3500n }]);
  });

  it('arredonda para baixo quando mais próximo do step inferior', () => {
    // 31% de 10000 = 3100, step de 500 -> arredonda para 3000
    const offers = calculatePartialOffers(10000n, [31], 0n, 500n);
    expect(offers).toEqual([{ percentage: 31, amountCents: 3000n }]);
  });

  it('aplica o mínimo configurado quando o cálculo fica abaixo dele', () => {
    // 5% de 10000 = 500, mínimo de 2000 -> usa o mínimo
    const offers = calculatePartialOffers(10000n, [5], 2000n, 1n);
    expect(offers).toEqual([{ percentage: 5, amountCents: 2000n }]);
  });

  it('elimina ofertas duplicadas após arredondamento', () => {
    // 20% e 22% de 10000 com step 500 arredondam ambas para 2000
    const offers = calculatePartialOffers(10000n, [20, 22], 0n, 500n);
    expect(offers).toEqual([{ percentage: 20, amountCents: 2000n }]);
  });

  it('descarta oferta que iguala ou ultrapassa o saldo', () => {
    const offers = calculatePartialOffers(10000n, [100], 0n, 1n);
    expect(offers).toEqual([]);
  });

  it('descarta oferta quando o mínimo configurado ultrapassa o saldo', () => {
    const offers = calculatePartialOffers(1000n, [20], 5000n, 1n);
    expect(offers).toEqual([]);
  });
});

describe('isPromiseValid', () => {
  it('retorna ACTIVE quando a data prometida ainda não passou', () => {
    const promisedDate = new Date('2026-08-25T00:00:00');
    const now = new Date('2026-08-20T10:00:00');
    expect(isPromiseValid(promisedDate, now)).toBe('ACTIVE');
  });

  it('retorna ACTIVE até o fim do próprio dia prometido', () => {
    const promisedDate = new Date('2026-08-20T00:00:00');
    const now = new Date('2026-08-20T23:59:00');
    expect(isPromiseValid(promisedDate, now)).toBe('ACTIVE');
  });

  it('retorna OVERDUE no dia seguinte à data prometida', () => {
    const promisedDate = new Date('2026-08-20T00:00:00');
    const now = new Date('2026-08-21T00:00:01');
    expect(isPromiseValid(promisedDate, now)).toBe('OVERDUE');
  });
});
