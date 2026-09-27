import { describe, expect, it, vi } from 'vitest';

import { PaymentGatewayService } from './payment-gateway.service.js';
import { type DebtPixPaymentService } from '../../collections/debt-pix-payment.service.js';
import { type PrismaClient } from '../../../database-client/client.js';
import { type PaymentMethodService } from '../payment-method.service.js';
import { type PaymentService } from '../payment.service.js';

const activeConfig = (overrides: Record<string, unknown> = {}) => ({
  provider: 'pix-local',
  active: true,
  environment: 'SANDBOX',
  credentialsCiphertext: 'cipher-blob',
  ...overrides,
});

function mockAdapter(overrides: Record<string, unknown> = {}) {
  return {
    name: 'pix-local',
    createCharge: vi.fn().mockResolvedValue({ externalId: 'ext-1', status: 'PENDING', raw: {}, pixCopyPaste: 'copia-e-cola-xyz' }),
    getCharge: vi.fn(),
    verifyWebhookSignature: vi.fn().mockReturnValue(true),
    parseWebhookEvent: vi.fn(),
    ...overrides,
  };
}

function mockRegistry(providers: Record<string, ReturnType<typeof mockAdapter> | undefined>) {
  return { get: vi.fn((provider: string) => providers[provider]) } as unknown as import('./provider-registry.js').PaymentGatewayProviderRegistry;
}

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    debt: {
      findUnique: vi.fn().mockResolvedValue({ id: 1n, publicId: 'debt-public-id', currentBalanceCents: 5000n }),
    },
    paymentGatewayCharge: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 900n,
        publicId: 'charge-public-id',
        provider: 'pix-local',
        environment: 'SANDBOX',
        status: 'PENDING',
        pixCopyPaste: 'copia-e-cola-xyz',
      }),
    },
    paymentGatewayConfig: {
      findFirst: vi.fn().mockResolvedValue(activeConfig()),
      findMany: vi.fn().mockResolvedValue([{ provider: 'pix-local' }]),
    },
    paymentGatewayEvent: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    tenant: { findFirst: vi.fn() },
    ...overrides,
  } as unknown as PrismaClient;
}

function mockCipher() {
  return { decrypt: vi.fn().mockReturnValue({ pixKey: 'chave' }), encrypt: vi.fn() } as unknown as import('./credentials-cipher.js').CredentialsCipher;
}

function mockPaymentMethods() {
  return { list: vi.fn(), create: vi.fn() } as unknown as PaymentMethodService;
}

function mockPayments() {
  return { create: vi.fn() } as unknown as PaymentService;
}

function mockDebtPixPayments() {
  return { reconcile: vi.fn().mockResolvedValue(undefined) } as unknown as DebtPixPaymentService;
}

