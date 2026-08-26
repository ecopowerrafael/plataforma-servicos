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
  autoReplyEnabled: z.boolean().optional(),
});

const params = z.object({ publicId: z.uuid() });
const materializeBody = z.object({
  categoryId: z.bigint().optional(),
  state: z.string().max(2).optional(),
  city: z.string().max(120).optional(),
});

const leadsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
  status: z.string().optional(),
  city: z.string().optional(),
  search: z.string().optional(),
});

const leadDetailParams = z.object({
  publicId: z.uuid(),
  leadPublicId: z.uuid(),
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

  app.get('/platform/prospecting/stats', async (request) => {
    allow(request, 'platform.tenant.read');
    const campaignId = (request.query as any).campaignId
      ? BigInt(String((request.query as any).campaignId))
      : undefined;

    const whereClause = campaignId ? { campaignId } : {};

    const [sentCount, deliveredCount, readCount, respondedCount, interestedCount, leadsCount, followUpCount, optOutCount] =
      await Promise.all([
        options.client.prospectingMessage.count({
          where: {
            direction: 'OUTBOUND',
            status: { in: ['SENT', 'DELIVERED', 'READ'] },
            ...whereClause,
          },
        }),
        options.client.prospectingMessage.count({
          where: {
            direction: 'OUTBOUND',
            status: { in: ['DELIVERED', 'READ'] },
            ...whereClause,
          },
        }),
        options.client.prospectingMessage.count({
          where: {
            direction: 'OUTBOUND',
            status: 'READ',
            ...whereClause,
          },
        }),
        options.client.prospectingLead.count({
          where: {
            status: 'RESPONDED',
            ...whereClause,
          },
        }),
        options.client.prospectingLead.count({
          where: {
            status: 'INTERESTED',
            ...whereClause,
          },
        }),
        options.client.prospectingLead.count({
          where: {
            ...whereClause,
          },
        }),
        options.client.prospectingLead.count({
          where: {
            status: 'FOLLOW_UP',
            ...whereClause,
          },
        }),
        options.client.prospectingLead.count({
          where: {
            status: 'SUPPRESSED',
            ...whereClause,
          },
        }),
      ]);

    const deliveryRate = sentCount > 0 ? (deliveredCount / sentCount) * 100 : 0;
    const readRate = sentCount > 0 ? (readCount / sentCount) * 100 : 0;
    const responseRate = leadsCount > 0 ? (respondedCount / leadsCount) * 100 : 0;
    const interestRate = leadsCount > 0 ? (interestedCount / leadsCount) * 100 : 0;

    return {
      leads: leadsCount,
      sent: sentCount,
      delivered: deliveredCount,
      read: readCount,
      responded: respondedCount,
      interested: interestedCount,
      followUp: followUpCount,
      optOut: optOutCount,
      deliveryRate: Math.round(deliveryRate * 100) / 100,
      readRate: Math.round(readRate * 100) / 100,
      responseRate: Math.round(responseRate * 100) / 100,
      interestRate: Math.round(interestRate * 100) / 100,
    };
  });

  app.get('/platform/prospecting/status', async (request) => {
    allow(request, 'platform.tenant.read');
    const { PROSPECTING_WORKER_ENABLED, PROSPECTING_DRY_RUN } = process.env;

    const whatsappConfig = await options.client.prospectingWhatsAppConfig.findFirst({
      where: { isActive: true },
    });

    return {
      workerEnabled: PROSPECTING_WORKER_ENABLED === 'true',
      dryRun: PROSPECTING_DRY_RUN === 'true',
      whatsappConfigured: !!whatsappConfig,
      whatsappActive: !!whatsappConfig,
    };
  });

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
    { schema: { params, querystring: leadsQuerySchema } },
    async (request) => {
      allow(request, 'platform.tenant.read');
      const campaign = await options.service.getCampaign(request.params.publicId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const page = Number((request.query as any).page || 1);
      const pageSize = Math.min(Number((request.query as any).pageSize || 25), 100);
      const skip = (page - 1) * pageSize;
      const status = (request.query as any).status;
      const city = (request.query as any).city;
      const search = (request.query as any).search;

      const where: any = { campaignId: campaign.id };
      if (status) where.status = status;
      if (city) where.city = city;
      if (search) {
        where.OR = [
          { nameSnapshot: { contains: search } },
          { phoneSnapshot: { contains: search } },
          { normalizedPhone: { contains: search } },
        ];
      }

      const [leads, total] = await Promise.all([
        options.client.prospectingLead.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { createdAt: 'desc' },
        }),
        options.client.prospectingLead.count({ where }),
      ]);

      return {
        items: leads,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    },
  );

  app.get(
    '/platform/prospecting/campaigns/:publicId/leads/:leadPublicId',
    { schema: { params: leadDetailParams } },
    async (request) => {
      allow(request, 'platform.tenant.read');
      const campaign = await options.service.getCampaign(request.params.publicId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const lead = await options.service.getLead(request.params.leadPublicId);
      if (!lead || lead.campaignId !== campaign.id) {
        throw new Error('Lead not found');
      }

      return lead;
    },
  );

  // Conversations
  app.get(
    '/platform/prospecting/conversations',
    { schema: { querystring: leadsQuerySchema } },
    async (request) => {
      allow(request, 'platform.tenant.read');
      const page = Number((request.query as any).page || 1);
      const pageSize = Math.min(Number((request.query as any).pageSize || 25), 100);
      const skip = (page - 1) * pageSize;
      const status = (request.query as any).status;
      const search = (request.query as any).search;

      const where: any = {};
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { nameSnapshot: { contains: search } },
          { phoneSnapshot: { contains: search } },
        ];
      }

      const [leads, total] = await Promise.all([
        options.client.prospectingLead.findMany({
          where,
          skip,
          take: pageSize,
          select: {
            id: true,
            publicId: true,
            nameSnapshot: true,
            phoneSnapshot: true,
            status: true,
            campaign: { select: { publicId: true, name: true } },
            humanLockType: true,
            lastInboundAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        }),
        options.client.prospectingLead.count({ where }),
      ]);

      return {
        items: leads,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    },
  );

  app.get(
    '/platform/prospecting/conversations/:leadPublicId/messages',
    { schema: { params: leadDetailParams } },
    async (request) => {
      allow(request, 'platform.tenant.read');
      const page = Number((request.query as any).page || 1);
      const pageSize = Math.min(Number((request.query as any).pageSize || 50), 100);
      const skip = (page - 1) * pageSize;

      const lead = await options.client.prospectingLead.findUnique({
        where: { publicId: request.params.leadPublicId },
        select: { id: true },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      const [messages, total] = await Promise.all([
        options.client.prospectingMessage.findMany({
          where: { leadId: lead.id },
          skip,
          take: pageSize,
          orderBy: { createdAt: 'asc' },
        }),
        options.client.prospectingMessage.count({ where: { leadId: lead.id } }),
      ]);

      return {
        items: messages,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      };
    },
  );

  app.post(
    '/platform/prospecting/leads/:publicId/takeover',
    { schema: { params: z.object({ publicId: z.uuid() }) } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const lead = await options.client.prospectingLead.findUnique({
        where: { publicId: request.params.publicId },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      const updated = await options.client.prospectingLead.update({
        where: { publicId: request.params.publicId },
        data: {
          humanLockType: 'MANUAL',
          humanLockStartedAt: new Date(),
          humanLockUntil: null,
          humanLockReason: 'Atendimento manual via plataforma',
        },
      });

      return updated;
    },
  );

  app.post(
    '/platform/prospecting/leads/:publicId/release',
    { schema: { params: z.object({ publicId: z.uuid() }) } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const lead = await options.client.prospectingLead.findUnique({
        where: { publicId: request.params.publicId },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      const updated = await options.client.prospectingLead.update({
        where: { publicId: request.params.publicId },
        data: {
          humanLockType: null,
          humanLockStartedAt: null,
          humanLockUntil: null,
          humanLockReason: null,
        },
      });

      return updated;
    },
  );

  app.post(
    '/platform/prospecting/leads/:publicId/messages',
    { schema: { params: z.object({ publicId: z.uuid() }), body: z.object({ body: z.string().min(1) }) } },
    async (request) => {
      allow(request, 'platform.tenant.update');
      const lead = await options.client.prospectingLead.findUnique({
        where: { publicId: request.params.publicId },
        select: { id: true, status: true, campaignId: true, humanLockType: true },
      });

      if (!lead) {
        throw new Error('Lead not found');
      }

      if (lead.status === 'SUPPRESSED') {
        throw new Error('Lead opted out');
      }

      if (lead.humanLockType !== 'MANUAL') {
        throw new Error('Lead not under manual lock');
      }

      const idempotencyKey = `MANUAL:${request.params.publicId}:${Date.now()}`;

      const message = await options.client.prospectingMessage.create({
        data: {
          publicId: require('node:crypto').randomUUID(),
          campaignId: lead.campaignId,
          leadId: lead.id,
          direction: 'OUTBOUND',
          status: process.env.PROSPECTING_DRY_RUN === 'true' ? 'DRY_RUN' : 'PENDING',
          body: request.body.body,
          idempotencyKey,
          purpose: 'MANUAL',
        },
      });

      return message;
    },
  );

  // Worker run-once endpoint for manual testing (Platform Admin only)
  app.post(
    '/platform/prospecting/worker/run-once',
    async (request) => {
      allow(request, 'platform.worker.execute');
      if (!options.worker) {
        throw new Error('Worker not configured');
      }
      const result = await options.worker.runOnce();
      return result;
    },
  );
};
