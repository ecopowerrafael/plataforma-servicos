import { readFileSync } from 'node:fs';

import {
  CreateTreatmentPlanRequestSchema,
  estimatedTotalCents,
  recommendedNextDate,
  servicePriceLabel,
  treatmentAmountLabel,
  treatmentPlanStateLabel,
} from '@plataforma/shared';
import { describe, expect, it, vi } from 'vitest';

import { type TreatmentPlanRepository } from './treatment-plan.repository.js';
import { TreatmentPlanService } from './treatment-plan.service.js';

const ACTOR = { userId: 1n, sessionId: 1n };
const PLAN_ID = '00000000-0000-4000-8000-0000000000a1';

const session = (overrides: Record<string, unknown> = {}) => ({
  id: 10n,
  publicId: '00000000-0000-4000-8000-0000000000b1',
  sessionNumber: 1,
  startsAt: new Date('2026-09-05T17:00:00.000Z'),
  status: 'COMPLETED' as const,
  priceCents: 30000n,
  ...overrides,
});

const plan = (overrides: Record<string, unknown> = {}) => ({
  id: 1n,
  publicId: PLAN_ID,
  tenantId: 1n,
  customerId: 2n,
  serviceId: 3n,
  professionalId: 4n,
  originAppointmentId: 9n,
  title: 'Protocolo Facial Premium',
  status: 'APPROVED' as const,
  billingMode: 'PER_SESSION' as const,
  amountCents: 30000n,
  sessionsPlanned: 4,
  returnIntervalDays: 30,
  notes: null,
  approvedAt: new Date('2026-08-10T12:00:00.000Z'),
  startedAt: null,
  completedAt: null,
  canceledAt: null,
  canceledReason: null,
  createdAt: new Date('2026-08-10T12:00:00.000Z'),
  updatedAt: new Date('2026-08-10T12:00:00.000Z'),
  customer: { publicId: '00000000-0000-4000-8000-0000000000c1', name: 'Maria Oliveira' },
  service: { publicId: '00000000-0000-4000-8000-0000000000d1', name: 'Tratamento Capilar' },
  professional: { publicId: '00000000-0000-4000-8000-0000000000e1', publicName: 'João' },
  originAppointment: { publicId: '00000000-0000-4000-8000-0000000000f1' },
  sessions: [] as ReturnType<typeof session>[],
  ...overrides,
});

