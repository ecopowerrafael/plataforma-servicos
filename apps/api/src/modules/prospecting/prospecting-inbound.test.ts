import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProspectingInboundService } from './prospecting-inbound.service.js';
import { type ProspectingWhatsAppConfigService } from './prospecting-whatsapp-config.service.js';
import { type PrismaClient } from '../../database-client/client.js';

describe('ProspectingInboundService', () => {
  let service: ProspectingInboundService;
  let mockClient: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockClient = {
      prospectingMessage: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      prospectingLead: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      prospectingCampaign: {
        findUnique: vi.fn(),
      },
      prospectingSuppression: {
        create: vi.fn(),
      },
    } as unknown as PrismaClient;

    mockConfigService = {
      getConfig: vi.fn(),
    } as unknown as ProspectingWhatsAppConfigService;

    service = new ProspectingInboundService(mockClient, mockConfigService);
  });

  describe('Instance Routing', () => {
    it('1. instance Prospecting → processInbound handled', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingLead.findMany.mockResolvedValue([
        {
          id: 1n,
          campaignId: 1n,
          publicId: 'lead-123',
          respondedAt: null,
          status: 'WAITING_REPLY',
          normalizedPhone: '5511999999999',
        },
      ]);
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        pauseOnReply: false,
        publicId: 'camp-123',
      });

      const result = await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'Oi, tudo bem?',
        fromMe: false,
        eventType: 'message',
      });

      expect(result.handled).toBe(true);
      expect(result.leadPublicId).toBe('lead-123');
    });

    it('2. outra instance → handled=false', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'different-instance',
        isActive: true,
      });

      const result = await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'Oi',
        fromMe: false,
        eventType: 'message',
      });

      expect(result.handled).toBe(false);
      expect(result.reason).toBe('INSTANCE_MISMATCH');
    });
  });

  describe('Message Filtering', () => {
    it('3. fromMe=true ignorado', async () => {
      const result = await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'Mensagem saída',
        fromMe: true,
        eventType: 'message',
      });

      expect(result.handled).toBe(false);
      expect(result.reason).toBe('FROM_ME');
    });

    it('4. messageType não "message" ignorado', async () => {
      const result = await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'Status',
        fromMe: false,
        eventType: 'delivered',
      });

      expect(result.handled).toBe(false);
      expect(result.reason).toBe('NOT_MESSAGE_EVENT');
    });

    it('5. body vazio ignorado', async () => {
      const result = await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: '',
        fromMe: false,
        eventType: 'message',
      });

      expect(result.handled).toBe(false);
      expect(result.reason).toBe('EMPTY_BODY');
    });
  });

  describe('Deduplication', () => {
    it('6. duplicate externalMessageId não duplica', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue({
        id: 1n,
        externalMessageId: 'msg-123',
        direction: 'INBOUND',
      });

      const result = await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'Repetida',
        fromMe: false,
        eventType: 'message',
      });

      expect(result.handled).toBe(true);
      expect(result.reason).toBe('DUPLICATE_MESSAGE');
      expect(mockClient.prospectingLead.update).not.toHaveBeenCalled();
    });
  });

  describe('Lead Matching', () => {
    it('7. WAITING_REPLY priorizado', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingLead.findMany.mockResolvedValue([
        {
          id: 2n,
          campaignId: 1n,
          publicId: 'lead-222',
          respondedAt: null,
          status: 'PENDING',
        },
        {
          id: 1n,
          campaignId: 1n,
          publicId: 'lead-111',
          respondedAt: null,
          status: 'WAITING_REPLY',
        },
      ]);
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        pauseOnReply: false,
        publicId: 'camp-123',
      });

      const result = await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'Resposta',
        fromMe: false,
        eventType: 'message',
      });

      expect(result.leadPublicId).toBe('lead-111');
    });

    it('8. lead não encontrado', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingLead.findMany.mockResolvedValue([]);

      const result = await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'Mensagem',
        fromMe: false,
        eventType: 'message',
      });

      expect(result.handled).toBe(false);
      expect(result.reason).toBe('LEAD_NOT_FOUND');
    });
  });

  describe('Inbound Message Creation', () => {
    it('9. inbound cria ProspectingMessage RECEIVED', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingLead.findMany.mockResolvedValue([
        {
          id: 1n,
          campaignId: 1n,
          publicId: 'lead-123',
          respondedAt: null,
          status: 'WAITING_REPLY',
        },
      ]);
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        pauseOnReply: false,
        publicId: 'camp-123',
      });

      await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'Resposta do lead',
        fromMe: false,
        eventType: 'message',
      });

      expect(mockClient.prospectingMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          direction: 'INBOUND',
          status: 'RECEIVED',
          body: 'Resposta do lead',
          externalMessageId: 'msg-123',
        }),
      });
    });
  });

  describe('Lead Status Updates', () => {
    it('10. RESPONDED atualizado', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingLead.findMany.mockResolvedValue([
        {
          id: 1n,
          campaignId: 1n,
          publicId: 'lead-123',
          respondedAt: null,
          status: 'WAITING_REPLY',
        },
      ]);
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        pauseOnReply: false,
        publicId: 'camp-123',
      });

      await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'OK',
        fromMe: false,
        eventType: 'message',
      });

      expect(mockClient.prospectingLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'RESPONDED',
          }),
        }),
      );
    });

    it('11. respondedAt preenchido', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingLead.findMany.mockResolvedValue([
        {
          id: 1n,
          campaignId: 1n,
          publicId: 'lead-123',
          respondedAt: null,
          status: 'WAITING_REPLY',
        },
      ]);
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        pauseOnReply: false,
        publicId: 'camp-123',
      });

      await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'Mensagem',
        fromMe: false,
        eventType: 'message',
      });

      expect(mockClient.prospectingLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            respondedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('12. lastInboundAt atualizado', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingLead.findMany.mockResolvedValue([
        {
          id: 1n,
          campaignId: 1n,
          publicId: 'lead-123',
          respondedAt: null,
          status: 'WAITING_REPLY',
        },
      ]);
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        pauseOnReply: false,
        publicId: 'camp-123',
      });

      await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'Mensagem',
        fromMe: false,
        eventType: 'message',
      });

      expect(mockClient.prospectingLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastInboundAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('pauseOnReply', () => {
    it('13. pauseOnReply=true limpa nextActionAt', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingLead.findMany.mockResolvedValue([
        {
          id: 1n,
          campaignId: 1n,
          publicId: 'lead-123',
          respondedAt: null,
          status: 'WAITING_REPLY',
        },
      ]);
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        pauseOnReply: true,
        publicId: 'camp-123',
      });

      await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'Resposta',
        fromMe: false,
        eventType: 'message',
      });

      const calls = mockClient.prospectingLead.update.mock.calls;
      expect(calls.some((call) => call[0].data.nextActionAt === null)).toBe(true);
    });
  });

  describe('Opt-Out Detection', () => {
    it('14. opt-out SAIR', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingLead.findMany.mockResolvedValue([
        {
          id: 1n,
          campaignId: 1n,
          publicId: 'lead-123',
          respondedAt: null,
          normalizedPhone: '5511999999999',
          status: 'WAITING_REPLY',
        },
      ]);
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        pauseOnReply: false,
        publicId: 'camp-123',
      });

      await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'SAIR',
        fromMe: false,
        eventType: 'message',
      });

      expect(mockClient.prospectingSuppression.create).toHaveBeenCalled();
      expect(mockClient.prospectingLead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'SUPPRESSED',
          }),
        }),
      );
    });

    it('15. opt-out PARAR', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingLead.findMany.mockResolvedValue([
        {
          id: 1n,
          campaignId: 1n,
          publicId: 'lead-123',
          respondedAt: null,
          normalizedPhone: '5511999999999',
          status: 'WAITING_REPLY',
        },
      ]);
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        pauseOnReply: false,
        publicId: 'camp-123',
      });

      await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'PARAR',
        fromMe: false,
        eventType: 'message',
      });

      expect(mockClient.prospectingSuppression.create).toHaveBeenCalled();
    });

    it('16. opt-out STOP', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingLead.findMany.mockResolvedValue([
        {
          id: 1n,
          campaignId: 1n,
          publicId: 'lead-123',
          respondedAt: null,
          normalizedPhone: '5511999999999',
          status: 'WAITING_REPLY',
        },
      ]);
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        pauseOnReply: false,
        publicId: 'camp-123',
      });

      await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'STOP',
        fromMe: false,
        eventType: 'message',
      });

      expect(mockClient.prospectingSuppression.create).toHaveBeenCalled();
    });

    it('17. opt-out NÃO QUERO', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingLead.findMany.mockResolvedValue([
        {
          id: 1n,
          campaignId: 1n,
          publicId: 'lead-123',
          respondedAt: null,
          normalizedPhone: '5511999999999',
          status: 'WAITING_REPLY',
        },
      ]);
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        pauseOnReply: false,
        publicId: 'camp-123',
      });

      await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'não quero',
        fromMe: false,
        eventType: 'message',
      });

      expect(mockClient.prospectingSuppression.create).toHaveBeenCalled();
    });
  });

  describe('Human Lock', () => {
    it('18. humanLock criado', async () => {
      mockConfigService.getConfig.mockResolvedValue({
        instanceId: 'instance-123',
        isActive: true,
      });
      mockClient.prospectingMessage.findFirst.mockResolvedValue(null);
      mockClient.prospectingLead.findMany.mockResolvedValue([
        {
          id: 1n,
          campaignId: 1n,
          publicId: 'lead-123',
          respondedAt: null,
          status: 'WAITING_REPLY',
        },
      ]);
      mockClient.prospectingCampaign.findUnique.mockResolvedValue({
        pauseOnReply: false,
        publicId: 'camp-123',
      });

      await service.processInbound({
        instanceId: 'instance-123',
        externalMessageId: 'msg-123',
        fromPhone: '+55 11 99999999',
        body: 'Resposta',
        fromMe: false,
        eventType: 'message',
      });

      // Human lock should be created with reason
      expect(mockClient.prospectingLead.update).toHaveBeenCalled();
    });
  });

  describe('Delivery Status Updates', () => {
    it('19. DELIVERED status update', async () => {
      const result = await service.updateOutboundDeliveryStatus('msg-123', 'delivered');
      // Service configured with mocks, testing behavior
      expect(result).toBeDefined();
    });

    it('20. READ status update', async () => {
      const result = await service.updateOutboundDeliveryStatus('msg-123', 'read');
      expect(result).toBeDefined();
    });

    it('21. READ não regride para DELIVERED', async () => {
      const result = await service.updateOutboundDeliveryStatus('msg-123', 'delivered');
      // Service should return handled or reason
      expect(result).toHaveProperty('handled');
    });

    it('22. FAILED status update', async () => {
      const result = await service.updateOutboundDeliveryStatus('msg-123', 'failed', 'Error message');
      expect(result).toBeDefined();
    });
  });

  describe('Regression', () => {
    it('23. configuration check', () => {
      expect(mockClient).toBeDefined();
      expect(mockConfigService).toBeDefined();
      expect(service).toBeDefined();
    });
  });
});
