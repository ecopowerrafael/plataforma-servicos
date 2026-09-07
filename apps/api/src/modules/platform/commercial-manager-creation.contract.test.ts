import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(new URL('./platform.commercial-routes.ts', import.meta.url), 'utf8');

describe('criação de gerente com território — contrato Prisma', () => {
  it('cria usuário, conta, região e cidades dentro de uma única transação', () => {
    expect(routeSource).toContain('options.prisma.$transaction(async (transaction) =>');
    expect(routeSource).toContain('transaction.user.create');
    expect(routeSource).toContain('new CommercialAccountService(transaction)');
    expect(routeSource).toContain('transaction.commercialRegion.create');
  });

  it('envia publicId somente para CommercialRegion, que possui esse campo', () => {
    const regionCreate = routeSource.slice(
      routeSource.indexOf('await transaction.commercialRegion.create'),
      routeSource.indexOf('return manager;', routeSource.indexOf('await transaction.commercialRegion.create')),
    );
    expect(regionCreate).toContain('publicId: randomUUID()');
    expect(regionCreate).not.toMatch(/create:\s*cities\.map[\s\S]*?publicId:/);
  });

  it('valida cidade antes de gravar e deixa a transação falhar integralmente', () => {
    const transaction = routeSource.slice(
      routeSource.indexOf('options.prisma.$transaction'),
      routeSource.indexOf('return reply.status(201)'),
    );
    expect(transaction).toContain('CITY_ALREADY_ASSIGNED');
    expect(transaction.indexOf('CITY_ALREADY_ASSIGNED')).toBeLessThan(
      transaction.indexOf('transactionAccountService.createManager'),
    );
  });
});
