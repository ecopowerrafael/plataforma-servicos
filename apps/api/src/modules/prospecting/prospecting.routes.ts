import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ProspectingService } from './prospecting.service.js';
import { type PlatformService } from '../platform/platform.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { platformAuthenticationPlugin } from '../platform/platform-auth.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type ProspectingWorker } from './prospecting-worker.js';

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(180),
  categoryId: z.bigint().optional(),
  state: z.string().max(2).optional(),
  city: z.string().max(120).optional(),
  dailyLimit: z.number().int().positive().optional(),
  sendingStartMinutes: z.number().int().min(0).max(1440).optional(),
  sendingEndMinutes: z.number().int().min(0).max(1440).optional(),
  minIntervalSeconds: z.number().int().positive().optional(),
  maxIntervalSeconds: z.number().int().positive().optional(),
  allowedWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
});

const UpdateCampaignSchema = z.object({
  name: z.string().min(1).max(180).optional(),
  dailyLimit: z.number().int().positive().optional(),
  sendingStartMinutes: z.number().int().min(0).max(1440).optional(),
  sendingEndMinutes: z.number().int().min(0).max(1440).optional(),
  followUpEnabled: z.boolean().optional(),
  followUpAfterHours: z.number().int().positive().optional(),
  maxFollowUps: z.number().int().min(0).optional(),
  pauseOnReply: z.boolean().optional(),
  pauseOnInterest: z.boolean().optional(),
});

const params = z.object({ publicId: z.uuid() });
const materializeBody = z.object({
  categoryId: z.bigint().optional(),
  state: z.string().max(2).optional(),
  city: z.string().max(120).optional(),
});

interface ProspectingRoutesOptions {
  service: ProspectingService;
  platformService: PlatformService;
  authService: AuthService;
  cookieName: string;
  client: PrismaClient;
  worker?: ProspectingWorker;
}

export const registerProspectingRoutes: FastifyPluginAsyncZod<ProspectingRoutesOptions> = async (
  app,
  options,
) => {
  await app.register(platformAuthenticationPlugin, {
    platformService: options.platformService,
    authService: options.authService,
    cookieName: options.cookieName,
  });

  const allow = (
    request: { platformAuth: Parameters<PlatformService['requirePermission']>[0] },
    permission: Parameters<PlatformService['requirePermission']>[1],
  ) => options.platformService.requirePermission(request.platformAuth, permission);

  app.get('/platform/prospecting/campaigns', async (request) => {
    allow(request, 'platform.tenant.read');
    const campaigns = await options.service.listCampaigns();
    return { items: campaigns };
  });

  app.post(
    '/platform/prospecting/campaigns',
    { schema: { body: CreateCampaignSchema } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const input = Object.fromEntries(
        Object.entries(request.body).filter(([_, v]) => v !== undefined),
      );
      const campaign = await options.service.createCampaign(
        input as Parameters<typeof options.service.createCampaign>[0],
      );
      return campaign;
    },
  );

  app.get(
    '/platform/prospecting/campaigns/:publicId',
    { schema: { params } },
    async (request) => {
      allow(request, 'platform.tenant.read');
      const campaign = await options.service.getCampaign(request.params.publicId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }
      return campaign;
    },
  );

  app.patch(
    '/platform/prospecting/campaigns/:publicId',
    { schema: { params, body: UpdateCampaignSchema } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const input = Object.fromEntries(
        Object.entries(request.body).filter(([_, v]) => v !== undefined),
      );
      const campaign = await options.service.updateCampaign(request.params.publicId, input);
      return campaign;
    },
  );

  app.post(
    '/platform/prospecting/campaigns/:publicId/materialize',
    { schema: { params, body: materializeBody } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const campaign = await options.service.getCampaign(request.params.publicId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const count = await options.service.materializeLeads(
        campaign.id,
        request.body.categoryId,
        request.body.state,
        request.body.city,
      );

      return { materialized: count };
    },
  );

  app.post(
    '/platform/prospecting/campaigns/:publicId/start',
    { schema: { params } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const campaign = await options.service.startCampaign(request.params.publicId);
      return campaign;
    },
  );

  app.post(
    '/platform/prospecting/campaigns/:publicId/pause',
    { schema: { params } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const campaign = await options.service.pauseCampaign(request.params.publicId);
      return campaign;
    },
  );

  app.post(
    '/platform/prospecting/campaigns/:publicId/resume',
    { schema: { params } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const campaign = await options.service.resumeCampaign(request.params.publicId);
      return campaign;
    },
  );

  app.post(
    '/platform/prospecting/campaigns/:publicId/cancel',
    { schema: { params } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const campaign = await options.service.cancelCampaign(request.params.publicId);
      return campaign;
    },
  );

  app.get(
    '/platform/prospecting/campaigns/:publicId/leads',
    { schema: { params } },
    async (request) => {
      allow(request, 'platform.tenant.read');
      const campaign = await options.service.getCampaign(request.params.publicId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const leads = await options.service.getLeads(campaign.id, 100);
      return { items: leads };
    },
  );

  // Worker run-once endpoint for manual testing
  app.post(
    '/platform/prospecting/worker/run-once',
    async (request) => {
      allow(request, 'platform.tenant.update');
      if (!options.worker) {
        throw new Error('Worker not configured');
      }
      const result = await options.worker.runOnce();
      return result;
    },
  );
};
