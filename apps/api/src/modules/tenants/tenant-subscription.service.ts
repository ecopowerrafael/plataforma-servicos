import { randomUUID } from 'node:crypto';

import { TenantSubscriptionResponseSchema } from '@plataforma/shared';
import { SubscriptionChangePreviewSchema } from '@plataforma/shared';

import { type PrismaClient } from '../../database-client/client.js';
import { AppError } from '../../errors/AppError.js';
import { mapPlan, mapSubscription } from '../platform/platform.service.js';
import { TenantCommercialPolicyService } from '../platform/tenant-commercial-policy.service.js';
import { TenantCommercialStatusResolver } from '../platform/tenant-commercial-status.resolver.js';

export class TenantSubscriptionService {
  private readonly labels: Record<string,string> = { 'whatsapp.enabled':'WhatsApp','commissions.enabled':'Gestão de comissões','automations.enabled':'Automações','loyalty.enabled':'Fidelidade','products.enabled':'Produtos','stock.enabled':'Estoque','custom_domain.enabled':'Domínio próprio','branding.customization.enabled':'Personalização da marca','professionals.max':'Profissionais','units.max':'Unidades','members.max':'Membros da equipe','services.max':'Serviços','monthly_appointments.max':'Agendamentos por mês' };
  private readonly policyService: TenantCommercialPolicyService;
  private readonly statusResolver: TenantCommercialStatusResolver;

  public constructor(private readonly client: PrismaClient) {
    this.policyService = new TenantCommercialPolicyService(client);
    this.statusResolver = new TenantCommercialStatusResolver();
  }

