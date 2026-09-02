import {
  ChangePlanRequestSchema,
  CreateCommercialPlanRequestSchema,
  CreatePlanBenefitRequestSchema,
  CreatePlatformTenantRequestSchema,
  CreateSubscriptionRequestSchema,
  DashboardQuerySchema,
  ExtendTrialRequestSchema,
  PaginationQuerySchema,
  PlanBenefitListResponseSchema,
  PlanBenefitResponseSchema,
  PlanListQuerySchema,
  PlanListResponseSchema,
  PlatformAuditQuerySchema,
  PlatformAuditResponseSchema,
  PlatformDashboardResponseSchema,
  PlatformMeResponseSchema,
  type PlatformPermissionCode,
  PlatformTenantDetailResponseSchema,
  PlatformTenantListQuerySchema,
  PlatformTenantListResponseSchema,
  SubscriptionActionRequestSchema,
  SubscriptionDetailResponseSchema,
  SubscriptionListQuerySchema,
  SubscriptionListResponseSchema,
  SuccessResponseSchema,
  TenantStatusActionRequestSchema,
  TenantExperienceResponseSchema,
  TenantFeaturesResponseSchema,
  TenantCustomFieldsResponseSchema,
  CreateTenantCustomFieldRequestSchema,
  UpdateTenantCustomFieldRequestSchema,
  UpdateTenantBrandingRequestSchema,
  UpdateTenantTerminologyRequestSchema,
  UpdateTenantFeaturesRequestSchema,
  UpdateCommercialPlanRequestSchema,
  UpdatePlanBenefitRequestSchema,
  UpdatePlatformTenantRequestSchema,
  UpdateSubscriptionRequestSchema,
  TenantCommercialPolicySchema,
  UpdateTenantCommercialPolicyRequestSchema,
  PlatformFinanceOverviewSchema,
  PlatformPaymentConfigInputSchema,
  PlatformManualActivationInputSchema,
  PlatformChargeResponseSchema,
  PlatformSubscriptionBillingSchema,
  CreatePlatformChargeSchema,
  PlatformFinanceReceiptsQuerySchema,
  PlatformFinanceSubscriptionsQuerySchema,
  PlatformFinanceDelinquencyQuerySchema,
  PlatformTenantWhatsAppSchema,
  PlatformTenantWhatsAppUpdateSchema,
  PlatformTenantWhatsAppTestResponseSchema,
  PlatformTenantSettingsUpdateRequestSchema,
  PlatformTenantSettingsUpdateResponseSchema,
} from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { platformAuthenticationPlugin } from './platform-auth.plugin.js';
import { type PlatformBillingService } from './platform-billing.service.js';
import { type PlatformAuthContext, type PlatformService } from './platform.service.js';
import { type TenantCommercialPolicyService } from './tenant-commercial-policy.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { requestMetadata } from '../auth/request-context.js';
import { type IntegrationService } from '../integrations/integration.service.js';
import { type WhatsAppProvisioningService } from '../integrations/whatsapp-provisioning.service.js';

interface PlatformRoutesOptions {
  service: PlatformService;
  authService: AuthService;
  cookieName: string;
  commercialPolicyService?: TenantCommercialPolicyService;
  billingService?: PlatformBillingService;
  integrationsService?: IntegrationService;
  whatsappProvisioningService?: WhatsAppProvisioningService;
}
const PublicIdParamsSchema = z.object({ publicId: z.uuid() });
const TenantParamsSchema = z.object({ tenantPublicId: z.uuid() });
const CustomFieldParamsSchema = TenantParamsSchema.extend({ fieldPublicId: z.uuid() });

