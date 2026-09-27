import { type TreatmentPlanPublic } from '@plataforma/shared';
import { describe, expect, it, vi } from 'vitest';

import { type CustomerNotificationDispatcher } from './customer-notification-dispatcher.js';
import { type NotificationService } from './notification.service.js';
import { TreatmentPlanNotificationService } from './treatment-plan-notification.service.js';

import type { PrismaClient } from '../../database-client/client.js';

const plan = (overrides: Partial<TreatmentPlanPublic> = {}): TreatmentPlanPublic => ({
  publicId: '00000000-0000-4000-8000-0000000000a1',
    title: 'Protocolo Facial Premium',
    status: 'PENDING',
    billingMode: 'PER_SESSION',
    amountCents: '30000',
    estimatedTotalCents: '120000',
    sessionsPlanned: 4,
    sessionsCompleted: 0,
    returnIntervalDays: 30,
    notes: null,
    customerPublicId: '00000000-0000-4000-8000-0000000000c1',
    customerName: 'Maria Oliveira',
    servicePublicId: '00000000-0000-4000-8000-0000000000d1',
    serviceName: 'Avaliação Facial',
    professionalPublicId: '00000000-0000-4000-8000-0000000000e1',
    professionalName: 'Rafael Silva',
    originAppointmentPublicId: '00000000-0000-4000-8000-0000000000f1',
    recommendedNextDate: null,
    lastCompletedSessionAt: null,
    paidCents: '0',
    sessions: [],
    approvedAt: null,
    startedAt: null,
    completedAt: null,
    canceledAt: null,
    canceledReason: null,
    createdAt: '2026-08-17T12:00:00.000Z',
    updatedAt: '2026-08-17T12:00:00.000Z',
  ...overrides,
});

function client(overrides: Record<string, unknown> = {}) {
  return {
    customer: { findFirst: vi.fn().mockResolvedValue({ id: 2n }) },
    professional: { findFirst: vi.fn().mockResolvedValue({ email: 'pro@example.com' }) },
    tenant: { findUnique: vi.fn().mockResolvedValue({ slug: 'studio' }) },
    ...overrides,
  } as unknown as PrismaClient;
}

type DispatchArgs = Parameters<CustomerNotificationDispatcher['dispatch']>;
type EnqueueArgs = Parameters<NotificationService['enqueue']>;

function dispatcher() {
  const dispatch = vi.fn<(...args: DispatchArgs) => Promise<boolean>>().mockResolvedValue(true);
  return { dispatch, service: { dispatch } as unknown as CustomerNotificationDispatcher };
}
function queue() {
  const enqueue = vi.fn<(...args: EnqueueArgs) => Promise<void>>().mockResolvedValue(undefined);
  return { enqueue, service: { enqueue } as unknown as NotificationService };
}

describe('notificação de orçamento pronto', () => {
  it('usa o título do tratamento e o link do detalhe na conta', async () => {
    const sender = dispatcher();
    await new TreatmentPlanNotificationService(
      client(),
      sender.service,
      queue().service,
      'https://app.exemplo.com',
    ).notifyQuoteReady(1n, plan());
    const call = sender.dispatch.mock.calls[0];
    expect(call?.[2]).toBe('treatment_plan.quote_ready');
    expect(call?.[4]).toMatchObject({ treatmentTitle: 'Protocolo Facial Premium' });
    expect(call?.[5]).toBe('treatment_plan');
    expect(call?.[6]?.ctaUrl).toBe(
      'https://app.exemplo.com/public/studio/conta/tratamentos/00000000-0000-4000-8000-0000000000a1',
    );
  });

  it('PER_SESSION fala em valor por sessão e informa o total estimado', async () => {
    const sender = dispatcher();
    await new TreatmentPlanNotificationService(
      client(),
      sender.service,
      queue().service,
    ).notifyQuoteReady(1n, plan());
    const variables: Record<string, string> = sender.dispatch.mock.calls[0]?.[4] ?? {};
    expect(variables.amountLine).toContain('Valor por sessão');
    expect(variables.sessionsLine).toContain('4 sessões previstas');
    expect(variables.estimatedTotalLine).toContain('Total estimado');
  });

  it('TOTAL fala em valor total e não menciona valor por sessão', async () => {
    const sender = dispatcher();
    await new TreatmentPlanNotificationService(
      client(),
      sender.service,
      queue().service,
    ).notifyQuoteReady(1n, plan({ billingMode: 'TOTAL', amountCents: '120000', estimatedTotalCents: null }));
    const variables: Record<string, string> = sender.dispatch.mock.calls[0]?.[4] ?? {};
    expect(variables.amountLine).toContain('Valor total');
    expect(variables.amountLine).not.toContain('por sessão');
    expect(variables.estimatedTotalLine).toBe('');
  });
});

describe('notificação de aprovação', () => {
  it('avisa o profissional pela fila transacional existente', async () => {
    const notifications = queue();
    await new TreatmentPlanNotificationService(
      client(),
      dispatcher().service,
      notifications.service,
    ).notifyApproved(1n, plan({ status: 'APPROVED' }));
    const call = notifications.enqueue.mock.calls[0];
    expect(call?.[1]).toMatchObject({
      kind: 'treatment_plan.approved',
      targetType: 'treatment_plan',
      recipient: 'pro@example.com',
    });
    expect(call?.[1].body).toContain('Protocolo Facial Premium');
    expect(call?.[1].body).toContain('Primeira sessão ainda não agendada.');
  });

  it('sem e-mail do profissional nada é enfileirado', async () => {
    const notifications = queue();
    await new TreatmentPlanNotificationService(
      client({ professional: { findFirst: vi.fn().mockResolvedValue({ email: null }) } }),
      dispatcher().service,
      notifications.service,
    ).notifyApproved(1n, plan());
    expect(notifications.enqueue).not.toHaveBeenCalled();
  });
});
