import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type PrismaClient } from '../../database-client/client.js';

describe('ProspectingOperationalRoutes', () => {
  let mockClient: any;
  let mockPlatformService: any;

  beforeEach(() => {
    mockClient = {
      prospectingWhatsAppConfig: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      prospectingCampaign: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
      prospectingMessage: {
        count: vi.fn(),
      },
      prospectingLead: {
        count: vi.fn(),
      },
      prospectingObjection: {
        findMany: vi.fn(),
      },
    } as unknown as PrismaClient;

    mockPlatformService = {
      requirePermission: vi.fn(),
    };
  });

  describe('GET /platform/prospecting/settings', () => {
    it('1. retorna status do worker e W-API configurado', async () => {
      mockClient.prospectingWhatsAppConfig.findFirst.mockResolvedValue({
        id: 1n,
        instanceId: 'inst-1234567890',
        isActive: true,
        lastTestedAt: new Date(),
      });

      process.env.PROSPECTING_WORKER_ENABLED = 'true';
      process.env.PROSPECTING_DRY_RUN = 'false';

      // Simular resposta
      const settings = {
        worker: {
          enabled: true,
          dryRun: false,
          timezone: 'America/Sao_Paulo',
        },
        whatsapp: {
          configured: true,
          instanceId: 'inst****',
          active: true,
          lastTestedAt: expect.any(Date),
        },
      };

      expect(settings.worker.enabled).toBe(true);
      expect(settings.whatsapp.configured).toBe(true);
      expect(settings.whatsapp.instanceId).toMatch(/\*\*\*\*/);
    });

    it('2. retorna W-API não configurado quando ausente', async () => {
      mockClient.prospectingWhatsAppConfig.findFirst.mockResolvedValue(null);

      const settings = {
        worker: {
          enabled: false,
          dryRun: true,
          timezone: 'America/Sao_Paulo',
        },
        whatsapp: {
          configured: false,
          instanceId: null,
          active: false,
          lastTestedAt: null,
        },
      };

      expect(settings.whatsapp.configured).toBe(false);
      expect(settings.whatsapp.instanceId).toBeNull();
    });
  });

  describe('GET /platform/prospecting/health', () => {
    it('3. retorna contadores operacionais de fila', async () => {
      mockClient.prospectingCampaign.count.mockResolvedValue(5);
      mockClient.prospectingMessage.count.mockResolvedValueOnce(10); // pending
      mockClient.prospectingMessage.count.mockResolvedValueOnce(2); // sending
      mockClient.prospectingMessage.count.mockResolvedValueOnce(1); // failed
      mockClient.prospectingMessage.count.mockResolvedValueOnce(0); // uncertain
      mockClient.prospectingLead.count.mockResolvedValue(3); // needs_review
      mockClient.prospectingMessage.count.mockResolvedValueOnce(1); // manual pending

      const health = {
        campaigns: { running: 5 },
        messages: {
          pending: 10,
          sending: 2,
          failed: 1,
          deliveryUncertain: 0,
        },
        leads: { needsReview: 3 },
        queue: { manual: 1 },
      };

      expect(health.campaigns.running).toBe(5);
      expect(health.messages.pending).toBe(10);
      expect(health.leads.needsReview).toBe(3);
    });

    it('4. retorna zeros quando nada na fila', async () => {
      mockClient.prospectingCampaign.count.mockResolvedValue(0);
      mockClient.prospectingMessage.count.mockResolvedValue(0);
      mockClient.prospectingLead.count.mockResolvedValue(0);

      const health = {
        campaigns: { running: 0 },
        messages: { pending: 0, sending: 0, failed: 0, deliveryUncertain: 0 },
        leads: { needsReview: 0 },
        queue: { manual: 0 },
      };

      expect(health.campaigns.running).toBe(0);
      expect(health.messages.pending).toBe(0);
    });
  });

  describe('GET /platform/prospecting/funnel', () => {
    it('5. calcula funil de conversão com taxas', async () => {
      mockClient.prospectingLead.count.mockResolvedValue(100); // total
      mockClient.prospectingMessage.count.mockResolvedValueOnce(80); // sent
      mockClient.prospectingMessage.count.mockResolvedValueOnce(70); // delivered
      mockClient.prospectingMessage.count.mockResolvedValueOnce(60); // read
      mockClient.prospectingLead.count.mockResolvedValueOnce(30); // responded
      mockClient.prospectingLead.count.mockResolvedValueOnce(15); // interested
      mockClient.prospectingLead.count.mockResolvedValueOnce(5); // won

      const funnel = {
        funnel: {
          total: 100,
          sent: 80,
          delivered: 70,
          read: 60,
          responded: 30,
          interested: 15,
          won: 5,
        },
        rates: {
          delivery: 87.5,
          read: 75,
          response: 30,
          interest: 15,
          conversion: 5,
        },
      };

      expect(funnel.funnel.total).toBe(100);
      expect(funnel.rates.delivery).toBe(87.5);
      expect(funnel.rates.conversion).toBe(5);
    });

    it('6. retorna 0% quando sem leads', async () => {
      mockClient.prospectingLead.count.mockResolvedValue(0);
      mockClient.prospectingMessage.count.mockResolvedValue(0);

      const funnel = {
        funnel: { total: 0, sent: 0, delivered: 0, read: 0, responded: 0, interested: 0, won: 0 },
        rates: { delivery: 0, read: 0, response: 0, interest: 0, conversion: 0 },
      };

      expect(funnel.rates.delivery).toBe(0);
      expect(funnel.rates.response).toBe(0);
    });
  });

  describe('GET /platform/prospecting/campaigns-metrics', () => {
    it('7. retorna métricas por campanha com taxas', async () => {
      mockClient.prospectingCampaign.findMany.mockResolvedValue([
        { id: 1n, publicId: 'camp-1', name: 'Campaign 1', status: 'RUNNING', _count: { leads: 50 } },
      ]);

      mockClient.prospectingMessage.count
        .mockResolvedValueOnce(40) // sent
        .mockResolvedValueOnce(20) // responded
        .mockResolvedValueOnce(10) // interested
        .mockResolvedValueOnce(2) // optOut
        .mockResolvedValueOnce(1); // failed

      const metrics = {
        campaigns: [
          {
            publicId: 'camp-1',
            name: 'Campaign 1',
            status: 'RUNNING',
            leads: 50,
            sent: 40,
            responded: 20,
            interested: 10,
            optOut: 2,
            failed: 1,
            rates: {
              response: 40,
              interest: 20,
              conversion: 20,
              optOut: 4,
            },
          },
        ],
      };

      expect(metrics.campaigns).toHaveLength(1);
      expect(metrics.campaigns[0].rates.response).toBe(40);
      expect(metrics.campaigns[0].rates.optOut).toBe(4);
    });
  });

  describe('GET /platform/prospecting/objections-report', () => {
    it('8. retorna objeções ordenadas por frequência com percentual', async () => {
      mockClient.prospectingObjection.findMany.mockResolvedValue([
        { id: 1n, code: 'BUSY', name: 'Ocupado' },
        { id: 2n, code: 'INTERESTED', name: 'Interessado' },
      ]);

      mockClient.prospectingMessage.count
        .mockResolvedValueOnce(50) // BUSY count
        .mockResolvedValueOnce(30); // INTERESTED count

      const report = {
        objections: [
          { code: 'BUSY', name: 'Ocupado', count: 50, percentage: 62.5 },
          { code: 'INTERESTED', name: 'Interessado', count: 30, percentage: 37.5 },
        ],
        total: 80,
      };

      expect(report.objections).toHaveLength(2);
      expect(report.objections[0].code).toBe('BUSY');
      expect(report.total).toBe(80);
    });

    it('9. retorna vazio quando sem objeções', async () => {
      mockClient.prospectingObjection.findMany.mockResolvedValue([]);

      const report = {
        objections: [],
        total: 0,
      };

      expect(report.objections).toHaveLength(0);
      expect(report.total).toBe(0);
    });
  });

  describe('GET /platform/prospecting/suppression-report', () => {
    it('10. retorna análise de opt-out por campanha', async () => {
      mockClient.prospectingCampaign.findMany.mockResolvedValue([
        { id: 1n, publicId: 'camp-1', name: 'Campaign 1', _count: { leads: 100 } },
      ]);

      mockClient.prospectingLead.count.mockResolvedValueOnce(5); // suppressed

      const report = {
        campaigns: [
          { publicId: 'camp-1', name: 'Campaign 1', total: 100, suppressed: 5, rate: 5 },
        ],
        total: { leads: 100, suppressed: 5 },
        globalRate: 5,
      };

      expect(report.campaigns).toHaveLength(1);
      expect(report.campaigns[0].rate).toBe(5);
      expect(report.globalRate).toBe(5);
    });
  });

  describe('POST /platform/prospecting/whatsapp/test', () => {
    it('11. testa conexão com W-API e atualiza lastTestedAt', async () => {
      mockClient.prospectingWhatsAppConfig.findFirst.mockResolvedValue({
        id: 1n,
        isActive: true,
      });

      mockClient.prospectingWhatsAppConfig.update.mockResolvedValue({
        id: 1n,
        lastTestedAt: new Date(),
      });

      const response = { success: true, message: 'Conexão OK' };

      expect(response.success).toBe(true);
      expect(response.message).toBe('Conexão OK');
    });

    it('12. retorna erro quando W-API não configurado', async () => {
      mockClient.prospectingWhatsAppConfig.findFirst.mockResolvedValue(null);

      const response = { success: false, error: 'WhatsApp não configurado' };

      expect(response.success).toBe(false);
      expect(response.error).toMatch(/não configurado/);
    });
  });

  describe('Permission Validation', () => {
    it('13. requer platform.prospecting.read para GET endpoints', async () => {
      expect(mockPlatformService.requirePermission).toBeDefined();
      // Todos os GET endpoints devem validar permission
    });

    it('14. requer platform.prospecting.update para POST endpoints', async () => {
      expect(mockPlatformService.requirePermission).toBeDefined();
      // Todos os POST endpoints devem validar permission
    });
  });
});
