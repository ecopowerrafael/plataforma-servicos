import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { professionalSelfRoutes } from './professional-self.routes.js';
import { AppointmentService } from '../appointments/appointment.service.js';
import { PaymentService } from '../payments/payment.service.js';

const tenantPublicId = '11111111-1111-4111-8111-111111111111';
const appointmentA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const appointmentB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const professionalA = 'aaaaaaaa-0000-4000-8000-000000000001';
const professionalB = 'bbbbbbbb-0000-4000-8000-000000000002';
const paymentMethod = 'cccccccc-0000-4000-8000-000000000003';
const apps: FastifyInstance[] = [];

const record = (publicId: string, professionalId: bigint, professionalPublicId: string) => ({
  id: publicId === appointmentA ? 101n : 102n, publicId, professionalId, customerId: 5n,
  protocol: `AGD-${publicId[0]}`, status: 'CONFIRMED', startsAt: new Date('2026-09-01T13:00:00.000Z'),
  endsAt: new Date('2026-09-01T13:30:00.000Z'), durationMinutes: 30, postServiceBreakMinutes: 0,
  priceCents: 10_000n, notes: null, source: 'ADMIN', canceledReason: null, rescheduleReason: null,
  kind: 'STANDARD' as const, treatmentPlan: null, sessionNumber: null,
  isFitIn: false, fitInReason: null, checkedInAt: null, depositType: null, depositPercentage: null,
  depositAmountCents: null, createdAt: new Date('2026-08-01T00:00:00.000Z'), updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  customer: { publicId: 'dddddddd-0000-4000-8000-000000000004', name: 'Cliente', phone: '11999999999' },
  professional: { publicId: professionalPublicId, publicName: professionalId === 11n ? 'Profissional A' : 'Profissional B' },
  service: { publicId: 'eeeeeeee-0000-4000-8000-000000000005', name: 'Corte' }, unit: null,
}) as never;

afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

