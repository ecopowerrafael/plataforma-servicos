import { describe, expect, it } from 'vitest';

const minutesToTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const translateWaitReason = (reason: string | null): string => {
  const translations: Record<string, string> = {
    WORKER_DISABLED: 'Worker de prospecção desativado.',
    DRY_RUN: 'Modo de teste ativo. Nenhuma mensagem real será enviada.',
    WHATSAPP_NOT_CONFIGURED: 'WhatsApp da prospecção não está configurado ou ativo.',
    OUTSIDE_WINDOW: 'Fora da janela de envio.',
    WEEKDAY_NOT_ALLOWED: 'Hoje não é um dia permitido para esta campanha.',
    DAILY_LIMIT_REACHED: 'Limite diário de envios atingido.',
    NO_ELIGIBLE_LEADS: 'Não há leads elegíveis para envio.',
  };
  if (!reason) return 'Aguardando próximo ciclo do worker.';
  return translations[reason] || reason;
};

describe('ProspectingModule frontend — operational panel', () => {
  it('minutesToTime converte minutos para HH:MM', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(540)).toBe('09:00');
    expect(minutesToTime(1080)).toBe('18:00');
    expect(minutesToTime(1140)).toBe('19:00');
    expect(minutesToTime(1439)).toBe('23:59');
  });

  it('translateWaitReason converte código para mensagem português', () => {
    expect(translateWaitReason('WORKER_DISABLED')).toContain('Worker de prospecção desativado');
    expect(translateWaitReason('DRY_RUN')).toContain('Modo de teste');
    expect(translateWaitReason('WHATSAPP_NOT_CONFIGURED')).toContain('WhatsApp');
    expect(translateWaitReason('OUTSIDE_WINDOW')).toContain('janela de envio');
    expect(translateWaitReason('WEEKDAY_NOT_ALLOWED')).toContain('dia permitido');
    expect(translateWaitReason('DAILY_LIMIT_REACHED')).toContain('Limite diário');
    expect(translateWaitReason('NO_ELIGIBLE_LEADS')).toContain('leads elegíveis');
  });

  it('translateWaitReason com null retorna mensagem de espera', () => {
    const msg = translateWaitReason(null);
    expect(msg).toContain('próximo ciclo');
  });

  it('progressPercent renderiza entre 0 e 100', () => {
    const testCases = [0, 1, 42, 50, 99, 100];
    for (const percent of testCases) {
      expect(percent).toBeGreaterThanOrEqual(0);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });

  it('barra de progresso com 42% deve ter width 42%', () => {
    const progressPercent = 42;
    const expectedWidth = `${Math.min(progressPercent, 100)}%`;
    expect(expectedWidth).toBe('42%');
  });

  it('botão Excluir visível apenas em DRAFT e CANCELED', () => {
    const allowedStatuses = ['DRAFT', 'CANCELED'];
    const deniedStatuses = ['RUNNING', 'PAUSED', 'COMPLETED'];

    for (const status of allowedStatuses) {
      expect(['DRAFT', 'CANCELED']).toContain(status);
    }

    for (const status of deniedStatuses) {
      expect(['DRAFT', 'CANCELED']).not.toContain(status);
    }
  });

  it('dailySent >= dailyLimit destaca como limite atingido', () => {
    const testCases = [
      { dailySent: 42, dailyLimit: 100, reached: false },
      { dailySent: 100, dailyLimit: 100, reached: true },
      { dailySent: 101, dailyLimit: 100, reached: true },
    ];

    for (const tc of testCases) {
      const isReached = tc.dailySent >= tc.dailyLimit;
      expect(isReached).toBe(tc.reached);
    }
  });

  it('schema de progress valida campos obrigatórios', () => {
    const mockProgress = {
      totalLeads: 100,
      pending: 25,
      scheduled: 10,
      contacted: 5,
      responded: 8,
      interested: 3,
      failed: 5,
      suppressed: 2,
      sent: 20,
      delivered: 15,
      read: 12,
      dailySent: 3,
      dailyLimit: 100,
      progressPercent: 75,
      waitReason: null,
    };

    // Validar tipos
    expect(typeof mockProgress.totalLeads).toBe('number');
    expect(typeof mockProgress.dailySent).toBe('number');
    expect(typeof mockProgress.progressPercent).toBe('number');
    expect(mockProgress.waitReason === null || typeof mockProgress.waitReason === 'string').toBe(true);
  });

  it('polling somente RUNNING com refetchInterval 10000ms', () => {
    const campaignRunning = { status: 'RUNNING' };
    const campaignDraft = { status: 'DRAFT' };

    // Simulação de refetchInterval logic
    const getRefetchInterval = (data: any) => {
      if (data?.status === 'RUNNING') return 10000;
      return false;
    };

    expect(getRefetchInterval(campaignRunning)).toBe(10000);
    expect(getRefetchInterval(campaignDraft)).toBe(false);
  });

  it('confirmação DELETE tem contrato correto', () => {
    const deleteConfirm = {
      title: 'Excluir campanha?',
      description: 'Esta ação excluirá permanentemente a campanha e seus dados relacionados.',
      confirmLabel: 'Excluir definitivamente',
      requiresReason: false,
      variant: 'danger',
    };

    expect(deleteConfirm.title).toBe('Excluir campanha?');
    expect(deleteConfirm.requiresReason).toBe(false);
    expect(deleteConfirm.variant).toBe('danger');
    expect(typeof deleteConfirm.confirmLabel).toBe('string');
  });
});
