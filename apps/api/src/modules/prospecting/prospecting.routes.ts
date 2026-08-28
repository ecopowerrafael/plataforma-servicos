import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { ProspectingService } from './prospecting.service.js';
import { ProspectingObjectionEngine } from './prospecting-objection-engine.js';
import { type PlatformService } from '../platform/platform.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { platformAuthenticationPlugin } from '../platform/platform-auth.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type ProspectingWorker } from './prospecting-worker.js';
import { ProspectingAudienceService } from './prospecting-audience.service.js';
import { ProspectingRepository } from './prospecting.repository.js';

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
  flowPublicId: z.string().uuid().nullable().optional(),
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
  flowPublicId: z.string().uuid().nullable().optional(),
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

const TemplateSchema = z.object({
  name: z.string().min(1).max(180),
  stepNumber: z.number().int().min(1),
  body: z.string().min(1),
  isDefault: z.boolean().optional(),
});

const ObjectionSchema = z.object({
  name: z.string().min(1).max(180),
  description: z.string().nullish(),
  suggestedResponse: z.string().nullish(),
  autoReplyAllowed: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const PatternSchema = z.object({
  pattern: z.string().min(1),
  patternType: z.enum(['EXACT', 'STARTS_WITH', 'ENDS_WITH', 'CONTAINS']),
  priority: z.number().int().min(0).optional(),
});

interface ProspectingRoutesOptions {
  service: ProspectingService;
  platformService: PlatformService;
  authService: AuthService;
  cookieName: string;
  client: PrismaClient;
  worker?: ProspectingWorker;
  audienceService: ProspectingAudienceService;
  repository: ProspectingRepository;
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
    allow(request, 'platform.prospecting.read');
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
    allow(request, 'platform.prospecting.read');
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
    allow(request, 'platform.prospecting.read');
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

      // Create default templates for new campaign
      const defaultTemplates = [
        {
          stepNumber: 1,
          name: 'Abordagem Inicial',
          body: 'Olá {{nome}}, tudo bem? Falo da {{empresa}}. Posso te fazer uma pergunta rápida?',
          isDefault: true,
        },
        {
          stepNumber: 2,
          name: 'Follow-up',
          body: 'Oi {{nome}}, passando novamente porque talvez minha mensagem anterior tenha ficado perdida. Posso te explicar rapidamente o motivo do contato?',
          isDefault: true,
        },
        {
          stepNumber: 3,
          name: 'Último Contato',
          body: 'Olá {{nome}}, este é meu último contato por aqui. Se fizer sentido conversar, fico à disposição.',
          isDefault: true,
        },
      ];

      for (const template of defaultTemplates) {
        await options.client.prospectingTemplate.create({
          data: {
            publicId: randomUUID(),
            campaignId: campaign.id,
            stepNumber: template.stepNumber,
            name: template.name,
            body: template.body,
            isDefault: template.isDefault,
          },
        });
      }

      return campaign;
    },
  );

  app.get(
    '/platform/prospecting/campaigns/:publicId',
    { schema: { params } },
    async (request) => {
      allow(request, 'platform.prospecting.read');
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
      allow(request, 'platform.prospecting.read');
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
      allow(request, 'platform.prospecting.read');
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
      allow(request, 'platform.prospecting.read');
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
      allow(request, 'platform.prospecting.read');
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
          publicId: randomUUID(),
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

  // Templates: CRUD
  app.get(
    '/platform/prospecting/templates',
    { schema: { querystring: z.object({ campaignId: z.string().uuid().optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.read');
      const where = request.query.campaignId
        ? { campaign: { publicId: request.query.campaignId } }
        : {};

      const templates = await options.client.prospectingTemplate.findMany({
        where,
        include: { variants: { orderBy: { variantIndex: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      });

      return { items: templates };
    },
  );

  app.get(
    '/platform/prospecting/campaigns/:publicId/templates',
    { schema: { params: z.object({ publicId: z.uuid() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.read');
      const campaign = await options.client.prospectingCampaign.findUnique({
        where: { publicId: request.params.publicId },
        select: { id: true },
      });

      if (!campaign) throw new Error('Campaign not found');

      const templates = await options.client.prospectingTemplate.findMany({
        where: { campaignId: campaign.id },
        include: { variants: true },
        orderBy: { stepNumber: 'asc' },
      });

      return {
        items: templates.map((t) => ({
          publicId: t.publicId,
          name: t.name,
          stepNumber: t.stepNumber,
          body: t.body,
          isDefault: t.isDefault,
          updatedAt: t.updatedAt.toISOString(),
          variants: t.variants.map((v) => ({
            variantIndex: v.variantIndex,
            body: v.body,
          })),
        })),
      };
    },
  );

  app.post(
    '/platform/prospecting/campaigns/:publicId/templates',
    { schema: { params: z.object({ publicId: z.uuid() }), body: TemplateSchema } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const campaign = await options.client.prospectingCampaign.findUnique({
        where: { publicId: request.params.publicId },
        select: { id: true },
      });

      if (!campaign) throw new Error('Campaign not found');

      const template = await options.client.prospectingTemplate.create({
        data: {
          publicId: randomUUID(),
          campaignId: campaign.id,
          name: request.body.name,
          stepNumber: request.body.stepNumber,
          body: request.body.body,
          isDefault: request.body.isDefault ?? false,
        },
        include: { variants: true },
      });

      return template;
    },
  );

  app.put(
    '/platform/prospecting/templates/:publicId',
    { schema: { params: z.object({ publicId: z.uuid() }), body: TemplateSchema.partial() } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const data: Record<string, any> = {};
      if (request.body.name !== undefined) data.name = request.body.name;
      if (request.body.stepNumber !== undefined) data.stepNumber = request.body.stepNumber;
      if (request.body.body !== undefined) data.body = request.body.body;
      if (request.body.isDefault !== undefined) data.isDefault = request.body.isDefault;

      const template = await options.client.prospectingTemplate.update({
        where: { publicId: request.params.publicId },
        data,
        include: { variants: true },
      });

      return template;
    },
  );

  app.patch(
    '/platform/prospecting/templates/:publicId',
    { schema: { params: z.object({ publicId: z.uuid() }), body: TemplateSchema } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const template = await options.client.prospectingTemplate.update({
        where: { publicId: request.params.publicId },
        data: {
          name: request.body.name,
          stepNumber: request.body.stepNumber,
          body: request.body.body,
        },
        include: { variants: true },
      });

      return template;
    },
  );

  app.delete(
    '/platform/prospecting/templates/:publicId',
    { schema: { params: z.object({ publicId: z.uuid() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const template = await options.client.prospectingTemplate.findUnique({
        where: { publicId: request.params.publicId },
        select: { isDefault: true },
      });

      if (template?.isDefault) {
        throw new Error('Cannot delete default template');
      }

      await options.client.prospectingTemplate.delete({
        where: { publicId: request.params.publicId },
      });

      return { success: true };
    },
  );

  // Template Variants: CRUD
  app.post(
    '/platform/prospecting/templates/:publicId/variants',
    { schema: { params: z.object({ publicId: z.uuid() }), body: z.object({ body: z.string().min(1) }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const template = await options.client.prospectingTemplate.findUnique({
        where: { publicId: request.params.publicId },
        select: { id: true },
      });

      if (!template) throw new Error('Template not found');

      const maxIndex = await options.client.prospectingTemplateVariant.aggregate({
        where: { templateId: template.id },
        _max: { variantIndex: true },
      });

      const variant = await options.client.prospectingTemplateVariant.create({
        data: {
          templateId: template.id,
          variantIndex: (maxIndex._max.variantIndex ?? -1) + 1,
          body: request.body.body,
        },
      });

      return variant;
    },
  );

  app.delete(
    '/platform/prospecting/templates/:publicId/variants/:variantIndex',
    { schema: { params: z.object({ publicId: z.uuid(), variantIndex: z.coerce.number() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const template = await options.client.prospectingTemplate.findUnique({
        where: { publicId: request.params.publicId },
        select: { id: true },
      });

      if (!template) throw new Error('Template not found');

      await options.client.prospectingTemplateVariant.delete({
        where: { templateId_variantIndex: { templateId: template.id, variantIndex: request.params.variantIndex } },
      });

      return { success: true };
    },
  );

  // Objections: CRUD
  app.get(
    '/platform/prospecting/objections',
    { schema: { querystring: z.object({ isActive: z.enum(['true', 'false']).optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.read');
      const where = request.query.isActive !== undefined ? { isActive: request.query.isActive === 'true' } : {};

      const objections = await options.client.prospectingObjection.findMany({
        where,
        include: { patterns: true },
        orderBy: { createdAt: 'desc' },
      });

      return {
        items: objections.map((obj) => ({
          publicId: obj.publicId,
          code: obj.code,
          name: obj.name,
          description: obj.description,
          suggestedResponse: obj.suggestedResponse,
          autoReplyAllowed: obj.autoReplyAllowed,
          isActive: obj.isActive,
          createdAt: obj.createdAt.toISOString(),
          patterns: obj.patterns.map((p) => ({
            id: p.id.toString(),
            pattern: p.pattern,
            type: p.patternType,
            priority: p.priority,
          })),
        })),
      };
    },
  );

  app.post(
    '/platform/prospecting/objections',
    { schema: { body: ObjectionSchema } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const objection = await options.client.prospectingObjection.create({
        data: {
          publicId: randomUUID(),
          name: request.body.name,
          description: request.body.description ?? null,
          suggestedResponse: request.body.suggestedResponse ?? null,
          autoReplyAllowed: request.body.autoReplyAllowed ?? false,
          isActive: request.body.isActive ?? true,
        },
      });

      return {
        publicId: objection.publicId,
        code: objection.code,
        name: objection.name,
        description: objection.description,
        suggestedResponse: objection.suggestedResponse,
        autoReplyAllowed: objection.autoReplyAllowed,
        isActive: objection.isActive,
        createdAt: objection.createdAt.toISOString(),
        patterns: [],
      };
    },
  );

  app.put(
    '/platform/prospecting/objections/:publicId',
    { schema: { params: z.object({ publicId: z.uuid() }), body: ObjectionSchema.partial() } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const data: Record<string, any> = {};
      if (request.body.name !== undefined) data.name = request.body.name;
      if (request.body.description !== undefined) data.description = request.body.description;
      if (request.body.suggestedResponse !== undefined) data.suggestedResponse = request.body.suggestedResponse;
      if (request.body.autoReplyAllowed !== undefined) data.autoReplyAllowed = request.body.autoReplyAllowed;
      if (request.body.isActive !== undefined) data.isActive = request.body.isActive;

      const objection = await options.client.prospectingObjection.update({
        where: { publicId: request.params.publicId },
        data,
      });

      return {
        publicId: objection.publicId,
        code: objection.code,
        name: objection.name,
        description: objection.description,
        suggestedResponse: objection.suggestedResponse,
        autoReplyAllowed: objection.autoReplyAllowed,
        isActive: objection.isActive,
        createdAt: objection.createdAt.toISOString(),
        patterns: [],
      };
    },
  );

  // Objection Patterns: CRUD
  app.post(
    '/platform/prospecting/objections/:publicId/patterns',
    { schema: { params: z.object({ publicId: z.uuid() }), body: PatternSchema } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const objection = await options.client.prospectingObjection.findUnique({
        where: { publicId: request.params.publicId },
        select: { id: true },
      });

      if (!objection) throw new Error('Objection not found');

      const pattern = await options.client.prospectingObjectionPattern.create({
        data: {
          objectionId: objection.id,
          pattern: request.body.pattern,
          patternType: request.body.patternType,
          priority: request.body.priority ?? 0,
        },
      });

      return {
        id: pattern.id.toString(),
        pattern: pattern.pattern,
        type: pattern.patternType,
        priority: pattern.priority,
      };
    },
  );

  app.put(
    '/platform/prospecting/objections/:publicId/patterns/:patternId',
    { schema: { params: z.object({ publicId: z.uuid(), patternId: z.string().regex(/^\d+$/) }), body: PatternSchema.partial() } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const objection = await options.client.prospectingObjection.findUnique({
        where: { publicId: request.params.publicId },
        select: { id: true },
      });

      if (!objection) throw new Error('Objection not found');

      const pattern = await options.client.prospectingObjectionPattern.findUnique({
        where: { id: BigInt(request.params.patternId) },
        select: { objectionId: true },
      });

      if (!pattern || pattern.objectionId !== objection.id) {
        throw new Error('Pattern does not belong to this objection');
      }

      const data: Record<string, any> = {};
      if (request.body.pattern !== undefined) data.pattern = request.body.pattern;
      if (request.body.patternType !== undefined) data.patternType = request.body.patternType;
      if (request.body.priority !== undefined) data.priority = request.body.priority;

      const updatedPattern = await options.client.prospectingObjectionPattern.update({
        where: { id: BigInt(request.params.patternId) },
        data,
      });

      return {
        id: updatedPattern.id.toString(),
        pattern: updatedPattern.pattern,
        type: updatedPattern.patternType,
        priority: updatedPattern.priority,
      };
    },
  );

  app.delete(
    '/platform/prospecting/objections/:publicId/patterns/:patternId',
    { schema: { params: z.object({ publicId: z.uuid(), patternId: z.string().regex(/^\d+$/) }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const objection = await options.client.prospectingObjection.findUnique({
        where: { publicId: request.params.publicId },
        select: { id: true },
      });

      if (!objection) throw new Error('Objection not found');

      const pattern = await options.client.prospectingObjectionPattern.findUnique({
        where: { id: BigInt(request.params.patternId) },
        select: { objectionId: true },
      });

      if (!pattern || pattern.objectionId !== objection.id) {
        throw new Error('Pattern does not belong to this objection');
      }

      await options.client.prospectingObjectionPattern.delete({
        where: { id: BigInt(request.params.patternId) },
      });

      return { success: true };
    },
  );

  // Objection Exclusions per Campaign
  app.get(
    '/platform/prospecting/campaigns/:publicId/objection-exclusions',
    { schema: { params: z.object({ publicId: z.uuid() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.read');
      const campaign = await options.client.prospectingCampaign.findUnique({
        where: { publicId: request.params.publicId },
        select: { id: true },
      });

      if (!campaign) throw new Error('Campaign not found');

      const exclusions = await options.client.prospectingObjectionExclusion.findMany({
        where: { campaignId: campaign.id },
        include: { objection: true },
      });

      return { items: exclusions };
    },
  );

  app.post(
    '/platform/prospecting/campaigns/:publicId/objection-exclusions',
    {
      schema: {
        params: z.object({ publicId: z.uuid() }),
        body: z.object({ objectionPublicId: z.uuid() }),
      },
    },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const campaign = await options.client.prospectingCampaign.findUnique({
        where: { publicId: request.params.publicId },
        select: { id: true },
      });

      if (!campaign) throw new Error('Campaign not found');

      const objection = await options.client.prospectingObjection.findUnique({
        where: { publicId: request.body.objectionPublicId },
        select: { id: true },
      });

      if (!objection) throw new Error('Objection not found');

      const existing = await options.client.prospectingObjectionExclusion.findFirst({
        where: { campaignId: campaign.id, objectionId: objection.id },
      });

      if (existing) return existing;

      const exclusion = await options.client.prospectingObjectionExclusion.create({
        data: { campaignId: campaign.id, objectionId: objection.id },
      });

      return exclusion;
    },
  );

  app.delete(
    '/platform/prospecting/campaigns/:publicId/objection-exclusions/:exclusionId',
    { schema: { params: z.object({ publicId: z.uuid(), exclusionId: z.coerce.number() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      await options.client.prospectingObjectionExclusion.delete({
        where: { id: BigInt(request.params.exclusionId) },
      });

      return { success: true };
    },
  );

  // Classify preview: test patterns without persistence (reutiliza ProspectingObjectionEngine)
  app.post(
    '/platform/prospecting/objections/classify-preview',
    {
      schema: {
        body: z.object({
          text: z.string().min(1),
          campaignPublicId: z.string().uuid().optional(),
        }),
      },
    },
    async (request) => {
      allow(request, 'platform.prospecting.read');

      let exclusionObjectionIds: bigint[] = [];

      if (request.body.campaignPublicId) {
        const campaign = await options.client.prospectingCampaign.findUnique({
          where: { publicId: request.body.campaignPublicId },
          select: { id: true },
        });

        if (campaign) {
          const exclusions = await options.client.prospectingObjectionExclusion.findMany({
            where: { campaignId: campaign.id },
            select: { objectionId: true },
          });

          exclusionObjectionIds = exclusions.map((e) => e.objectionId);
        }
      }

      const engine = new ProspectingObjectionEngine(options.client);
      const result = await engine.classifyPreview(request.body.text, exclusionObjectionIds);

      return result;
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

  // Flows: CRUD
  app.get(
    '/platform/prospecting/flows',
    { schema: { querystring: z.object({ isActive: z.enum(['true', 'false']).optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.read');
      const isActive = request.query.isActive === 'true' ? true : request.query.isActive === 'false' ? false : undefined;
      const flows = await options.client.prospectingFlow.findMany({
        where: isActive !== undefined ? { isActive } : {},
        orderBy: { createdAt: 'desc' },
      });
      const withCounts = await Promise.all(flows.map(async f => {
        const stepsCount = await options.client.prospectingFlowStep.count({ where: { flowId: f.id } });
        return { publicId: f.publicId, code: f.code, name: f.name, description: f.description, isActive: f.isActive, stepsCount, createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString() };
      }));
      return { items: withCounts };
    },
  );

  app.post(
    '/platform/prospecting/flows',
    { schema: { body: z.object({ name: z.string().min(1), description: z.string().optional(), isActive: z.boolean().optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const flow = await options.client.prospectingFlow.create({
        data: { publicId: randomUUID(), name: request.body.name, description: request.body.description ?? null, isActive: request.body.isActive ?? true },
      });
      return { publicId: flow.publicId, code: flow.code, name: flow.name, description: flow.description, isActive: flow.isActive, createdAt: flow.createdAt.toISOString(), updatedAt: flow.updatedAt.toISOString() };
    },
  );

  app.get(
    '/platform/prospecting/flows/:publicId',
    { schema: { params: z.object({ publicId: z.uuid() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.read');
      const flow = await options.client.prospectingFlow.findUnique({ where: { publicId: request.params.publicId }, include: { steps: { orderBy: { position: 'asc' }, include: { options: { orderBy: { position: 'asc' }, include: { patterns: true } } } } } });
      if (!flow) throw new Error('Flow not found');
      return { publicId: flow.publicId, code: flow.code, name: flow.name, description: flow.description, isActive: flow.isActive, steps: flow.steps.map(s => ({ publicId: s.publicId, name: s.name, message: s.message, stepType: s.stepType, position: s.position, isStart: s.isStart, nextStepPublicId: s.nextStepId ? 'null' : null, options: s.options.map(o => ({ publicId: o.publicId, label: o.label, actionType: o.actionType, position: o.position, nextStepPublicId: o.nextStepId ? 'null' : null, patterns: o.patterns.map(p => ({ id: p.id.toString(), pattern: p.pattern, patternType: p.patternType, priority: p.priority })) })) })) };
    },
  );

  app.put(
    '/platform/prospecting/flows/:publicId',
    { schema: { params: z.object({ publicId: z.uuid() }), body: z.object({ name: z.string().optional(), description: z.string().optional(), isActive: z.boolean().optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const data: any = {};
      if (request.body.name) data.name = request.body.name;
      if (request.body.description !== undefined) data.description = request.body.description;
      if (request.body.isActive !== undefined) data.isActive = request.body.isActive;
      const flow = await options.client.prospectingFlow.update({ where: { publicId: request.params.publicId }, data });
      return { publicId: flow.publicId, code: flow.code, name: flow.name, isActive: flow.isActive };
    },
  );

  app.delete(
    '/platform/prospecting/flows/:publicId',
    { schema: { params: z.object({ publicId: z.uuid() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const flow = await options.client.prospectingFlow.findUnique({ where: { publicId: request.params.publicId }, select: { id: true, code: true } });
      if (!flow) throw new Error('Flow not found');
      if (flow.code === 'DIRECTORY_PUBLICATION') throw new Error('Cannot delete default flow');
      const campaigns = await options.client.prospectingCampaign.count({ where: { flowId: flow.id } });
      const executions = await options.client.prospectingFlowExecution.count({ where: { flowId: flow.id } });
      if (campaigns > 0 || executions > 0) throw new Error('Flow has associated data');
      await options.client.prospectingFlow.delete({ where: { publicId: request.params.publicId } });
      return { success: true };
    },
  );

  // Steps: CRUD
  app.post(
    '/platform/prospecting/flows/:flowPublicId/steps',
    { schema: { params: z.object({ flowPublicId: z.uuid() }), body: z.object({ name: z.string().min(1), message: z.string().min(1), stepType: z.enum(['MESSAGE_OPTIONS', 'WAIT_TEXT', 'WAIT_LINK', 'MESSAGE_ONLY', 'MANUAL', 'END']), position: z.number().int(), isStart: z.boolean().optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const flow = await options.client.prospectingFlow.findUnique({ where: { publicId: request.params.flowPublicId }, select: { id: true } });
      if (!flow) throw new Error('Flow not found');
      if (request.body.isStart) await options.client.prospectingFlowStep.updateMany({ where: { flowId: flow.id }, data: { isStart: false } });
      const step = await options.client.prospectingFlowStep.create({ data: { publicId: randomUUID(), flowId: flow.id, name: request.body.name, message: request.body.message, stepType: request.body.stepType, position: request.body.position, isStart: request.body.isStart ?? false } });
      return { publicId: step.publicId, name: step.name, stepType: step.stepType, position: step.position, isStart: step.isStart };
    },
  );

  app.put(
    '/platform/prospecting/flows/:flowPublicId/steps/:stepPublicId',
    { schema: { params: z.object({ flowPublicId: z.uuid(), stepPublicId: z.uuid() }), body: z.object({ name: z.string().optional(), message: z.string().optional(), stepType: z.enum(['MESSAGE_OPTIONS', 'WAIT_TEXT', 'WAIT_LINK', 'MESSAGE_ONLY', 'MANUAL', 'END']).optional(), position: z.number().int().optional(), nextStepPublicId: z.uuid().optional(), isStart: z.boolean().optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const flow = await options.client.prospectingFlow.findUnique({ where: { publicId: request.params.flowPublicId }, select: { id: true } });
      if (!flow) throw new Error('Flow not found');
      const step = await options.client.prospectingFlowStep.findUnique({ where: { publicId: request.params.stepPublicId }, select: { id: true, flowId: true } });
      if (!step || step.flowId !== flow.id) throw new Error('Step not found in this flow');
      if (request.body.nextStepPublicId) {
        const nextStep = await options.client.prospectingFlowStep.findUnique({ where: { publicId: request.body.nextStepPublicId }, select: { id: true, flowId: true } });
        if (!nextStep || nextStep.flowId !== flow.id) throw new Error('Next step not in same flow');
      }
      if (request.body.isStart) await options.client.prospectingFlowStep.updateMany({ where: { flowId: flow.id, id: { not: step.id } }, data: { isStart: false } });
      const data: any = {};
      if (request.body.name) data.name = request.body.name;
      if (request.body.message) data.message = request.body.message;
      if (request.body.stepType) data.stepType = request.body.stepType;
      if (request.body.position !== undefined) data.position = request.body.position;
      if (request.body.isStart !== undefined) data.isStart = request.body.isStart;
      const updated = await options.client.prospectingFlowStep.update({ where: { publicId: request.params.stepPublicId }, data });
      return { publicId: updated.publicId, isStart: updated.isStart };
    },
  );

  app.delete(
    '/platform/prospecting/flows/:flowPublicId/steps/:stepPublicId',
    { schema: { params: z.object({ flowPublicId: z.uuid(), stepPublicId: z.uuid() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const flow = await options.client.prospectingFlow.findUnique({ where: { publicId: request.params.flowPublicId }, select: { id: true } });
      if (!flow) throw new Error('Flow not found');
      const step = await options.client.prospectingFlowStep.findUnique({ where: { publicId: request.params.stepPublicId }, select: { id: true, flowId: true, isStart: true } });
      if (!step || step.flowId !== flow.id) throw new Error('Step not in this flow');
      if (step.isStart) throw new Error('Cannot delete start step');
      const usedAsNext = await options.client.prospectingFlowStep.count({ where: { nextStepId: step.id } });
      if (usedAsNext > 0) throw new Error('Step is used as next step');
      const executions = await options.client.prospectingFlowExecution.count({ where: { currentStepId: step.id } });
      if (executions > 0) throw new Error('Step has executions');
      await options.client.prospectingFlowStep.delete({ where: { publicId: request.params.stepPublicId } });
      return { success: true };
    },
  );

  // Options: CRUD
  app.post(
    '/platform/prospecting/flows/:flowPublicId/steps/:stepPublicId/options',
    { schema: { params: z.object({ flowPublicId: z.uuid(), stepPublicId: z.uuid() }), body: z.object({ label: z.string().min(1), actionType: z.enum(['NEXT_STEP', 'END', 'MANUAL']), position: z.number().int(), nextStepPublicId: z.uuid().optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const flow = await options.client.prospectingFlow.findUnique({ where: { publicId: request.params.flowPublicId }, select: { id: true } });
      if (!flow) throw new Error('Flow not found');
      const step = await options.client.prospectingFlowStep.findUnique({ where: { publicId: request.params.stepPublicId }, select: { id: true, flowId: true } });
      if (!step || step.flowId !== flow.id) throw new Error('Step not in this flow');
      let nextStepId: bigint | null = null;
      if (request.body.nextStepPublicId) {
        const nextStep = await options.client.prospectingFlowStep.findUnique({ where: { publicId: request.body.nextStepPublicId }, select: { id: true, flowId: true } });
        if (!nextStep || nextStep.flowId !== flow.id) throw new Error('Next step not in same flow');
        nextStepId = nextStep.id;
      }
      const option = await options.client.prospectingFlowOption.create({ data: { publicId: randomUUID(), stepId: step.id, label: request.body.label, actionType: request.body.actionType, position: request.body.position, nextStepId } });
      return { publicId: option.publicId, label: option.label, actionType: option.actionType, position: option.position };
    },
  );

  app.put(
    '/platform/prospecting/flows/:flowPublicId/options/:optionPublicId',
    { schema: { params: z.object({ flowPublicId: z.uuid(), optionPublicId: z.uuid() }), body: z.object({ label: z.string().optional(), actionType: z.enum(['NEXT_STEP', 'END', 'MANUAL']).optional(), position: z.number().int().optional(), nextStepPublicId: z.uuid().optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const flow = await options.client.prospectingFlow.findUnique({ where: { publicId: request.params.flowPublicId }, select: { id: true } });
      if (!flow) throw new Error('Flow not found');
      const option = await options.client.prospectingFlowOption.findUnique({ where: { publicId: request.params.optionPublicId }, include: { step: true } });
      if (!option || option.step.flowId !== flow.id) throw new Error('Option not in this flow');
      let nextStepId: bigint | null | undefined = undefined;
      if (request.body.nextStepPublicId) {
        const nextStep = await options.client.prospectingFlowStep.findUnique({ where: { publicId: request.body.nextStepPublicId }, select: { id: true, flowId: true } });
        if (!nextStep || nextStep.flowId !== flow.id) throw new Error('Next step not in same flow');
        nextStepId = nextStep.id;
      }
      const data: any = {};
      if (request.body.label) data.label = request.body.label;
      if (request.body.actionType) data.actionType = request.body.actionType;
      if (request.body.position !== undefined) data.position = request.body.position;
      if (nextStepId !== undefined) data.nextStepId = nextStepId;
      await options.client.prospectingFlowOption.update({ where: { publicId: request.params.optionPublicId }, data });
      return { success: true };
    },
  );

  app.delete(
    '/platform/prospecting/flows/:flowPublicId/options/:optionPublicId',
    { schema: { params: z.object({ flowPublicId: z.uuid(), optionPublicId: z.uuid() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const flow = await options.client.prospectingFlow.findUnique({ where: { publicId: request.params.flowPublicId }, select: { id: true } });
      if (!flow) throw new Error('Flow not found');
      const option = await options.client.prospectingFlowOption.findUnique({ where: { publicId: request.params.optionPublicId }, include: { step: true } });
      if (!option || option.step.flowId !== flow.id) throw new Error('Option not in this flow');
      await options.client.prospectingFlowOption.delete({ where: { publicId: request.params.optionPublicId } });
      return { success: true };
    },
  );

  // Patterns: CRUD
  app.post(
    '/platform/prospecting/flows/:flowPublicId/options/:optionPublicId/patterns',
    { schema: { params: z.object({ flowPublicId: z.uuid(), optionPublicId: z.uuid() }), body: z.object({ pattern: z.string().min(1), patternType: z.enum(['EXACT', 'STARTS_WITH', 'ENDS_WITH', 'CONTAINS']), priority: z.number().int().optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const flow = await options.client.prospectingFlow.findUnique({ where: { publicId: request.params.flowPublicId }, select: { id: true } });
      if (!flow) throw new Error('Flow not found');
      const option = await options.client.prospectingFlowOption.findUnique({ where: { publicId: request.params.optionPublicId }, include: { step: true } });
      if (!option || option.step.flowId !== flow.id) throw new Error('Option not in this flow');
      const pattern = await options.client.prospectingFlowOptionPattern.create({ data: { optionId: option.id, pattern: request.body.pattern, patternType: request.body.patternType, priority: request.body.priority ?? 0 } });
      return { id: pattern.id.toString(), pattern: pattern.pattern, patternType: pattern.patternType, priority: pattern.priority };
    },
  );

  app.put(
    '/platform/prospecting/flows/:flowPublicId/options/:optionPublicId/patterns/:patternId',
    { schema: { params: z.object({ flowPublicId: z.uuid(), optionPublicId: z.uuid(), patternId: z.string().regex(/^\d+$/) }), body: z.object({ pattern: z.string().optional(), patternType: z.enum(['EXACT', 'STARTS_WITH', 'ENDS_WITH', 'CONTAINS']).optional(), priority: z.number().int().optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const flow = await options.client.prospectingFlow.findUnique({ where: { publicId: request.params.flowPublicId }, select: { id: true } });
      if (!flow) throw new Error('Flow not found');
      const pattern = await options.client.prospectingFlowOptionPattern.findUnique({ where: { id: BigInt(request.params.patternId) }, include: { option: { include: { step: true } } } });
      if (!pattern || pattern.option.step.flowId !== flow.id) throw new Error('Pattern not in this flow');
      const data: any = {};
      if (request.body.pattern) data.pattern = request.body.pattern;
      if (request.body.patternType) data.patternType = request.body.patternType;
      if (request.body.priority !== undefined) data.priority = request.body.priority;
      await options.client.prospectingFlowOptionPattern.update({ where: { id: BigInt(request.params.patternId) }, data });
      return { success: true };
    },
  );

  app.delete(
    '/platform/prospecting/flows/:flowPublicId/options/:optionPublicId/patterns/:patternId',
    { schema: { params: z.object({ flowPublicId: z.uuid(), optionPublicId: z.uuid(), patternId: z.string().regex(/^\d+$/) }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const flow = await options.client.prospectingFlow.findUnique({ where: { publicId: request.params.flowPublicId }, select: { id: true } });
      if (!flow) throw new Error('Flow not found');
      const pattern = await options.client.prospectingFlowOptionPattern.findUnique({ where: { id: BigInt(request.params.patternId) }, include: { option: { include: { step: true } } } });
      if (!pattern || pattern.option.step.flowId !== flow.id) throw new Error('Pattern not in this flow');
      await options.client.prospectingFlowOptionPattern.delete({ where: { id: BigInt(request.params.patternId) } });
      return { success: true };
    },
  );

  // Audience: list categories
  app.get(
    '/platform/prospecting/audience/categories',
    { schema: {} },
    async (request) => {
      allow(request, 'platform.prospecting.read');
      const { ProspectingAudienceService } = await import('./prospecting-audience.service.js');
      const audienceService = new ProspectingAudienceService(options.client);
      const categories = await audienceService.getCategories();
      return { items: categories };
    },
  );

  // Audience: list cities
  app.get(
    '/platform/prospecting/audience/cities',
    { schema: { querystring: z.object({ categoryPublicIds: z.string().optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.read');
      const categoryPublicIds = (request.query as any).categoryPublicIds?.split(',').filter(Boolean);
      const { ProspectingAudienceService } = await import('./prospecting-audience.service.js');
      const audienceService = new ProspectingAudienceService(options.client);
      const cities = await audienceService.getCities(categoryPublicIds?.length ? { categoryPublicIds } : undefined);
      return { items: cities };
    },
  );

  // Audience: get preview counters (no campaign yet)
  app.get(
    '/platform/prospecting/audience/preview/counters',
    { schema: { querystring: z.object({ categoryPublicIds: z.string().optional(), states: z.string().optional(), cities: z.string().optional(), search: z.string().optional(), contactStatus: z.enum(['all', 'never', 'sent', 'responded']).optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.read');
      const q = request.query as any;
      const categoryPublicIds = q.categoryPublicIds?.split(',').filter(Boolean);
      const states = q.states?.split(',').filter(Boolean);
      const cities = q.cities?.split(',').filter(Boolean);
      const { ProspectingAudienceService } = await import('./prospecting-audience.service.js');
      const audienceService = new ProspectingAudienceService(options.client);
      const counters = await audienceService.getPreviewCounters({
        categoryPublicIds,
        states,
        cities,
        search: q.search,
        contactStatus: q.contactStatus,
      });
      return counters;
    },
  );

  // Audience: get preview paginated list (no campaign yet)
  app.get(
    '/platform/prospecting/audience/preview',
    { schema: { querystring: z.object({ page: z.coerce.number().int().positive().optional().default(1), limit: z.coerce.number().int().positive().max(100).optional().default(50), categoryPublicIds: z.string().optional(), states: z.string().optional(), cities: z.string().optional(), search: z.string().optional(), contactStatus: z.enum(['all', 'never', 'sent', 'responded']).optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.read');
      try {
        const q = request.query as any;
        const categoryPublicIds = q.categoryPublicIds?.split(',').filter(Boolean);
        const states = q.states?.split(',').filter(Boolean);
        const cities = q.cities?.split(',').filter(Boolean);
        const { ProspectingAudienceService } = await import('./prospecting-audience.service.js');
        const audienceService = new ProspectingAudienceService(options.client);
        const result = await audienceService.getPreviewPage(
          {
            categoryPublicIds,
            states,
            cities,
            search: q.search,
            contactStatus: q.contactStatus,
          },
          q.page,
          q.limit
        );

        // Diagnostic: test serialization
        try {
          JSON.stringify(result);
        } catch (serializeError) {
          request.log.error({
            route: '/platform/prospecting/audience/preview',
            requestId: request.id,
            stage: 'serialize',
            errorName: (serializeError as any)?.name,
            errorMessage: (serializeError as any)?.message,
          }, 'Prospecting audience preview serialization failed');
          throw serializeError;
        }

        return result;
      } catch (error) {
        let meta = '';
        try {
          const metaObj = (error as any)?.meta;
          if (metaObj) {
            meta = JSON.stringify(metaObj);
          }
        } catch {
          meta = '[unserializable]';
        }

        const diagnostic = [
          '[PROSPECTING_AUDIENCE_PREVIEW_ERROR]',
          `requestId=${request.id}`,
          `stage=${(error as any)?.diagnosticStage ?? 'unknown'}`,
          `name=${error instanceof Error ? error.name : 'unknown'}`,
          `code=${(error as any)?.code ?? 'none'}`,
          `message=${error instanceof Error ? error.message : String(error)}`,
          meta ? `meta=${meta}` : '',
        ].filter(Boolean).join(' | ');

        request.log.error(diagnostic);
        throw error;
      }
    },
  );

  // Audience: materialize selection for campaign
  app.post(
    '/platform/prospecting/campaigns/:campaignPublicId/materialize-audience',
    { schema: { params: z.object({ campaignPublicId: z.uuid() }), body: z.object({ mode: z.enum(['explicit', 'allFiltered']), businessPublicIds: z.array(z.string().uuid()).optional(), filters: z.object({ categoryPublicIds: z.array(z.string().uuid()).optional(), states: z.array(z.string()).optional(), cities: z.array(z.string()).optional(), search: z.string().optional(), contactStatus: z.enum(['all', 'never', 'sent', 'responded']).optional() }).optional(), excludedBusinessPublicIds: z.array(z.string().uuid()).optional() }) } },
    async (request) => {
      allow(request, 'platform.prospecting.update');
      const campaign = await options.client.prospectingCampaign.findUnique({
        where: { publicId: request.params.campaignPublicId },
        select: { id: true },
      });
      if (!campaign) throw new Error('Campaign not found');

      const body = request.body as { mode: 'explicit' | 'allFiltered'; businessPublicIds?: string[]; filters?: { categoryPublicIds?: string[]; states?: string[]; cities?: string[]; search?: string; contactStatus?: 'all' | 'never' | 'sent' | 'responded' }; excludedBusinessPublicIds?: string[] };

      let businessPublicIds: string[];

      if (body.mode === 'explicit') {
        businessPublicIds = body.businessPublicIds || [];
      } else {
        // allFiltered: resolve from filters server-side
        businessPublicIds = await options.audienceService.resolveFilteredBusinessPublicIds(
          body.filters || {},
          body.excludedBusinessPublicIds
        );
      }

      const result = await options.repository.materializeLeadsSelective(campaign.id, businessPublicIds);

      return {
        success: true,
        selected: businessPublicIds.length,
        ...result,
      };
    },
  );
};