  public async get(tenantId: bigint) {
    const subscription =
      (await this.client.tenantSubscription.findFirst({
        where: { tenantId, effectiveKey: 'EFFECTIVE' },
        include: { tenant: true, plan: true, scheduledPlan: { include: { limits: true } } },
      })) ??
      (await this.client.tenantSubscription.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        include: { tenant: true, plan: true, scheduledPlan: { include: { limits: true } } },
      }));
    if (subscription === null)
      throw new AppError({
        code: 'TENANT_SUBSCRIPTION_NOT_FOUND',
        message: 'Nenhuma assinatura foi encontrada para este estabelecimento.',
        statusCode: 404,
      });

    const plan = await this.client.commercialPlan.findUniqueOrThrow({
      where: { id: subscription.planId },
      include: { limits: true, benefits: { where: { enabled: true }, orderBy: { sortOrder: 'asc' } } },
    });

    const usageByKey = await this.usageByKey(
      tenantId,
      subscription.currentPeriodStartsAt,
      subscription.currentPeriodEndsAt,
    );

    const policy = await this.policyService.getOrCreateRaw();
    const commercial = this.statusResolver.resolve(subscription, policy);

    return TenantSubscriptionResponseSchema.parse({
      subscription: mapSubscription(subscription),
      plan: mapPlan(plan),
      commercial,
      scheduledChange: subscription.scheduledPlan === null || subscription.scheduledBillingCycle === null || subscription.scheduledEffectiveAt === null ? null : { plan: mapPlan(subscription.scheduledPlan), billingCycle: subscription.scheduledBillingCycle, effectiveAt: subscription.scheduledEffectiveAt.toISOString() },
      limits: plan.limits.map((limit) => ({
        key: limit.key,
        valueType: limit.valueType,
        integerValue: limit.integerValue === null ? null : limit.integerValue.toString(),
        booleanValue: limit.booleanValue,
        stringValue: limit.stringValue,
        usage: usageByKey.get(limit.key) ?? null,
      })),
    });
  }

  public async selectPlan(tenantId: bigint, planPublicId: string, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL') {
    const plan = await this.client.commercialPlan.findUnique({ where: { publicId: planPublicId }, include: { billingOptions: true } });
    if (plan?.status !== 'ACTIVE' || !plan.isPublic)
      throw new AppError({ code: 'PLAN_UNAVAILABLE', message: 'O plano escolhido não está disponível.', statusCode: 409 });
    const option = plan.billingOptions.find((item) => item.billingCycle === billingCycle && item.active);
    if (option === undefined)
      throw new AppError({ code: 'BILLING_OPTION_UNAVAILABLE', message: 'A periodicidade escolhida não está disponível para este plano.', statusCode: 409 });
    const now = new Date();
    const endsAt = new Date(now);
    endsAt.setMonth(endsAt.getMonth() + (billingCycle === 'ANNUAL' ? 12 : billingCycle === 'SEMIANNUAL' ? 6 : billingCycle === 'QUARTERLY' ? 3 : 1));
    const active = await this.client.tenantSubscription.findFirst({ where: { tenantId, effectiveKey: 'EFFECTIVE' }, include: { plan: true } });
    if (active !== null && active.planId === plan.id)
      throw new AppError({ code: 'PLAN_ALREADY_ACTIVE', message: 'Este já é o seu plano atual.', statusCode: 409 });
    if (active !== null && plan.sortOrder < active.plan.sortOrder) {
      await this.client.tenantSubscription.update({ where: { id: active.id }, data: { scheduledPlanId: plan.id, scheduledBillingCycle: billingCycle, scheduledEffectiveAt: active.currentPeriodEndsAt } });
      await this.client.subscriptionHistory.create({ data: { publicId: randomUUID(), subscriptionId: active.id, tenantId, action: 'PLAN_CHANGED', previousPlanId: active.planId, newPlanId: plan.id, previousStatus: active.status, newStatus: active.status, reason: 'Downgrade agendado para o fim do ciclo.' } });
      return this.get(tenantId);
    }
    const subscription = active === null
      ? await this.client.tenantSubscription.create({ data: { publicId: randomUUID(), tenantId, planId: plan.id, status: 'ACTIVE', startsAt: now, currentPeriodStartsAt: now, currentPeriodEndsAt: endsAt, priceCents: option.priceCents, currency: plan.currency, billingCycle, effectiveKey: 'EFFECTIVE' } })
      : await this.client.tenantSubscription.update({ where: { id: active.id }, data: { planId: plan.id, priceCents: option.priceCents, currency: plan.currency, billingCycle, currentPeriodStartsAt: now, currentPeriodEndsAt: endsAt } });
    await this.client.subscriptionHistory.create({ data: { publicId: randomUUID(), subscriptionId: subscription.id, tenantId, action: active === null ? 'CREATED' : 'PLAN_CHANGED', previousPlanId: active?.planId ?? null, newPlanId: plan.id, previousStatus: active?.status ?? null, newStatus: subscription.status, reason: 'Plano selecionado pelo proprietário.' } });
    return this.get(tenantId);
  }

  public async cancelScheduledChange(tenantId: bigint) {
    const active = await this.client.tenantSubscription.findFirst({ where: { tenantId, effectiveKey: 'EFFECTIVE' } });
    if (active === null) throw new AppError({ code: 'TENANT_SUBSCRIPTION_NOT_FOUND', message: 'Nenhuma assinatura foi encontrada para este estabelecimento.', statusCode: 404 });
    if (active.scheduledPlanId === null) throw new AppError({ code: 'NO_SCHEDULED_PLAN_CHANGE', message: 'Não há mudança de plano agendada.', statusCode: 409 });
    await this.client.tenantSubscription.update({ where: { id: active.id }, data: { scheduledPlanId: null, scheduledBillingCycle: null, scheduledEffectiveAt: null } });
    await this.client.subscriptionHistory.create({ data: { publicId: randomUUID(), subscriptionId: active.id, tenantId, action: 'PLAN_CHANGED', previousPlanId: active.planId, newPlanId: active.planId, previousStatus: active.status, newStatus: active.status, reason: 'Mudança de plano agendada cancelada pelo proprietário.' } });
    return this.get(tenantId);
  }

  public async previewChange(tenantId: bigint, planPublicId: string, billingCycle?: 'MONTHLY'|'QUARTERLY'|'SEMIANNUAL'|'ANNUAL') {
    const current = await this.client.tenantSubscription.findFirst({ where: { tenantId, effectiveKey: 'EFFECTIVE' }, include: { plan: { include: { limits: true } } } });
    if (!current) throw new AppError({ code:'TENANT_SUBSCRIPTION_NOT_FOUND',message:'Nenhuma assinatura foi encontrada para este estabelecimento.',statusCode:404 });
    const target = await this.client.commercialPlan.findUnique({ where:{publicId:planPublicId}, include:{limits:true,billingOptions:true} });
    if (!target?.isPublic || target.status !== 'ACTIVE') throw new AppError({code:'PLAN_UNAVAILABLE',message:'O plano escolhido não está disponível.',statusCode:409});
    if (target.id === current.planId) throw new AppError({code:'PLAN_ALREADY_ACTIVE',message:'Este já é o seu plano atual.',statusCode:409});
    const cycle = billingCycle ?? current.billingCycle; const option=target.billingOptions.find(x=>x.active&&x.billingCycle===cycle); if(!option) throw new AppError({code:'BILLING_OPTION_UNAVAILABLE',message:'A periodicidade escolhida não está disponível.',statusCode:409});
    const byKey=(items: typeof current.plan.limits)=>new Map(items.map(x=>[x.key,x])); const a=byKey(current.plan.limits), b=byKey(target.limits); const keys=new Set([...a.keys(),...b.keys()]); const usage=await this.usageByKey(tenantId,current.currentPeriodStartsAt,current.currentPeriodEndsAt); const up=target.sortOrder>current.plan.sortOrder;
    const gained:any[]=[],lost:any[]=[],inc:any[]=[],red:any[]=[],conf:any[]=[]; for(const key of keys){const x=a.get(key),y=b.get(key),label=this.labels[key]??key;if((x?.valueType==='BOOLEAN'||y?.valueType==='BOOLEAN')){if(x?.booleanValue!==true&&y?.booleanValue===true)gained.push({key,label});if(x?.booleanValue===true&&y?.booleanValue!==true)lost.push({key,label});continue}const cv=x?.integerValue?.toString()??null,tv=y?.integerValue?.toString()??null;if(cv!==null&&tv!==null){if(BigInt(tv)>BigInt(cv))inc.push({key,label,currentValue:cv,targetValue:tv});if(BigInt(tv)<BigInt(cv)){red.push({key,label,currentValue:cv,targetValue:tv});const used=usage.get(key);if(used!==undefined&&used>Number(tv))conf.push({key,label,currentUsage:used,targetLimit:Number(tv)})}}}
    return SubscriptionChangePreviewSchema.parse({changeType:up?'UPGRADE':'DOWNGRADE',effectiveAt:up?null:current.currentPeriodEndsAt.toISOString(),currentPlan:{publicId:current.plan.publicId,name:current.plan.name,billingCycle:current.billingCycle,priceCents:current.priceCents.toString(),currency:current.currency},targetPlan:{publicId:target.publicId,name:target.name,billingCycle:cycle,priceCents:option.priceCents.toString(),currency:target.currency},gainedFeatures:gained,lostFeatures:lost,increasedLimits:inc,reducedLimits:red,usageConflicts:conf});
  }

  private async usageByKey(tenantId: bigint, periodStartsAt: Date, periodEndsAt: Date) {
    const [units, members, professionals, services, monthlyAppointments] = await Promise.all([
      this.client.businessUnit.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.client.tenantMembership.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.client.professional.count({ where: { tenantId, active: true } }),
      this.client.service.count({ where: { tenantId, active: true } }),
      this.client.appointment.count({
        where: { tenantId, createdAt: { gte: periodStartsAt, lte: periodEndsAt } },
      }),
    ]);
    return new Map<string, number>([
      ['units.max', units],
      ['members.max', members],
      ['professionals.max', professionals],
      ['services.max', services],
      ['monthly_appointments.max', monthlyAppointments],
    ]);
  }
}