export const platformRoutes: FastifyPluginAsyncZod<PlatformRoutesOptions> = async (
  app,
  options,
) => {
  await app.register(platformAuthenticationPlugin, {
    platformService: options.service,
    authService: options.authService,
    cookieName: options.cookieName,
  });
  const allow = (
    request: { platformAuth: PlatformAuthContext },
    permission: PlatformPermissionCode,
  ) => {
    options.service.requirePermission(request.platformAuth, permission);
  };

  app.get('/platform/me', { schema: { response: { 200: PlatformMeResponseSchema } } }, (request) =>
    options.service.getMe(request.platformAuth),
  );
  app.get(
    '/platform/dashboard/metrics',
    {
      schema: {
        querystring: DashboardQuerySchema,
        response: { 200: PlatformDashboardResponseSchema },
      },
    },
    (request) => {
      allow(request, 'platform.dashboard.read');
      allow(request, 'platform.metrics.read');
      return options.service.dashboard(request.query.period);
    },
  );

  app.get(
    '/platform/tenants',
    {
      schema: {
        querystring: PlatformTenantListQuerySchema,
        response: { 200: PlatformTenantListResponseSchema },
      },
    },
    (request) => {
      allow(request, 'platform.tenant.read');
      return options.service.listTenants(request.query);
    },
  );
  app.post(
    '/platform/tenants',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { body: CreatePlatformTenantRequestSchema },
    },
    async (request, reply) => {
      allow(request, 'platform.tenant.create');
      return reply
        .status(201)
        .send(
          await options.service.createTenant(
            request.body,
            request.platformAuth,
            requestMetadata(request),
          ),
        );
    },
  );
  app.get(
    '/platform/tenants/:tenantPublicId',
    {
      schema: { params: TenantParamsSchema, response: { 200: PlatformTenantDetailResponseSchema } },
    },
    (request) => {
      allow(request, 'platform.tenant.read');
      return options.service.getTenant(request.params.tenantPublicId);
    },
  );
  app.patch(
    '/platform/tenants/:tenantPublicId',
    { schema: { params: TenantParamsSchema, body: UpdatePlatformTenantRequestSchema } },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.updateTenant(
        request.params.tenantPublicId,
        request.body,
        request.platformAuth,
        requestMetadata(request),
      );
    },
  );
  app.delete(
    '/platform/plans/:publicId',
    { schema: { params: PublicIdParamsSchema, response: { 200: SuccessResponseSchema } } },
    async (request) => {
      allow(request, 'platform.plan.update');
      await options.service.deletePlan(
        request.params.publicId,
        request.platformAuth,
        requestMetadata(request),
      );
      return { success: true } as const;
    },
  );
  app.get(
    '/platform/tenants/:tenantPublicId/experience',
    { schema: { params: TenantParamsSchema, response: { 200: TenantExperienceResponseSchema } } },
    (request) => {
      allow(request, 'platform.tenant.read');
      return options.service.getTenantExperience(request.params.tenantPublicId);
    },
  );
  app.patch(
    '/platform/tenants/:tenantPublicId/branding',
    { schema: { params: TenantParamsSchema, body: UpdateTenantBrandingRequestSchema } },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.updateTenantBranding(
        request.params.tenantPublicId,
        request.body,
        request.platformAuth,
        requestMetadata(request),
      );
    },
  );
  app.patch(
    '/platform/tenants/:tenantPublicId/terminology',
    { schema: { params: TenantParamsSchema, body: UpdateTenantTerminologyRequestSchema } },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.updateTenantTerminology(
        request.params.tenantPublicId,
        request.body,
        request.platformAuth,
        requestMetadata(request),
      );
    },
  );
  app.get(
    '/platform/tenants/:tenantPublicId/features',
    { schema: { params: TenantParamsSchema, response: { 200: TenantFeaturesResponseSchema } } },
    (request) => {
      allow(request, 'platform.tenant.read');
      return options.service.getTenantFeatures(request.params.tenantPublicId);
    },
  );
  app.patch(
    '/platform/tenants/:tenantPublicId/features',
    { schema: { params: TenantParamsSchema, body: UpdateTenantFeaturesRequestSchema } },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.updateTenantFeatures(
        request.params.tenantPublicId,
        request.body.features,
        request.platformAuth,
        requestMetadata(request),
      );
    },
  );
  app.get(
    '/platform/tenants/:tenantPublicId/custom-fields',
    { schema: { params: TenantParamsSchema, response: { 200: TenantCustomFieldsResponseSchema } } },
    (request) => {
      allow(request, 'platform.tenant.read');
      return options.service.getTenantCustomFields(request.params.tenantPublicId);
    },
  );
  app.post(
    '/platform/tenants/:tenantPublicId/custom-fields',
    { schema: { params: TenantParamsSchema, body: CreateTenantCustomFieldRequestSchema } },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.createTenantCustomField(
        request.params.tenantPublicId,
        request.body,
        request.platformAuth,
        requestMetadata(request),
      );
    },
  );
  app.patch(
    '/platform/tenants/:tenantPublicId/custom-fields/:fieldPublicId',
    { schema: { params: CustomFieldParamsSchema, body: UpdateTenantCustomFieldRequestSchema } },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.updateTenantCustomField(
        request.params.tenantPublicId,
        request.params.fieldPublicId,
        request.body,
        request.platformAuth,
        requestMetadata(request),
      );
    },
  );
  for (const [path, active] of [
    ['activate', true],
    ['deactivate', false],
  ] as const) {
    app.post(
      `/platform/tenants/:tenantPublicId/custom-fields/:fieldPublicId/${path}`,
      { schema: { params: CustomFieldParamsSchema } },
      (request) => {
        allow(request, 'platform.tenant.update');
        return options.service.setTenantCustomFieldActive(
          request.params.tenantPublicId,
          request.params.fieldPublicId,
          active,
          request.platformAuth,
          requestMetadata(request),
        );
      },
    );
  }
  if (options.integrationsService) {
    app.get(
      '/platform/tenants/:tenantPublicId/whatsapp',
      { schema: { params: TenantParamsSchema, response: { 200: PlatformTenantWhatsAppSchema } } },
      async (request) => {
        allow(request, 'platform.tenant.read');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        return options.integrationsService!.whatsappAdminView(tenantId);
      },
    );
    app.patch(
      '/platform/tenants/:tenantPublicId/whatsapp',
      {
        schema: {
          params: TenantParamsSchema,
          body: PlatformTenantWhatsAppUpdateSchema,
          response: { 200: PlatformTenantWhatsAppSchema },
        },
      },
      async (request) => {
        allow(request, 'platform.tenant.update');
        const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
        const current = await options.integrationsService!.whatsappAdminView(tenantId);
        await options.integrationsService!.updateWhatsapp(
          tenantId,
          {
            active: request.body.isActive ?? current.active,
            instanceId: request.body.instanceId,
            token: request.body.token,
            instanceName: request.body.instanceName,
            phoneNumber: request.body.phoneNumber,
          },
          { userId: request.platformAuth.user.id, sessionId: null },
        );
        return options.integrationsService!.whatsappAdminView(tenantId);
      },
    );
    if (options.whatsappProvisioningService) {
      app.post(
        '/platform/tenants/:tenantPublicId/whatsapp/test',
        {
          schema: {
            params: TenantParamsSchema,
            response: { 200: PlatformTenantWhatsAppTestResponseSchema },
          },
        },
        async (request) => {
          allow(request, 'platform.tenant.update');
          const tenantId = await options.service.resolveTenantId(request.params.tenantPublicId);
          const view = await options.whatsappProvisioningService!.refreshStatus(tenantId);
          return {
            connected: view.state === 'CONNECTED',
            state: view.state,
            connectedPhone: view.connectedPhone,
            connectedName: view.connectedName,
            lastStatusCheckAt: view.lastStatusCheckAt,
          };
        },
      );
    }
  }
  app.patch(
    '/platform/tenants/:tenantPublicId/settings',
    {
      schema: {
        params: TenantParamsSchema,
        body: PlatformTenantSettingsUpdateRequestSchema,
        response: { 200: PlatformTenantSettingsUpdateResponseSchema },
      },
    },
    (request) => {
      allow(request, 'platform.tenant.update');
      return options.service.updateTenantSettings(
        request.params.tenantPublicId,
        request.body,
        request.platformAuth,
        requestMetadata(request),
      );
    },
  );
  for (const [path, status] of [
    ['suspend', 'SUSPENDED'],
    ['reactivate', 'ACTIVE'],
    ['deactivate', 'INACTIVE'],
  ] as const) {
    app.post(
      `/platform/tenants/:tenantPublicId/${path}`,
      {
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: { params: TenantParamsSchema, body: TenantStatusActionRequestSchema },
      },
      (request) => {
        allow(request, 'platform.tenant.status.manage');
        if (status === 'INACTIVE' && request.body.confirm !== true)
          throw new Error('Confirmação obrigatória.');
        return options.service.changeTenantStatus(
          request.params.tenantPublicId,
          status,
          request.body.reason,
          request.platformAuth,
          requestMetadata(request),
        );
      },
    );
  }

  app.get(
    '/platform/plans',
    { schema: { querystring: PlanListQuerySchema, response: { 200: PlanListResponseSchema } } },
    (request) => {
      allow(request, 'platform.plan.read');
      return options.service.listPlans(request.query);
    },
  );
  app.post(
    '/platform/plans',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { body: CreateCommercialPlanRequestSchema },
    },
    async (request, reply) => {
      allow(request, 'platform.plan.create');
      return reply
        .status(201)
        .send(
          await options.service.createPlan(
            request.body,
            request.platformAuth,
            requestMetadata(request),
          ),
        );
    },
  );
  app.get('/platform/plans/:publicId', { schema: { params: PublicIdParamsSchema } }, (request) => {
    allow(request, 'platform.plan.read');
    return options.service.getPlan(request.params.publicId);
  });
  app.patch(
    '/platform/plans/:publicId',
    { schema: { params: PublicIdParamsSchema, body: UpdateCommercialPlanRequestSchema } },
    (request) => {
      allow(request, 'platform.plan.update');
      return options.service.updatePlan(
        request.params.publicId,
        request.body,
        request.platformAuth,
        requestMetadata(request),
      );
    },
  );
  for (const [path, status] of [
    ['activate', 'ACTIVE'],
    ['deactivate', 'INACTIVE'],
    ['archive', 'ARCHIVED'],
  ] as const)
    app.post(
      `/platform/plans/:publicId/${path}`,
      {
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: { params: PublicIdParamsSchema, response: { 200: SuccessResponseSchema } },
      },
      async (request) => {
        allow(request, 'platform.plan.status.manage');
        await options.service.changePlanStatus(
          request.params.publicId,
          status,
          request.platformAuth,
          requestMetadata(request),
        );
        return { success: true } as const;
      },
    );

  app.get(
    '/platform/plans/:publicId/benefits',
    { schema: { params: PublicIdParamsSchema, response: { 200: PlanBenefitListResponseSchema } } },
    (request) => {
      allow(request, 'platform.plan.read');
      return options.service.listPlanBenefits(request.params.publicId);
    },
  );
  app.post(
    '/platform/plans/:publicId/benefits',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        params: PublicIdParamsSchema,
        body: CreatePlanBenefitRequestSchema,
        response: { 201: PlanBenefitResponseSchema },
      },
    },
    async (request, reply) => {
      allow(request, 'platform.plan.update');
      return reply
        .status(201)
        .send(
          await options.service.createPlanBenefit(
            request.params.publicId,
            request.body,
            request.platformAuth,
            requestMetadata(request),
          ),
        );
    },
  );
  app.patch(
    '/platform/plan-benefits/:publicId',
    {
      schema: {
        params: PublicIdParamsSchema,
        body: UpdatePlanBenefitRequestSchema,
        response: { 200: PlanBenefitResponseSchema },
      },
    },
    (request) => {
      allow(request, 'platform.plan.update');
      return options.service.updatePlanBenefit(
        request.params.publicId,
        request.body,
        request.platformAuth,
        requestMetadata(request),
      );
    },
  );
  app.delete(
    '/platform/plan-benefits/:publicId',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { params: PublicIdParamsSchema, response: { 200: SuccessResponseSchema } },
    },
    async (request) => {
      allow(request, 'platform.plan.update');
      await options.service.deletePlanBenefit(
        request.params.publicId,
        request.platformAuth,
        requestMetadata(request),
      );
      return { success: true } as const;
    },
  );

  app.get(
    '/platform/subscriptions',
    {
      schema: {
        querystring: SubscriptionListQuerySchema,
        response: { 200: SubscriptionListResponseSchema },
      },
    },
    (request) => {
      allow(request, 'platform.subscription.read');
      return options.service.listSubscriptions(request.query);
    },
  );
  app.get(
    '/platform/subscriptions/:publicId',
    {
      schema: {
        params: PublicIdParamsSchema,
        querystring: PaginationQuerySchema,
        response: { 200: SubscriptionDetailResponseSchema },
      },
    },
    (request) => {
      allow(request, 'platform.subscription.read');
      return options.service.getSubscription(request.params.publicId, request.query);
    },
  );
  app.post(
    '/platform/tenants/:tenantPublicId/subscriptions',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { params: TenantParamsSchema, body: CreateSubscriptionRequestSchema },
    },
    async (request, reply) => {
      allow(request, 'platform.subscription.create');
      return reply
        .status(201)
        .send(
          await options.service.createSubscription(
            request.params.tenantPublicId,
            request.body,
            request.platformAuth,
            requestMetadata(request),
          ),
        );
    },
  );
  for (const [path, action] of [
    ['activate', 'ACTIVATED'],
    ['suspend', 'SUSPENDED'],
    ['reactivate', 'REACTIVATED'],
    ['cancel', 'CANCELED'],
  ] as const)
    app.post(
      `/platform/subscriptions/:publicId/${path}`,
      {
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: { params: PublicIdParamsSchema, body: SubscriptionActionRequestSchema },
      },
      async (request) => {
        allow(request, 'platform.subscription.status.manage');
        if (action === 'ACTIVATED' && options.billingService)
          await options.billingService.requireManualActivationEnabled();
        return options.service.transitionSubscription(
          request.params.publicId,
          action,
          request.body.reason,
          request.platformAuth,
          requestMetadata(request),
        );
      },
    );
  app.post(
    '/platform/subscriptions/:publicId/extend-trial',
    { schema: { params: PublicIdParamsSchema, body: ExtendTrialRequestSchema } },
    (request) => {
      allow(request, 'platform.subscription.update');
      return options.service.extendTrial(
        request.params.publicId,
        request.body.trialEndsAt,
        request.body.reason,
        request.platformAuth,
        requestMetadata(request),
      );
    },
  );
  app.post(
    '/platform/subscriptions/:publicId/change-plan',
    { schema: { params: PublicIdParamsSchema, body: ChangePlanRequestSchema } },
    (request) => {
      allow(request, 'platform.subscription.update');
      return options.service.changeSubscriptionPlan(
        request.params.publicId,
        request.body.planPublicId,
        request.body.billingCycle,
        request.body.reason,
        request.platformAuth,
        requestMetadata(request),
      );
    },
  );
  app.post(
    '/platform/subscriptions/:publicId/period',
    { schema: { params: PublicIdParamsSchema, body: UpdateSubscriptionRequestSchema } },
    (request) => {
      allow(request, 'platform.subscription.update');
      return options.service.updateSubscriptionPeriod(
        request.params.publicId,
        request.body.currentPeriodStartsAt,
        request.body.currentPeriodEndsAt,
        request.body.reason,
        request.platformAuth,
        requestMetadata(request),
      );
    },
  );
  app.get(
    '/platform/audit',
    {
      schema: {
        querystring: PlatformAuditQuerySchema,
        response: { 200: PlatformAuditResponseSchema },
      },
    },
    (request) => {
      allow(request, 'platform.audit.read');
      return options.service.listAudit(request.query);
    },
  );

  if (options.commercialPolicyService !== undefined) {
    const policyService = options.commercialPolicyService;
    app.get(
      '/platform/commercial-policy',
      { schema: { response: { 200: TenantCommercialPolicySchema } } },
      (request) => {
        allow(request, 'platform.commercial_policy.read');
        return policyService.get();
      },
    );
    app.patch(
      '/platform/commercial-policy',
      {
        schema: {
          body: UpdateTenantCommercialPolicyRequestSchema,
          response: { 200: z.object({ policy: TenantCommercialPolicySchema }) },
        },
      },
      (request) => {
        allow(request, 'platform.commercial_policy.manage');
        return policyService.update(request.body, request.platformAuth, requestMetadata(request));
      },
    );
  }
  if (options.billingService) {
    const billing = options.billingService;
    const actor = (request: { platformAuth: PlatformAuthContext }) => ({
      userId: request.platformAuth.user.id,
      sessionId: null,
    });
    app.get(
      '/platform/finance',
      { schema: { response: { 200: PlatformFinanceOverviewSchema } } },
      (request) => {
        allow(request, 'platform.subscription.read');
        return billing.overview();
      },
    );
    app.put(
      '/platform/finance/providers/:provider',
      {
        schema: {
          params: z.object({ provider: z.enum(['pix-local', 'mercadopago']) }),
          body: PlatformPaymentConfigInputSchema,
          response: { 200: PlatformFinanceOverviewSchema },
        },
      },
      (request) => {
        allow(request, 'platform.subscription.status.manage');
        return billing.upsert(
          request.params.provider,
          {
            active: request.body.active,
            environment: request.body.environment,
            ...(request.body.credentials === undefined
              ? {}
              : { credentials: request.body.credentials }),
          },
          actor(request),
        );
      },
    );
    app.put(
      '/platform/finance/manual-activation',
      {
        schema: {
          body: PlatformManualActivationInputSchema,
          response: { 200: PlatformFinanceOverviewSchema },
        },
      },
      (request) => {
        allow(request, 'platform.subscription.status.manage');
        return billing.setManual(request.body.active, actor(request));
      },
    );
    app.get(
      '/platform/subscriptions/:publicId/billing',
      {
        schema: {
          params: PublicIdParamsSchema,
          response: { 200: PlatformSubscriptionBillingSchema },
        },
      },
      (request) => {
        allow(request, 'platform.subscription.read');
        return billing.subscriptionOverview(request.params.publicId);
      },
    );
    app.post(
      '/platform/subscriptions/:publicId/charges',
      {
        schema: {
          params: PublicIdParamsSchema,
          body: CreatePlatformChargeSchema,
          response: { 200: PlatformChargeResponseSchema },
        },
      },
      (request) => {
        allow(request, 'platform.subscription.status.manage');
        return billing.createCharge(request.params.publicId, request.body.provider);
      },
    );
    app.post(
      '/platform/charges/:publicId/confirm',
      { schema: { params: PublicIdParamsSchema, response: { 200: PlatformChargeResponseSchema } } },
      (request) => {
        allow(request, 'platform.subscription.status.manage');
        return billing.confirm(request.params.publicId, actor(request));
      },
    );

    // Financeiro — analytics read-only (Fase 1). No "response" schema on
    // these four: format=csv returns a text/csv string, which a Zod
    // object response schema can't validate. The JSON shape is instead
    // guaranteed by the service methods themselves (each .parse()s its
    // own response schema before returning).
    app.get('/platform/finance/overview', { schema: {} }, (request) => {
      allow(request, 'platform.subscription.read');
      return billing.financeDashboard();
    });
    app.get(
      '/platform/finance/receipts',
      { schema: { querystring: PlatformFinanceReceiptsQuerySchema } },
      async (request, reply) => {
        allow(request, 'platform.subscription.read');
        const result = await billing.receipts(request.query);
        if (request.query.format === 'csv') {
          return reply
            .header('Content-Type', 'text/csv; charset=utf-8')
            .header('Content-Disposition', 'attachment; filename="recebimentos.csv"')
            .send(result);
        }
        return result;
      },
    );
    app.get(
      '/platform/finance/subscriptions',
      { schema: { querystring: PlatformFinanceSubscriptionsQuerySchema } },
      async (request, reply) => {
        allow(request, 'platform.subscription.read');
        const result = await billing.subscriptionsAnalytics(request.query);
        if (request.query.format === 'csv') {
          return reply
            .header('Content-Type', 'text/csv; charset=utf-8')
            .header('Content-Disposition', 'attachment; filename="assinaturas.csv"')
            .send(result);
        }
        return result;
      },
    );
    app.get(
      '/platform/finance/delinquency',
      { schema: { querystring: PlatformFinanceDelinquencyQuerySchema } },
      async (request, reply) => {
        allow(request, 'platform.subscription.read');
        const result = await billing.delinquency(request.query);
        if (request.query.format === 'csv') {
          return reply
            .header('Content-Type', 'text/csv; charset=utf-8')
            .header('Content-Disposition', 'attachment; filename="inadimplencia.csv"')
            .send(result);
        }
        return result;
      },
    );
  }
};