function repository(overrides: Record<string, unknown> = {}) {
  return {
    find: vi.fn().mockResolvedValue(plan()),
    findByOriginAppointment: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([plan()]),
    create: vi.fn().mockImplementation((data: Record<string, unknown>) =>
      Promise.resolve(plan({ ...data, sessions: [] })),
    ),
    update: vi.fn().mockImplementation((_id: bigint, data: Record<string, unknown>) =>
      Promise.resolve(plan(data)),
    ),
    evaluationAppointment: vi.fn().mockResolvedValue({
      id: 9n,
      kind: 'EVALUATION' as const,
      status: 'COMPLETED' as const,
      customerId: 2n,
      serviceId: 3n,
      professionalId: 4n,
      service: { pricingMode: 'QUOTE' as const },
    }),
    paidCentsByAppointment: vi.fn().mockResolvedValue(new Map<bigint, bigint>()),
    withPlanLock: vi.fn().mockImplementation((_id: string, run: () => Promise<unknown>) => run()),
    audit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as TreatmentPlanRepository;
}

describe('serviço sob orçamento', () => {
  it('nunca expõe R$ 0,00 no público', () => {
    expect(servicePriceLabel('QUOTE', '0', null)).toBe('Valor sob orçamento');
    expect(servicePriceLabel('QUOTE', '0', 'Orçamento na avaliação')).toBe(
      'Orçamento na avaliação',
    );
    expect(servicePriceLabel('FIXED', '12000', null)).toContain('120,00');
  });
});

describe('TreatmentPlanService — orçamento', () => {
  it('cria orçamento por sessão a partir da avaliação', async () => {
    const repo = repository();
    const created = await new TreatmentPlanService(repo).createFromEvaluation(
      1n,
      {
        appointmentPublicId: '00000000-0000-4000-8000-0000000000f1',
        title: 'Protocolo Facial Premium',
        billingMode: 'PER_SESSION',
        amountCents: 30000,
        sessionsPlanned: 4,
        returnIntervalDays: 30,
      },
      ACTOR,
      4n,
    );
    expect(created.billingMode).toBe('PER_SESSION');
    expect(created.amountCents).toBe('30000');
    expect(created.estimatedTotalCents).toBe('120000');
    expect(created.sessionsCompleted).toBe(0);
    // A avaliação não conta como sessão e o intervalo ainda não começou.
    expect(created.sessions).toHaveLength(0);
    expect(created.recommendedNextDate).toBeNull();
  });

  it('cria orçamento total sem dividir o valor pelas sessões', async () => {
    const repo = repository();
    const created = await new TreatmentPlanService(repo).createFromEvaluation(
      1n,
      {
        appointmentPublicId: '00000000-0000-4000-8000-0000000000f1',
        title: 'Protocolo Facial Premium',
        billingMode: 'TOTAL',
        amountCents: 120000,
        sessionsPlanned: 4,
        returnIntervalDays: 30,
      },
      ACTOR,
    );
    expect(created.amountCents).toBe('120000');
    expect(created.estimatedTotalCents).toBeNull();
  });

  it('permite quantidade de sessões em aberto', async () => {
    const created = await new TreatmentPlanService(repository()).createFromEvaluation(
      1n,
      {
        appointmentPublicId: '00000000-0000-4000-8000-0000000000f1',
        title: 'Protocolo Facial Premium',
        billingMode: 'PER_SESSION',
        amountCents: 30000,
        sessionsPlanned: null,
      },
      ACTOR,
    );
    expect(created.sessionsPlanned).toBeNull();
    expect(created.estimatedTotalCents).toBeNull();
  });

  it('recusa orçamento sobre atendimento que não é avaliação', async () => {
    const repo = repository({
      evaluationAppointment: vi.fn().mockResolvedValue({
        id: 9n,
        kind: 'STANDARD' as const,
        status: 'COMPLETED' as const,
        customerId: 2n,
        serviceId: 3n,
        professionalId: 4n,
        service: { pricingMode: 'FIXED' as const },
      }),
    });
    await expect(
      new TreatmentPlanService(repo).createFromEvaluation(
        1n,
        {
          appointmentPublicId: '00000000-0000-4000-8000-0000000000f1',
          title: 'Protocolo Facial Premium',
          billingMode: 'TOTAL',
          amountCents: 1000,
        },
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: 'TREATMENT_PLAN_REQUIRES_EVALUATION' });
  });
});

describe('TreatmentPlanService — intervalo entre sessões', () => {
  it('não recomenda data antes da primeira sessão concluída', async () => {
    const repo = repository({ find: vi.fn().mockResolvedValue(plan({ sessions: [] })) });
    const result = await new TreatmentPlanService(repo).get(1n, PLAN_ID);
    expect(result.recommendedNextDate).toBeNull();
    expect(result.sessionsCompleted).toBe(0);
  });

  it('conta a partir da conclusão real da sessão, não do agendamento', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue(plan({ sessions: [session()] })),
    });
    const result = await new TreatmentPlanService(repo).get(1n, PLAN_ID);
    expect(result.sessionsCompleted).toBe(1);
    expect(result.recommendedNextDate).toBe('2026-10-05T17:00:00.000Z');
  });

  it('usa a data da última sessão quando o cliente atrasa', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue(
        plan({
          sessions: [
            session(),
            session({
              id: 11n,
              publicId: '00000000-0000-4000-8000-0000000000b2',
              sessionNumber: 2,
              startsAt: new Date('2026-10-12T17:00:00.000Z'),
            }),
          ],
        }),
      ),
    });
    const result = await new TreatmentPlanService(repo).get(1n, PLAN_ID);
    expect(result.sessionsCompleted).toBe(2);
    expect(result.recommendedNextDate).toBe('2026-11-11T17:00:00.000Z');
  });

  it('ignora avaliação e sessões canceladas no contador', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue(
        plan({
          sessions: [
            session(),
            session({
              id: 12n,
              publicId: '00000000-0000-4000-8000-0000000000b3',
              sessionNumber: 2,
              status: 'CANCELED' as const,
            }),
          ],
        }),
      ),
    });
    const result = await new TreatmentPlanService(repo).get(1n, PLAN_ID);
    expect(result.sessionsCompleted).toBe(1);
  });

  it('calcula a recomendação com a fórmula do contrato', () => {
    expect(recommendedNextDate(new Date('2026-09-05T17:00:00.000Z'), 30)?.toISOString()).toBe(
      '2026-10-05T17:00:00.000Z',
    );
    expect(recommendedNextDate(null, 30)).toBeNull();
    expect(recommendedNextDate(new Date('2026-09-05T17:00:00.000Z'), null)).toBeNull();
    expect(estimatedTotalCents('TOTAL', 120000n, 4)).toBeNull();
    expect(estimatedTotalCents('PER_SESSION', 30000n, 4)).toBe(120000n);
  });
});

