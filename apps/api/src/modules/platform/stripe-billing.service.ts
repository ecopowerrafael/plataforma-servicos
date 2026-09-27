import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../errors/AppError.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { SubscriptionPlanChangeService } from '../tenants/subscription-plan-change.service.js';

const cycle = (value: string): { interval: 'month' | 'year'; interval_count: number } => {
  if (value === 'ANNUAL') return { interval: 'year', interval_count: 1 };
  const counts: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6 };
  const count = counts[value];
  if (!count) throw new AppError({ code: 'BILLING_CYCLE_INVALID', message: 'Ciclo inválido.', statusCode: 400 });
  return { interval: 'month', interval_count: count };
};

export class StripeBillingService {
  public stripe: Stripe;
  private webhookSecret: string;
  public constructor(private readonly client: PrismaClient, secretKey: string, webhookSecret: string, private readonly appWebUrl: string, private readonly cipher?: CredentialsCipher) {
    this.stripe = new Stripe(secretKey);
    this.webhookSecret = webhookSecret;
  }

  public reconfigure(secretKey: string, webhookSecret: string) { this.stripe = new Stripe(secretKey); this.webhookSecret = webhookSecret; }
  private async ensureConfigured() {
    if (!this.cipher || this.client.platformPaymentConfig === undefined) return;
    const config = await this.client.platformPaymentConfig.findUnique({ where: { provider: 'stripe' } });
    if (config?.credentialsCiphertext && this.cipher) {
      try { const value = this.cipher.decrypt(config.credentialsCiphertext); const environments = typeof value.environments === 'object' && value.environments !== null ? value.environments as Record<string, unknown> : value; const selected = (environments[config.environment] as Record<string, unknown> | undefined) ?? value; if (typeof selected.secretKey === 'string' && typeof selected.webhookSecret === 'string') this.reconfigure(selected.secretKey, selected.webhookSecret); } catch { /* admin can replace invalid credentials */ }
    }
  }

  public async testConnection() {
    await this.ensureConfigured();
    const account = await this.stripe.accounts.retrieve('self');
    return { valid: true, accountId: account.id, businessName: account.business_profile?.name ?? account.settings?.dashboard?.display_name ?? null };
  }

