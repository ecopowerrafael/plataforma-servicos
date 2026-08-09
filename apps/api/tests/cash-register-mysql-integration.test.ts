import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
import { CashRegisterService } from '../src/modules/payments/cash-register.service.js';
import { PaymentMethodService } from '../src/modules/payments/payment-method.service.js';
import { PaymentService } from '../src/modules/payments/payment.service.js';
import { ReceiptService } from '../src/modules/payments/receipt.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
let actor = { userId: 1n, sessionId: 1n };

describe.skipIf(url === undefined)('caixa e recibos (Etapa 14) com MySQL local', () => {
  const client = createPrismaClient(url ?? 'mysql://invalid');
  const cashRegisters = new CashRegisterService(client);
  const appointments = new AppointmentService(
    new AppointmentRepository(client),
    new AvailabilityService(new AvailabilityRepository(client)),
  );
  const payments = new PaymentService(client, cashRegisters);
  const paymentMethods = new PaymentMethodService(client);
  const receipts = new ReceiptService(client);
  const suffix = randomUUID().slice(0, 8);
  let tenantId: bigint;
  let otherTenantId: bigint;
  let customerId = '';
  let professionalId = '';
  let serviceId = '';
  let userId: bigint;
  let cashMethodPublicId = '';
  const date = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const start = `${date}T15:00:00.000Z`;
  const input = (startsAt: string) => ({
    customerPublicId: customerId,
    professionalPublicId: professionalId,
    servicePublicId: serviceId,
    startsAt,
    source: 'INTERNAL',
  });

  beforeEach(async () => {
    const user = await client.user.create({
      data: {
        publicId: randomUUID(),
        email: `cash-${randomUUID()}@test.invalid`,
        normalizedEmail: `cash-${randomUUID()}@test.invalid`,
        passwordHash: 'test',
        status: 'ACTIVE',
      },
    });
    const session = await client.userSession.create({
      data: {
        publicId: randomUUID(),
        userId: user.id,
        tokenHash: randomUUID().replaceAll('-', ''),
        expiresAt: new Date(Date.now() + 86_400_000),
        lastSeenAt: new Date(),
      },
    });
    userId = user.id;
    actor = { userId: user.id, sessionId: session.id };

    const tenant = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `cash-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Salão Teste Ltda',
        displayName: 'Salão Teste',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    const other = await client.tenant.create({
      data: {
        publicId: randomUUID(),
        slug: `cash-other-${suffix}-${randomUUID().slice(0, 4)}`,
        legalName: 'Outro',
        displayName: 'Outro',
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
        currency: 'BRL',
      },
    });
    tenantId = tenant.id;
    otherTenantId = other.id;

    const [customer, professional, catalog] = await Promise.all([
      client.customer.create({ data: { publicId: randomUUID(), tenantId, name: 'Ana Silva' } }),
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
          hasPostServiceBreak: false,
          priceCents: 15000n,
          color: '#111111',
        },
      }),
    ]);
    customerId = customer.publicId;
    professionalId = professional.publicId;
    serviceId = catalog.publicId;
    await client.professionalService.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        professionalId: professional.id,
        serviceId: catalog.id,
        priceCents: 15000n,
        durationMinutes: 30,
        hasPostServiceBreak: false,
      },
    });
    await client.professionalWorkSchedule.create({
      data: {
        publicId: randomUUID(),
        tenantId,
        professionalId: professional.id,
        weekday: new Date(`${date}T12:00:00Z`).getUTCDay(),
        startsAt: '09:00',
        endsAt: '18:00',
      },
    });

    const seededMethods = await paymentMethods.list(tenantId);
    const cashMethod = seededMethods.items.find((item) => item.type === 'CASH');
    if (cashMethod === undefined) throw new Error('Forma de pagamento padrão não provisionada.');
    cashMethodPublicId = cashMethod.publicId;
  });

  afterEach(async () => {
    const ids = [tenantId, otherTenantId];
    await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
    await client.receipt.deleteMany({ where: { tenantId: { in: ids } } });
    await client.cashMovement.deleteMany({ where: { tenantId: { in: ids } } });
    await client.cashRegister.deleteMany({ where: { tenantId: { in: ids } } });
    await client.payment.deleteMany({ where: { tenantId: { in: ids } } });
    await client.paymentMethod.deleteMany({ where: { tenantId: { in: ids } } });
    await client.appointmentHistoryEntry.deleteMany({ where: { tenantId: { in: ids } } });
    await client.appointment.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalWorkSchedule.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professionalService.deleteMany({ where: { tenantId: { in: ids } } });
    await client.customer.deleteMany({ where: { tenantId: { in: ids } } });
    await client.service.deleteMany({ where: { tenantId: { in: ids } } });
    await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
    await client.tenant.deleteMany({ where: { id: { in: ids } } });
    await client.userSession.deleteMany({ where: { userId } });
    await client.user.deleteMany({ where: { id: userId } });
  });

  describe('abertura, fechamento e movimentações do caixa', () => {
    it('abre um caixa com saldo inicial e impede uma segunda abertura simultânea', async () => {
      const opened = await cashRegisters.open(tenantId, { openingBalanceCents: 10_000 }, actor);
      expect(opened.status).toBe('OPEN');
      expect(opened.openingBalanceCents).toBe('10000');
      expect(opened.balanceCents).toBe('10000');

      await expect(
        cashRegisters.open(tenantId, { openingBalanceCents: 0 }, actor),
      ).rejects.toMatchObject({ code: 'CASH_REGISTER_ALREADY_OPEN' });
    });

    it('registra entradas e saídas manuais com motivo e calcula o saldo a partir delas', async () => {
      const opened = await cashRegisters.open(tenantId, { openingBalanceCents: 5_000 }, actor);

      await cashRegisters.addMovement(
        tenantId,
        opened.publicId,
        { direction: 'IN', amountCents: 2_000, reason: 'Venda de produto avulso' },
        actor,
      );
      await cashRegisters.addMovement(
        tenantId,
        opened.publicId,
        { direction: 'OUT', amountCents: 1_500, reason: 'Troco para o motoboy' },
        actor,
      );

      const detail = await cashRegisters.get(tenantId, opened.publicId);
      expect(detail.register.balanceCents).toBe('5500');
      expect(detail.movements).toHaveLength(2);
    });

    it('impede movimentação com valor zero ou negativo', async () => {
      const opened = await cashRegisters.open(tenantId, { openingBalanceCents: 0 }, actor);
      await expect(
        cashRegisters.addMovement(
          tenantId,
          opened.publicId,
          { direction: 'IN', amountCents: 0, reason: 'Teste' },
          actor,
        ),
      ).rejects.toMatchObject({ code: 'CASH_MOVEMENT_AMOUNT_INVALID' });
    });

    it('fecha o caixa, calcula o saldo final e impede novas movimentações depois', async () => {
      const opened = await cashRegisters.open(tenantId, { openingBalanceCents: 1_000 }, actor);
      await cashRegisters.addMovement(
        tenantId,
        opened.publicId,
        { direction: 'IN', amountCents: 4_000, reason: 'Entrada' },
        actor,
      );

      const closed = await cashRegisters.close(tenantId, opened.publicId, {}, actor);
      expect(closed.status).toBe('CLOSED');
      expect(closed.closingBalanceCents).toBe('5000');

      await expect(
        cashRegisters.addMovement(
          tenantId,
          opened.publicId,
          { direction: 'IN', amountCents: 1_000, reason: 'Depois de fechado' },
          actor,
        ),
      ).rejects.toMatchObject({ code: 'CASH_REGISTER_NOT_OPEN' });

      await expect(cashRegisters.close(tenantId, opened.publicId, {}, actor)).rejects.toMatchObject(
        { code: 'CASH_REGISTER_NOT_OPEN' },
      );
    });

    it('isola caixas por tenant', async () => {
      const opened = await cashRegisters.open(tenantId, { openingBalanceCents: 0 }, actor);
      await expect(cashRegisters.get(otherTenantId, opened.publicId)).rejects.toMatchObject({
        code: 'CASH_REGISTER_NOT_FOUND',
      });
      const otherOpen = await cashRegisters.getOpen(otherTenantId, null);
      expect(otherOpen).toBeNull();
    });
  });

  describe('pagamentos de agendamentos refletidos no caixa', () => {
    it('reflete automaticamente um pagamento real no caixa aberto', async () => {
      const opened = await cashRegisters.open(tenantId, { openingBalanceCents: 0 }, actor);
      const appointment = await appointments.create(tenantId, input(start), actor);

      await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
        actor,
      );

      const detail = await cashRegisters.get(tenantId, opened.publicId);
      expect(detail.register.balanceCents).toBe('10000');
      expect(detail.movements).toHaveLength(1);
      expect(detail.movements[0]?.type).toBe('PAYMENT');
      expect(detail.movements[0]?.direction).toBe('IN');
    });

    it('não bloqueia o pagamento quando não há caixa aberto', async () => {
      const appointment = await appointments.create(tenantId, input(start), actor);
      const payment = await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
        actor,
      );
      expect(payment.status).toBe('PAID');
    });

    it('estorna no caixa um pagamento cancelado, quando o caixa ainda está aberto', async () => {
      const opened = await cashRegisters.open(tenantId, { openingBalanceCents: 0 }, actor);
      const appointment = await appointments.create(tenantId, input(start), actor);
      const payment = await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
        actor,
      );

      await payments.cancel(
        tenantId,
        appointment.publicId,
        payment.publicId,
        'Pagamento duplicado',
        actor,
      );

      const detail = await cashRegisters.get(tenantId, opened.publicId);
      expect(detail.register.balanceCents).toBe('0');
      expect(detail.movements).toHaveLength(2);
    });

    it('não altera o caixa já fechado ao cancelar um pagamento antigo', async () => {
      const opened = await cashRegisters.open(tenantId, { openingBalanceCents: 0 }, actor);
      const appointment = await appointments.create(tenantId, input(start), actor);
      const payment = await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
        actor,
      );
      const closed = await cashRegisters.close(tenantId, opened.publicId, {}, actor);
      expect(closed.closingBalanceCents).toBe('10000');

      await payments.cancel(tenantId, appointment.publicId, payment.publicId, 'Estorno', actor);

      const detail = await cashRegisters.get(tenantId, opened.publicId);
      expect(detail.register.status).toBe('CLOSED');
      expect(detail.movements).toHaveLength(1);
    });
  });

  describe('recibo de pagamento', () => {
    it('gera um recibo com número/protocolo para um pagamento pago e é idempotente', async () => {
      const appointment = await appointments.create(tenantId, input(start), actor);
      const payment = await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
        actor,
      );

      const receipt = await receipts.getForPayment(
        tenantId,
        appointment.publicId,
        payment.publicId,
        actor,
      );
      expect(receipt.number).toMatch(/^REC-\d{6}$/u);
      expect(receipt.customerName).toBe('Ana Silva');
      expect(receipt.serviceName).toBe('Consulta');
      expect(receipt.paymentMethodName).toBe('Dinheiro');
      expect(receipt.amountCents).toBe('10000');
      expect(receipt.tenantDisplayName).toBe('Salão Teste');

      const again = await receipts.getForPayment(
        tenantId,
        appointment.publicId,
        payment.publicId,
        actor,
      );
      expect(again.publicId).toBe(receipt.publicId);
      expect(again.number).toBe(receipt.number);
    });

    it('impede recibo de pagamento cancelado e isola por tenant', async () => {
      const appointment = await appointments.create(tenantId, input(start), actor);
      const payment = await payments.create(
        tenantId,
        appointment.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 10_000 },
        actor,
      );
      await payments.cancel(tenantId, appointment.publicId, payment.publicId, 'Engano', actor);

      await expect(
        receipts.getForPayment(tenantId, appointment.publicId, payment.publicId, actor),
      ).rejects.toMatchObject({ code: 'RECEIPT_NOT_ALLOWED_FOR_CANCELED_PAYMENT' });

      const other = await appointments.create(tenantId, input(`${date}T17:00:00.000Z`), actor);
      const otherPayment = await payments.create(
        tenantId,
        other.publicId,
        { paymentMethodPublicId: cashMethodPublicId, kind: 'PAYMENT', amountCents: 5_000 },
        actor,
      );
      await expect(
        receipts.getForPayment(otherTenantId, other.publicId, otherPayment.publicId, actor),
      ).rejects.toMatchObject({ code: 'PAYMENT_NOT_FOUND' });
    });
  });
});
