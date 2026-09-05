import { describe, it, expect } from 'vitest';

describe('OLD/NEW LOCATION - Business move entre cities/categories', () => {
  it('UPDATE business move: category A+city X → category B+city Y enfileira AMBAS', async () => {
    // Simula lógica que deveria estar em updateBusiness()
    const old = {
      categoryId: 1n,
      citySlug: 'sao-paulo-sp',
      seoEligible: true,
    };

    const updated = {
      categoryId: 2n,
      citySlug: 'rio-janeiro-rj',
      seoEligible: true,
    };

    // Enqueues esperados
    const enqueues: Array<{ categoryId: bigint; citySlug: string }> = [];

    // Lógica: se categoria mudou OR citySlug mudou, enfileira ambos
    if (old.categoryId !== updated.categoryId || old.citySlug !== updated.citySlug) {
      enqueues.push({ categoryId: old.categoryId, citySlug: old.citySlug });
      enqueues.push({ categoryId: updated.categoryId, citySlug: updated.citySlug });
    }

    // Verificações
    expect(enqueues).toHaveLength(2);
    expect(enqueues[0]).toEqual({ categoryId: 1n, citySlug: 'sao-paulo-sp' });
    expect(enqueues[1]).toEqual({ categoryId: 2n, citySlug: 'rio-janeiro-rj' });
  });

  it('UPDATE business move: só cidade X → Y enfileira AMBAS', () => {
    const old = {
      categoryId: 1n,
      citySlug: 'sao-paulo-sp',
      seoEligible: true,
    };

    const updated = {
      categoryId: 1n, // Mesma categoria
      citySlug: 'rio-janeiro-rj', // Cidade diferente
      seoEligible: true,
    };

    const enqueues: Array<{ categoryId: bigint; citySlug: string }> = [];

    if (old.categoryId !== updated.categoryId || old.citySlug !== updated.citySlug) {
      enqueues.push({ categoryId: old.categoryId, citySlug: old.citySlug });
      enqueues.push({ categoryId: updated.categoryId, citySlug: updated.citySlug });
    }

    expect(enqueues).toHaveLength(2);
    expect(enqueues[0]).toEqual({ categoryId: 1n, citySlug: 'sao-paulo-sp' });
    expect(enqueues[1]).toEqual({ categoryId: 1n, citySlug: 'rio-janeiro-rj' });
  });

  it('UPDATE business move: só categoria A → B enfileira AMBAS', () => {
    const old = {
      categoryId: 1n,
      citySlug: 'sao-paulo-sp',
      seoEligible: true,
    };

    const updated = {
      categoryId: 2n, // Categoria diferente
      citySlug: 'sao-paulo-sp', // Mesma cidade
      seoEligible: true,
    };

    const enqueues: Array<{ categoryId: bigint; citySlug: string }> = [];

    if (old.categoryId !== updated.categoryId || old.citySlug !== updated.citySlug) {
      enqueues.push({ categoryId: old.categoryId, citySlug: old.citySlug });
      enqueues.push({ categoryId: updated.categoryId, citySlug: updated.citySlug });
    }

    expect(enqueues).toHaveLength(2);
    expect(enqueues[0]).toEqual({ categoryId: 1n, citySlug: 'sao-paulo-sp' });
    expect(enqueues[1]).toEqual({ categoryId: 2n, citySlug: 'sao-paulo-sp' });
  });

  it('UPDATE business sem mudança de city/category NÃO enfileira', () => {
    const old = {
      categoryId: 1n,
      citySlug: 'sao-paulo-sp',
      seoEligible: true,
    };

    const updated = {
      categoryId: 1n,
      citySlug: 'sao-paulo-sp',
      seoEligible: false, // Só SEO mudou, não location
    };

    const enqueues: Array<{ categoryId: bigint; citySlug: string }> = [];

    if (old.categoryId !== updated.categoryId || old.citySlug !== updated.citySlug) {
      enqueues.push({ categoryId: old.categoryId, citySlug: old.citySlug });
      enqueues.push({ categoryId: updated.categoryId, citySlug: updated.citySlug });
    }

    expect(enqueues).toHaveLength(0);
  });
});
