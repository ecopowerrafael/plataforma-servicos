import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentReviewRepository } from '../src/modules/appointments/appointment-review.repository.js';
import { AppointmentReviewService } from '../src/modules/appointments/appointment-review.service.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

describe.skipIf(url === undefined)('avaliações do cliente autenticado com MySQL local', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const appointmentRepository = new AppointmentRepository(client);
  const service = new AppointmentReviewService(
    new AppointmentReviewRepository(client),
    appointmentRepository,
  );
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let customerId: bigint;
  let otherCustomerId: bigint;
  let professionalId: bigint;
  let serviceId: bigint;
  const date = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

  const createAppointment = async (customerIdValue: bigint, status: 'PENDING' | 'COMPLETED') => {
    return client.appointment.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        protocol: `AGD-TEST-${randomUUID().slice(0, 8)}`,
        customerId: customerIdValue,
        professionalId,
        serviceId,
        startsAt: new Date(`${date}T15:00:00.000Z`),
        endsAt: new Date(`${date}T15:30:00.000Z`),
        durationMinutes: 30,
        priceCents: 15000n,
        status,
      },
    });
  };

  beforeEach(async () => {
    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `custrev-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Teste',
        displayName: 'Teste',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;
    const [customer, otherCustomer, professional, catalog] = await Promise.all([
      client.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Cliente' } }),
      client.customer.create({
        data: { publicId: randomUUID(), tenantId, name: 'Outro Cliente' },
      }),
      client.professional.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Profissional',
          publicName: 'Profissional',
          calendarColor: '#111111',
        },
      }),
      client.service.create({
        data: {
          publicId: randomUUID(),
          tenantId,
          name: 'Consulta',
          durationMinutes: 45,
          priceCents: 12000n,
          color: '#111111',
        },
      }),
    ]);
    customerId = customer.id;
    otherCustomerId = otherCustomer.id;
    professionalId = professional.id;
    serviceId = catalog.id;
  });

  afterEach(async () => {
    await client.auditLog.deleteMany({ where: { tenantId } });
    await client.appointmentReview.deleteMany({ where: { tenantId } });
    await client.appointmentHistoryEntry.deleteMany({ where: { tenantId } });
    await client.appointment.deleteMany({ where: { tenantId } });
    await client.customer.deleteMany({ where: { tenantId } });
    await client.service.deleteMany({ where: { tenantId } });
    await client.professional.deleteMany({ where: { tenantId } });
    await client.tenant.deleteMany({ where: { id: tenantId } });
  });

  it('permite avaliar atendimento concluído, registra auditoria e permite editar a própria avaliação', async () => {
    const appointment = await createAppointment(customerId, 'COMPLETED');

    const created = await service.create(tenantId, customerId, appointment.publicId, {
      rating: 4,
      comment: 'Muito bom atendimento',
    });
    expect(created).toMatchObject({
      appointmentPublicId: appointment.publicId,
      rating: 4,
      comment: 'Muito bom atendimento',
    });

    const updated = await service.update(tenantId, customerId, appointment.publicId, {
      rating: 5,
      comment: 'Revisando: excelente atendimento',
    });
    expect(updated).toMatchObject({
      publicId: created.publicId,
      rating: 5,
      comment: 'Revisando: excelente atendimento',
    });

    const list = await service.list(tenantId, customerId);
    expect(list.items).toHaveLength(1);

    const auditActions = await client.auditLog.findMany({
      where: { tenantId, targetType: 'appointment_review' },
      select: { action: true },
    });
    expect(auditActions.map((entry) => entry.action).sort()).toEqual([
      'appointment.review.created',
      'appointment.review.updated',
    ]);
  });

  it('impede avaliar agendamento não concluído', async () => {
    const appointment = await createAppointment(customerId, 'PENDING');
    await expect(
      service.create(tenantId, customerId, appointment.publicId, { rating: 5 }),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_REVIEW_NOT_ALLOWED' });
  });

  it('impede avaliar agendamento de outro cliente', async () => {
    const appointment = await createAppointment(otherCustomerId, 'COMPLETED');
    await expect(
      service.create(tenantId, customerId, appointment.publicId, { rating: 5 }),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
    await expect(
      service.update(tenantId, customerId, appointment.publicId, { rating: 5 }),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('impede uma segunda avaliação para o mesmo agendamento e impede editar avaliação inexistente', async () => {
    const appointment = await createAppointment(customerId, 'COMPLETED');
    await service.create(tenantId, customerId, appointment.publicId, { rating: 3 });
    await expect(
      service.create(tenantId, customerId, appointment.publicId, { rating: 4 }),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_REVIEW_ALREADY_EXISTS' });

    const otherAppointment = await createAppointment(customerId, 'COMPLETED');
    await expect(
      service.update(tenantId, customerId, otherAppointment.publicId, { rating: 4 }),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_REVIEW_NOT_FOUND' });
  });
});