async function fixture({ gateway = false } = {}) {
  const records = new Map([[appointmentA, record(appointmentA, 11n, professionalA)], [appointmentB, record(appointmentB, 12n, professionalB)]]);
  const update = vi.fn(async () => record(appointmentA, 11n, professionalA));
  const repo = {
    find: vi.fn(async (_tenant: bigint, id: string) => records.get(id) ?? null),
    list: vi.fn(async (_tenant: bigint, where: { professional?: { publicId?: string } }) =>
      [...records.values()].filter((item: any) => item.professional.publicId === where.professional?.publicId)),
    update, listHistory: vi.fn(async () => []), createHistory: vi.fn(), audit: vi.fn(),
  };
  const appointments = new AppointmentService(repo as never, {} as never);
  const payments: any[] = [];
  const paymentCreate = vi.fn(async ({ data }: { data: any }) => {
    const value = { id: 701n, publicId: 'ffffffff-0000-4000-8000-000000000006', status: 'PAID', canceledAt: null, canceledReason: null, createdAt: new Date('2026-09-01T14:00:00.000Z'), ...data, paymentMethod: { publicId: paymentMethod, name: 'Dinheiro' } };
    payments.push(value); return value;
  });
  const paymentClient = {
    appointment: { findFirst: vi.fn(async ({ where }: any) => where.publicId === appointmentA ? { id: 101n, priceCents: 10_000n, status: 'CONFIRMED', unitId: null, professionalId: 11n, serviceId: 1n, customerId: 5n, depositType: null, depositPercentage: null, depositAmountCents: null } : null) },
    paymentGatewayCharge: { findFirst: vi.fn(async () => gateway ? { id: 1n } : null) },
    paymentMethod: { findFirst: vi.fn(async () => ({ id: 2n, active: true })) },
    payment: { aggregate: vi.fn(async () => ({ _sum: { amountCents: payments.reduce((sum, item) => sum + item.amountCents, 0n) } })), create: paymentCreate, findMany: vi.fn(async () => payments) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const authService = {
    authenticate: vi.fn(async () => ({ user: { id: 1n }, session: { id: 2n } })),
    resolveTenant: vi.fn(async () => ({ id: 1n, publicId: tenantPublicId, timezone: 'America/Sao_Paulo', membership: { permissions: ['professional.self.read', 'professional.self.update'] } })),
    requirePermission: vi.fn(),
  };
  const professionals = { me: vi.fn(async () => ({ publicId: professionalA })), myId: vi.fn(async () => 11n) };
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler); app.setSerializerCompiler(serializerCompiler); await app.register(cookie);
  const commissionHistory = vi.fn(async () => ({ items: [] }));
  await app.register(professionalSelfRoutes, { professionals: professionals as never, appointments, schedules: {} as never, unavailabilities: {} as never, professionalServices: {} as never, availability: {} as never, commissions: { listForProfessional: commissionHistory } as never, payments: new PaymentService(paymentClient as never), authService: authService as never, cookieName: 'ps_session' });
  apps.push(app); return { app, paymentCreate, payments, update, commissionHistory };
}

const headers = { cookie: 'ps_session=a', 'x-tenant-id': tenantPublicId };

describe('Professional SELF — isolamento funcional A x B', () => {
  it('agenda somente A e recusa concluir ou cancelar appointment de B no AppointmentService real', async () => {
    const { app, update } = await fixture();
    const agenda = await app.inject({ method: 'GET', url: '/tenant/professionals/me/agenda?from=2026-09-01T00:00:00.000Z&to=2026-09-02T00:00:00.000Z', headers });
    expect(agenda.statusCode, agenda.body).toBe(200); expect(JSON.parse(agenda.body).items.map((item: { publicId: string }) => item.publicId)).toEqual([appointmentA]);
    const complete = await app.inject({ method: 'POST', url: `/tenant/professionals/me/appointments/${appointmentB}/completed`, headers, payload: {} });
    const cancel = await app.inject({ method: 'POST', url: `/tenant/professionals/me/appointments/${appointmentB}/canceled`, headers, payload: { reason: 'teste' } });
    expect(complete.statusCode).toBe(404); expect(cancel.statusCode).toBe(404); expect(update).not.toHaveBeenCalled();
  });
});

describe('Professional SELF — pagamento de efeito', () => {
  it('cria pagamento local próprio, devolve schema público e reduz saldo canônico', async () => {
    const { app, payments } = await fixture();
    const created = await app.inject({ method: 'POST', url: `/tenant/professionals/me/appointments/${appointmentA}/payments`, headers, payload: { paymentMethodPublicId: paymentMethod, kind: 'PAYMENT', amountCents: '4000' } });
    expect(created.statusCode, created.body).toBe(201); expect(JSON.parse(created.body)).toMatchObject({ appointmentPublicId: appointmentA, amountCents: '4000', status: 'PAID' });
    const listed = await app.inject({ method: 'GET', url: `/tenant/professionals/me/appointments/${appointmentA}/payments`, headers });
    expect(JSON.parse(listed.body).summary).toMatchObject({ totalPaidCents: '4000', balanceCents: '6000' }); expect(payments).toHaveLength(1);
  });

  it('não cria pagamento para B e bloqueia marcação manual enquanto gateway está pendente', async () => {
    const other = await fixture();
    const denied = await other.app.inject({ method: 'POST', url: `/tenant/professionals/me/appointments/${appointmentB}/payments`, headers, payload: { paymentMethodPublicId: paymentMethod, kind: 'PAYMENT', amountCents: '1000' } });
    expect(denied.statusCode).toBe(404); expect(other.paymentCreate).not.toHaveBeenCalled();
    const gateway = await fixture({ gateway: true });
    const pending = await gateway.app.inject({ method: 'POST', url: `/tenant/professionals/me/appointments/${appointmentA}/payments`, headers, payload: { paymentMethodPublicId: paymentMethod, kind: 'PAYMENT', amountCents: '1000' } });
    expect(pending.statusCode, pending.body).toBe(409); expect(gateway.paymentCreate).not.toHaveBeenCalled();
  });
});

describe('Professional SELF — período civil de comissões', () => {
  it('resolve 31/08 em São Paulo mesmo quando o relógio UTC já está em 01/09', async () => {
    const { app, commissionHistory } = await fixture();
    const response = await app.inject({ method: 'GET', url: '/tenant/professionals/me/commissions/history?fromDate=2026-08-31&toDate=2026-08-31', headers });
    expect(response.statusCode).toBe(200);
    expect(commissionHistory).toHaveBeenCalledWith(1n, 11n, {
      from: '2026-08-31T03:00:00.000Z', to: '2026-09-01T03:00:00.000Z',
    });
  });
});
