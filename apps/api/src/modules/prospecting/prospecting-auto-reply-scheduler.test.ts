import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProspectingAutoReplyScheduler } from './prospecting-auto-reply-scheduler.js';
import { type PrismaClient } from '../../database-client/client.js';

describe('ProspectingAutoReplyScheduler', () => {
  let scheduler: ProspectingAutoReplyScheduler;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      prospectingCampaign: {
        findUnique: vi.fn(),
      },
      prospectingObjection: {
        findUnique: vi.fn(),
      },
      prospectingLead: {
        findUnique: vi.fn(),
      },
      prospectingMessage: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    } as unknown as PrismaClient;

    scheduler = new ProspectingAutoReplyScheduler(mockClient, 10, 30);
  });

  describe('Auto-Reply Scheduling', () => {
    it('1. autoReplyEnabled=false → não agenda', async () => {
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        autoReplyEnabled: false,
        status: 'RUNNING',
      });

      const result = await scheduler.scheduleAutoReply({
        campaignId: 1n,
        leadId: 1n,
        inboundMessageId: 1n,
        objectionId: 1n,
        suggestedResponse: 'Response',
      });

      expect(result.scheduled).toBe(false);
      expect(result.reason).toBe('AUTO_REPLY_DISABLED');
    });

    it('2. autoReplyAllowed=false → não agenda', async () => {
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        autoReplyEnabled: true,
        status: 'RUNNING',
      });
      mockClient.prospectingObjection.findUnique.mockResolvedValue({
        autoReplyAllowed: false,
        isActive: true,
      });

      const result = await scheduler.scheduleAutoReply({
        campaignId: 1n,
        leadId: 1n,
        inboundMessageId: 1n,
        objectionId: 1n,
        suggestedResponse: 'Response',
      });

      expect(result.scheduled).toBe(false);
      expect(result.reason).toBe('OBJECTION_NOT_ALLOWED');
    });

    it('3. suggestedResponse null → não agenda', async () => {
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        autoReplyEnabled: true,
        status: 'RUNNING',
      });
      mockClient.prospectingObjection.findUnique.mockResolvedValue({
        autoReplyAllowed: true,
        isActive: true,
      });

      const result = await scheduler.scheduleAutoReply({
        campaignId: 1n,
        leadId: 1n,
        inboundMessageId: 1n,
        objectionId: 1n,
        suggestedResponse: '',
      });

      expect(result.scheduled).toBe(false);
      expect(result.reason).toBe('NO_RESPONSE_TEXT');
    });

    it('4. SUPPRESSED → não agenda', async () => {
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        autoReplyEnabled: true,
        status: 'RUNNING',
      });
      mockClient.prospectingObjection.findUnique.mockResolvedValue({
        autoReplyAllowed: true,
        isActive: true,
      });
      mockClient.prospectingLead.findUnique.mockResolvedValue({
        status: 'SUPPRESSED',
      });

      const result = await scheduler.scheduleAutoReply({
        campaignId: 1n,
        leadId: 1n,
        inboundMessageId: 1n,
        objectionId: 1n,
        suggestedResponse: 'Response',
      });

      expect(result.scheduled).toBe(false);
      expect(result.reason).toBe('LEAD_BLOCKED');
    });

    it('5. Campaign PAUSED → não agenda', async () => {
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        autoReplyEnabled: true,
        status: 'PAUSED',
      });

      const result = await scheduler.scheduleAutoReply({
        campaignId: 1n,
        leadId: 1n,
        inboundMessageId: 1n,
        objectionId: 1n,
        suggestedResponse: 'Response',
      });

      expect(result.scheduled).toBe(false);
      expect(result.reason).toBe('CAMPAIGN_NOT_RUNNING');
    });

    it('6. Already scheduled → não cria duplicata', async () => {
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        autoReplyEnabled: true,
        status: 'RUNNING',
      });
      mockClient.prospectingObjection.findUnique.mockResolvedValue({
        autoReplyAllowed: true,
        isActive: true,
      });
      mockClient.prospectingLead.findUnique.mockResolvedValue({
        status: 'RESPONDED',
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue({
        id: 1n,
      });

      const result = await scheduler.scheduleAutoReply({
        campaignId: 1n,
        leadId: 1n,
        inboundMessageId: 1n,
        objectionId: 1n,
        suggestedResponse: 'Response',
      });

      expect(result.scheduled).toBe(false);
      expect(result.reason).toBe('ALREADY_SCHEDULED');
    });

    it('7. Valid schedule → cria PENDING AUTO_REPLY', async () => {
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        autoReplyEnabled: true,
        status: 'RUNNING',
      });
      mockClient.prospectingObjection.findUnique.mockResolvedValue({
        autoReplyAllowed: true,
        isActive: true,
      });
      mockClient.prospectingLead.findUnique.mockResolvedValue({
        status: 'RESPONDED',
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingMessage.create.mockResolvedValue({
        id: 42n,
      });

      const result = await scheduler.scheduleAutoReply({
        campaignId: 1n,
        leadId: 1n,
        inboundMessageId: 1n,
        objectionId: 1n,
        suggestedResponse: 'Response',
      });

      expect(result.scheduled).toBe(true);
      expect(result.messageId).toBe(42n);

      const createCall = vi.mocked(mockClient.prospectingMessage.create).mock.calls[0];
      expect(createCall![0].data.purpose).toBe('AUTO_REPLY');
      expect(createCall![0].data.status).toBe('PENDING');
      expect(createCall![0].data.direction).toBe('OUTBOUND');
    });

    it('8. Delay is between min and max', async () => {
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        autoReplyEnabled: true,
        status: 'RUNNING',
      });
      mockClient.prospectingObjection.findUnique.mockResolvedValue({
        autoReplyAllowed: true,
        isActive: true,
      });
      mockClient.prospectingLead.findUnique.mockResolvedValue({
        status: 'RESPONDED',
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingMessage.create.mockResolvedValue({
        id: 42n,
      });

      const before = Date.now();
      await scheduler.scheduleAutoReply({
        campaignId: 1n,
        leadId: 1n,
        inboundMessageId: 1n,
        objectionId: 1n,
        suggestedResponse: 'Response',
      });
      const after = Date.now();

      const createCall = vi.mocked(mockClient.prospectingMessage.create).mock.calls[0];
      const scheduledAt = createCall![0].data.scheduledAt as Date;

      const delayMs = scheduledAt.getTime() - before;
      const minMs = 10 * 1000;
      const maxMs = 30 * 1000;

      expect(delayMs).toBeGreaterThanOrEqual(minMs);
      expect(delayMs).toBeLessThanOrEqual(maxMs + 100); // +100ms para margem de tempo de execução
    });

    it('9. Placeholder rendering {{nome}}', () => {
      const rendered = scheduler.renderResponse('Oi {{nome}}, tudo bem?', {
        nameSnapshot: 'João',
      });

      expect(rendered).toBe('Oi João, tudo bem?');
    });

    it('10. Service not configured returns error', async () => {
      const emptyScheduler = new ProspectingAutoReplyScheduler(null);

      const result = await emptyScheduler.scheduleAutoReply({
        campaignId: 1n,
        leadId: 1n,
        inboundMessageId: 1n,
        objectionId: 1n,
        suggestedResponse: 'Response',
      });

      expect(result.scheduled).toBe(false);
      expect(result.reason).toBe('SERVICE_NOT_CONFIGURED');
    });
  });
});