describe('TreatmentPlanService — sessões e cobrança', () => {
  it('cobra cada sessão em PER_SESSION', async () => {
    const service = new TreatmentPlanService(repository());
    const first = await service.nextSession(1n, PLAN_ID);
    expect(first).toMatchObject({ sessionNumber: 1, priceCents: 30000n });
  });

  it('lança o valor total uma única vez em TOTAL', async () => {
    const totalPlan = (sessions: ReturnType<typeof session>[]) =>
      repository({
        find: vi
          .fn()
          .mockResolvedValue(
            plan({ billingMode: 'TOTAL' as const, amountCents: 120000n, sessions }),
          ),
      });
    const first = await new TreatmentPlanService(totalPlan([])).nextSession(1n, PLAN_ID);
    expect(first).toMatchObject({ sessionNumber: 1, priceCents: 120000n });
    const second = await new TreatmentPlanService(totalPlan([session()])).nextSession(1n, PLAN_ID);
    expect(second).toMatchObject({ sessionNumber: 2, priceCents: 0n });
  });

  it('exige orçamento aprovado antes da primeira sessão', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue(plan({ status: 'PENDING' as const })),
    });
    await expect(new TreatmentPlanService(repo).nextSession(1n, PLAN_ID)).rejects.toMatchObject({
      code: 'TREATMENT_PLAN_NOT_APPROVED',
    });
  });

  it('bloqueia mudança de valor quando já existe pagamento', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue(plan({ sessions: [session()] })),
      paidCentsByAppointment: vi.fn().mockResolvedValue(new Map([[10n, 30000n]])),
    });
    await expect(
      new TreatmentPlanService(repo).update(
        1n,
        PLAN_ID,
        { title: 'Protocolo Facial Premium', billingMode: 'PER_SESSION', amountCents: 50000 },
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: 'TREATMENT_PLAN_AMOUNT_LOCKED' });
  });

  it('conclui o plano ao atingir as sessões previstas, preservando histórico', async () => {
    const sessions = [1, 2, 3, 4].map((number) =>
      session({
        id: BigInt(10 + number),
        publicId: `00000000-0000-4000-8000-000000000b${String(number).padStart(2, '0')}`,
        sessionNumber: number,
      }),
    );
    const update = vi
      .fn()
      .mockImplementation((_id: bigint, data: Record<string, unknown>) =>
        Promise.resolve(plan(data)),
      );
    const repo = repository({ list: vi.fn().mockResolvedValue([plan({ sessions })]), update });
    await new TreatmentPlanService(repo).refreshProgress(1n, 1n);
    expect(update).toHaveBeenCalledWith(1n, expect.objectContaining({ status: 'COMPLETED' }));
  });
});

describe('TreatmentPlanService — numeração das sessões', () => {
  const numbered = (number: number, status: 'COMPLETED' | 'CANCELED' | 'NO_SHOW' | 'CONFIRMED') =>
    session({
      id: BigInt(20 + number),
      publicId: `00000000-0000-4000-8000-000000000c${String(number).padStart(2, '0')}`,
      sessionNumber: number,
      status,
    });

  it('sessão cancelada não consome número', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue(plan({ sessions: [numbered(1, 'CANCELED')] })),
    });
    await expect(new TreatmentPlanService(repo).nextSession(1n, PLAN_ID)).resolves.toMatchObject({
      sessionNumber: 1,
    });
  });

  it('falta não consome número', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue(plan({ sessions: [numbered(1, 'NO_SHOW')] })),
    });
    await expect(new TreatmentPlanService(repo).nextSession(1n, PLAN_ID)).resolves.toMatchObject({
      sessionNumber: 1,
    });
  });

  it('sessão viva mantém o número e a próxima segue a sequência', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue(
        plan({ sessions: [numbered(1, 'COMPLETED'), numbered(2, 'CONFIRMED')] }),
      ),
    });
    await expect(new TreatmentPlanService(repo).nextSession(1n, PLAN_ID)).resolves.toMatchObject({
      sessionNumber: 3,
    });
  });

  it('serializa a numeração por plano para não duplicar em concorrência', async () => {
    const withPlanLock = vi
      .fn()
      .mockImplementation((_id: string, run: () => Promise<unknown>) => run());
    const repo = repository({ withPlanLock });
    const service = new TreatmentPlanService(repo);
    await expect(service.reserveSession(PLAN_ID, () => Promise.resolve(true))).resolves.toBe(true);
    expect(withPlanLock).toHaveBeenCalledWith(PLAN_ID, expect.any(Function));
  });
});

