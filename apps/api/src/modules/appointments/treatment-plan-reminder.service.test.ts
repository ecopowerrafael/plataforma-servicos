import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TreatmentPlanReminderService } from './treatment-plan-reminder.service.js';
import { TreatmentPlanReminderRepository } from './treatment-plan-reminder.repository.js';
import { type IntegrationService } from '../integrations/integration.service.js';
import { type IntegrationRepository } from '../integrations/integration.repository.js';

describe('TreatmentPlanReminderService', () => {
  let service: TreatmentPlanReminderService;
  let repo: TreatmentPlanReminderRepository;
  let integrationService: IntegrationService;
  let integrationRepo: IntegrationRepository;

  beforeEach(() => {
    repo = {
      getConfig: vi.fn(),
      createConfig: vi.fn(),
      updateConfig: vi.fn(),
      getByTreatmentPlanId: vi.fn(),
      createReminderState: vi.fn(),
      updateReminderState: vi.fn(),
      getDueReminders: vi.fn(),
      getTreatmentPlan: vi.fn(),
      getTenant: vi.fn(),
      getTenantTerminology: vi.fn(),
      createReminderLog: vi.fn(),
      getReminderLogs: vi.fn(),
    } as any;

    integrationService = {} as any;
    integrationRepo = {} as any;

    service = new TreatmentPlanReminderService(repo, integrationService, integrationRepo);
  });

  describe('initializeForPendingPlan', () => {
    it('deve criar ReminderState quando config está ativa', async () => {
      const tenantId = 1n;
      const planId = 100n;
      const config = {
        enabled: true,
        sequence: [{ delayValue: 1, delayUnit: 'DAY' as const, message: 'test' }],
      };

      vi.mocked(repo.getByTreatmentPlanId).mockResolvedValue(null);
      vi.mocked(repo.getConfig).mockResolvedValue(config as any);
      vi.mocked(repo.createReminderState).mockResolvedValue({} as any);

      await service.initializeForPendingPlan(tenantId, planId);

      expect(repo.createReminderState).toHaveBeenCalled();
      const call = vi.mocked(repo.createReminderState).mock.calls[0][0];
      expect(call.tenantId).toBe(tenantId);
      expect(call.treatmentPlanId).toBe(planId);
      expect(call.status).toBe('ACTIVE');
    });

    it('não deve criar state se já existe', async () => {
      const planId = 100n;
      const existingState = { id: 1n };

      vi.mocked(repo.getByTreatmentPlanId).mockResolvedValue(existingState as any);

      await service.initializeForPendingPlan(1n, planId);

      expect(repo.createReminderState).not.toHaveBeenCalled();
    });

    it('não deve criar state se config desativada', async () => {
      const tenantId = 1n;
      const planId = 100n;

      vi.mocked(repo.getByTreatmentPlanId).mockResolvedValue(null);
      vi.mocked(repo.getConfig).mockResolvedValue({ enabled: false } as any);

      await service.initializeForPendingPlan(tenantId, planId);

      expect(repo.createReminderState).not.toHaveBeenCalled();
    });
  });

  describe('pauseReminder', () => {
    it('deve pausar reminder existente', async () => {
      const planId = 100n;
      const state = { id: 1n, status: 'ACTIVE' };

      vi.mocked(repo.getByTreatmentPlanId).mockResolvedValue(state as any);
      vi.mocked(repo.updateReminderState).mockResolvedValue({} as any);

      await service.pauseReminder(planId);

      expect(repo.updateReminderState).toHaveBeenCalledWith(state.id, {
        status: 'PAUSED',
      });
    });
  });

  describe('resumeReminder', () => {
    it('deve retomar reminder pausado', async () => {
      const tenantId = 1n;
      const planId = 100n;
      const state = { id: 1n, tenantId, status: 'PAUSED', currentStepIndex: 0 };
      const config = {
        sequence: [{ delayValue: 1, delayUnit: 'DAY' as const, message: 'test' }],
      };

      vi.mocked(repo.getByTreatmentPlanId).mockResolvedValue(state as any);
      vi.mocked(repo.getConfig).mockResolvedValue(config as any);
      vi.mocked(repo.updateReminderState).mockResolvedValue({} as any);

      await service.resumeReminder(planId);

      expect(repo.updateReminderState).toHaveBeenCalled();
      const call = vi.mocked(repo.updateReminderState).mock.calls[0][1];
      expect(call.status).toBe('ACTIVE');
      expect(call.nextReminderAt).toBeDefined();
    });
  });

  describe('cancelReminder', () => {
    it('deve cancelar reminder existente', async () => {
      const planId = 100n;
      const state = { id: 1n };

      vi.mocked(repo.getByTreatmentPlanId).mockResolvedValue(state as any);
      vi.mocked(repo.updateReminderState).mockResolvedValue({} as any);

      await service.cancelReminder(planId);

      expect(repo.updateReminderState).toHaveBeenCalledWith(state.id, {
        status: 'CANCELED',
        nextReminderAt: null,
      });
    });

    it('não deve falhar se reminder não existe', async () => {
      const planId = 100n;

      vi.mocked(repo.getByTreatmentPlanId).mockResolvedValue(null);

      await expect(service.cancelReminder(planId)).resolves.not.toThrow();
    });
  });

  describe('processDueReminders', () => {
    it('deve processar lembretes vencidos', async () => {
      const state = {
        id: 1n,
        tenantId: 1n,
        treatmentPlanId: 100n,
        currentStepIndex: 0,
        channel: 'WHATSAPP',
        remindersSent: 0,
      };

      const plan = {
        id: 100n,
        status: 'PENDING',
        customer: { name: 'João', phone: '5511999999999' },
        title: 'Limpeza',
        service: { name: 'Serviço' },
        professional: { publicName: 'Prof' },
        amountCents: 10000n,
      };

      const config = {
        enabled: true,
        sequence: [{ delayValue: 1, delayUnit: 'DAY', message: 'Olá {{customerName}}!' }],
      };

      vi.mocked(repo.getDueReminders).mockResolvedValue([state as any]);
      vi.mocked(repo.getTreatmentPlan).mockResolvedValue(plan as any);
      vi.mocked(repo.getConfig).mockResolvedValue(config as any);
      vi.mocked(repo.getTenant).mockResolvedValue({ currency: 'BRL', displayName: 'Clínica' } as any);
      vi.mocked(repo.getTenantTerminology).mockResolvedValue({ treatmentPlanSingular: 'Orçamento' } as any);
      vi.mocked(repo.createReminderLog).mockResolvedValue({} as any);
      vi.mocked(repo.updateReminderState).mockResolvedValue({} as any);

      await service.processDueReminders();

      expect(repo.createReminderLog).toHaveBeenCalled();
    });

    it('deve cancelar reminder se plano não está pending', async () => {
      const state = {
        id: 1n,
        treatmentPlanId: 100n,
      };

      const plan = {
        status: 'CANCELED',
      };

      vi.mocked(repo.getDueReminders).mockResolvedValue([state as any]);
      vi.mocked(repo.getTreatmentPlan).mockResolvedValue(plan as any);
      vi.mocked(repo.updateReminderState).mockResolvedValue({} as any);

      await service.processDueReminders();

      expect(repo.updateReminderState).toHaveBeenCalledWith(state.id, {
        status: 'CANCELED',
        nextReminderAt: null,
      });
    });
  });
});
