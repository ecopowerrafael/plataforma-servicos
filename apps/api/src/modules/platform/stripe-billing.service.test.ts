import { describe, expect, it, vi } from 'vitest';
import { StripeBillingService } from './stripe-billing.service.js';

describe('StripeBillingService', () => {
  it('rejeita checkout para plano inexistente', async () => {
    const client = { commercialPlan: { findUnique: vi.fn().mockResolvedValue(null) } } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    await expect(service.checkout(1n, '00000000-0000-4000-8000-000000000001', 'MONTHLY', 'owner@example.com')).rejects.toMatchObject({ code: 'PLAN_NOT_FOUND' });
  });

  it('rejeita webhook sem assinatura válida', () => {
    const client = {} as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    expect(() => service.constructEvent('{}', 't=1,v1=invalid')).toThrow();
  });

  it('retorna duplicado sem reaplicar evento persistido', async () => {
    const client = { stripeWebhookEvent: { create: vi.fn().mockRejectedValue(new Error('unique')), findUnique: vi.fn().mockResolvedValue({ processingStatus: 'PROCESSED' }), update: vi.fn() } } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service, 'constructEvent').mockReturnValue({ id: 'evt_duplicate', type: 'invoice.paid', data: { object: {} } } as any);
    await expect(service.handleWebhook('{}', 'signature')).resolves.toEqual({ received: true, duplicate: true });
    expect(client.stripeWebhookEvent.update).not.toHaveBeenCalled();
  });

  it('reutiliza Customer Stripe existente ao abrir checkout', async () => {
    const client = {
      commercialPlan: { findUnique: vi.fn().mockResolvedValue({ id: 9n, status: 'ACTIVE', billingOptions: [{ id: 3n, billingCycle: 'MONTHLY', active: true, stripePriceId: 'price_test' }] }) },
      tenantSubscription: { findFirst: vi.fn().mockResolvedValue({ id: 7n, stripeCustomerId: 'cus_existing', stripeSubscriptionId: null, status: 'CANCELED' }), update: vi.fn() },
    } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service.stripe.checkout.sessions, 'create').mockResolvedValue({ url: 'https://checkout.stripe.test/session' } as any);
    vi.spyOn(service.stripe.customers, 'create');
    await expect(service.checkout(1n, '00000000-0000-4000-8000-000000000001', 'MONTHLY', 'owner@example.com')).resolves.toEqual({ url: 'https://checkout.stripe.test/session' });
    expect(service.stripe.customers.create).not.toHaveBeenCalled();
  });

  it('recusa Customer Portal sem Customer Stripe', async () => {
    const client = { tenantSubscription: { findFirst: vi.fn().mockResolvedValue(null) } } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    await expect(service.portal(1n)).rejects.toMatchObject({ code: 'STRIPE_CUSTOMER_NOT_FOUND' });
  });

  it('projeta invoice.paid e marca o evento como processado', async () => {
    const client = {
      stripeWebhookEvent: { create: vi.fn().mockResolvedValue({}), update: vi.fn() },
      tenantSubscription: { findFirst: vi.fn().mockResolvedValue({ id: 7n, status: 'PAST_DUE', stripeCustomerId: 'cus_1' }), update: vi.fn() },
    } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service, 'constructEvent').mockReturnValue({ id: 'evt_paid', type: 'invoice.paid', data: { object: { metadata: { tenantId: '1' }, customer: 'cus_1' } } } as any);
    await expect(service.handleWebhook('{}', 'signature')).resolves.toEqual({ received: true });
    expect(client.tenantSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE', lastPaymentAt: expect.any(Date) }) }));
    expect(client.stripeWebhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ processingStatus: 'PROCESSED' }) }));
  });
});