  public webhookUrl() { return `${process.env.APP_API_URL ?? process.env.APP_WEB_URL ?? this.appWebUrl}/webhooks/stripe`; }
  public async integrationStatus(endpointId?: string) {
    await this.ensureConfigured();
    let webhookStatus: string | null = endpointId ? 'unknown' : 'not_configured';
    if (endpointId) {
      try { webhookStatus = (await this.stripe.webhookEndpoints.retrieve(endpointId)).status ?? 'unknown'; } catch { webhookStatus = 'error'; }
    }
    let customerPortalConfigured = false;
    try { customerPortalConfigured = (await this.stripe.billingPortal.configurations.list({ limit: 1 })).data.length > 0; } catch { customerPortalConfigured = false; }
    return { webhookStatus, customerPortalConfigured };
  }
  public async createWebhook() {
    await this.ensureConfigured();
    const endpoint = await this.stripe.webhookEndpoints.create({ url: this.webhookUrl(), enabled_events: ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed', 'charge.refunded', 'subscription_schedule.updated', 'subscription_schedule.completed', 'subscription_schedule.canceled', 'subscription_schedule.released', 'subscription_schedule.aborted'] });
    return { id: endpoint.id, secret: endpoint.secret ?? null, url: endpoint.url, status: endpoint.status ?? null };
  }

  public async syncCatalog(environment: 'SANDBOX' | 'PRODUCTION') {
    await this.ensureConfigured();
    const plans = await this.client.commercialPlan.findMany({ where: { status: 'ACTIVE' }, include: { billingOptions: { where: { active: true } } } });
    const result: Array<{ planPublicId: string; status: string; lastError: string | null }> = [];
    for (const plan of plans) {
      try {
        let catalog = await this.client.stripePlanCatalog.findUnique({ where: { planId_environment: { planId: plan.id, environment } }, include: { prices: true } });
        const product = catalog ? await this.stripe.products.update(catalog.stripeProductId, { name: `Agendei - ${plan.name}`, metadata: { planId: plan.id.toString(), environment } }) : await this.stripe.products.create({ name: `Agendei - ${plan.name}`, metadata: { planId: plan.id.toString(), environment } });
        catalog = catalog ? await this.client.stripePlanCatalog.update({ where: { id: catalog.id }, data: { stripeProductId: product.id, status: 'PENDING', lastError: null }, include: { prices: true } }) : await this.client.stripePlanCatalog.create({ data: { publicId: randomUUID(), planId: plan.id, environment, stripeProductId: product.id }, include: { prices: true } });
        for (const option of plan.billingOptions) {
          const current = catalog.prices.find((price) => price.billingOptionId === option.id);
          if (current && current.amountCents === option.priceCents && current.status === 'SYNCED') {
            try {
              const existing = await this.stripe.prices.retrieve(current.stripePriceId);
              if (existing.active && existing.product === product.id) continue;
            } catch { /* recreate a missing or invalid remote Price below */ }
          }
          if (current) await this.stripe.prices.update(current.stripePriceId, { active: false });
          const price = await this.stripe.prices.create({ product: product.id, currency: plan.currency.toLowerCase(), unit_amount: Number(option.priceCents), recurring: cycle(option.billingCycle), metadata: { planId: plan.id.toString(), billingOptionId: option.id.toString(), environment } });
          await this.client.stripePlanPrice.upsert({ where: { catalogId_billingOptionId: { catalogId: catalog.id, billingOptionId: option.id } }, create: { publicId: randomUUID(), catalogId: catalog.id, billingOptionId: option.id, stripePriceId: price.id, amountCents: option.priceCents }, update: { stripePriceId: price.id, amountCents: option.priceCents, status: 'SYNCED' } });
        }
        await this.client.stripePlanCatalog.update({ where: { id: catalog.id }, data: { status: 'SYNCED', lastSyncedAt: new Date(), lastError: null } });
        result.push({ planPublicId: plan.publicId, status: 'SYNCED', lastError: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        await this.client.stripePlanCatalog.updateMany({ where: { planId: plan.id, environment }, data: { status: 'ERROR', lastError: message } });
        result.push({ planPublicId: plan.publicId, status: 'ERROR', lastError: message });
      }
    }
    return { environment, items: result };
  }

  public async createInitialSubscriptionCheckout(tenantId: bigint, planPublicId: string, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL', email: string) {
    await this.ensureConfigured();
    const subscription = await this.client.tenantSubscription.findFirst({ where: { tenantId, effectiveKey: 'EFFECTIVE' }, include: { plan: true } });
    if (!subscription || subscription.plan.publicId !== planPublicId || subscription.billingCycle !== billingCycle)
      throw new AppError({ code: 'INITIAL_SUBSCRIPTION_REFERENCE_INVALID', message: 'A assinatura inicial local não corresponde ao plano escolhido.', statusCode: 409 });
    if (subscription.stripeSubscriptionId) throw new AppError({ code: 'STRIPE_SUBSCRIPTION_ALREADY_EXISTS', message: 'Este estabelecimento já possui uma assinatura Stripe.', statusCode: 409 });
    const { priceId, environment } = await this.resolveRecurringPrice(subscription.planId, billingCycle);
    let customerId = subscription.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({ email, metadata: { tenantPublicId: (await this.client.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { publicId: true } })).publicId, tenantSubscriptionPublicId: subscription.publicId } }, { idempotencyKey: `agendei:customer:${tenantId}` });
      customerId = customer.id;
    }
    const tenant = await this.client.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { publicId: true } });
    const metadata = { tenantPublicId: tenant.publicId, tenantSubscriptionPublicId: subscription.publicId, planPublicId: subscription.plan.publicId, billingOptionPublicId: (await this.client.planBillingOption.findUniqueOrThrow({ where: { planId_billingCycle: { planId: subscription.planId, billingCycle } }, select: { publicId: true } })).publicId, billingCycle, environment, operation: 'INITIAL_SUBSCRIPTION' };
    const session = await this.stripe.checkout.sessions.create({ mode: 'subscription', customer: customerId, line_items: [{ price: priceId, quantity: 1 }], success_url: `${this.appWebUrl}/planos?checkout=success`, cancel_url: `${this.appWebUrl}/planos?checkout=cancelled`, metadata, subscription_data: { metadata } }, { idempotencyKey: `agendei:initial-subscription:${subscription.publicId}` });
    const returnedSubscription = typeof session.subscription === 'string' ? session.subscription : null;
    await this.client.tenantSubscription.update({ where: { id: subscription.id }, data: { stripeCustomerId: customerId, stripeSubscriptionId: returnedSubscription, stripePriceId: priceId, billingProvider: 'stripe' } });
    return { url: session.url };
  }

  /** @deprecated Use createInitialSubscriptionCheckout. */
  public async checkout(tenantId: bigint, planPublicId: string, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL', email: string) {
    void tenantId; void planPublicId; void billingCycle; void email;
    throw new AppError({ code: 'STRIPE_CHANGE_REFERENCE_REQUIRED', message: 'Use o checkout explícito de assinatura inicial ou de ajuste de upgrade.', statusCode: 409 });
  }

  private async resolveRecurringPrice(planId: bigint, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL') {
    const config = await this.client.platformPaymentConfig?.findUnique({ where: { provider: 'stripe' }, select: { environment: true } });
    const environment = config?.environment ?? 'SANDBOX';
    const option = await this.client.planBillingOption.findUnique({ where: { planId_billingCycle: { planId, billingCycle } }, include: { plan: true } });
    const catalog = await this.client.stripePlanCatalog.findUnique({ where: { planId_environment: { planId, environment } }, include: { prices: true } });
    const price = catalog?.prices.find((item) => item.billingOptionId === option?.id && item.status === 'SYNCED');
    if (!option?.active || !catalog || catalog.status !== 'SYNCED' || !price)
      throw new AppError({ code: 'STRIPE_PRICE_NOT_SYNCED', message: 'O preço Stripe recorrente ainda não está sincronizado para este ambiente.', statusCode: 409 });
    let remote: Stripe.Price;
    try { remote = await this.stripe.prices.retrieve(price.stripePriceId); } catch {
      throw new AppError({ code: 'STRIPE_PRICE_NOT_FOUND', message: 'O preço Stripe não foi encontrado no ambiente configurado.', statusCode: 409 });
    }
    const expected = cycle(billingCycle);
    if (!remote.active || remote.product !== catalog.stripeProductId || remote.currency !== option.plan.currency.toLowerCase() || remote.unit_amount !== Number(option.priceCents) || !remote.recurring || remote.recurring.interval !== expected.interval || remote.recurring.interval_count !== expected.interval_count)
      throw new AppError({ code: 'STRIPE_PRICE_MISMATCH', message: 'O preço Stripe não corresponde ao plano, moeda, valor ou periodicidade selecionados.', statusCode: 409 });
    return { priceId: price.stripePriceId, environment };
  }

  public async previewStripeUpgrade(tenantId: bigint, changePublicId: string) {
    await this.ensureConfigured();
    const change = await this.client.subscriptionPlanChange.findUnique({ where: { publicId: changePublicId }, include: { subscription: true } });
    if (!change || change.tenantId !== tenantId || change.status !== 'PENDING_PAYMENT' || !change.subscription.stripeSubscriptionId)
      throw new AppError({ code: 'STRIPE_UPGRADE_NOT_AVAILABLE', message: 'Upgrade Stripe não disponível para esta assinatura.', statusCode: 409 });
    const { priceId } = await this.resolveRecurringPrice(change.targetPlanId, change.targetBillingCycle as 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL');
    const remote = await this.stripe.subscriptions.retrieve(change.subscription.stripeSubscriptionId);
    const item = remote.items.data[0];
    if (!item) throw new AppError({ code: 'STRIPE_SUBSCRIPTION_ITEM_NOT_FOUND', message: 'Item da assinatura Stripe não encontrado.', statusCode: 409 });
    const invoice = await (this.stripe.invoices as any).createPreview({ customer: change.subscription.stripeCustomerId, subscription: change.subscription.stripeSubscriptionId, subscription_details: { items: [{ id: item.id, price: priceId }], proration_behavior: 'always_invoice' } });
    return { changePublicId, priceId, amountDueCents: String(invoice.amount_due ?? 0), currency: invoice.currency, invoiceId: invoice.id };
  }

  public async applyStripeUpgrade(tenantId: bigint, changePublicId: string) {
    await this.ensureConfigured();
    const preview = await this.previewStripeUpgrade(tenantId, changePublicId);
    const change = await this.client.subscriptionPlanChange.findUniqueOrThrow({ where: { publicId: changePublicId }, include: { subscription: true } });
    const remote = await this.stripe.subscriptions.retrieve(change.subscription.stripeSubscriptionId!);
    const item = remote.items.data[0];
    // pending_if_incomplete prevents a card decline/3DS/open invoice from
    // committing the new Price. The webhook applies local entitlements only
    // after invoice.paid.
    await this.stripe.subscriptions.update(change.subscription.stripeSubscriptionId!, { items: [{ id: item!.id, price: preview.priceId }], proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete', metadata: { subscriptionChangePublicId: change.publicId, operation: 'UPGRADE_PRORATION' } }, { idempotencyKey: `agendei:stripe-upgrade:${change.publicId}` });
    await this.client.subscriptionPlanChange.update({ where: { id: change.id }, data: { stripeSubscriptionId: change.subscription.stripeSubscriptionId, metadata: { operation: 'UPGRADE_PRORATION', stripePriceId: preview.priceId, previewInvoiceId: preview.invoiceId }, amountDueCents: BigInt(preview.amountDueCents) } });
    return preview;
  }

  public async scheduleStripePlanChange(tenantId: bigint, changePublicId: string) {
    await this.ensureConfigured();
    const change = await this.client.subscriptionPlanChange.findUnique({ where: { publicId: changePublicId }, include: { subscription: true } });
    if (!change || change.tenantId !== tenantId || change.status !== 'SCHEDULED' || !change.subscription.stripeSubscriptionId)
      return { scheduled: false as const };
    const { priceId } = await this.resolveRecurringPrice(change.targetPlanId, change.targetBillingCycle as 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL');
    const remote = await this.stripe.subscriptions.retrieve(change.subscription.stripeSubscriptionId);
    const item = remote.items.data[0];
    if (!item) throw new AppError({ code: 'STRIPE_SUBSCRIPTION_ITEM_NOT_FOUND', message: 'Item da assinatura Stripe não encontrado.', statusCode: 409 });
    const schedule = await this.stripe.subscriptionSchedules.create({ from_subscription: change.subscription.stripeSubscriptionId });
    await this.stripe.subscriptionSchedules.update(schedule.id, { end_behavior: 'release', phases: [{ items: [{ price: item.price.id, quantity: 1 }], end_date: Math.floor(change.currentPeriodEndsAt.getTime() / 1000) }, { items: [{ price: priceId, quantity: 1 }] }] } as any);
    await this.client.subscriptionPlanChange.update({ where: { id: change.id }, data: { stripeSubscriptionId: change.subscription.stripeSubscriptionId, metadata: { operation: 'SCHEDULED_RECURRING_CHANGE', stripeScheduleId: schedule.id, stripePriceId: priceId } } });
    return { scheduled: true as const, scheduleId: schedule.id, priceId };
  }

  /**
   * This is intentionally a one-time adjustment checkout. It never creates a
   * Stripe subscription; the recurring subscription is updated separately
   * after the adjustment is confirmed with proration_behavior=none.
   */
  public async createOneTimeUpgradeAdjustmentCheckout(tenantId: bigint, changePublicId: string, email: string) {
    await this.ensureConfigured();
    const change = await this.client.subscriptionPlanChange.findUnique({ where: { publicId: changePublicId }, include: { subscription: true, targetPlan: true } });
    if (!change || change.tenantId !== tenantId) throw new AppError({ code: 'SUBSCRIPTION_CHANGE_NOT_FOUND', message: 'Alteração de assinatura não encontrada.', statusCode: 404 });
    if (change.status !== 'PENDING_PAYMENT') throw new AppError({ code: 'SUBSCRIPTION_CHANGE_NOT_PENDING', message: 'A alteração não está pendente de pagamento.', statusCode: 409 });
    if (change.expiresAt <= new Date()) throw new AppError({ code: 'SUBSCRIPTION_CHANGE_EXPIRED', message: 'A alteração de assinatura expirou.', statusCode: 409 });
    if (change.amountDueCents <= 0n) throw new AppError({ code: 'SUBSCRIPTION_CHANGE_NO_CHARGE', message: 'Esta alteração não requer cobrança.', statusCode: 409 });
    const subscription = change.subscription;
    let customerId = subscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({ email, metadata: { tenantId: tenantId.toString() } }, { idempotencyKey: `agendei:customer:${tenantId}` });
      customerId = customer.id;
      if (subscription) await this.client.tenantSubscription.update({ where: { id: subscription.id }, data: { stripeCustomerId: customerId, billingProvider: 'stripe' } });
    }
    const session = await this.stripe.checkout.sessions.create({ mode: 'payment', customer: customerId, line_items: [{ price_data: { currency: change.currency.toLowerCase(), unit_amount: Number(change.amountDueCents), product_data: { name: `Ajuste de upgrade - ${change.targetPlan.name}` } }, quantity: 1 }], success_url: `${this.appWebUrl}/planos?checkout=success`, cancel_url: `${this.appWebUrl}/planos?checkout=cancelled`, metadata: { tenantId: tenantId.toString(), subscriptionChangePublicId: change.publicId, operation: 'UPGRADE_ADJUSTMENT' }, payment_intent_data: { metadata: { tenantId: tenantId.toString(), subscriptionChangePublicId: change.publicId, operation: 'UPGRADE_ADJUSTMENT' } } }, { idempotencyKey: `agendei:change-checkout:${change.publicId}` });
    await this.client.subscriptionPlanChange.update({ where: { id: change.id }, data: { paymentProvider: 'stripe', stripeCheckoutSessionId: session.id, paymentReference: session.payment_intent?.toString() ?? null } });
    return { url: session.url };
  }

  /** @deprecated Use createOneTimeUpgradeAdjustmentCheckout for legacy callers. */
  public checkoutChange(tenantId: bigint, changePublicId: string, email: string) {
    return this.createOneTimeUpgradeAdjustmentCheckout(tenantId, changePublicId, email);
  }

  public async cancelAtPeriodEnd(tenantId: bigint) {
    await this.ensureConfigured();
    const subscription = await this.client.tenantSubscription.findFirst({ where: { tenantId, effectiveKey: 'EFFECTIVE' } });
    if (!subscription?.stripeSubscriptionId) throw new AppError({ code: 'STRIPE_SUBSCRIPTION_NOT_FOUND', message: 'Este estabelecimento ainda não possui uma assinatura Stripe.', statusCode: 409 });
    const updated = await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true }, { idempotencyKey: `agendei:stripe-cancel:${subscription.publicId}` });
    const periodEnd = updated.items.data[0]?.current_period_end;
    const currentPeriodEndsAt = new Date(periodEnd ? periodEnd * 1000 : subscription.currentPeriodEndsAt.getTime());
    await this.client.tenantSubscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: true, currentPeriodEndsAt, lastStripeEventAt: new Date() } });
    return { cancelAtPeriodEnd: updated.cancel_at_period_end, currentPeriodEndsAt };
  }

  public async undoCancelAtPeriodEnd(tenantId: bigint) {
    await this.ensureConfigured();
    const subscription = await this.client.tenantSubscription.findFirst({ where: { tenantId, effectiveKey: 'EFFECTIVE' } });
    if (!subscription?.stripeSubscriptionId) throw new AppError({ code: 'STRIPE_SUBSCRIPTION_NOT_FOUND', message: 'Este estabelecimento ainda não possui uma assinatura Stripe.', statusCode: 409 });
    const updated = await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: false }, { idempotencyKey: `agendei:stripe-uncancel:${subscription.publicId}` });
    await this.client.tenantSubscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: false, canceledAt: null, lastStripeEventAt: new Date() } });
    return { cancelAtPeriodEnd: updated.cancel_at_period_end };
  }

  public async portal(tenantId: bigint) {
    await this.ensureConfigured();
    const subscription = await this.client.tenantSubscription.findFirst({ where: { tenantId, effectiveKey: 'EFFECTIVE' } });
    if (!subscription?.stripeCustomerId) throw new AppError({ code: 'STRIPE_CUSTOMER_NOT_FOUND', message: 'Este estabelecimento ainda não possui cliente Stripe.', statusCode: 409 });
    return { url: (await this.stripe.billingPortal.sessions.create({ customer: subscription.stripeCustomerId, return_url: `${this.appWebUrl}/configuracoes/assinatura` })).url };
  }

  public constructEvent(raw: string, signature: string) { return this.stripe.webhooks.constructEvent(raw, signature, this.webhookSecret); }

  public async syncPlanPrices(planId: bigint, productId: string) {
    const [options, plan] = await Promise.all([
      this.client.planBillingOption.findMany({ where: { planId, active: true } }),
      this.client.commercialPlan.findUnique({ where: { id: planId }, select: { currency: true } }),
    ]);
    const result = [];
    for (const option of options) {
      if (option.billingCycle === 'CUSTOM' || option.stripePriceId) continue;
      const price = await syncStripePrice(this.client, this.stripe, option.id, option.priceCents, plan?.currency ?? 'BRL', productId);
      result.push(price);
    }
    return result;
  }

  public async handleWebhook(raw: string, signature: string) {
    await this.ensureConfigured();
    const event = this.constructEvent(raw, signature);
    const config = await this.client.platformPaymentConfig?.findUnique({ where: { provider: 'stripe' }, select: { environment: true } });
    if (config && event.livemode !== (config.environment === 'PRODUCTION')) throw new AppError({ code: 'STRIPE_EVENT_ENVIRONMENT_MISMATCH', message: 'O evento Stripe pertence a outro ambiente.', statusCode: 400 });
    try {
      await this.client.stripeWebhookEvent.create({ data: { externalEventId: event.id, eventType: event.type, processingStatus: 'PROCESSING' } });
    } catch {
      const prior = await this.client.stripeWebhookEvent.findUnique({ where: { externalEventId: event.id } });
      if (prior?.processingStatus === 'PROCESSED' || prior?.processingStatus === 'PROCESSING') return { received: true, duplicate: true };
      if (!prior) throw new AppError({ code: 'STRIPE_EVENT_PERSISTENCE_FAILED', message: 'Não foi possível registrar o evento Stripe.', statusCode: 503 });
    }
    try {
      const object = event.data.object as Stripe.Subscription | Stripe.Invoice | Stripe.Checkout.Session;
      if (event.type.startsWith('subscription_schedule.')) {
        await this.reconcileSubscriptionScheduleEvent(event.type, (object as any).id, object as any);
        await this.client.stripeWebhookEvent.update({ where: { externalEventId: event.id }, data: { processingStatus: 'PROCESSED', processedAt: new Date() } });
        return { received: true };
      }
      let tenantId = object.metadata?.tenantId;
      const changePublicId = object.metadata?.subscriptionChangePublicId;
      const tenantSubscriptionPublicId = object.metadata?.tenantSubscriptionPublicId;
      if (event.type === 'checkout.session.completed' && changePublicId && ('payment_status' in object ? object.payment_status === 'paid' : true)) {
        const change = await this.client.subscriptionPlanChange.findUnique({ where: { publicId: changePublicId }, include: { subscription: true, targetPlan: { include: { billingOptions: true } } } });
        if (change && change.status !== 'APPLIED') {
          if (change.status === 'PENDING_PAYMENT') await this.client.subscriptionPlanChange.update({ where: { id: change.id }, data: { status: 'PAID', paidAt: new Date(), paymentProvider: 'stripe', paymentReference: 'payment_intent' in object ? object.payment_intent?.toString() ?? null : null } });
          await new SubscriptionPlanChangeService(this.client).applyPlanChange(change.publicId);
          if (change.subscription.stripeSubscriptionId) {
            const option = change.targetPlan.billingOptions.find((item) => item.active && item.billingCycle === change.targetBillingCycle);
            if (option?.stripePriceId) {
              const remote = await this.stripe.subscriptions.retrieve(change.subscription.stripeSubscriptionId);
              const item = remote.items.data[0];
              if (item) await this.stripe.subscriptions.update(change.subscription.stripeSubscriptionId, { items: [{ id: item.id, price: option.stripePriceId }], proration_behavior: 'none', billing_cycle_anchor: 'now' });
            }
          }
        }
      }
      let stripeSubscriptionId: string | undefined = 'subscription' in object && typeof object.subscription === 'string' ? object.subscription : undefined;
      if (tenantSubscriptionPublicId) {
        const local = await this.client.tenantSubscription.findUnique({ where: { publicId: tenantSubscriptionPublicId }, select: { tenantId: true } });
        tenantId = local?.tenantId.toString() ?? tenantId;
      }
      if (!tenantId && object.metadata?.tenantPublicId && this.client.tenant) {
        const local = await this.client.tenant.findUnique({ where: { publicId: object.metadata.tenantPublicId }, select: { id: true } });
        tenantId = local?.id.toString();
      }
      if (!tenantId && stripeSubscriptionId) {
        const local = await this.client.tenantSubscription.findUnique({ where: { stripeSubscriptionId }, select: { tenantId: true } });
        tenantId = local?.tenantId.toString();
      }
      if (!tenantId && 'customer' in object && typeof object.customer === 'string') {
        const local = await this.client.tenantSubscription.findFirst({ where: { stripeCustomerId: object.customer }, select: { tenantId: true } });
        tenantId = local?.tenantId.toString();
      }
      if (tenantId) {
        const subscription = await this.client.tenantSubscription.findFirst({ where: { tenantId: BigInt(tenantId), effectiveKey: 'EFFECTIVE' } });
        if (subscription) {
          const eventAt = event.created ? new Date(event.created * 1000) : null;
          // A paid invoice is a positive financial confirmation and may arrive
          // after a newer failure event due to delivery reordering. It must be
          // allowed to recover the entitlement; older negative events remain
          // stale once this confirmation has been recorded.
          if (event.type !== 'invoice.paid' && eventAt && subscription.lastStripeEventAt && subscription.lastStripeEventAt.getTime() >= eventAt.getTime()) {
            await this.client.stripeWebhookEvent.update({ where: { externalEventId: event.id }, data: { processingStatus: 'PROCESSED', processedAt: new Date() } });
            return { received: true, stale: true };
          }
          const paymentConfirmed =
            event.type === 'invoice.paid' ||
            (event.type === 'checkout.session.completed' &&
              object.metadata?.operation === 'UPGRADE_ADJUSTMENT' &&
              'payment_status' in object &&
              object.payment_status === 'paid');
          const remoteObject = object as any;
          const isFullRefund = event.type === 'charge.refunded' && typeof remoteObject.amount === 'number' && typeof remoteObject.amount_refunded === 'number' && remoteObject.amount_refunded >= remoteObject.amount;
          const isUpgradeAdjustmentRefund = event.type === 'charge.refunded' && remoteObject.metadata?.operation === 'UPGRADE_ADJUSTMENT';
          const isCurrentCycleRefund = !eventAt || !subscription.currentPeriodStartsAt || eventAt >= subscription.currentPeriodStartsAt;
          if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
            if (typeof stripeSubscriptionId !== 'string' || !subscription.stripeSubscriptionId || stripeSubscriptionId !== subscription.stripeSubscriptionId)
              throw new AppError({ code: 'STRIPE_INVOICE_SUBSCRIPTION_MISMATCH', message: 'O Invoice Stripe não corresponde à assinatura local.', statusCode: 400 });
            if (typeof object.currency !== 'string' || (subscription.currency && object.currency.toUpperCase() !== subscription.currency.toUpperCase()))
              throw new AppError({ code: 'STRIPE_INVOICE_CURRENCY_MISMATCH', message: 'A moeda do Invoice Stripe não corresponde à assinatura.', statusCode: 400 });
            const amountPaid = 'amount_paid' in object ? object.amount_paid : null;
            if (typeof amountPaid === 'number' && amountPaid < 0) throw new AppError({ code: 'STRIPE_INVOICE_AMOUNT_INVALID', message: 'O valor pago do Invoice Stripe é inválido.', statusCode: 400 });
            const linePriceId = remoteObject.lines?.data?.find((line: any) => line?.price?.id)?.price?.id;
            if (typeof linePriceId !== 'string') throw new AppError({ code: 'STRIPE_INVOICE_PRICE_MISSING', message: 'O Invoice Stripe não contém Price recorrente verificável.', statusCode: 400 });
            const pendingPrices = this.client.subscriptionPlanChange?.findMany
              ? await this.client.subscriptionPlanChange.findMany({ where: { subscriptionId: subscription.id, stripeSubscriptionId, status: 'PENDING_PAYMENT' } })
              : [];
            const acceptedPriceIds = new Set([subscription.stripePriceId, ...pendingPrices.map((change: any) => (change.metadata as any)?.stripePriceId)]);
            if (!acceptedPriceIds.has(linePriceId)) throw new AppError({ code: 'STRIPE_INVOICE_PRICE_MISMATCH', message: 'O Price do Invoice Stripe não corresponde ao plano contratado ou à alteração pendente.', statusCode: 400 });
            const period = remoteObject.lines?.data?.find((line: any) => line?.price?.id === linePriceId)?.period;
            if (period?.start && period?.end && subscription.currentPeriodEndsAt && period.start * 1000 < subscription.currentPeriodEndsAt.getTime() && !pendingPrices.length)
              throw new AppError({ code: 'STRIPE_INVOICE_CYCLE_MISMATCH', message: 'O ciclo do Invoice Stripe não corresponde ao ciclo local.', statusCode: 400 });
          }
          const status = event.type === 'charge.refunded'
            ? (isFullRefund && isCurrentCycleRefund && !isUpgradeAdjustmentRefund ? 'SUSPENDED' : subscription.status)
            : event.type.includes('payment_failed')
            ? 'PAST_DUE'
            : event.type.includes('deleted')
              ? 'CANCELED'
              : paymentConfirmed
                ? 'ACTIVE'
                : subscription.status;
          const data: any = { billingProvider: 'stripe', lastStripeEventAt: eventAt ?? new Date(), status };
          if (event.type === 'charge.refunded' && isFullRefund && isCurrentCycleRefund && !isUpgradeAdjustmentRefund) { data.canceledAt = eventAt ?? new Date(); data.endsAt = eventAt ?? new Date(); data.suspendedAt = eventAt ?? new Date(); }
          if ('id' in object && event.type.includes('subscription')) data.stripeSubscriptionId = object.id;
          if (stripeSubscriptionId) data.stripeSubscriptionId = stripeSubscriptionId;
          if (tenantSubscriptionPublicId && event.type === 'checkout.session.completed' && 'subscription' in object && typeof object.subscription === 'string') data.stripeSubscriptionId = object.subscription;
          if (tenantSubscriptionPublicId && event.type === 'checkout.session.completed' && object.metadata?.billingCycle) data.billingCycle = object.metadata.billingCycle;
          if (paymentConfirmed) {
            const paidAt = new Date();
            data.lastPaymentAt = paidAt;
            if (subscription.status === 'TRIALING') {
              const end = new Date(paidAt);
              end.setUTCMonth(end.getUTCMonth() + ({ MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, ANNUAL: 12, CUSTOM: 1 }[subscription.billingCycle] ?? 1));
              data.currentPeriodStartsAt = paidAt;
              data.currentPeriodEndsAt = end;
              data.trialEndsAt = paidAt;
            }
          }
          if (event.type === 'invoice.paid') {
            const candidates = !this.client.subscriptionPlanChange?.findMany ? [] : changePublicId
              ? await this.client.subscriptionPlanChange.findMany({ where: { publicId: changePublicId } })
              : stripeSubscriptionId
                ? await this.client.subscriptionPlanChange.findMany({ where: { subscriptionId: subscription.id, stripeSubscriptionId, status: 'PENDING_PAYMENT' } })
                : [];
            const change = candidates.length === 1 ? candidates[0] : null;
            if (change?.status === 'PENDING_PAYMENT') {
              await this.client.subscriptionPlanChange.update({ where: { id: change.id }, data: { status: 'PAID', paidAt: new Date(), paymentProvider: 'stripe', paymentReference: 'id' in object ? object.id : null } });
              await new SubscriptionPlanChangeService(this.client).applyPlanChange(change.publicId);
            }
          }
          const remote = object as any;
          if (event.type.startsWith('customer.subscription.') || event.type === 'checkout.session.completed') {
            if (typeof remote.current_period_start === 'number') data.currentPeriodStartsAt = new Date(remote.current_period_start * 1000);
            if (typeof remote.current_period_end === 'number') data.currentPeriodEndsAt = new Date(remote.current_period_end * 1000);
            if (typeof remote.cancel_at_period_end === 'boolean') data.cancelAtPeriodEnd = remote.cancel_at_period_end;
            const remotePrice = remote.items?.data?.[0]?.price;
            if (remotePrice?.id) data.stripePriceId = remotePrice.id;
          }
          if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
            const period = remote.lines?.data?.[0]?.period;
            if (typeof period?.start === 'number') data.currentPeriodStartsAt = new Date(period.start * 1000);
            if (typeof period?.end === 'number') data.currentPeriodEndsAt = new Date(period.end * 1000);
          }
          await this.client.tenantSubscription.update({ where: { id: subscription.id }, data });
        }
      }
      await this.client.stripeWebhookEvent.update({ where: { externalEventId: event.id }, data: { processingStatus: 'PROCESSED', processedAt: new Date() } });
    } catch (error) { await this.client.stripeWebhookEvent.update({ where: { externalEventId: event.id }, data: { processingStatus: 'FAILED', lastError: error instanceof Error ? error.message : 'unknown' } }); throw error; }
    return { received: true };
  }

  private async reconcileSubscriptionScheduleEvent(eventType: string, scheduleId: string, scheduleObject?: any) {
    const changes = await this.client.subscriptionPlanChange.findMany({ where: { status: { in: ['SCHEDULED', 'PENDING_PAYMENT'] } }, include: { subscription: true } });
    const change = changes.find((candidate) => (candidate.metadata as Record<string, unknown> | null)?.stripeScheduleId === scheduleId);
    if (!change) return;
    if (eventType === 'subscription_schedule.completed') {
      if (change.status === 'SCHEDULED') await this.client.subscriptionPlanChange.update({ where: { id: change.id }, data: { status: 'PENDING_PAYMENT', expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
      return;
    }
    const scheduleStatus = scheduleObject?.status;
    if (eventType === 'subscription_schedule.canceled' || eventType === 'subscription_schedule.released' || eventType === 'subscription_schedule.aborted' || scheduleStatus === 'canceled' || scheduleStatus === 'released') {
      await this.client.subscriptionPlanChange.update({ where: { id: change.id }, data: { status: 'CANCELED', failureReason: `Stripe schedule ${eventType.replace('subscription_schedule.', '')}.` } });
      await this.client.tenantSubscription.update({ where: { id: change.subscriptionId }, data: { scheduledPlanId: null, scheduledBillingCycle: null, scheduledEffectiveAt: null } });
    }
  }
}

export async function syncStripePrice(client: PrismaClient, stripe: Stripe, optionId: bigint, amountCents: bigint, currency: string, productId: string) {
  const option = await client.planBillingOption.findUnique({ where: { id: optionId } });
  if (!option) throw new AppError({ code: 'BILLING_OPTION_NOT_FOUND', message: 'Opção de cobrança não encontrada.', statusCode: 404 });
  const recurring = cycle(option.billingCycle);
  const price = await stripe.prices.create({ product: productId, currency: currency.toLowerCase(), unit_amount: Number(amountCents), recurring, metadata: { billingOptionId: optionId.toString() } }, { idempotencyKey: `agendei:price:${optionId}:${amountCents}` });
  return client.planBillingOption.update({ where: { id: optionId }, data: { stripePriceId: price.id } });
}
