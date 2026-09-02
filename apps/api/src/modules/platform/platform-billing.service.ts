import { randomUUID } from 'node:crypto';

import {
  PlatformChargeResponseSchema,
  PlatformFinanceOverviewSchema,
  PlatformSubscriptionBillingSchema,
  PlatformFinanceDashboardSchema,
  PlatformFinanceReceiptsResponseSchema,
  PlatformFinanceSubscriptionsResponseSchema,
  PlatformFinanceDelinquencyResponseSchema,
  type PaymentGatewayEnvironment,
} from '@plataforma/shared';
import QRCode from 'qrcode';

import { Prisma, type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { type CredentialsCipher } from '../payments/gateway/credentials-cipher.js';
import { type PaymentGatewayProviderRegistry } from '../payments/gateway/provider-registry.js';

export const monthlyFactor: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
  CUSTOM: 1,
};
export const monthlyCentsFrom = (priceCents: bigint, billingCycle: string): bigint =>
  priceCents / BigInt(monthlyFactor[billingCycle] ?? 1);
export const monthKey = (date: Date): string =>
  `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
export const startOfMonthUtc = (date: Date, offsetMonths = 0): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offsetMonths, 1));
export const bucketOfDays = (days: number): '1-7' | '8-15' | '16-30' | '30+' => {
  if (days <= 7) return '1-7';
  if (days <= 15) return '8-15';
  if (days <= 30) return '16-30';
  return '30+';
};

/** Escapes one CSV field per RFC 4180 (quote if it contains the separator/quote/newline). */
export function csvField(value: string): string {
  return /[;"\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
// Separator is ";" (not ",") and the output is prefixed with a UTF-8 BOM:
// this export is opened by end users double-clicking a .csv in Excel on
// Windows in a pt-BR locale, where "," is the decimal separator, so Excel's
// own default list separator is ";" — a comma-separated file opens with the
// whole row crammed into column A instead of split into columns. The BOM is
// what makes Excel detect UTF-8 on that same double-click-open path instead
// of guessing the system codepage and mangling accented characters (e.g.
// "não" -> "nÃ£o"). LibreOffice always shows an explicit import dialog
// regardless, so neither change affects it.
const CSV_BOM = '﻿';
export function toCsv(headers: string[], rows: string[][]): string {
  return CSV_BOM + [headers, ...rows].map((row) => row.map(csvField).join(';')).join('\n');
}

/**
 * Resolves which plan a subscription was actually on at a given moment.
 *
 * Why this exists: TenantSubscription.planId is mutated in place on every
 * plan change (changeSubscriptionPlan() does an UPDATE, never inserts a new
 * row), and PlatformSubscriptionCharge has no plan snapshot of its own. So
 * `charge.subscription.plan` always resolves to the subscription's CURRENT
 * plan, which silently misattributes old receipts to whatever plan the
 * tenant is on today after an upgrade/downgrade.
 *
 * SubscriptionHistory is the one real, already-existing source that lets
 * this be reconstructed without a migration: every plan-setting event
 * (initial CREATED/TRIAL_STARTED, and every later PLAN_CHANGED) records
 * `newPlanId` with its own `createdAt`. The plan in effect "at" a given
 * timestamp is the newPlanId of the last such event at or before it.
 *
 * `events` must be pre-sorted ascending by createdAt (loadPlanHistory does
 * this via the DB query, not here, so this stays a pure, cheap lookup).
 */
export function resolvePlanIdAt(
  events: { createdAt: Date; newPlanId: bigint }[] | undefined,
  at: Date,
  fallbackPlanId: bigint,
): bigint {
  if (!events || events.length === 0) return fallbackPlanId;
  let resolved: bigint | null = null;
  for (const event of events) {
    if (event.createdAt.getTime() > at.getTime()) break;
    resolved = event.newPlanId;
  }
  return resolved ?? fallbackPlanId;
}

interface Actor {userId:bigint|null;sessionId:bigint|null}
const providers=['pix-local','mercadopago'] as const;
const months:Record<string,number>={MONTHLY:1,QUARTERLY:3,SEMIANNUAL:6,ANNUAL:12,CUSTOM:1};

export class PlatformBillingService {
  public constructor(private readonly client:PrismaClient,private readonly registry:PaymentGatewayProviderRegistry,private readonly cipher:CredentialsCipher|undefined){}
  private publicCharge(charge:{publicId:string;subscription:{publicId:string};provider:string;environment:PaymentGatewayEnvironment;externalId:string|null;status:string;amountCents:bigint;currency:string;pixCopyPaste:string|null;paidAt:Date|null;createdAt:Date}){return {publicId:charge.publicId,subscriptionPublicId:charge.subscription.publicId,provider:charge.provider,environment:charge.environment,externalId:charge.externalId,status:charge.status,amountCents:charge.amountCents.toString(),currency:charge.currency,pixCopyPaste:charge.pixCopyPaste,paidAt:charge.paidAt?.toISOString()??null,createdAt:charge.createdAt.toISOString()};}
  public async overview(){const configs=await this.client.platformPaymentConfig.findMany();const items=providers.map(provider=>{const config=configs.find(c=>c.provider===provider);const visible=config?.credentialsCiphertext&&this.cipher?this.cipher.decrypt(config.credentialsCiphertext):{};return {provider,active:config?.active??false,environment:config?.environment??'SANDBOX',hasCredentials:config?.credentialsCiphertext!==null&&config!==undefined,keyType:typeof visible.keyType==='string'?visible.keyType:null,receiverName:typeof visible.receiverName==='string'?visible.receiverName:null,city:typeof visible.city==='string'?visible.city:null,updatedAt:(config?.updatedAt??new Date(0)).toISOString()};});return PlatformFinanceOverviewSchema.parse({configs:items,manualActivationEnabled:configs.find(c=>c.provider==='manual')?.active??true});}
  public async upsert(provider:string,input:{active:boolean;environment:PaymentGatewayEnvironment;credentials?:Record<string,unknown>},actor:Actor){if(!providers.includes(provider as typeof providers[number]))throw new AppError({code:'PLATFORM_PAYMENT_PROVIDER_INVALID',message:'Método de pagamento inválido.',statusCode:400});let encrypted:string|undefined;if(input.credentials){if(!this.cipher)throw new AppError({code:'GATEWAY_ENCRYPTION_NOT_CONFIGURED',message:'A criptografia de credenciais não está configurada.',statusCode:503});encrypted=this.cipher.encrypt(input.credentials);}const config=await this.client.platformPaymentConfig.upsert({where:{provider},create:{publicId:randomUUID(),provider,active:input.active,environment:input.environment,...(encrypted?{credentialsCiphertext:encrypted}:{})},update:{active:input.active,environment:input.environment,...(encrypted?{credentialsCiphertext:encrypted}:{})}});await this.client.auditLog.create({data:{publicId:randomUUID(),userId:actor.userId,sessionId:actor.sessionId,action:'platform.billing.config_updated',targetType:'platform_payment_config',targetPublicId:config.publicId,metadata:{provider,active:input.active,credentialsReplaced:encrypted!==undefined}}});return this.overview();}
  public async setManual(active:boolean,actor:Actor){await this.upsertManual(active,actor);return this.overview();}
  public async requireManualActivationEnabled(){const config=await this.client.platformPaymentConfig.findUnique({where:{provider:'manual'}});if(config?.active===false)throw new AppError({code:'PLATFORM_MANUAL_ACTIVATION_DISABLED',message:'A ativação manual está desativada.',statusCode:409});}
  private async upsertManual(active:boolean,actor:Actor){const config=await this.client.platformPaymentConfig.upsert({where:{provider:'manual'},create:{publicId:randomUUID(),provider:'manual',active,environment:'PRODUCTION'},update:{active}});await this.client.auditLog.create({data:{publicId:randomUUID(),userId:actor.userId,sessionId:actor.sessionId,action:'platform.billing.manual_activation_updated',targetType:'platform_payment_config',targetPublicId:config.publicId,metadata:{active}}});}
  public async tenantOverview(tenantId:bigint){const subscription=await this.subscriptionForTenant(tenantId);const [configs,latest]=await Promise.all([this.client.platformPaymentConfig.findMany({where:{provider:{in:[...providers]},active:true,credentialsCiphertext:{not:null}}}),this.client.platformSubscriptionCharge.findFirst({where:{subscriptionId:subscription.id},orderBy:{createdAt:'desc'},include:{subscription:{select:{publicId:true}}}})]);return PlatformSubscriptionBillingSchema.parse({methods:configs.map(c=>c.provider),manualActivationEnabled:false,latestCharge:latest?this.publicCharge(latest):null});}
  public async subscriptionOverview(publicId:string){const subscription=await this.client.tenantSubscription.findUnique({where:{publicId}});if(!subscription)throw new AppError({code:'PLATFORM_SUBSCRIPTION_NOT_FOUND',message:'Assinatura não encontrada.',statusCode:404});const result=await this.tenantOverview(subscription.tenantId);const finance=await this.overview();return {...result,manualActivationEnabled:finance.manualActivationEnabled};}
  public async createTenantCharge(tenantId:bigint,provider:string){const subscription=await this.subscriptionForTenant(tenantId);return this.createCharge(subscription.publicId,provider);}
  public async createCharge(subscriptionPublicId:string,provider:string){const subscription=await this.client.tenantSubscription.findUnique({where:{publicId:subscriptionPublicId},include:{plan:{include:{billingOptions:true}}}});if(!subscription)throw new AppError({code:'PLATFORM_SUBSCRIPTION_NOT_FOUND',message:'Assinatura não encontrada.',statusCode:404});const option=subscription.plan.billingOptions.find(o=>o.billingCycle===subscription.billingCycle&&o.active);if(!option)throw new AppError({code:'BILLING_OPTION_UNAVAILABLE',message:'A opção de cobrança da assinatura não está disponível.',statusCode:409});const config=await this.client.platformPaymentConfig.findUnique({where:{provider}});if(!config?.active||!config.credentialsCiphertext||!this.cipher)throw new AppError({code:'PLATFORM_PAYMENT_METHOD_UNAVAILABLE',message:'Este método de pagamento não está disponível.',statusCode:409});const adapter=this.registry.get(provider);if(!adapter)throw new AppError({code:'GATEWAY_PROVIDER_NOT_IMPLEMENTED',message:'Gateway não implementado.',statusCode:501});const idempotencyKey=`platform:${subscription.publicId}:${randomUUID()}`;const result=await adapter.createCharge(this.cipher.decrypt(config.credentialsCiphertext),config.environment,{amountCents:option.priceCents,currency:subscription.currency,description:`Assinatura ${subscription.plan.name}`,idempotencyKey});const charge=await this.client.platformSubscriptionCharge.create({data:{publicId:randomUUID(),subscriptionId:subscription.id,provider,environment:config.environment,externalId:result.externalId,status:result.status,amountCents:option.priceCents,currency:subscription.currency,idempotencyKey,pixCopyPaste:result.pixCopyPaste??null},include:{subscription:{select:{publicId:true}}}});return PlatformChargeResponseSchema.parse({charge:this.publicCharge(charge),...(charge.pixCopyPaste?{qrCodeDataUrl:await QRCode.toDataURL(charge.pixCopyPaste)}:{})});}
  public async confirm(chargePublicId:string,actor:Actor){const charge=await this.client.platformSubscriptionCharge.findUnique({where:{publicId:chargePublicId}});if(!charge)throw new AppError({code:'PLATFORM_CHARGE_NOT_FOUND',message:'Cobrança não encontrada.',statusCode:404});await this.markPaid(charge.id,actor,'Confirmação manual de pagamento');return this.client.platformSubscriptionCharge.findUniqueOrThrow({where:{id:charge.id},include:{subscription:{select:{publicId:true}}}}).then(c=>PlatformChargeResponseSchema.parse({charge:this.publicCharge(c)}));}
  private async markPaid(id:bigint,actor:Actor,reason:string){await this.client.$transaction(async tx=>{const charge=await tx.platformSubscriptionCharge.findUniqueOrThrow({where:{id},include:{subscription:true}});if(charge.status==='PAID')return;const start=new Date(Math.max(Date.now(),charge.subscription.currentPeriodEndsAt.getTime()));const end=new Date(start);end.setUTCMonth(end.getUTCMonth()+(months[charge.subscription.billingCycle]??1));await tx.platformSubscriptionCharge.update({where:{id},data:{status:'PAID',paidAt:new Date()}});await tx.tenantSubscription.update({where:{id:charge.subscriptionId},data:{status:'ACTIVE',effectiveKey:'EFFECTIVE',currentPeriodStartsAt:start,currentPeriodEndsAt:end,suspendedAt:null}});await tx.subscriptionHistory.create({data:{publicId:randomUUID(),subscriptionId:charge.subscriptionId,tenantId:charge.subscription.tenantId,action:'PAYMENT_CONFIRMED',previousStatus:charge.subscription.status,newStatus:'ACTIVE',previousPlanId:charge.subscription.planId,newPlanId:charge.subscription.planId,reason,performedByUserId:actor.userId}});await tx.auditLog.create({data:{publicId:randomUUID(),tenantId:charge.subscription.tenantId,userId:actor.userId,sessionId:actor.sessionId,action:'platform.subscription.payment_confirmed',targetType:'platform_subscription_charge',targetPublicId:charge.publicId,metadata:{provider:charge.provider,amountCents:charge.amountCents.toString()}}});});}
  public async webhook(provider:string,rawBody:string,headers:Record<string,string>){const config=await this.client.platformPaymentConfig.findUnique({where:{provider}});const adapter=this.registry.get(provider);if(!config?.active||!config.credentialsCiphertext||!this.cipher||!adapter)throw new AppError({code:'PLATFORM_WEBHOOK_UNAVAILABLE',message:'Webhook indisponível.',statusCode:404});const credentials=this.cipher.decrypt(config.credentialsCiphertext);if(!adapter.verifyWebhookSignature(credentials,config.environment,rawBody,headers))throw new AppError({code:'PLATFORM_WEBHOOK_INVALID',message:'Assinatura do webhook inválida.',statusCode:401});const event=adapter.parseWebhookEvent(rawBody);if(!event.externalId)return {received:true};const charge=await this.client.platformSubscriptionCharge.findFirst({where:{provider,externalId:event.externalId}});if(!charge)return {received:true};const remote=await adapter.getCharge(credentials,config.environment,event.externalId);if(remote.status==='PAID')await this.markPaid(charge.id,{userId:null,sessionId:null},'Pagamento confirmado pelo Mercado Pago');else await this.client.platformSubscriptionCharge.update({where:{id:charge.id},data:{status:remote.status}});return {received:true};}
  private async subscriptionForTenant(tenantId:bigint){const value=await this.client.tenantSubscription.findFirst({where:{tenantId,effectiveKey:'EFFECTIVE'},orderBy:{createdAt:'desc'}})??await this.client.tenantSubscription.findFirst({where:{tenantId},orderBy:{createdAt:'desc'}});if(!value)throw new AppError({code:'TENANT_SUBSCRIPTION_NOT_FOUND',message:'Assinatura não encontrada.',statusCode:404});return value;}

  // -------------------------------------------------------------------
  // Financeiro — analytics read-only (Fase 1).
  //
  // Two concepts, never mixed:
  //   - "Recebido" (received): PlatformSubscriptionCharge, status='PAID',
  //     paidAt != null. Real money.
  //   - "MRR contratado" (contracted): TenantSubscription.priceCents /
  //     billingCycle for effectiveKey='EFFECTIVE' subscriptions — the
  //     exact same rule already used by PlatformService.dashboard() for
  //     "Receita recorrente estimada". A contractual estimate, never a
  //     receipt.
  // -------------------------------------------------------------------

  /** Plan-setting SubscriptionHistory events for a set of subscriptions, grouped and sorted ascending — the input resolvePlanIdAt() expects. */
  private async loadPlanHistory(subscriptionIds: bigint[]): Promise<Map<string, { createdAt: Date; newPlanId: bigint }[]>> {
    if (subscriptionIds.length === 0) return new Map();
    const events = await this.client.subscriptionHistory.findMany({
      where: { subscriptionId: { in: subscriptionIds }, newPlanId: { not: null } },
      select: { subscriptionId: true, createdAt: true, newPlanId: true },
      orderBy: { createdAt: 'asc' },
    });
    const map = new Map<string, { createdAt: Date; newPlanId: bigint }[]>();
    for (const event of events) {
      if (event.newPlanId === null) continue;
      const key = event.subscriptionId.toString();
      const list = map.get(key) ?? [];
      list.push({ createdAt: event.createdAt, newPlanId: event.newPlanId });
      map.set(key, list);
    }
    return map;
  }

  /** publicId/name for every plan, including ones no subscription currently uses — needed because a historically-resolved plan may no longer be anyone's current plan. */
  private async loadPlanLookup(): Promise<Map<string, { publicId: string; name: string }>> {
    const plans = await this.client.commercialPlan.findMany({ select: { id: true, publicId: true, name: true } });
    return new Map(plans.map((plan) => [plan.id.toString(), { publicId: plan.publicId, name: plan.name }]));
  }

  public async financeDashboard() {
    const now = new Date();
    const thisMonthStart = startOfMonthUtc(now);
    const nextMonthStart = startOfMonthUtc(now, 1);
    const lastMonthStart = startOfMonthUtc(now, -1);
    const twelveMonthsAgoStart = startOfMonthUtc(now, -11);

    const [
      receivedThisMonth,
      receivedLastMonth,
      paymentsThisMonth,
      pastDueSubscriptions,
      suspendedSubscriptions,
      newSubscribersThisMonth,
      cancellationsThisMonth,
      effectiveSubscriptions,
      paidChargesLast12Months,
      recentCharges,
    ] = await Promise.all([
      this.client.platformSubscriptionCharge.aggregate({
        _sum: { amountCents: true },
        where: { status: 'PAID', paidAt: { gte: thisMonthStart, lt: nextMonthStart } },
      }),
      this.client.platformSubscriptionCharge.aggregate({
        _sum: { amountCents: true },
        where: { status: 'PAID', paidAt: { gte: lastMonthStart, lt: thisMonthStart } },
      }),
      this.client.platformSubscriptionCharge.count({
        where: { status: 'PAID', paidAt: { gte: thisMonthStart, lt: nextMonthStart } },
      }),
      this.client.tenantSubscription.count({ where: { status: 'PAST_DUE' } }),
      this.client.tenantSubscription.count({ where: { status: 'SUSPENDED' } }),
      this.client.tenantSubscription.count({
        where: { createdAt: { gte: thisMonthStart, lt: nextMonthStart } },
      }),
      this.client.tenantSubscription.count({
        where: { canceledAt: { gte: thisMonthStart, lt: nextMonthStart } },
      }),
      this.client.tenantSubscription.findMany({
        where: { effectiveKey: 'EFFECTIVE' },
        select: {
          priceCents: true,
          billingCycle: true,
          status: true,
          plan: { select: { publicId: true, name: true } },
        },
      }),
      this.client.platformSubscriptionCharge.findMany({
        where: { status: 'PAID', paidAt: { gte: twelveMonthsAgoStart } },
        select: { amountCents: true, paidAt: true },
      }),
      this.client.platformSubscriptionCharge.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { subscription: { include: { tenant: true, plan: true } } },
      }),
    ]);
    const recentChargesPlanHistory = await this.loadPlanHistory(recentCharges.map((charge) => charge.subscriptionId));

    const receivedThisMonthCents = receivedThisMonth._sum.amountCents ?? 0n;
    const receivedLastMonthCents = receivedLastMonth._sum.amountCents ?? 0n;
    const monthOverMonthChangePercent =
      receivedLastMonthCents === 0n
        ? null
        : Number(((receivedThisMonthCents - receivedLastMonthCents) * 10_000n) / receivedLastMonthCents) / 100;

    // effectiveKey='EFFECTIVE' groups TRIALING, ACTIVE, PAST_DUE and
    // SUSPENDED together (see subscriptionEffectiveKey() in
    // platform.service.ts) — CANCELED/EXPIRED are already excluded, which is
    // correct. But PAST_DUE/SUSPENDED represent contracted revenue that
    // isn't actually being paid right now, so mrrContractedCents (kept as
    // the total, unchanged) is split out into mrrAtRiskCents rather than
    // silently presenting it as indistinguishable from healthy MRR.
    const mrrContractedCents = effectiveSubscriptions.reduce(
      (total, sub) => total + monthlyCentsFrom(sub.priceCents, sub.billingCycle),
      0n,
    );
    const mrrAtRiskCents = effectiveSubscriptions
      .filter((sub) => sub.status === 'PAST_DUE' || sub.status === 'SUSPENDED')
      .reduce((total, sub) => total + monthlyCentsFrom(sub.priceCents, sub.billingCycle), 0n);
    const averageTicketCents = paymentsThisMonth > 0 ? receivedThisMonthCents / BigInt(paymentsThisMonth) : null;

    // Recebido no mês, por plano. changeSubscriptionPlan() mutates
    // TenantSubscription.planId in place (no new row per plan change), and
    // PlatformSubscriptionCharge keeps no plan snapshot of its own — so
    // resolving "current" plan via the relation would silently reattribute
    // an old receipt to whatever plan the tenant is on today after an
    // upgrade/downgrade. Resolved instead via SubscriptionHistory
    // (newPlanId on every CREATED/TRIAL_STARTED/PLAN_CHANGED event), the
    // one real historical source that already exists — see resolvePlanIdAt().
    const paidChargesThisMonthByPlan = await this.client.platformSubscriptionCharge.findMany({
      where: { status: 'PAID', paidAt: { gte: thisMonthStart, lt: nextMonthStart } },
      select: { amountCents: true, createdAt: true, subscriptionId: true, subscription: { select: { planId: true } } },
    });
    const [thisMonthPlanHistory, planLookup] = await Promise.all([
      this.loadPlanHistory(paidChargesThisMonthByPlan.map((charge) => charge.subscriptionId)),
      this.loadPlanLookup(),
    ]);
    const receivedByPlanId = new Map<string, bigint>();
    for (const charge of paidChargesThisMonthByPlan) {
      const resolvedPlanId = resolvePlanIdAt(
        thisMonthPlanHistory.get(charge.subscriptionId.toString()),
        charge.createdAt,
        charge.subscription.planId,
      );
      const key = resolvedPlanId.toString();
      receivedByPlanId.set(key, (receivedByPlanId.get(key) ?? 0n) + charge.amountCents);
    }

    // planLookup is keyed by planId; byPlan below needs to merge "currently
    // effective subscriptions" (grouped by the subscription's current plan)
    // with "historically resolved receipts" (grouped by planId) into one
    // table, so build a publicId -> planId reverse index to unify the keys.
    const planIdByPublicId = new Map([...planLookup.entries()].map(([planIdKey, plan]) => [plan.publicId, planIdKey]));

    const byPlanAgg = new Map<
      string,
      { planPublicId: string; planName: string; activeSubscriptions: number; mrrContractedCents: bigint }
    >();
    for (const sub of effectiveSubscriptions) {
      const planIdKey = planIdByPublicId.get(sub.plan.publicId) ?? sub.plan.publicId;
      const current = byPlanAgg.get(planIdKey) ?? {
        planPublicId: sub.plan.publicId,
        planName: sub.plan.name,
        activeSubscriptions: 0,
        mrrContractedCents: 0n,
      };
      if (sub.status === 'ACTIVE') current.activeSubscriptions += 1;
      current.mrrContractedCents += monthlyCentsFrom(sub.priceCents, sub.billingCycle);
      byPlanAgg.set(planIdKey, current);
    }
    // A plan can have received money this month via a resolved historical
    // charge without having any currently-effective subscription anymore
    // (everyone since moved off it) — union both sets so that row isn't
    // silently dropped from the table.
    const allPlanIdKeys = new Set([...byPlanAgg.keys(), ...receivedByPlanId.keys()]);
    const byPlan = [...allPlanIdKeys].map((planIdKey) => {
      const existing = byPlanAgg.get(planIdKey);
      const lookedUp = planLookup.get(planIdKey);
      return {
        planPublicId: existing?.planPublicId ?? lookedUp?.publicId ?? planIdKey,
        planName: existing?.planName ?? lookedUp?.name ?? 'Plano removido',
        activeSubscriptions: existing?.activeSubscriptions ?? 0,
        mrrContractedCents: (existing?.mrrContractedCents ?? 0n).toString(),
        receivedThisMonthCents: (receivedByPlanId.get(planIdKey) ?? 0n).toString(),
      };
    });

    // 12 meses, sempre completos (zero-preenchidos onde não há recebimento).
    const receiptsByMonth = new Map<string, bigint>();
    for (const charge of paidChargesLast12Months) {
      if (!charge.paidAt) continue;
      const key = monthKey(charge.paidAt);
      receiptsByMonth.set(key, (receiptsByMonth.get(key) ?? 0n) + charge.amountCents);
    }
    const monthlyReceipts = Array.from({ length: 12 }, (_, index) => {
      const date = startOfMonthUtc(now, -11 + index);
      const key = monthKey(date);
      return { month: key, amountCents: (receiptsByMonth.get(key) ?? 0n).toString() };
    });

    const recentReceipts = recentCharges.map((charge) => {
      const resolvedPlanId = resolvePlanIdAt(
        recentChargesPlanHistory.get(charge.subscriptionId.toString()),
        charge.createdAt,
        charge.subscription.planId,
      );
      const resolvedPlan = planLookup.get(resolvedPlanId.toString());
      return {
        publicId: charge.publicId,
        createdAt: charge.createdAt.toISOString(),
        tenantPublicId: charge.subscription.tenant.publicId,
        tenantDisplayName: charge.subscription.tenant.displayName,
        planPublicId: resolvedPlan?.publicId ?? charge.subscription.plan.publicId,
        planName: resolvedPlan?.name ?? charge.subscription.plan.name,
        amountCents: charge.amountCents.toString(),
        currency: charge.currency,
        provider: charge.provider,
        status: charge.status,
        paidAt: charge.paidAt?.toISOString() ?? null,
        externalId: charge.externalId,
      };
    });

    return PlatformFinanceDashboardSchema.parse({
      currency: 'BRL',
      receivedThisMonthCents: receivedThisMonthCents.toString(),
      receivedLastMonthCents: receivedLastMonthCents.toString(),
      monthOverMonthChangePercent,
      mrrContractedCents: mrrContractedCents.toString(),
      mrrAtRiskCents: mrrAtRiskCents.toString(),
      paymentsReceivedThisMonth: paymentsThisMonth,
      averageTicketCents: averageTicketCents?.toString() ?? null,
      pastDueSubscriptions,
      suspendedSubscriptions,
      newSubscribersThisMonth,
      cancellationsThisMonth,
      monthlyReceipts,
      byPlan,
      recentReceipts,
      disclaimer:
        'Os recebimentos refletem pagamentos registrados pelo módulo financeiro. Períodos anteriores à adoção deste fluxo podem estar incompletos. O MRR contratado inclui assinaturas em trial, ativas, inadimplentes e suspensas; o valor em risco (inadimplentes/suspensas) é destacado separadamente.',
    });
  }

  public async receipts(query: {
    page: number;
    limit: number;
    from?: string | undefined;
    to?: string | undefined;
    tenantPublicId?: string | undefined;
    planPublicId?: string | undefined;
    provider?: string | undefined;
    status?: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED' | 'CANCELED' | 'EXPIRED' | 'REFUNDED' | undefined;
    format: 'json' | 'csv';
  }) {
    const where: Prisma.PlatformSubscriptionChargeWhereInput = {
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.provider === undefined ? {} : { provider: query.provider }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            createdAt: {
              ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
              ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
            },
          }),
      ...(query.tenantPublicId === undefined && query.planPublicId === undefined
        ? {}
        : {
            subscription: {
              ...(query.tenantPublicId === undefined ? {} : { tenant: { publicId: query.tenantPublicId } }),
              ...(query.planPublicId === undefined ? {} : { plan: { publicId: query.planPublicId } }),
            },
          }),
    };

    if (query.format === 'csv') {
      const rows = await this.client.platformSubscriptionCharge.findMany({
        where,
        take: 5000,
        orderBy: { createdAt: 'desc' },
        include: { subscription: { include: { tenant: true, plan: true } } },
      });
      const [rowsPlanHistory, planLookup] = await Promise.all([
        this.loadPlanHistory(rows.map((row) => row.subscriptionId)),
        this.loadPlanLookup(),
      ]);
      return toCsv(
        ['criado_em', 'estabelecimento', 'plano', 'valor_centavos', 'moeda', 'provider', 'status', 'pago_em', 'external_id'],
        rows.map((row) => {
          const resolvedPlanId = resolvePlanIdAt(
            rowsPlanHistory.get(row.subscriptionId.toString()),
            row.createdAt,
            row.subscription.planId,
          );
          const planName = planLookup.get(resolvedPlanId.toString())?.name ?? row.subscription.plan.name;
          return [
            row.createdAt.toISOString(),
            row.subscription.tenant.displayName,
            planName,
            row.amountCents.toString(),
            row.currency,
            row.provider,
            row.status,
            row.paidAt?.toISOString() ?? '',
            row.externalId ?? '',
          ];
        }),
      );
    }

    const [items, total] = await Promise.all([
      this.client.platformSubscriptionCharge.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { subscription: { include: { tenant: true, plan: true } } },
      }),
      this.client.platformSubscriptionCharge.count({ where }),
    ]);
    const [itemsPlanHistory, planLookup] = await Promise.all([
      this.loadPlanHistory(items.map((item) => item.subscriptionId)),
      this.loadPlanLookup(),
    ]);
    return PlatformFinanceReceiptsResponseSchema.parse({
      items: items.map((charge) => {
        const resolvedPlanId = resolvePlanIdAt(
          itemsPlanHistory.get(charge.subscriptionId.toString()),
          charge.createdAt,
          charge.subscription.planId,
        );
        const resolvedPlan = planLookup.get(resolvedPlanId.toString());
        return {
          publicId: charge.publicId,
          createdAt: charge.createdAt.toISOString(),
          tenantPublicId: charge.subscription.tenant.publicId,
          tenantDisplayName: charge.subscription.tenant.displayName,
          planPublicId: resolvedPlan?.publicId ?? charge.subscription.plan.publicId,
          planName: resolvedPlan?.name ?? charge.subscription.plan.name,
          amountCents: charge.amountCents.toString(),
          currency: charge.currency,
          provider: charge.provider,
          status: charge.status,
          paidAt: charge.paidAt?.toISOString() ?? null,
          externalId: charge.externalId,
        };
      }),
      page: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    });
  }

  public async subscriptionsAnalytics(query: {
    segment?: 'new' | 'canceled' | undefined;
    page: number;
    limit: number;
    from?: string | undefined;
    to?: string | undefined;
    format: 'json' | 'csv';
  }) {
    const now = new Date();
    const thisMonthStart = startOfMonthUtc(now);
    const nextMonthStart = startOfMonthUtc(now, 1);

    const [active, trialing, newThisMonth, canceledThisMonth, effectiveSubscriptions] = await Promise.all([
      this.client.tenantSubscription.count({ where: { status: 'ACTIVE' } }),
      this.client.tenantSubscription.count({ where: { status: 'TRIALING' } }),
      this.client.tenantSubscription.count({
        where: { createdAt: { gte: thisMonthStart, lt: nextMonthStart } },
      }),
      this.client.tenantSubscription.count({
        where: { canceledAt: { gte: thisMonthStart, lt: nextMonthStart } },
      }),
      this.client.tenantSubscription.findMany({
        where: { effectiveKey: 'EFFECTIVE' },
        select: {
          priceCents: true,
          billingCycle: true,
          status: true,
          plan: { select: { publicId: true, name: true } },
        },
      }),
    ]);

    const mrrContractedCents = effectiveSubscriptions.reduce(
      (total, sub) => total + monthlyCentsFrom(sub.priceCents, sub.billingCycle),
      0n,
    );
    const byPlanAgg = new Map<
      string,
      { planPublicId: string; planName: string; activeSubscriptions: number; mrrContractedCents: bigint }
    >();
    for (const sub of effectiveSubscriptions) {
      const current = byPlanAgg.get(sub.plan.publicId) ?? {
        planPublicId: sub.plan.publicId,
        planName: sub.plan.name,
        activeSubscriptions: 0,
        mrrContractedCents: 0n,
      };
      if (sub.status === 'ACTIVE') current.activeSubscriptions += 1;
      current.mrrContractedCents += monthlyCentsFrom(sub.priceCents, sub.billingCycle);
      byPlanAgg.set(sub.plan.publicId, current);
    }

    let segment: { items: unknown[]; page: { page: number; limit: number; total: number; totalPages: number } } | null =
      null;
    if (query.segment) {
      const range = {
        gte: query.from === undefined ? thisMonthStart : new Date(query.from),
        lte: query.to === undefined ? now : new Date(query.to),
      };
      const where: Prisma.TenantSubscriptionWhereInput =
        query.segment === 'new' ? { createdAt: range } : { canceledAt: range };

      if (query.format === 'csv') {
        const rows = await this.client.tenantSubscription.findMany({
          where,
          take: 5000,
          orderBy: { createdAt: 'desc' },
          include: { tenant: true, plan: true },
        });
        return toCsv(
          ['criado_em', 'cancelado_em', 'estabelecimento', 'plano', 'valor_centavos', 'ciclo'],
          rows.map((row) => [
            row.createdAt.toISOString(),
            row.canceledAt?.toISOString() ?? '',
            row.tenant.displayName,
            row.plan.name,
            row.priceCents.toString(),
            row.billingCycle,
          ]),
        );
      }

      const [rows, total] = await Promise.all([
        this.client.tenantSubscription.findMany({
          where,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          orderBy: { createdAt: 'desc' },
          include: { tenant: true, plan: true },
        }),
        this.client.tenantSubscription.count({ where }),
      ]);
      segment = {
        items: rows.map((row) => ({
          publicId: row.publicId,
          tenantPublicId: row.tenant.publicId,
          tenantDisplayName: row.tenant.displayName,
          planPublicId: row.plan.publicId,
          planName: row.plan.name,
          priceCents: row.priceCents.toString(),
          billingCycle: row.billingCycle,
          createdAt: row.createdAt.toISOString(),
          canceledAt: row.canceledAt?.toISOString() ?? null,
        })),
        page: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
      };
    }

    return PlatformFinanceSubscriptionsResponseSchema.parse({
      active,
      trialing,
      newThisMonth,
      canceledThisMonth,
      mrrContractedCents: mrrContractedCents.toString(),
      currency: 'BRL',
      byPlan: [...byPlanAgg.values()].map((entry) => ({
        planPublicId: entry.planPublicId,
        planName: entry.planName,
        activeSubscriptions: entry.activeSubscriptions,
        mrrContractedCents: entry.mrrContractedCents.toString(),
      })),
      segment,
    });
  }

  public async delinquency(query: {
    page: number;
    limit: number;
    status?: 'PAST_DUE' | 'SUSPENDED' | undefined;
    bucket?: '1-7' | '8-15' | '16-30' | '30+' | undefined;
    format: 'json' | 'csv';
  }) {
    const now = new Date();
    const rows = await this.client.tenantSubscription.findMany({
      where: { status: query.status ?? { in: ['PAST_DUE', 'SUSPENDED'] } },
      orderBy: { currentPeriodEndsAt: 'asc' },
      include: { tenant: true, plan: true },
    });

    const withDays = rows.map((row) => ({
      row,
      daysSincePeriodEnd: Math.floor((now.getTime() - row.currentPeriodEndsAt.getTime()) / 86_400_000),
    }));

    const summary = {
      pastDueCount: 0,
      suspendedCount: 0,
      pastDueContractedCents: 0n,
      suspendedContractedCents: 0n,
      buckets: { d1_7: 0, d8_15: 0, d16_30: 0, d30Plus: 0 },
    };
    for (const { row, daysSincePeriodEnd } of withDays) {
      if (row.status === 'PAST_DUE') {
        summary.pastDueCount += 1;
        summary.pastDueContractedCents += row.priceCents;
      } else {
        summary.suspendedCount += 1;
        summary.suspendedContractedCents += row.priceCents;
      }
      const bucket = bucketOfDays(daysSincePeriodEnd);
      if (bucket === '1-7') summary.buckets.d1_7 += 1;
      else if (bucket === '8-15') summary.buckets.d8_15 += 1;
      else if (bucket === '16-30') summary.buckets.d16_30 += 1;
      else summary.buckets.d30Plus += 1;
    }

    const filtered = query.bucket
      ? withDays.filter(({ daysSincePeriodEnd }) => bucketOfDays(daysSincePeriodEnd) === query.bucket)
      : withDays;

    if (query.format === 'csv') {
      return toCsv(
        ['estabelecimento', 'plano', 'valor_contratual_centavos', 'fim_periodo', 'dias', 'carencia_ate', 'status'],
        filtered
          .slice(0, 5000)
          .map(({ row, daysSincePeriodEnd }) => [
            row.tenant.displayName,
            row.plan.name,
            row.priceCents.toString(),
            row.currentPeriodEndsAt.toISOString(),
            String(daysSincePeriodEnd),
            row.graceEndsAt?.toISOString() ?? '',
            row.status,
          ]),
      );
    }

    const total = filtered.length;
    const page = filtered.slice((query.page - 1) * query.limit, (query.page - 1) * query.limit + query.limit);

    return PlatformFinanceDelinquencyResponseSchema.parse({
      summary: {
        pastDueCount: summary.pastDueCount,
        suspendedCount: summary.suspendedCount,
        pastDueContractedCents: summary.pastDueContractedCents.toString(),
        suspendedContractedCents: summary.suspendedContractedCents.toString(),
        buckets: summary.buckets,
      },
      currency: 'BRL',
      items: page.map(({ row, daysSincePeriodEnd }) => ({
        publicId: row.publicId,
        tenantPublicId: row.tenant.publicId,
        tenantDisplayName: row.tenant.displayName,
        planPublicId: row.plan.publicId,
        planName: row.plan.name,
        priceCents: row.priceCents.toString(),
        currency: row.currency,
        currentPeriodEndsAt: row.currentPeriodEndsAt.toISOString(),
        daysSincePeriodEnd,
        graceEndsAt: row.graceEndsAt?.toISOString() ?? null,
        status: row.status as 'PAST_DUE' | 'SUSPENDED',
      })),
      page: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
    });
  }
}
