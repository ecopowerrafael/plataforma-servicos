import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../errors/AppError.js';
import { type PrismaClient } from '../../database-client/client.js';

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
  public constructor(private readonly client: PrismaClient, secretKey: string, webhookSecret: string, private readonly appWebUrl: string) {
    this.stripe = new Stripe(secretKey);
    this.webhookSecret = webhookSecret;
  }

  public reconfigure(secretKey: string, webhookSecret: string) { this.stripe = new Stripe(secretKey); this.webhookSecret = webhookSecret; }

  public async checkout(tenantId: bigint, planPublicId: string, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL', email: string) {
    const plan = await this.client.commercialPlan.findUnique({ where: { publicId: planPublicId }, include: { billingOptions: true } });
    if (!plan || plan.status !== 'ACTIVE') throw new AppError({ code: 'PLAN_NOT_FOUND', message: 'Plano inválido.', statusCode: 404 });
    const option = plan.billingOptions.find((item) => item.active && item.billingCycle === billingCycle);
    if (!option) throw new AppError({ code: 'STRIPE_PRICE_UNAVAILABLE', message: 'O plano ainda não está sincronizado com o Stripe.', statusCode: 409 });
    const subscription = await this.client.tenantSubscription.findFirst({ where: { tenantId, effectiveKey: 'EFFECTIVE' } });
    if (subscription?.stripeSubscriptionId && ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(subscription.status)) throw new AppError({ code: 'STRIPE_SUBSCRIPTION_EXISTS', message: 'Este estabelecimento já possui uma assinatura Stripe.', statusCode: 409 });
    let customerId = subscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({ email, metadata: { tenantId: tenantId.toString() } }, { idempotencyKey: `agendei:customer:${tenantId}` });
      customerId = customer.id;
      if (subscription) await this.client.tenantSubscription.update({ where: { id: subscription.id }, data: { stripeCustomerId: customerId, billingProvider: 'stripe' } });
    }
    const session = await this.stripe.checkout.sessions.create({ mode: 'subscription', customer: customerId, line_items: [{ price: option.stripePriceId!, quantity: 1 }], success_url: `${this.appWebUrl}/planos?checkout=success`, cancel_url: `${this.appWebUrl}/planos?checkout=cancelled`, metadata: { tenantId: tenantId.toString(), planId: plan.id.toString(), billingOptionId: option.id.toString() }, subscription_data: { ...(plan.trialDays && plan.trialDays > 0 ? { trial_period_days: plan.trialDays } : {}), metadata: { tenantId: tenantId.toString(), planId: plan.id.toString(), billingOptionId: option.id.toString() } } }, { idempotencyKey: `agendei:checkout:${tenantId}:${option.id}:${randomUUID()}` });
    return { url: session.url };
  }

  public async cancelAtPeriodEnd(tenantId: bigint) {
    const subscription = await this.client.tenantSubscription.findFirst({ where: { tenantId, effectiveKey: 'EFFECTIVE' } });
    if (!subscription?.stripeSubscriptionId) throw new AppError({ code: 'STRIPE_SUBSCRIPTION_NOT_FOUND', message: 'Este estabelecimento ainda não possui uma assinatura Stripe.', statusCode: 409 });
    const updated = await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
    await this.client.tenantSubscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: true, lastStripeEventAt: new Date() } });
    const periodEnd = updated.items.data[0]?.current_period_end;
    return { cancelAtPeriodEnd: updated.cancel_at_period_end, currentPeriodEndsAt: new Date(periodEnd ? periodEnd * 1000 : subscription.currentPeriodEndsAt.getTime()) };
  }

  public async portal(tenantId: bigint) {
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