describe('PaymentGatewayService.createDebtCharge', () => {
  it('Debt inexistente retorna null', async () => {
    const client = mockClient({ debt: { findUnique: vi.fn().mockResolvedValue(null) } });
    const service = new PaymentGatewayService(client, mockRegistry({}), mockCipher(), mockPaymentMethods(), mockPayments());
    expect(await service.createDebtCharge(10n, 1n)).toBeNull();
  });

  it('saldo já zerado retorna null (sem chamar o provedor)', async () => {
    const adapter = mockAdapter();
    const client = mockClient({ debt: { findUnique: vi.fn().mockResolvedValue({ id: 1n, publicId: 'debt-public-id', currentBalanceCents: 0n }) } });
    const service = new PaymentGatewayService(client, mockRegistry({ 'pix-local': adapter }), mockCipher(), mockPaymentMethods(), mockPayments());
    expect(await service.createDebtCharge(10n, 1n)).toBeNull();
    expect(adapter.createCharge).not.toHaveBeenCalled();
  });

  it('reaproveita cobrança DEBT PENDING/PROCESSING já existente em vez de criar outra', async () => {
    const adapter = mockAdapter();
    const client = mockClient({
      paymentGatewayCharge: {
        findFirst: vi.fn().mockResolvedValue({ publicId: 'existing-charge', status: 'PENDING', pixCopyPaste: 'codigo-existente' }),
        create: vi.fn(),
      },
    });
    const service = new PaymentGatewayService(client, mockRegistry({ 'pix-local': adapter }), mockCipher(), mockPaymentMethods(), mockPayments());

    const result = await service.createDebtCharge(10n, 1n);

    expect(result).toEqual({ publicId: 'existing-charge', status: 'PENDING', pixCopyPaste: 'codigo-existente' });
    expect(adapter.createCharge).not.toHaveBeenCalled();
    expect(client.paymentGatewayCharge.create).not.toHaveBeenCalled();
  });

  it('sem nenhum provedor ativo configurado retorna null', async () => {
    const client = mockClient({ paymentGatewayConfig: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) } });
    const service = new PaymentGatewayService(client, mockRegistry({}), mockCipher(), mockPaymentMethods(), mockPayments());
    expect(await service.createDebtCharge(10n, 1n)).toBeNull();
  });

  it('prefere mercadopago quando os dois provedores estão ativos', async () => {
    const mpAdapter = mockAdapter({ name: 'mercadopago' });
    const localAdapter = mockAdapter({ name: 'pix-local' });
    const client = mockClient({
      paymentGatewayConfig: {
        findFirst: vi.fn().mockResolvedValue(activeConfig({ provider: 'mercadopago' })),
        findMany: vi.fn().mockResolvedValue([{ provider: 'pix-local' }, { provider: 'mercadopago' }]),
      },
    });
    const service = new PaymentGatewayService(
      client,
      mockRegistry({ mercadopago: mpAdapter, 'pix-local': localAdapter }),
      mockCipher(),
      mockPaymentMethods(),
      mockPayments(),
    );

    await service.createDebtCharge(10n, 1n);

    expect(mpAdapter.createCharge).toHaveBeenCalledOnce();
    expect(localAdapter.createCharge).not.toHaveBeenCalled();
  });

  it('cria a cobrança com originType DEBT e debtId, idempotencyKey nova a cada chamada', async () => {
    const adapter = mockAdapter();
    const client = mockClient();
    const service = new PaymentGatewayService(client, mockRegistry({ 'pix-local': adapter }), mockCipher(), mockPaymentMethods(), mockPayments());

    const result = await service.createDebtCharge(10n, 1n);

    expect(client.paymentGatewayCharge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ originType: 'DEBT', debtId: 1n, kind: 'PAYMENT', amountCents: 5000n }),
    });
    expect(result).toEqual({ publicId: 'charge-public-id', status: 'PENDING', pixCopyPaste: 'copia-e-cola-xyz' });

    await service.createDebtCharge(10n, 1n);
    const firstKey = (client.paymentGatewayCharge.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].data.idempotencyKey;
    const secondKey = (client.paymentGatewayCharge.create as ReturnType<typeof vi.fn>).mock.calls[1]?.[0].data.idempotencyKey;
    expect(firstKey).not.toBe(secondKey);
  });

  it('erro do adapter retorna null em vez de lançar (chamada automática, não uma rota HTTP)', async () => {
    const adapter = mockAdapter({ createCharge: vi.fn().mockRejectedValue(new Error('provedor fora do ar')) });
    const client = mockClient();
    const service = new PaymentGatewayService(client, mockRegistry({ 'pix-local': adapter }), mockCipher(), mockPaymentMethods(), mockPayments());

    expect(await service.createDebtCharge(10n, 1n)).toBeNull();
  });

  it('cobrança já paga na criação (raro, mas possível) delega a reconciliação para DebtPixPaymentService', async () => {
    const adapter = mockAdapter({
      createCharge: vi.fn().mockResolvedValue({ externalId: 'ext-1', status: 'PAID', raw: {}, pixCopyPaste: null }),
    });
    const client = mockClient({
      paymentGatewayCharge: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 900n, publicId: 'charge-public-id', originType: 'DEBT', status: 'PAID', pixCopyPaste: null }),
      },
    });
    const debtPixPayments = mockDebtPixPayments();
    const service = new PaymentGatewayService(client, mockRegistry({ 'pix-local': adapter }), mockCipher(), mockPaymentMethods(), mockPayments(), debtPixPayments);

    await service.createDebtCharge(10n, 1n);

    expect(debtPixPayments.reconcile).toHaveBeenCalledWith(900n);
  });
});

describe('PaymentGatewayService.handleWebhook — roteamento por originType', () => {
  it('cobrança originType=DEBT confirmada como PAID delega a DebtPixPaymentService.reconcile, não toca PaymentService', async () => {
    const adapter = mockAdapter({
      verifyWebhookSignature: vi.fn().mockReturnValue(true),
      parseWebhookEvent: vi.fn().mockReturnValue({ externalEventId: 'evt-1', externalId: 'ext-1', status: 'PAID', raw: {} }),
    });
    const client = mockClient({
      tenant: { findFirst: vi.fn().mockResolvedValue({ id: 10n }) },
      paymentGatewayConfig: { findFirst: vi.fn().mockResolvedValue(activeConfig()), findMany: vi.fn() },
      paymentGatewayEvent: { create: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue(null) },
      paymentGatewayCharge: {
        findFirst: vi.fn().mockResolvedValue({ id: 900n, originType: 'DEBT', paymentId: null }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: 900n, originType: 'DEBT', paymentId: null, status: 'PAID' }),
      },
    });
    const payments = mockPayments();
    const debtPixPayments = mockDebtPixPayments();
    const service = new PaymentGatewayService(client, mockRegistry({ 'pix-local': adapter }), mockCipher(), mockPaymentMethods(), payments, debtPixPayments);

    await service.handleWebhook('tenant-public-id', 'pix-local', '{"data":{"id":"ext-1"}}', {});

    expect(debtPixPayments.reconcile).toHaveBeenCalledWith(900n);
    expect(payments.create).not.toHaveBeenCalled();
  });
});
