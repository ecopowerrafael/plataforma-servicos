import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProspectingObjectionEngine } from './prospecting-objection-engine.js';
import { type PrismaClient } from '../../database-client/client.js';

describe('ProspectingObjectionEngine', () => {
  let engine: ProspectingObjectionEngine;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      prospectingMessage: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      prospectingObjectionPattern: {
        findMany: vi.fn(),
      },
      prospectingLead: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      prospectingCampaign: {
        findUnique: vi.fn(),
      },
    } as unknown as PrismaClient;

    engine = new ProspectingObjectionEngine(mockClient);
  });

  describe('Pattern Matching', () => {
    it('1. EXACT match', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 1n,
          objection: { publicId: 'obj-1', code: 'INTERESSADO', suggestedResponse: 'Ótimo!' },
          patternType: 'EXACT',
          pattern: 'tenho interesse',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null });
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({ pauseOnInterest: false });

      const result = await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'tenho interesse',
      });

      expect(result.matched).toBe(true);
      expect(result.confidence).toBe('EXACT');
      expect(result.objectionCode).toBe('INTERESSADO');
    });

    it('2. STARTS_WITH match', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 2n,
          objection: { publicId: 'obj-2', code: 'PRECO', suggestedResponse: 'Posso mostrar' },
          patternType: 'STARTS_WITH',
          pattern: 'quanto',
          priority: 8,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null });

      const result = await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'quanto custa esse servico',
      });

      expect(result.matched).toBe(true);
      expect(result.confidence).toBe('RULE');
    });

    it('3. ENDS_WITH match', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 3n,
          objection: { publicId: 'obj-3', code: 'FALAR_DEPOIS', suggestedResponse: 'Ok' },
          patternType: 'ENDS_WITH',
          pattern: 'depois',
          priority: 8,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null });

      const result = await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'me chama depois',
      });

      expect(result.matched).toBe(true);
    });

    it('4. CONTAINS match', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 4n,
          objection: { publicId: 'obj-4', code: 'SEM_TEMPO', suggestedResponse: 'Sem problema' },
          patternType: 'CONTAINS',
          pattern: 'ocupado',
          priority: 6,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null });

      const result = await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'estou muito ocupado agora',
      });

      expect(result.matched).toBe(true);
    });

    it('5. Priority determines winner', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 5n,
          objection: { publicId: 'obj-5a', code: 'LOW_PRI', suggestedResponse: '' },
          patternType: 'CONTAINS',
          pattern: 'depois',
          priority: 2,
        },
        {
          objectionId: 6n,
          objection: { publicId: 'obj-5b', code: 'HIGH_PRI', suggestedResponse: '' },
          patternType: 'CONTAINS',
          pattern: 'depois',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null });

      const result = await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'me chama depois',
      });

      expect(result.objectionCode).toBe('HIGH_PRI');
    });

    it('6. Unmatched text', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([]);

      const result = await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'aleatório sem pattern',
      });

      expect(result.matched).toBe(false);
    });

    it('7. Normalize accents', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 7n,
          objection: { publicId: 'obj-7', code: 'PRECO', suggestedResponse: '' },
          patternType: 'EXACT',
          pattern: 'qual o preco',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null });

      const result = await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'qual o preço',
      });

      expect(result.matched).toBe(true);
    });
  });

  describe('Status Mapping', () => {
    it('8. SEM_INTERESSE → LOST', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 8n,
          objection: { publicId: 'obj-8', code: 'SEM_INTERESSE', suggestedResponse: '' },
          patternType: 'EXACT',
          pattern: 'nao tenho interesse',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null });

      await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'nao tenho interesse',
      });

      expect(mockClient.prospectingLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'LOST' }),
        }),
      );
    });

    it('9. INTERESSADO → INTERESTED + interestedAt', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 9n,
          objection: { publicId: 'obj-9', code: 'INTERESSADO', suggestedResponse: '' },
          patternType: 'EXACT',
          pattern: 'gostei',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null });
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({ pauseOnInterest: false });

      await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'gostei',
      });

      const call = vi.mocked(mockClient.prospectingLead.update).mock.calls.find(
        (c) => c[0]?.data?.status === 'INTERESTED',
      );
      expect(call).toBeDefined();
      expect(call![0].data.interestedAt).toBeDefined();
    });

    it('10. interestedAt only filled if null', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 10n,
          objection: { publicId: 'obj-10', code: 'INTERESSADO', suggestedResponse: '' },
          patternType: 'EXACT',
          pattern: 'gostei',
          priority: 10,
        },
      ]);
      const existingDate = new Date('2026-08-01');
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: existingDate });
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({ pauseOnInterest: false });

      await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'gostei',
      });

      const call = vi.mocked(mockClient.prospectingLead.update).mock.calls.find(
        (c) => c[0]?.data?.status === 'INTERESTED',
      );
      // Should NOT set interestedAt if already exists
      expect(call![0].data.interestedAt).toBeUndefined();
    });

    it('11. PRECO → QUALIFYING', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 11n,
          objection: { publicId: 'obj-11', code: 'PRECO', suggestedResponse: '' },
          patternType: 'EXACT',
          pattern: 'qual o preco',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null });

      await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'qual o preco',
      });

      expect(mockClient.prospectingLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'QUALIFYING' }),
        }),
      );
    });

    it('12. JA_USA_SISTEMA → QUALIFYING', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 12n,
          objection: { publicId: 'obj-12', code: 'JA_USA_SISTEMA', suggestedResponse: '' },
          patternType: 'EXACT',
          pattern: 'ja tenho sistema',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null });

      await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'ja tenho sistema',
      });

      expect(mockClient.prospectingLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'QUALIFYING' }),
        }),
      );
    });

    it('13. FALAR_DEPOIS → FOLLOW_UP', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 13n,
          objection: { publicId: 'obj-13', code: 'FALAR_DEPOIS', suggestedResponse: '' },
          patternType: 'EXACT',
          pattern: 'me chama depois',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null, followUpCount: 0 });
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        followUpEnabled: true,
        maxFollowUps: 2,
        followUpAfterHours: 24,
      });

      await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'me chama depois',
      });

      expect(mockClient.prospectingLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FOLLOW_UP' }),
        }),
      );
    });

    it('14. SEM_TEMPO → FOLLOW_UP', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 14n,
          objection: { publicId: 'obj-14', code: 'SEM_TEMPO', suggestedResponse: '' },
          patternType: 'EXACT',
          pattern: 'sem tempo agora',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null, followUpCount: 0 });
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        followUpEnabled: true,
        maxFollowUps: 2,
        followUpAfterHours: 24,
      });

      await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'sem tempo agora',
      });

      expect(mockClient.prospectingLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FOLLOW_UP' }),
        }),
      );
    });
  });

  describe('Follow-up Rules', () => {
    it('15. followUpEnabled=false prevents scheduling', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 15n,
          objection: { publicId: 'obj-15', code: 'FALAR_DEPOIS', suggestedResponse: '' },
          patternType: 'EXACT',
          pattern: 'me chama depois',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null, followUpCount: 0 });
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({ followUpEnabled: false });

      await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'me chama depois',
      });

      const calls = vi.mocked(mockClient.prospectingLead.update).mock.calls;
      const followUpCall = calls.find((c) => c[0]?.data?.nextActionAt);
      expect(followUpCall).toBeUndefined();
    });

    it('16. maxFollowUps limits scheduling', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 16n,
          objection: { publicId: 'obj-16', code: 'FALAR_DEPOIS', suggestedResponse: '' },
          patternType: 'EXACT',
          pattern: 'me chama depois',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null, followUpCount: 2 });
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        followUpEnabled: true,
        maxFollowUps: 2,
        followUpAfterHours: 24,
      });

      await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'me chama depois',
      });

      const calls = vi.mocked(mockClient.prospectingLead.update).mock.calls;
      const followUpCall = calls.find((c) => c[0]?.data?.nextActionAt);
      expect(followUpCall).toBeUndefined();
    });
  });

  describe('Status Protection', () => {
    it('17. SUPPRESSED not overridden', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 17n,
          objection: { publicId: 'obj-17', code: 'INTERESSADO', suggestedResponse: '' },
          patternType: 'EXACT',
          pattern: 'gostei',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'SUPPRESSED', interestedAt: null });

      await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'gostei',
      });

      const statusUpdateCall = vi.mocked(mockClient.prospectingLead.update).mock.calls.find(
        (c) => c[0]?.data?.status,
      );
      expect(statusUpdateCall).toBeUndefined();
    });

    it('18. NEEDS_REVIEW not overridden', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 18n,
          objection: { publicId: 'obj-18', code: 'INTERESSADO', suggestedResponse: '' },
          patternType: 'EXACT',
          pattern: 'gostei',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'NEEDS_REVIEW', interestedAt: null });

      await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'gostei',
      });

      const statusUpdateCall = vi.mocked(mockClient.prospectingLead.update).mock.calls.find(
        (c) => c[0]?.data?.status,
      );
      expect(statusUpdateCall).toBeUndefined();
    });

    it('19. WON not overridden', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 19n,
          objection: { publicId: 'obj-19', code: 'SEM_INTERESSE', suggestedResponse: '' },
          patternType: 'EXACT',
          pattern: 'nao tenho interesse',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'WON', interestedAt: null });

      await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'nao tenho interesse',
      });

      const statusUpdateCall = vi.mocked(mockClient.prospectingLead.update).mock.calls.find(
        (c) => c[0]?.data?.status,
      );
      expect(statusUpdateCall).toBeUndefined();
    });
  });

  describe('Idempotence', () => {
    it('20. Already classified message skipped', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue({ classifiedAt: new Date() });

      const result = await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'some text',
      });

      expect(result.matched).toBe(false);
    });

    it('21. Service not configured returns unmatched', () => {
      const emptyEngine = new ProspectingObjectionEngine(null);

      const result = emptyEngine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'some text',
      });

      expect(result).resolves.toEqual({ matched: false, confidence: 'RULE' });
    });
  });

  describe('Response Template', () => {
    it('22. suggestedResponse returned', async () => {
      mockClient.prospectingMessage.findUnique.mockResolvedValue(null);
      mockClient.prospectingObjectionPattern.findMany.mockResolvedValue([
        {
          objectionId: 22n,
          objection: {
            publicId: 'obj-22',
            code: 'INTERESSADO',
            suggestedResponse: 'Ótimo! Deixa eu enviar uma demo.',
          },
          patternType: 'EXACT',
          pattern: 'gostei',
          priority: 10,
        },
      ]);
      mockClient.prospectingLead.findUnique.mockResolvedValue({ status: 'RESPONDED', interestedAt: null });
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({ pauseOnInterest: false });

      const result = await engine.classify({
        campaignId: 1n,
        leadId: 1n,
        messageId: 1n,
        text: 'gostei',
      });

      expect(result.suggestedResponse).toBe('Ótimo! Deixa eu enviar uma demo.');
    });
  });
});
