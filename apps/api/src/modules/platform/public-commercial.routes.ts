import { PublicCommercialPlansResponseSchema } from '@plataforma/shared';
import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { type PlatformService } from './platform.service.js';
import { type TenantCommercialPolicyService } from './tenant-commercial-policy.service.js';

interface PublicCommercialRoutesOptions {
  service: PlatformService;
  commercialPolicyService: TenantCommercialPolicyService;
}

export const publicCommercialRoutes: FastifyPluginAsyncZod<PublicCommercialRoutesOptions> = async (
  app,
  options,
) => {
  app.get(
    '/public/commercial-plans',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      schema: { response: { 200: PublicCommercialPlansResponseSchema } },
    },
    async () => {
      const policy = await options.commercialPolicyService.get();
      const plans = await options.service.listPublicPlans(policy.defaultTrialDays);
      return { plans, defaultTrialDays: policy.defaultTrialDays };
    },
  );
};
