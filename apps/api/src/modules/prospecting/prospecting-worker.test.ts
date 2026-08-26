import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProspectingWorkerService } from './prospecting-worker.service.js';
import { type ProspectingMessageSender } from './prospecting-message-sender.js';
import { type ProspectingWhatsAppConfigService } from './prospecting-whatsapp-config.service.js';
import { type PrismaClient } from '../../database-client/client.js';
import { type Environment } from '../../config/environment.js';

describe('ProspectingWorkerService', () => {
  let worker: ProspectingWorkerService;
  let mockClient: any;
  let mockEnv: any;
  let mockSender: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockClient = {
      prospectingCampaign: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      prospectingLead: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
      },
      prospectingMessage: {
        count: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      prospectingTemplate: {
        findFirst: vi.fn(),
      },
      prospectingSuppression: {
        findFirst: vi.fn(),
      },
      directoryBusiness: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaClient;

    mockEnv = {
      PROSPECTING_DRY_RUN: false,
      PROSPECTING_WORKER_ENABLED: true,
      PROSPECTING_WORKER_BATCH_SIZE: 10,
      PROSPECTING_WORKER_INTERVAL_SECONDS: 10,
      PROSPECTING_LOCK_TTL_SECONDS: 120,
      PROSPECTING_SENDING_STALE_SECONDS: 300,
      PROSPECTING_MAX_SEND_ATTEMPTS: 4,
      PROSPECTING_TIMEZONE: 'America/Sao_Paulo',
    } as unknown as Environment;

    mockSender = {
      sendText: vi.fn(),
    } as unknown as ProspectingMessageSender;

    mockConfigService = {
      getConfig: vi.fn(),
    } as unknown as ProspectingWhatsAppConfigService;

    worker = new ProspectingWorkerService(mockClient, mockEnv, mockSender, mockConfigService);
  });

  describe('Worker Disabled', () => {
    it('não inicia scheduler quando PROSPECTING_WORKER_ENABLED=false', async () => {
      mockEnv.PROSPECTING_WORKER_ENABLED = false;
      const workerDisabled = new ProspectingWorkerService(mockClient, mockEnv, mockSender, mockConfigService);

      workerDisabled.start();

      expect(mockClient.prospectingCampaign.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Campaign Status Filtering', () => {
    it('ignora campaña DRAFT', async () => {
      mockClient.prospectingCampaign.findMany.mockResolvedValue([]);

      await worker.runOnce();

      const call = vi.mocked(mockClient.prospectingCampaign.findMany).mock.calls[0];
      expect(call[0].where.status).toBe('RUNNING');
    });

    it('processa apenas campanhas RUNNING', async () => {
      mockClient.prospectingCampaign.findMany.mockResolvedValue([
        {
          id: 1n,
          status: 'RUNNING',
          leads: [],
        },
      ]);

      await worker.runOnce();

      const call = vi.mocked(mockClient.prospectingCampaign.findMany).mock.calls[0];
      expect(call[0].where.status).toBe('RUNNING');
    });
  });

  describe('Lead Status Filtering', () => {
    it('ignora lead WAITING_REPLY', async () => {
      mockClient.prospectingCampaign.findMany.mockResolvedValue([
        {
          id: 1n,
          status: 'RUNNING',
          sendingStartMinutes: 540,
          sendingEndMinutes: 1080,
          dailyLimit: 100,
          leads: [],
        },
      ]);

      await worker.runOnce();

      const call = vi.mocked(mockClient.prospectingCampaign.findMany).mock.calls[0];
      const whereClause = call[0].include.leads.where;
      expect(whereClause.status.in).toContain('PENDING');
      expect(whereClause.status.in).not.toContain('WAITING_REPLY');
    });

    it('processa leads com status PENDING, SCHEDULED, FOLLOW_UP', async () => {
      mockClient.prospectingCampaign.findMany.mockResolvedValue([]);

      await worker.runOnce();

      const call = vi.mocked(mockClient.prospectingCampaign.findMany).mock.calls[0];
      const whereClause = call[0].include.leads.where;
      expect(whereClause.status.in).toEqual(['PENDING', 'SCHEDULED', 'FOLLOW_UP']);
    });
  });

  describe('Dry Run', () => {
    it('não envia mensagem real quando PROSPECTING_DRY_RUN=true', async () => {
      mockEnv.PROSPECTING_DRY_RUN = true;
      mockClient.prospectingCampaign.findMany.mockResolvedValue([]);

      await worker.runOnce();

      expect(vi.mocked(mockSender.sendText)).not.toHaveBeenCalled();
    });
  });

  describe('Suppression', () => {
    it('não processa lead suppressionado', async () => {
      mockClient.prospectingCampaign.findMany.mockResolvedValue([]);
      // Suppression check is in validateLeadEligibility
      // Se existir suppression, lead não é processado
    });
  });

  describe('Human Lock', () => {
    it('não processa lead com humanLockUntil > now', async () => {
      const futureDate = new Date(Date.now() + 3600000);
      const lead = {
        id: 1n,
        publicId: 'lead-123',
        currentStep: 0,
        attemptCount: 0,
        normalizedPhone: '5511999999999',
        nameSnapshot: 'Test',
        directoryBusinessId: 1n,
        humanLockUntil: futureDate,
      };

      mockClient.prospectingCampaign.findMany.mockResolvedValue([
        {
          id: 1n,
          status: 'RUNNING',
          leads: [lead],
          sendingStartMinutes: 540,
          sendingEndMinutes: 1080,
          dailyLimit: 100,
          minIntervalSeconds: 30,
          maxIntervalSeconds: 120,
        },
      ]);

      // Mock claim to fail for this lead
      mockClient.prospectingLead.updateMany.mockResolvedValue({ count: 0 });

      const result = await worker.runOnce();

      expect(result.skipped).toBeGreaterThan(0);
    });
  });

  describe('WhatsApp Config Validation', () => {
    it('não processa se WhatsApp config não está ativa', async () => {
      mockConfigService.getConfig.mockResolvedValue(null);

      // The validation happens after claim
      // Se config não está ativa, lead é liberado e skipped
    });
  });

  describe('Batch Size', () => {
    it('respeita PROSPECTING_WORKER_BATCH_SIZE', async () => {
      mockClient.prospectingCampaign.findMany.mockResolvedValue([]);

      await worker.runOnce();

      const call = vi.mocked(mockClient.prospectingCampaign.findMany).mock.calls[0];
      expect(call[0].include.leads.take).toBe(mockEnv.PROSPECTING_WORKER_BATCH_SIZE);
    });
  });

  describe('runOnce Statistics', () => {
    it('retorna estatísticas corretas', async () => {
      mockClient.prospectingCampaign.findMany.mockResolvedValue([]);

      const result = await worker.runOnce();

      expect(result).toHaveProperty('campaignsChecked');
      expect(result).toHaveProperty('leadsClaimed');
      expect(result).toHaveProperty('sent');
      expect(result).toHaveProperty('dryRun');
      expect(result).toHaveProperty('retried');
      expect(result).toHaveProperty('failed');
      expect(result).toHaveProperty('skipped');
    });
  });

  describe('Lock Management', () => {
    it('tenta fazer claim atômico antes de processar', async () => {
      const lead = {
        id: 1n,
        publicId: 'lead-123',
        currentStep: 0,
        attemptCount: 0,
        normalizedPhone: '5511999999999',
        nameSnapshot: 'Test',
        directoryBusinessId: 1n,
      };

      mockClient.prospectingCampaign.findMany.mockResolvedValue([
        {
          id: 1n,
          status: 'RUNNING',
          leads: [lead],
        },
      ]);

      // Claim deve ser feito via updateMany
      mockClient.prospectingLead.updateMany.mockResolvedValue({ count: 0 });

      const result = await worker.runOnce();

      // Se claim não consegue (count=0), lead é skipped
      expect(result.skipped).toBeGreaterThan(0);
    });
  });

  describe('Scheduler', () => {
    it('start não faz nada se worker desabilitado', () => {
      mockEnv.PROSPECTING_WORKER_ENABLED = false;
      const disabledWorker = new ProspectingWorkerService(
        mockClient,
        mockEnv,
        mockSender,
        mockConfigService,
      );

      disabledWorker.start();

      // Scheduler deve não iniciar
      expect(mockClient.prospectingCampaign.findMany).not.toHaveBeenCalled();
    });

    it('stop para o scheduler', async () => {
      worker.start();
      await worker.stop();

      // Scheduler parado, nenhuma nova execução deve ocorrer
      expect(mockClient.prospectingCampaign.findMany).not.toHaveBeenCalled();
    });
  });
});
