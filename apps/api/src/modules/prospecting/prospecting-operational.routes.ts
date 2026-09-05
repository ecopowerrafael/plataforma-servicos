import { type FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { type PlatformService } from '../platform/platform.service.js';
import { type AuthService } from '../auth/auth.service.js';
import { platformAuthenticationPlugin } from '../platform/platform-auth.plugin.js';
import { type PrismaClient } from '../../database-client/client.js';

interface ProspectingOperationalRoutesOptions {
  platformService: PlatformService;
  authService: AuthService;
  cookieName: string;
  client: PrismaClient;
}

export const registerProspectingOperationalRoutes: FastifyPluginAsyncZod<ProspectingOperationalRoutesOptions> =
  async (app, options) => {
    await app.register(platformAuthenticationPlugin, {
      platformService: options.platformService,
      authService: options.authService,
      cookieName: options.cookieName,
    });

    const allow = (
      request: { platformAuth: Parameters<PlatformService['requirePermission']>[0] },
      permission: Parameters<PlatformService['requirePermission']>[1],
    ) => options.platformService.requirePermission(request.platformAuth, permission);

    // Settings: W-API status, Worker status
    app.get('/platform/prospecting/settings', async (request) => {
      allow(request, 'platform.prospecting.read');

      const whatsappConfig = await options.client.prospectingWhatsAppConfig.findFirst({
        where: { isActive: true },
        select: {
          id: true,
          instanceId: true,
          isActive: true,
          lastTestedAt: true,
        },
      });

      const { PROSPECTING_WORKER_ENABLED, PROSPECTING_DRY_RUN } = process.env;

      return {
        worker: {
          enabled: PROSPECTING_WORKER_ENABLED === 'true',
          dryRun: PROSPECTING_DRY_RUN === 'true',
          timezone: 'America/Sao_Paulo',
        },
        whatsapp: whatsappConfig
          ? {
              configured: true,
              instanceId: whatsappConfig.instanceId.slice(0, 4) + '****',
              active: whatsappConfig.isActive,
              lastTestedAt: whatsappConfig.lastTestedAt,
            }
          : {
              configured: false,
              instanceId: null,
              active: false,
              lastTestedAt: null,
            },
      };
    });

    // Health: operational status
    app.get('/platform/prospecting/health', async (request) => {
      allow(request, 'platform.prospecting.read');

      const [
        runningCampaigns,
        pendingMessages,
        sendingMessages,
        failedMessages,
        uncertainMessages,
        needsReviewLeads,
        pendingManualMessages,
      ] = await Promise.all([
        options.client.prospectingCampaign.count({ where: { status: 'RUNNING' } }),
        options.client.prospectingMessage.count({
          where: { status: 'PENDING', direction: 'OUTBOUND' },
        }),
        options.client.prospectingMessage.count({
          where: { status: 'SENDING', direction: 'OUTBOUND' },
        }),
        options.client.prospectingMessage.count({
          where: { status: 'FAILED', direction: 'OUTBOUND' },
        }),
        options.client.prospectingMessage.count({
          where: { status: 'DELIVERY_UNCERTAIN', direction: 'OUTBOUND' },
        }),
        options.client.prospectingLead.count({ where: { status: 'NEEDS_REVIEW' } }),
        options.client.prospectingMessage.count({
          where: { status: 'PENDING', direction: 'OUTBOUND', purpose: 'MANUAL' },
        }),
      ]);

      return {
        campaigns: { running: runningCampaigns },
        messages: {
          pending: pendingMessages,
          sending: sendingMessages,
          failed: failedMessages,
          deliveryUncertain: uncertainMessages,
        },
        leads: {
          needsReview: needsReviewLeads,
        },
        queue: {
          manual: pendingManualMessages,
        },
      };
    });

    // Funnel: leads progression
    app.get('/platform/prospecting/funnel', async (request) => {
      allow(request, 'platform.prospecting.read');

      const [
        totalLeads,
        sent,
        delivered,
        read,
        responded,
        interested,
        won,
      ] = await Promise.all([
        options.client.prospectingLead.count(),
        options.client.prospectingMessage.count({
          where: { direction: 'OUTBOUND', status: { in: ['SENT', 'DELIVERED', 'READ'] } },
        }),
        options.client.prospectingMessage.count({
          where: { direction: 'OUTBOUND', status: { in: ['DELIVERED', 'READ'] } },
        }),
        options.client.prospectingMessage.count({
          where: { direction: 'OUTBOUND', status: 'READ' },
        }),
        options.client.prospectingLead.count({ where: { status: 'RESPONDED' } }),
        options.client.prospectingLead.count({ where: { status: 'INTERESTED' } }),
        options.client.prospectingLead.count({ where: { status: 'WON' } }),
      ]);

      const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;
      const readRate = sent > 0 ? (read / sent) * 100 : 0;
      const responseRate = totalLeads > 0 ? (responded / totalLeads) * 100 : 0;
      const interestRate = totalLeads > 0 ? (interested / totalLeads) * 100 : 0;
      const conversionRate = totalLeads > 0 ? (won / totalLeads) * 100 : 0;

      return {
        funnel: {
          total: totalLeads,
          sent,
          delivered,
          read,
          responded,
          interested,
          won,
        },
        rates: {
          delivery: Math.round(deliveryRate * 100) / 100,
          read: Math.round(readRate * 100) / 100,
          response: Math.round(responseRate * 100) / 100,
          interest: Math.round(interestRate * 100) / 100,
          conversion: Math.round(conversionRate * 100) / 100,
        },
      };
    });

    // Campaign comparison
    app.get('/platform/prospecting/campaigns-metrics', async (request) => {
      allow(request, 'platform.prospecting.read');

      const campaigns = await options.client.prospectingCampaign.findMany({
        select: {
          id: true,
          publicId: true,
          name: true,
          status: true,
          _count: { select: { leads: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });

      const metrics = await Promise.all(
        campaigns.map(async (campaign) => {
          const [sent, responded, interested, optOut, failed] = await Promise.all([
            options.client.prospectingMessage.count({
              where: {
                campaignId: campaign.id,
                direction: 'OUTBOUND',
                status: { in: ['SENT', 'DELIVERED', 'READ'] },
              },
            }),
            options.client.prospectingLead.count({
              where: { campaignId: campaign.id, status: 'RESPONDED' },
            }),
            options.client.prospectingLead.count({
              where: { campaignId: campaign.id, status: 'INTERESTED' },
            }),
            options.client.prospectingLead.count({
              where: { campaignId: campaign.id, status: 'SUPPRESSED' },
            }),
            options.client.prospectingMessage.count({
              where: {
                campaignId: campaign.id,
                direction: 'OUTBOUND',
                status: 'FAILED',
              },
            }),
          ]);

          const total = campaign._count.leads;
          const responseRate = total > 0 ? (responded / total) * 100 : 0;
          const interestRate = total > 0 ? (interested / total) * 100 : 0;
          const conversionRate = total > 0 ? (interested / total) * 100 : 0;
          const optOutRate = total > 0 ? (optOut / total) * 100 : 0;

          return {
            publicId: campaign.publicId,
            name: campaign.name,
            status: campaign.status,
            leads: total,
            sent,
            responded,
            interested,
            optOut,
            failed,
            rates: {
              response: Math.round(responseRate * 100) / 100,
              interest: Math.round(interestRate * 100) / 100,
              conversion: Math.round(conversionRate * 100) / 100,
              optOut: Math.round(optOutRate * 100) / 100,
            },
          };
        })
      );

      return { campaigns: metrics };
    });

    // Objection report
    app.get('/platform/prospecting/objections-report', async (request) => {
      allow(request, 'platform.prospecting.read');

      const objections = await options.client.prospectingObjection.findMany({
        select: {
          id: true,
          code: true,
          name: true,
        },
      });

      const objectionsWithCounts = await Promise.all(
        objections.map(async (obj) => ({
          ...obj,
          count: await options.client.prospectingMessage.count({
            where: { objectionId: obj.id },
          }),
        }))
      );

      const sorted = objectionsWithCounts.sort((a, b) => b.count - a.count);
      const total = sorted.reduce((sum, obj) => sum + obj.count, 0);

      return {
        objections: sorted.map((obj) => ({
          code: obj.code,
          name: obj.name,
          count: obj.count,
          percentage: total > 0 ? Math.round((obj.count / total) * 10000) / 100 : 0,
        })),
        total,
      };
    });

    // Opt-out report
    app.get('/platform/prospecting/suppression-report', async (request) => {
      allow(request, 'platform.prospecting.read');

      const campaigns = await options.client.prospectingCampaign.findMany({
        select: {
          id: true,
          publicId: true,
          name: true,
          _count: { select: { leads: true } },
        },
      });

      const suppressedByCampaign = await Promise.all(
        campaigns.map(async (campaign) => {
          const suppressed = await options.client.prospectingLead.count({
            where: { campaignId: campaign.id, status: 'SUPPRESSED' },
          });
          const total = campaign._count.leads;
          return {
            publicId: campaign.publicId,
            name: campaign.name,
            total,
            suppressed,
            rate: total > 0 ? Math.round((suppressed / total) * 10000) / 100 : 0,
          };
        })
      );

      const totalLeads = suppressedByCampaign.reduce((sum, c) => sum + c.total, 0);
      const totalSuppressed = suppressedByCampaign.reduce((sum, c) => sum + c.suppressed, 0);

      return {
        campaigns: suppressedByCampaign,
        total: { leads: totalLeads, suppressed: totalSuppressed },
        globalRate: totalLeads > 0 ? Math.round((totalSuppressed / totalLeads) * 10000) / 100 : 0,
      };
    });

  };
