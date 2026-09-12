import { readFileSync } from 'node:fs';

import {
  CashMovementPublicSchema,
  CashRegisterDetailResponseSchema,
  CreateCashMovementRequestSchema,
} from '@plataforma/shared';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./CashRegisterModule.tsx', import.meta.url), 'utf8');

/** Resposta real de POST /tenant/cash-registers/:id/movements (201). */
const createdMovement = {
  publicId: '00000000-0000-4000-8000-00000000000a',
  type: 'MANUAL',
  direction: 'OUT',
  amountCents: '3500',
  reason: 'Compra de material',
  paymentPublicId: null,
  createdAt: '2026-08-15T14:05:00.000Z',
  userEmail: 'rafael@exemplo.com',
  paymentMethodName: null,
  customerName: null,
  serviceName: null,
  appointmentPublicId: null,
};

describe('contrato de movimentação do caixa', () => {
  it('o corpo enviado tem apenas os campos que o endpoint aceita', () => {
    const body = CreateCashMovementRequestSchema.parse({
      direction: 'OUT',
      amountCents: 3500,
      reason: 'Compra de material',
    });
    expect(Object.keys(body).sort()).toEqual(['amountCents', 'direction', 'reason']);
    // O schema é estrito: nada de `register`/`movements` no corpo.
    expect(() =>
      CreateCashMovementRequestSchema.parse({
        direction: 'OUT',
        amountCents: 3500,
        reason: 'Compra de material',
        register: {},
      }),
    ).toThrow();
  });

  it('a resposta do POST é um movimento, não o detalhe do caixa', () => {
    expect(() => CashMovementPublicSchema.parse(createdMovement)).not.toThrow();
    // Era exatamente esta validação errada que produzia "expected object em register".
    expect(() => CashRegisterDetailResponseSchema.parse(createdMovement)).toThrow();
  });

  it('a mutation usa o schema do movimento e a tela se atualiza pelo refetch', () => {
    const mutation = source.slice(
      source.indexOf('const addMovement = useMutation'),
      source.indexOf('const close = useMutation'),
    );
    expect(mutation).toContain('schema: CashMovementPublicSchema');
    expect(mutation).not.toContain('CashRegisterDetailResponseSchema');
    expect(mutation).toContain('setMovementOpen(false)');
    expect(mutation).toContain('await invalidate()');
    // O detalhe do caixa continua sendo o schema da consulta, não da mutação.
    expect(source).toContain('schema: CashRegisterDetailResponseSchema.nullable()');
  });

  it('erro inesperado vira mensagem legível, sem despejar o Zod na tela', () => {
    expect(source).toContain("friendlyError(addMovement.error, 'Não foi possível registrar a movimentação.')");
    expect(source).toContain('error instanceof HttpError ? error.message');
  });
});