describe('TreatmentPlanService — TOTAL sem duplicar faturamento', () => {
  it('nova primeira sessão cobra apenas o saldo depois de cancelamento pago', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue(
        plan({
          billingMode: 'TOTAL' as const,
          amountCents: 120000n,
          sessions: [session({ status: 'CANCELED' as const })],
        }),
      ),
      paidCentsByAppointment: vi.fn().mockResolvedValue(new Map([[10n, 30000n]])),
    });
    await expect(new TreatmentPlanService(repo).nextSession(1n, PLAN_ID)).resolves.toMatchObject({
      sessionNumber: 1,
      priceCents: 90000n,
    });
  });
});

describe('TreatmentPlanService — plano sem quantidade definida', () => {
  const open = (sessions: ReturnType<typeof session>[] = []) =>
    repository({
      find: vi.fn().mockResolvedValue(plan({ sessionsPlanned: null, sessions })),
      list: vi.fn().mockResolvedValue([plan({ sessionsPlanned: null, sessions })]),
    });

  it('permite agendar a primeira sessão', async () => {
    await expect(new TreatmentPlanService(open()).nextSession(1n, PLAN_ID)).resolves.toMatchObject({
      sessionNumber: 1,
    });
  });

  it('mostra apenas o realizado e não estima total', async () => {
    const result = await new TreatmentPlanService(open([session()])).get(1n, PLAN_ID);
    expect(result.sessionsPlanned).toBeNull();
    expect(result.sessionsCompleted).toBe(1);
    expect(result.estimatedTotalCents).toBeNull();
  });

  it('não conclui o plano automaticamente', async () => {
    const update = vi
      .fn()
      .mockImplementation((_id: bigint, data: Record<string, unknown>) =>
        Promise.resolve(plan(data)),
      );
    const repo = open([session()]);
    (repo as unknown as { update: unknown }).update = update;
    await new TreatmentPlanService(repo).refreshProgress(1n, 1n);
    expect(update).toHaveBeenCalledWith(1n, expect.objectContaining({ status: 'IN_PROGRESS' }));
  });
});

describe('TreatmentPlanService — isolamento', () => {
  it('bloqueia mudança de valor quando já existe sessão concluída', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue(plan({ sessions: [session()] })),
    });
    await expect(
      new TreatmentPlanService(repo).update(
        1n,
        PLAN_ID,
        { title: 'Protocolo Facial Premium', billingMode: 'PER_SESSION', amountCents: 50000 },
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: 'TREATMENT_PLAN_AMOUNT_LOCKED' });
  });

  it('permite ajustar sessões e intervalo mesmo com sessão concluída', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue(plan({ sessions: [session()] })),
    });
    const updated = await new TreatmentPlanService(repo).update(
      1n,
      PLAN_ID,
      { title: 'Protocolo Facial Premium', billingMode: 'PER_SESSION', amountCents: 30000, sessionsPlanned: 6 },
      ACTOR,
    );
    expect(updated.sessionsPlanned).toBe(6);
  });

  it('não devolve plano de outro profissional', async () => {
    const repo = repository({ find: vi.fn().mockResolvedValue(plan({ professionalId: 99n })) });
    await expect(new TreatmentPlanService(repo).get(1n, PLAN_ID, 4n)).rejects.toMatchObject({
      code: 'TREATMENT_PLAN_NOT_FOUND',
    });
  });

  it('não devolve plano de outro tenant', async () => {
    // O repositório já filtra por tenant: fora dele o plano simplesmente não existe.
    const repo = repository({ find: vi.fn().mockResolvedValue(null) });
    await expect(new TreatmentPlanService(repo).get(2n, PLAN_ID)).rejects.toMatchObject({
      code: 'TREATMENT_PLAN_NOT_FOUND',
    });
  });
});

describe('TreatmentPlanService — título do tratamento', () => {
  it('exige título ao definir o orçamento', () => {
    expect(
      CreateTreatmentPlanRequestSchema.safeParse({
        appointmentPublicId: '00000000-0000-4000-8000-0000000000f1',
        title: ' ',
        billingMode: 'TOTAL',
        amountCents: 1000,
      }).success,
    ).toBe(false);
    const parsed = CreateTreatmentPlanRequestSchema.parse({
      appointmentPublicId: '00000000-0000-4000-8000-0000000000f1',
      title: '  Protocolo Facial Premium  ',
      billingMode: 'TOTAL',
      amountCents: 1000,
    });
    expect(parsed.title).toBe('Protocolo Facial Premium');
  });

  it('usa o nome do serviço em planos antigos sem título', async () => {
    const repo = repository({ find: vi.fn().mockResolvedValue(plan({ title: null })) });
    const result = await new TreatmentPlanService(repo).get(1n, PLAN_ID);
    expect(result.title).toBe('Tratamento Capilar');
  });
});

