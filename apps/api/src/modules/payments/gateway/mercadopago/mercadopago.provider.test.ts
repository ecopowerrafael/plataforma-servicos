import { describe, expect, it, vi } from 'vitest';

import { MercadoPagoProviderAdapter } from './mercadopago.provider.js';

function adapterWith(body: Record<string, unknown>) {
  const http = {
    request: vi.fn().mockResolvedValue({ status: 200, body }),
  };
  return { adapter: new MercadoPagoProviderAdapter(http as never), http };
}

describe('MercadoPagoProviderAdapter financial reversals', () => {
  it('distingue refund total e preserva valor/data efetiva', async () => {
    const { adapter } = adapterWith({
      id: 123,
      status: 'refunded',
      transaction_amount: 100,
      transaction_amount_refunded: 100,
      date_last_updated: '2026-10-10T12:00:00.000Z',
    });

    const result = await adapter.getCharge({ accessToken: 'token' }, 'SANDBOX', '123');

    expect(result).toMatchObject({
      status: 'REFUNDED',
      financialReversalType: 'REFUND',
      reversalAmountCents: 10_000n,
      effectiveAt: new Date('2026-10-10T12:00:00.000Z'),
    });
  });

  it('distingue charged_back de refund', async () => {
    const { adapter } = adapterWith({
      id: 456,
      status: 'charged_back',
      transaction_amount: 100,
      transaction_amount_refunded: 100,
    });

    const result = await adapter.getCharge({ accessToken: 'token' }, 'SANDBOX', '456');

    expect(result.financialReversalType).toBe('CHARGEBACK');
    expect(result.reversalAmountCents).toBe(10_000n);
  });

  it('interpreta webhook sem status como PROCESSING para consulta autoritativa posterior', () => {
    const { adapter } = adapterWith({});

    const event = adapter.parseWebhookEvent(
      JSON.stringify({ id: 'evt-1', type: 'payment', data: { id: '123' } }),
    );

    expect(event).toMatchObject({
      externalEventId: 'evt-1',
      externalId: '123',
      status: 'PROCESSING',
    });
  });
});
