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
    const endpoint = await this.stripe.webhookEndpoints.create({ url: this.webhookUrl(), enabled_events: ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed'] });
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
          if (current && current.amountCents === option.priceCents) continue;
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

  public async checkout(tenantId: bigint, planPublicId: string, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL', email: string) {
    void tenantId; void planPublicId; void billingCycle; void email;
    throw new AppError({ code: 'STRIPE_CHANGE_REFERENCE_REQUIRED', message: 'O checkout de assinatura deve usar uma alteração de plano criada pelo servidor.', statusCode: 409 });
  }

  public async checkoutChange(tenantId: bigint, changePublicId: string, email: string) {
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
    const session = await this.stripe.checkout.sessions.create({ mode: 'payment', customer: customerId, line_items: [{ price_data: { currency: change.currency.toLowerCase(), unit_amount: Number(change.amountDueCents), product_data: { name: `Alteração para ${change.targetPlan.name}` } }, quantity: 1 }], success_url: `${this.appWebUrl}/planos?checkout=success`, cancel_url: `${this.appWebUrl}/planos?checkout=cancelled`, metadata: { tenantId: tenantId.toString(), subscriptionChangePublicId: change.publicId }, payment_intent_data: { metadata: { tenantId: tenantId.toString(), subscriptionChangePublicId: change.publicId } } }, { idempotencyKey: `agendei:change-checkout:${change.publicId}` });
    await this.client.subscriptionPlanChange.update({ where: { id: change.id }, data: { paymentProvider: 'stripe', stripeCheckoutSessionId: session.id, paymentReference: session.payment_intent?.toString() ?? null } });
    return { url: session.url };
  }

  public async cancelAtPeriodEnd(tenantId: bigint) {
    await this.ensureConfigured();
    const subscription = await this.client.tenantSubscription.findFirst({ where: { tenantId, effectiveKey: 'EFFECTIVE' } });
    if (!subscription?.stripeSubscriptionId) throw new AppError({ code: 'STRIPE_SUBSCRIPTION_NOT_FOUND', message: 'Este estabelecimento ainda não possui uma assinatura Stripe.', statusCode: 409 });
    const updated = await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
    await this.client.tenantSubscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: true, lastStripeEventAt: new Date() } });
    const periodEnd = updated.items.data[0]?.current_period_end;
    return { cancelAtPeriodEnd: updated.cancel_at_period_end, currentPeriodEndsAt: new Date(periodEnd ? periodEnd * 1000 : subscription.currentPeriodEndsAt.getTime()) };
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
    try {
      await this.client.stripeWebhookEvent.create({ data: { externalEventId: event.id, eventType: event.type, processingStatus: 'PROCESSING' } });
    } catch {
      const prior = await this.client.stripeWebhookEvent.findUnique({ where: { externalEventId: event.id } });
      if (prior?.processingStatus === 'PROCESSED') return { received: true, duplicate: true };
      if (!prior) throw new AppError({ code: 'STRIPE_EVENT_PERSISTENCE_FAILED', message: 'Não foi possível registrar o evento Stripe.', statusCode: 503 });
    }
    try {
      const object = event.data.object as Stripe.Subscription | Stripe.Invoice | Stripe.Checkout.Session;
      let tenantId = object.metadata?.tenantId;
      const changePublicId = object.metadata?.subscriptionChangePublicId;
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
          const status = event.type.includes('payment_failed') ? 'PAST_DUE' : event.type.includes('deleted') ? 'CANCELED' : event.type.includes('subscription') || event.type.includes('completed') || event.type.includes('paid') ? 'ACTIVE' : subscription.status;
          const data: any = { billingProvider: 'stripe', lastStripeEventAt: new Date(), status };
          if ('id' in object && event.type.includes('subscription')) data.stripeSubscriptionId = object.id;
          if (stripeSubscriptionId) data.stripeSubscriptionId = stripeSubscriptionId;
          if (event.type === 'invoice.paid') data.lastPaymentAt = new Date();
          await this.client.tenantSubscription.update({ where: { id: subscription.id }, data });
        }
      }
      await this.client.stripeWebhookEvent.update({ where: { externalEventId: event.id }, data: { processingStatus: 'PROCESSED', processedAt: new Date() } });
    } catch (error) { await this.client.stripeWebhookEvent.update({ where: { externalEventId: event.id }, data: { processingStatus: 'FAILED', lastError: error instanceof Error ? error.message : 'unknown' } }); throw error; }
    return { received: true };
  }
}

export async function syncStripePrice(client: PrismaClient, stripe: Stripe, optionId: bigint, amountCents: bigint, currency: string, productId: string) {
  const option = await client.planBillingOption.findUnique({ where: { id: optionId } });
  if (!option) throw new AppError({ code: 'BILLING_OPTION_NOT_FOUND', message: 'Opção de cobrança não encontrada.', statusCode: 404 });
  const recurring = cycle(option.billingCycle);
  const price = await stripe.prices.create({ product: productId, currency: currency.toLowerCase(), unit_amount: Number(amountCents), recurring, metadata: { billingOptionId: optionId.toString() } }, { idempotencyKey: `agendei:price:${optionId}:${amountCents}` });
  return client.planBillingOption.update({ where: { id: optionId }, data: { stripePriceId: price.id } });
}