describe('TreatmentPlanService — aprovação pelo cliente', () => {
  it('aprova um plano PENDING do próprio cliente', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue(plan({ status: 'PENDING' as const })),
    });
    const result = await new TreatmentPlanService(repo).approveForCustomer(1n, 2n, PLAN_ID);
    expect(result.changed).toBe(true);
    expect(result.plan.status).toBe('APPROVED');
  });

  it('é idempotente: aprovar de novo não muda nada nem reemite evento', async () => {
    const update = vi.fn();
    const repo = repository({
      find: vi.fn().mockResolvedValue(plan({ status: 'APPROVED' as const })),
      update,
    });
    const result = await new TreatmentPlanService(repo).approveForCustomer(1n, 2n, PLAN_ID);
    expect(result.changed).toBe(false);
    expect(result.plan.status).toBe('APPROVED');
    expect(update).not.toHaveBeenCalled();
  });

  it('cliente não aprova nem lê plano de outro cliente', async () => {
    const repo = repository({ find: vi.fn().mockResolvedValue(plan({ customerId: 99n })) });
    const service = new TreatmentPlanService(repo);
    await expect(service.approveForCustomer(1n, 2n, PLAN_ID)).rejects.toMatchObject({
      code: 'TREATMENT_PLAN_NOT_FOUND',
    });
    await expect(service.getForCustomer(1n, 2n, PLAN_ID)).rejects.toMatchObject({
      code: 'TREATMENT_PLAN_NOT_FOUND',
    });
  });

  it('tenant de outro estabelecimento não encontra o plano', async () => {
    const repo = repository({ find: vi.fn().mockResolvedValue(null) });
    await expect(
      new TreatmentPlanService(repo).getForCustomer(9n, 2n, PLAN_ID),
    ).rejects.toMatchObject({ code: 'TREATMENT_PLAN_NOT_FOUND' });
  });

  it('depois de aprovado permite agendar a primeira sessão', async () => {
    const repo = repository({
      find: vi.fn().mockResolvedValue(plan({ status: 'APPROVED' as const, sessions: [] })),
    });
    await expect(new TreatmentPlanService(repo).nextSession(1n, PLAN_ID)).resolves.toMatchObject({
      sessionNumber: 1,
    });
  });
});

describe('estado e mensagens do tratamento', () => {
  const base = {
    status: 'APPROVED' as const,
    sessionsCompleted: 0,
    sessions: [] as { status: string }[],
  };

  it('traduz o estado sem expor o enum', () => {
    expect(treatmentPlanStateLabel({ ...base, status: 'PENDING' })).toBe('Aguardando aprovação');
    expect(treatmentPlanStateLabel(base)).toBe('Pronto para iniciar');
    expect(treatmentPlanStateLabel({ ...base, sessions: [{ status: 'CONFIRMED' }] })).toBe(
      'Primeira sessão agendada',
    );
    expect(treatmentPlanStateLabel({ ...base, status: 'IN_PROGRESS' })).toBe('Em tratamento');
    expect(treatmentPlanStateLabel({ ...base, status: 'COMPLETED' })).toBe('Concluído');
    expect(treatmentPlanStateLabel({ ...base, status: 'CANCELED' })).toBe('Cancelado');
  });

  it('TOTAL fala em valor total e PER_SESSION em valor por sessão', () => {
    expect(treatmentAmountLabel({ billingMode: 'TOTAL', amountCents: '120000' })).toContain(
      'Valor total',
    );
    expect(treatmentAmountLabel({ billingMode: 'TOTAL', amountCents: '120000' })).not.toContain(
      'por sessão',
    );
    expect(treatmentAmountLabel({ billingMode: 'PER_SESSION', amountCents: '30000' })).toContain(
      'Valor por sessão',
    );
  });
});

describe('orçamento não depende da entrega da mensagem', () => {
  it('a rota isola a falha de notificação do salvamento do orçamento', () => {
    const routes = readFileSync(new URL('./treatment-plan.routes.ts', import.meta.url), 'utf8');
    // Criar o plano e avisar o cliente são passos independentes.
    expect(routes).toContain('await options.notifications?.notifyQuoteReady(request.tenant.id, plan)');
    expect(routes).toContain('a própria fila de notificações registra o erro');
    // O evento de aprovação só é emitido na transição real (idempotência).
    expect(routes).toContain('if (result.changed)');
  });
});
