import { describe, expect, it, vi } from 'vitest';
import { StripeBillingService } from './stripe-billing.service.js';

describe('StripeBillingService', () => {
  it.each(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const)('cria contratação inicial recorrente para %s sem preço inline', async (billingCycle) => {
    const plan = { id: 4n, publicId: 'plan-4', currency: 'BRL' };
    const option = { id: 9n, publicId: `option-${billingCycle}`, priceCents: 1990n, active: true, plan };
    const client = {
      platformPaymentConfig: { findUnique: vi.fn().mockResolvedValue({ environment: 'SANDBOX', credentialsCiphertext: null }) },
      tenant: { findUniqueOrThrow: vi.fn().mockResolvedValue({ publicId: 'tenant-1' }) },
      tenantSubscription: { findFirst: vi.fn().mockResolvedValue({ id: 7n, publicId: 'sub-7', tenantId: 1n, planId: 4n, billingCycle, stripeCustomerId: null, stripeSubscriptionId: null, plan }), update: vi.fn() },
      planBillingOption: { findUnique: vi.fn().mockResolvedValue(option), findUniqueOrThrow: vi.fn().mockResolvedValue(option) },
      stripePlanCatalog: { findUnique: vi.fn().mockResolvedValue({ stripeProductId: 'prod-4', status: 'SYNCED', prices: [{ billingOptionId: 9n, stripePriceId: 'price-recurring', status: 'SYNCED' }] }) },
    } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service.stripe.customers, 'create').mockResolvedValue({ id: 'cus-1' } as any);
    vi.spyOn(service.stripe.prices, 'retrieve').mockResolvedValue({ active: true, product: 'prod-4', currency: 'brl', unit_amount: 1990, recurring: { interval: billingCycle === 'ANNUAL' ? 'year' : 'month', interval_count: ({ MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 1 } as any)[billingCycle] } } as any);
    const create = vi.spyOn(service.stripe.checkout.sessions, 'create').mockResolvedValue({ url: 'https://checkout.stripe.test/session' } as any);

    await expect(service.createInitialSubscriptionCheckout(1n, 'plan-4', billingCycle, 'owner@example.com')).resolves.toEqual({ url: 'https://checkout.stripe.test/session' });
    const params = create.mock.calls[0][0] as any;
    expect(params.mode).toBe('subscription');
    expect(params.line_items).toEqual([{ price: 'price-recurring', quantity: 1 }]);
    expect(params.line_items[0].price_data).toBeUndefined();
    expect(params.subscription_data.metadata.operation).toBe('INITIAL_SUBSCRIPTION');
    expect(client.tenantSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stripeCustomerId: 'cus-1', stripeSubscriptionId: null, stripePriceId: 'price-recurring' }) }));
  });

  it('faz preview e aplica upgrade recorrente com prorrateio Stripe idempotente', async () => {
    const change = { id: 8n, publicId: 'change-8', tenantId: 1n, status: 'PENDING_PAYMENT', targetPlanId: 5n, targetBillingCycle: 'MONTHLY', subscription: { stripeSubscriptionId: 'sub-1', stripeCustomerId: 'cus-1' } };
    const client = {
      subscriptionPlanChange: { findUnique: vi.fn().mockResolvedValue(change), findUniqueOrThrow: vi.fn().mockResolvedValue(change), findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
      platformPaymentConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service as any, 'resolveRecurringPrice').mockResolvedValue({ priceId: 'price-new', environment: 'SANDBOX' });
    vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue({ items: { data: [{ id: 'si-1', price: { id: 'price-old' } }] } } as any);
    const preview = vi.spyOn(service.stripe.invoices as any, 'createPreview').mockResolvedValue({ id: 'in-1', amount_due: 3500, currency: 'brl' });
    const update = vi.spyOn(service.stripe.subscriptions, 'update').mockResolvedValue({} as any);

    await expect(service.previewStripeUpgrade(1n, 'change-8')).resolves.toEqual({ changePublicId: 'change-8', priceId: 'price-new', amountDueCents: '3500', currency: 'brl', invoiceId: 'in-1' });
    await service.applyStripeUpgrade(1n, 'change-8');
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ subscription: 'sub-1', subscription_details: expect.objectContaining({ items: [{ id: 'si-1', price: 'price-new' }] }) }));
    expect(update).toHaveBeenCalledWith('sub-1', expect.objectContaining({ proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete', items: [{ id: 'si-1', price: 'price-new' }] }), { idempotencyKey: 'agendei:stripe-upgrade:change-8' });
    expect(client.subscriptionPlanChange.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountDueCents: 3500n }) }));
  });

  it('agenda downgrade no Stripe preservando o Price atual até o vencimento', async () => {
    const endsAt = new Date('2026-10-01T00:00:00.000Z');
    const change = { id: 8n, publicId: 'change-scheduled', tenantId: 1n, status: 'SCHEDULED', targetPlanId: 5n, targetBillingCycle: 'MONTHLY', currentPeriodEndsAt: endsAt, subscription: { stripeSubscriptionId: 'sub-1' } };
    const client = { platformPaymentConfig: { findUnique: vi.fn().mockResolvedValue(null) }, subscriptionPlanChange: { findUnique: vi.fn().mockResolvedValue(change), update: vi.fn() } } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service as any, 'resolveRecurringPrice').mockResolvedValue({ priceId: 'price-target', environment: 'SANDBOX' });
    vi.spyOn(service.stripe.subscriptions, 'retrieve').mockResolvedValue({ items: { data: [{ id: 'si-1', price: { id: 'price-current' } }] } } as any);
    vi.spyOn(service.stripe.subscriptionSchedules, 'create').mockResolvedValue({ id: 'sched-1' } as any);
    const update = vi.spyOn(service.stripe.subscriptionSchedules, 'update').mockResolvedValue({} as any);
    await expect(service.scheduleStripePlanChange(1n, 'change-scheduled')).resolves.toEqual({ scheduled: true, scheduleId: 'sched-1', priceId: 'price-target' });
    expect(update).toHaveBeenCalledWith('sched-1', expect.objectContaining({ phases: [{ items: [{ price: 'price-current', quantity: 1 }], end_date: 1790812800 }, { items: [{ price: 'price-target', quantity: 1 }] }] }));
  });

  it.each(['subscription_schedule.completed', 'subscription_schedule.canceled', 'subscription_schedule.released'] as const)('reconcilia schedule %s sem ativar plano fora de invoice.paid', async (eventType) => {
    const change = { id: 8n, publicId: 'change-schedule', subscriptionId: 7n, status: 'SCHEDULED', metadata: { stripeScheduleId: 'sched-1' }, subscription: { id: 7n } };
    const client = {
      stripeWebhookEvent: { create: vi.fn().mockResolvedValue({}), update: vi.fn() },
      subscriptionPlanChange: { findMany: vi.fn().mockResolvedValue([change]), update: vi.fn() },
      tenantSubscription: { update: vi.fn() },
    } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service, 'constructEvent').mockReturnValue({ id: `evt_${eventType}`, created: 100, livemode: false, type: eventType, data: { object: { id: 'sched-1' } } } as any);
    await service.handleWebhook('{}', 'signature');
    if (eventType === 'subscription_schedule.completed') expect(client.subscriptionPlanChange.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_PAYMENT' }) }));
    else expect(client.subscriptionPlanChange.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELED' }) }));
  });

  it('bloqueia checkout direto por plano/ciclo', async () => {
    const client = {} as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example', { decrypt: () => ({}) } as any);
    await expect(service.checkout(1n, '00000000-0000-4000-8000-000000000001', 'MONTHLY', 'owner@example.com')).rejects.toMatchObject({ code: 'STRIPE_CHANGE_REFERENCE_REQUIRED' });
  });

  it('rejeita webhook sem assinatura válida', () => {
    const client = {} as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example', { decrypt: () => ({}) } as any);
    expect(() => service.constructEvent('{}', 't=1,v1=invalid')).toThrow();
  });

  it('retorna duplicado sem reaplicar evento persistido', async () => {
    const client = { stripeWebhookEvent: { create: vi.fn().mockRejectedValue(new Error('unique')), findUnique: vi.fn().mockResolvedValue({ processingStatus: 'PROCESSED' }), update: vi.fn() } } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example', { decrypt: () => ({}) } as any);
    vi.spyOn(service, 'constructEvent').mockReturnValue({ id: 'evt_duplicate', type: 'invoice.paid', data: { object: {} } } as any);
    await expect(service.handleWebhook('{}', 'signature')).resolves.toEqual({ received: true, duplicate: true });
    expect(client.stripeWebhookEvent.update).not.toHaveBeenCalled();
  });

  it('reutiliza Customer Stripe existente ao abrir checkout de change', async () => {
    const client = {
      subscriptionPlanChange: { findUnique: vi.fn().mockResolvedValue({ id: 8n, publicId: '00000000-0000-4000-8000-000000000001', tenantId: 1n, status: 'PENDING_PAYMENT', expiresAt: new Date(Date.now() + 60_000), amountDueCents: 85000n, currency: 'BRL', subscription: { id: 7n, stripeCustomerId: 'cus_existing', stripeSubscriptionId: null, status: 'CANCELED' }, targetPlan: { name: 'Pro' } }), update: vi.fn() },
      platformPaymentConfig: { findUnique: vi.fn().mockResolvedValue({ provider: 'stripe', active: true, environment: 'SANDBOX', credentialsCiphertext: 'encrypted' }) },
      tenantSubscription: { update: vi.fn() },
    } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service.stripe.checkout.sessions, 'create').mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.test/session', payment_intent: 'pi_test' } as any);
    vi.spyOn(service.stripe.customers, 'create');
    await expect(service.checkoutChange(1n, '00000000-0000-4000-8000-000000000001', 'owner@example.com')).resolves.toEqual({ url: 'https://checkout.stripe.test/session' });
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
      tenantSubscription: { findFirst: vi.fn().mockResolvedValue({ id: 7n, status: 'PAST_DUE', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripePriceId: 'price_1', currency: 'BRL' }), update: vi.fn() },
      subscriptionPlanChange: { findMany: vi.fn().mockResolvedValue([]) },
    } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service, 'constructEvent').mockReturnValue({ id: 'evt_paid', type: 'invoice.paid', data: { object: { metadata: { tenantId: '1' }, customer: 'cus_1', subscription: 'sub_1', currency: 'brl', amount_paid: 1990, lines: { data: [{ price: { id: 'price_1' }, period: { start: 100, end: 200 } }] } } } } as any);
    await expect(service.handleWebhook('{}', 'signature')).resolves.toEqual({ received: true });
    expect(client.tenantSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE', lastPaymentAt: expect.any(Date) }) }));
    expect(client.stripeWebhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ processingStatus: 'PROCESSED' }) }));
  });

  it('suspende a assinatura quando um charge é reembolsado', async () => {
    const client = { stripeWebhookEvent: { create: vi.fn().mockResolvedValue({}), update: vi.fn() }, tenantSubscription: { findFirst: vi.fn().mockResolvedValue({ id: 7n, status: 'ACTIVE', stripeCustomerId: 'cus_1', lastStripeEventAt: null }), update: vi.fn() } } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service, 'constructEvent').mockReturnValue({ id: 'evt_refund', created: 100, type: 'charge.refunded', data: { object: { amount: 1000, amount_refunded: 1000, metadata: { tenantId: '1' }, customer: 'cus_1' } } } as any);
    await service.handleWebhook('{}', 'signature');
    expect(client.tenantSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SUSPENDED', endsAt: new Date(100000), canceledAt: new Date(100000) }) }));
  });

  it.each([
    ['refund parcial', { amount: 1000, amount_refunded: 400, metadata: { tenantId: '1' } }],
    ['refund de ajuste de upgrade', { amount: 1000, amount_refunded: 1000, metadata: { tenantId: '1', operation: 'UPGRADE_ADJUSTMENT' } }],
  ])('não suspende a assinatura em %s', async (_label, charge) => {
    const client = { stripeWebhookEvent: { create: vi.fn().mockResolvedValue({}), update: vi.fn() }, tenantSubscription: { findFirst: vi.fn().mockResolvedValue({ id: 7n, status: 'ACTIVE', stripeCustomerId: 'cus_1', lastStripeEventAt: null }), update: vi.fn() } } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service, 'constructEvent').mockReturnValue({ id: `evt_${_label}`, created: 100, type: 'charge.refunded', data: { object: { ...charge, customer: 'cus_1' } } } as any);
    await service.handleWebhook('{}', 'signature');
    expect(client.tenantSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE' }) }));
  });

  it('ignora evento Stripe mais antigo sem alterar a assinatura', async () => {
    const client = { stripeWebhookEvent: { create: vi.fn().mockResolvedValue({}), update: vi.fn() }, tenantSubscription: { findFirst: vi.fn().mockResolvedValue({ id: 7n, status: 'ACTIVE', lastStripeEventAt: new Date(200000), stripeCustomerId: 'cus_1' }), update: vi.fn() } } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service, 'constructEvent').mockReturnValue({ id: 'evt_old', created: 100, type: 'invoice.payment_failed', data: { object: { metadata: { tenantId: '1' }, customer: 'cus_1' } } } as any);
    await expect(service.handleWebhook('{}', 'signature')).resolves.toEqual({ received: true, stale: true });
    expect(client.tenantSubscription.update).not.toHaveBeenCalled();
  });

  it('rejeita evento live quando o Stripe está configurado em sandbox', async () => {
    const client = { platformPaymentConfig: { findUnique: vi.fn().mockResolvedValue({ environment: 'SANDBOX' }) }, stripeWebhookEvent: { create: vi.fn() } } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service, 'constructEvent').mockReturnValue({ id: 'evt_live', created: 100, livemode: true, type: 'invoice.paid', data: { object: {} } } as any);
    await expect(service.handleWebhook('{}', 'signature')).rejects.toMatchObject({ code: 'STRIPE_EVENT_ENVIRONMENT_MISMATCH' });
    expect(client.stripeWebhookEvent.create).not.toHaveBeenCalled();
  });

  it('inicia um ciclo completo no primeiro pagamento depois do trial', async () => {
    const client = {
      stripeWebhookEvent: { create: vi.fn().mockResolvedValue({}), update: vi.fn() },
      subscriptionPlanChange: { findMany: vi.fn().mockResolvedValue([]) },
      tenantSubscription: {
        findFirst: vi.fn().mockResolvedValue({
          id: 7n,
          status: 'TRIALING',
          billingCycle: 'QUARTERLY',
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
          stripePriceId: 'price_1',
          currency: 'BRL',
        }),
        update: vi.fn(),
      },
    } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service, 'constructEvent').mockReturnValue({ id: 'evt_trial_paid', type: 'invoice.paid', data: { object: { metadata: { tenantId: '1' }, customer: 'cus_1', subscription: 'sub_1', currency: 'brl', amount_paid: 1990, lines: { data: [{ price: { id: 'price_1' } }] } } } } as any);

    await service.handleWebhook('{}', 'signature');

    const data = client.tenantSubscription.update.mock.calls[0][0].data;
    expect(data.status).toBe('ACTIVE');
    expect(data.currentPeriodStartsAt).toBeInstanceOf(Date);
    expect(data.currentPeriodEndsAt.getUTCMonth()).toBe((data.currentPeriodStartsAt.getUTCMonth() + 3) % 12);
    expect(data.trialEndsAt).toEqual(data.currentPeriodStartsAt);
  });

  it('não aplica uma mudança quando invoice.paid encontra duas mudanças pendentes', async () => {
    const client = {
      stripeWebhookEvent: { create: vi.fn().mockResolvedValue({}), update: vi.fn() },
      subscriptionPlanChange: { findMany: vi.fn().mockResolvedValue([{ id: 1n, status: 'PENDING_PAYMENT' }, { id: 2n, status: 'PENDING_PAYMENT' }]), update: vi.fn() },
      tenantSubscription: { findFirst: vi.fn().mockResolvedValue({ id: 7n, status: 'ACTIVE', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripePriceId: 'price_1', currency: 'BRL' }), update: vi.fn() },
    } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service, 'constructEvent').mockReturnValue({ id: 'evt_ambiguous', created: 100, type: 'invoice.paid', data: { object: { metadata: { tenantId: '1' }, customer: 'cus_1', subscription: 'sub_1', currency: 'brl', amount_paid: 1990, lines: { data: [{ price: { id: 'price_1' } }] } } } } as any);
    await service.handleWebhook('{}', 'signature');
    expect(client.subscriptionPlanChange.update).not.toHaveBeenCalled();
  });

  it('mantém a ordem financeira payment_failed seguido de invoice.paid sem conceder antes', async () => {
    const subscription = { id: 7n, status: 'ACTIVE', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', stripePriceId: 'price_1', currency: 'BRL', lastStripeEventAt: null };
    const client = {
      stripeWebhookEvent: { create: vi.fn().mockResolvedValue({}), update: vi.fn() },
      subscriptionPlanChange: { findMany: vi.fn().mockResolvedValue([]) },
      tenantSubscription: { findFirst: vi.fn().mockResolvedValue(subscription), update: vi.fn() },
    } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    const invoice = { metadata: { tenantId: '1' }, customer: 'cus_1', subscription: 'sub_1', currency: 'brl', amount_paid: 1990, lines: { data: [{ price: { id: 'price_1' } }] } };
    vi.spyOn(service, 'constructEvent')
      .mockReturnValueOnce({ id: 'evt_failed', created: 100, type: 'invoice.payment_failed', data: { object: invoice } } as any)
      .mockReturnValueOnce({ id: 'evt_paid_after', created: 101, type: 'invoice.paid', data: { object: invoice } } as any);
    await service.handleWebhook('{}', 'signature');
    expect(client.tenantSubscription.update.mock.calls[0][0].data.status).toBe('PAST_DUE');
    await service.handleWebhook('{}', 'signature');
    expect(client.tenantSubscription.update.mock.calls[1][0].data.status).toBe('ACTIVE');
  });

  it('reconcilia schedule substituído quando o evento updated informa status released', async () => {
    const change = { id: 8n, subscriptionId: 7n, status: 'SCHEDULED', metadata: { stripeScheduleId: 'sched-1' }, subscription: { id: 7n } };
    const client = { stripeWebhookEvent: { create: vi.fn().mockResolvedValue({}), update: vi.fn() }, subscriptionPlanChange: { findMany: vi.fn().mockResolvedValue([change]), update: vi.fn() }, tenantSubscription: { update: vi.fn() } } as any;
    const service = new StripeBillingService(client, 'sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'whsec_test', 'https://app.example');
    vi.spyOn(service, 'constructEvent').mockReturnValue({ id: 'evt_schedule_replaced', created: 100, type: 'subscription_schedule.updated', data: { object: { id: 'sched-1', status: 'released' } } } as any);
    await service.handleWebhook('{}', 'signature');
    expect(client.subscriptionPlanChange.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELED' }) }));
  });
});
