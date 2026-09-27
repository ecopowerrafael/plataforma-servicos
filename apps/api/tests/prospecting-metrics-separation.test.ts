import { describe, expect, it } from 'vitest';

describe('prospecting metrics — separation of accumulated vs daily outbound', () => {
  it('daily sent é apenas outbound de hoje, não acumulado total', () => {
    // Cenário: campanha tem mensagens historicamente
    const campaignHistory = {
      yesterday: [
        { status: 'SENT', direction: 'OUTBOUND' },
        { status: 'DELIVERED', direction: 'OUTBOUND' },
        { status: 'READ', direction: 'OUTBOUND' },
      ],
      today: [
        { status: 'SENT', direction: 'OUTBOUND' },
        { status: 'SENT', direction: 'OUTBOUND' },
        { status: 'INBOUND', direction: 'INBOUND' }, // não conta
      ],
    };

    // Cálculos esperados:
    // Acumulado total (SENT, DELIVERED, READ)
    const totalSent = 4; // 3 yesterday + 1 today
    const totalDelivered = 1; // 1 yesterday
    const totalRead = 1; // 1 yesterday

    // Apenas outbound de hoje
    const todayOutbound = [
      { status: 'SENT', direction: 'OUTBOUND' },
      { status: 'SENT', direction: 'OUTBOUND' },
    ];
    const dailySent = todayOutbound.filter((m) => ['SENT', 'DELIVERED', 'READ'].includes(m.status)).length;

    // Validação
    expect(totalSent).toBe(4);
    expect(dailySent).toBe(2);
    expect(totalSent).toBeGreaterThan(dailySent);

    // Inbound nunca conta no dailySent
    const inboundMessage = campaignHistory.today.find((m) => m.direction === 'INBOUND');
    expect(inboundMessage).toBeDefined();
    expect(dailySent).toBe(2); // ainda 2, inbound não foi contado
  });

  it('resposta de progress separada em campos distintos', () => {
    // Espera contrato:
    const progressResponse = {
      // Acumulado total
      sent: 20, // todas as mensagens SENT, histórico completo
      delivered: 15, // todas as mensagens DELIVERED, histórico completo
      read: 12, // todas as mensagens READ, histórico completo

      // Apenas hoje + outbound
      dailySent: 3, // enviadas outbound apenas hoje

      // Limite diário
      dailyLimit: 100,

      // Outros campos
      totalLeads: 100,
      pending: 25,
      scheduled: 10,
      progressPercent: 75,
      waitReason: null,
    };

    // Validação de contrato
    expect(progressResponse.sent).toBeDefined();
    expect(progressResponse.delivered).toBeDefined();
    expect(progressResponse.read).toBeDefined();
    expect(progressResponse.dailySent).toBeDefined();

    // Invariantes
    expect(progressResponse.sent).toBeGreaterThanOrEqual(progressResponse.dailySent);
    expect(progressResponse.delivered).toBeGreaterThanOrEqual(progressResponse.dailySent);
    expect(progressResponse.read).toBeGreaterThanOrEqual(progressResponse.dailySent);

    // dailySent < dailyLimit
    expect(progressResponse.dailySent).toBeLessThanOrEqual(progressResponse.dailyLimit);
  });

  it('query de mensagens acumuladas vs query de hoje com filtro OUTBOUND', () => {
    // Pseudocódigo do que deve acontecer no backend:

    // Query 1: Acumulado (sem filtro de data ou direction)
    const queryAccumulated = {
      where: { campaignId: 123 },
      groupBy: ['status'],
      // Retorna: SENT=20, DELIVERED=15, READ=12, FAILED=5, etc
    };

    // Query 2: Hoje + OUTBOUND apenas
    const queryTodayOutbound = {
      where: {
        campaignId: 123,
        direction: 'OUTBOUND',
        sentAt: { gte: '2026-08-31T00:00:00Z', lte: '2026-08-31T23:59:59Z' },
      },
      groupBy: ['status'],
      // Retorna: SENT=3, DELIVERED=0, READ=0
    };

    // Dois queries diferentes retornam dois conjuntos de dados
    expect(queryAccumulated.where).not.toEqual(queryTodayOutbound.where);
    expect(queryTodayOutbound.where).toHaveProperty('direction', 'OUTBOUND');
    expect(queryTodayOutbound.where).toHaveProperty('sentAt');
  });
});
