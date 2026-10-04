import { randomUUID } from 'node:crypto';

import { type PaymentGatewayChargeStatus } from '@plataforma/shared';
import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
import { CredentialsCipher } from '../src/modules/payments/gateway/credentials-cipher.js';
import { PaymentGatewayService } from '../src/modules/payments/gateway/payment-gateway.service.js';
import { PaymentGatewayProviderRegistry } from '../src/modules/payments/gateway/provider-registry.js';
import {
  type GatewayChargeInput,
  type GatewayChargeResult,
  type GatewayWebhookEvent,
  type PaymentGatewayProviderAdapter,
} from '../src/modules/payments/gateway/provider.js';
import { PaymentMethodService } from '../src/modules/payments/payment-method.service.js';
import { PaymentService } from '../src/modules/payments/payment.service.js';
import { ProfessionalCommissionService } from '../src/modules/payments/professional-commission.service.js';
import { TenantCommercialPolicyService } from '../src/modules/platform/tenant-commercial-policy.service.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;
let actor = { userId: 1n, sessionId: 1n };

/**
 * Provedor de teste local — nunca registrado na composição real da aplicação
 * (connection.ts registra um PaymentGatewayProviderRegistry vazio). Existe apenas
 * aqui para provar que a camada abstrata funciona de ponta a ponta sem depender
 * de nenhum fornecedor real, que ainda não foi escolhido pelo projeto.
 */
class TestProviderAdapter implements PaymentGatewayProviderAdapter {
  public readonly name = 'test-provider';
  public createCalls = 0;
  public nextStatus: PaymentGatewayChargeStatus = 'PENDING';
  public supportsCancel = true;

  public createCharge(
    _credentials: Record<string, unknown>,
    _environment: 'SANDBOX' | 'PRODUCTION',
    input: GatewayChargeInput,
  ): Promise<GatewayChargeResult> {
    this.createCalls += 1;
    return Promise.resolve({
      externalId: `ext-${input.idempotencyKey}`,
      status: this.nextStatus,
      raw: { idempotencyKey: input.idempotencyKey },
    });
  }

  public getCharge(
    _credentials: Record<string, unknown>,
    _environment: 'SANDBOX' | 'PRODUCTION',
    externalId: string,
  ): Promise<GatewayChargeResult> {
    return Promise.resolve({ externalId, status: this.nextStatus, raw: {} });
  }

  public cancelCharge(): Promise<void> {
    return Promise.resolve();
  }

  public verifyWebhookSignature(
    credentials: Record<string, unknown>,
    _environment: 'SANDBOX' | 'PRODUCTION',
    _rawBody: string,
    headers: Record<string, string>,
  ): boolean {
    return headers['x-signature'] === credentials.secret;
  }

  public parseWebhookEvent(rawBody: string): GatewayWebhookEvent {
    const parsed = JSON.parse(rawBody) as {
      externalEventId: string;
      externalId: string;
      status: PaymentGatewayChargeStatus;
    };
    return {
      externalEventId: parsed.externalEventId,
      externalId: parsed.externalId,
      status: parsed.status,
      raw: parsed,
    };
  }
}

/** Mesmo provedor de teste, mas sem suportar cancelamento (sem o método cancelCharge). */
class TestProviderAdapterNoCancel implements PaymentGatewayProviderAdapter {
  public readonly name = 'test-provider-no-cancel';

  public createCharge(
    _credentials: Record<string, unknown>,
    _environment: 'SANDBOX' | 'PRODUCTION',
    input: GatewayChargeInput,
  ): Promise<GatewayChargeResult> {
    return Promise.resolve({
      externalId: `ext-${input.idempotencyKey}`,
      status: 'PENDING',
      raw: {},
    });
  }

  public getCharge(
    _credentials: Record<string, unknown>,
    _environment: 'SANDBOX' | 'PRODUCTION',
    externalId: string,
  ): Promise<GatewayChargeResult> {
    return Promise.resolve({ externalId, status: 'PENDING', raw: {} });
  }

  public verifyWebhookSignature(): boolean {
    return false;
  }

  public parseWebhookEvent(rawBody: string): GatewayWebhookEvent {
    return { externalEventId: null, externalId: null, status: 'PENDING', raw: rawBody };
  }
}

describe.skipIf(url === undefined)(
  'arquitetura de gateway de pagamento (Etapa 14) com MySQL local',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const cipher = new CredentialsCipher(
      '807d15aaaa7796bd7ca1d604c597cc077b854680fa938e9328edcaf498d95edb',
    );
    const registry = new PaymentGatewayProviderRegistry();
    const testAdapter = new TestProviderAdapter();
    registry.register(testAdapter);
    registry.register(new TestProviderAdapterNoCancel());
    const paymentMethods = new PaymentMethodService(client);
    const commissions = new ProfessionalCommissionService(client);
    const cashPayments = new PaymentService(client, undefined, commissions);
    const gateway = new PaymentGatewayService(
      client,
      registry,
      cipher,
      paymentMethods,
      cashPayments,
    );
    const appointments = new AppointmentService(
      new AppointmentRepository(client),
      new AvailabilityService(new AvailabilityRepository(client)),
      client,
      new TenantCommercialPolicyService(client),
      client,
    );
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let tenantPublicId: string;
    let otherTenantId: bigint;
    let planIds: bigint[] = [];
    let customerId = '';
    let professionalId = '';
    let serviceId = '';
    let userId: bigint;
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
      testAdapter.createCalls = 0;
      testAdapter.nextStatus = 'PENDING';

      const user = await client.user.create({
        data: {
          publicId: randomUUID(),
          email: `gateway-${randomUUID()}@test.invalid`,
          normalizedEmail: `gateway-${randomUUID()}@test.invalid`,
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
          slug: `gateway-${suffix}-${randomUUID().slice(0, 4)}`,
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
          slug: `gateway-other-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Outro',
          displayName: 'Outro',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      tenantId = tenant.id;
      tenantPublicId = tenant.publicId;
      otherTenantId = other.id;
      planIds = [];
      for (const provisionedTenantId of [tenant.id, other.id]) {
        const plan = await client.commercialPlan.create({
          data: {
            publicId: randomUUID(),
            code: `GATEWAY_TEST_${suffix}_${provisionedTenantId}`,
            name: 'Plano de teste de gateway',
            status: 'ACTIVE',
            billingCycle: 'MONTHLY',
            priceCents: 0n,
            currency: 'BRL',
            limits: { create: [
              { key: 'monthly_appointments.max', valueType: 'INTEGER', integerValue: 1000n },
              { key: 'commissions.enabled', valueType: 'BOOLEAN', booleanValue: true },
            ] },
          },
        });
        planIds.push(plan.id);
        const now = new Date();
        await client.tenantSubscription.create({
          data: {
            publicId: randomUUID(), tenantId: provisionedTenantId, planId: plan.id, status: 'ACTIVE',
            effectiveKey: 'EFFECTIVE', startsAt: now, currentPeriodStartsAt: now,
            currentPeriodEndsAt: new Date(now.getTime() + 31 * 86_400_000), priceCents: 0n,
            currency: 'BRL', billingCycle: 'MONTHLY',
          },
        });
      }

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
    });

    afterEach(async () => {
      const ids = [tenantId, otherTenantId];
      await client.paymentGatewayEvent.deleteMany({ where: { tenantId: { in: ids } } });
      await client.paymentGatewayCharge.deleteMany({ where: { tenantId: { in: ids } } });
      await client.paymentGatewayConfig.deleteMany({ where: { tenantId: { in: ids } } });
      await client.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professionalCommission.deleteMany({ where: { tenantId: { in: ids } } });
      await client.payment.deleteMany({ where: { tenantId: { in: ids } } });
      await client.paymentMethod.deleteMany({ where: { tenantId: { in: ids } } });
      await client.appointmentHistoryEntry.deleteMany({ where: { tenantId: { in: ids } } });
      await client.appointment.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professionalWorkSchedule.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professionalService.deleteMany({ where: { tenantId: { in: ids } } });
      await client.customer.deleteMany({ where: { tenantId: { in: ids } } });
      await client.service.deleteMany({ where: { tenantId: { in: ids } } });
      await client.professional.deleteMany({ where: { tenantId: { in: ids } } });
      await client.tenantSubscription.deleteMany({ where: { tenantId: { in: ids } } });
      await client.tenant.deleteMany({ where: { id: { in: ids } } });
      await client.planLimit.deleteMany({ where: { planId: { in: planIds } } });
      await client.commercialPlan.deleteMany({ where: { id: { in: planIds } } });
      await client.userSession.deleteMany({ where: { userId } });
      await client.user.deleteMany({ where: { id: userId } });
    });

    describe('configuração por tenant', () => {
      it('cria e atualiza a configuração com credenciais armazenadas de forma criptografada', async () => {
        const created = await gateway.upsertConfig(
          tenantId,
          {
            provider: 'test-provider',
            active: true,
            environment: 'SANDBOX',
            credentials: { secret: 'abc123' },
          },
          actor,
        );
        expect(created.provider).toBe('test-provider');
        expect(created.active).toBe(true);
        expect(created.environment).toBe('SANDBOX');
        expect(created.hasCredentials).toBe(true);
        expect(created.providerImplemented).toBe(true);

        const raw = await client.paymentGatewayConfig.findFirst({ where: { tenantId } });
        expect(raw?.credentialsCiphertext).not.toBeNull();
        expect(raw?.credentialsCiphertext).not.toContain('abc123');

        const updated = await gateway.upsertConfig(
          tenantId,
          { provider: 'test-provider', active: false, environment: 'PRODUCTION' },
          actor,
        );
        expect(updated.active).toBe(false);
        expect(updated.environment).toBe('PRODUCTION');
        expect(updated.hasCredentials).toBe(true);
      });

      it('reporta providerImplemented=false para um provedor sem adapter registrado', async () => {
        const created = await gateway.upsertConfig(
          tenantId,
          { provider: 'unknown-provider', active: true, environment: 'SANDBOX' },
          actor,
        );
        expect(created.providerImplemented).toBe(false);
      });

      it('isola configuração por tenant', async () => {
        await gateway.upsertConfig(
          tenantId,
          { provider: 'test-provider', active: true, environment: 'SANDBOX' },
          actor,
        );
        const otherConfig = await gateway.getConfig(otherTenantId, 'test-provider');
        expect(otherConfig).toBeNull();
      });
    });

    describe('criação e consulta de cobrança', () => {
      it('impede criar cobrança sem gateway ativo configurado', async () => {
        const appointment = await appointments.create(tenantId, input(start), actor);
        await expect(
          gateway.createCharge(
            tenantId,
            appointment.publicId,
            'test-provider',
            {
              amountCents: 10_000,
              currency: 'BRL',
              idempotencyKey: randomUUID(),
              kind: 'PAYMENT' as const,
            },
            actor,
          ),
        ).rejects.toMatchObject({ code: 'GATEWAY_NOT_CONFIGURED' });
      });

      it('recusa cobrança quando o provedor configurado não possui integração implementada', async () => {
        await gateway.upsertConfig(
          tenantId,
          {
            provider: 'unknown-provider',
            active: true,
            environment: 'SANDBOX',
            credentials: { secret: 'x' },
          },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        await expect(
          gateway.createCharge(
            tenantId,
            appointment.publicId,
            'unknown-provider',
            {
              amountCents: 10_000,
              currency: 'BRL',
              idempotencyKey: randomUUID(),
              kind: 'PAYMENT' as const,
            },
            actor,
          ),
        ).rejects.toMatchObject({ code: 'GATEWAY_PROVIDER_NOT_IMPLEMENTED' });
      });

      it('cria uma cobrança real via provedor de teste e é idempotente pela idempotencyKey', async () => {
        await gateway.upsertConfig(
          tenantId,
          {
            provider: 'test-provider',
            active: true,
            environment: 'SANDBOX',
            credentials: { secret: 'abc123' },
          },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        const idempotencyKey = randomUUID();

        const first = await gateway.createCharge(
          tenantId,
          appointment.publicId,
          'test-provider',
          { amountCents: 10_000, currency: 'BRL', idempotencyKey, kind: 'PAYMENT' as const },
          actor,
        );
        expect(first.status).toBe('PENDING');
        expect(first.externalId).toBe(`ext-${idempotencyKey}`);
        expect(testAdapter.createCalls).toBe(1);

        const second = await gateway.createCharge(
          tenantId,
          appointment.publicId,
          'test-provider',
          { amountCents: 10_000, currency: 'BRL', idempotencyKey, kind: 'PAYMENT' as const },
          actor,
        );
        expect(second.publicId).toBe(first.publicId);
        expect(testAdapter.createCalls).toBe(1);
      });

      it('consulta a cobrança com refresh e reconcilia como Payment real quando fica PAID', async () => {
        await gateway.upsertConfig(
          tenantId,
          {
            provider: 'test-provider',
            active: true,
            environment: 'SANDBOX',
            credentials: { secret: 'abc123' },
          },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        const created = await gateway.createCharge(
          tenantId,
          appointment.publicId,
          'test-provider',
          {
            amountCents: 10_000,
            currency: 'BRL',
            idempotencyKey: randomUUID(),
            kind: 'PAYMENT' as const,
          },
          actor,
        );
        expect(created.paymentPublicId).toBeNull();

        testAdapter.nextStatus = 'PAID';
        const refreshed = await gateway.getCharge(tenantId, created.publicId, true);
        expect(refreshed.status).toBe('PAID');
        expect(refreshed.paymentPublicId).not.toBeNull();

        const list = await cashPayments.listForAppointment(tenantId, appointment.publicId);
        expect(list.items).toHaveLength(1);
        expect(list.items[0]?.amountCents).toBe('10000');
      });

      it('substitui todas as charges pendentes pelo mesmo Payment e preserva pagamento parcial', async () => {
        await gateway.upsertConfig(
          tenantId,
          { provider: 'test-provider', active: true, environment: 'SANDBOX', credentials: { secret: 'abc123' } },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        const first = await gateway.createCharge(tenantId, appointment.publicId, 'test-provider', {
          amountCents: 4_000, currency: 'BRL', idempotencyKey: randomUUID(), kind: 'PAYMENT' as const,
        }, actor);
        const second = await gateway.createCharge(tenantId, appointment.publicId, 'test-provider', {
          amountCents: 6_000, currency: 'BRL', idempotencyKey: randomUUID(), kind: 'PAYMENT' as const,
        }, actor);
        const methods = await paymentMethods.list(tenantId);
        const cash = methods.items.find((method) => method.type === 'CASH');
        if (cash === undefined) throw new Error('Forma de pagamento CASH não provisionada.');

        const payment = await gateway.createManualPayment(tenantId, appointment.publicId, {
          paymentMethodPublicId: cash.publicId, kind: 'PAYMENT', amountCents: 4_000,
        }, actor);
        const persistedAppointment = await client.appointment.findFirstOrThrow({ where: { tenantId, publicId: appointment.publicId } });
        const charges = await client.paymentGatewayCharge.findMany({ where: { tenantId, appointmentId: persistedAppointment.id }, orderBy: { createdAt: 'asc' } });
        expect(payment.amountCents).toBe('4000');
        expect(charges.map((charge) => charge.publicId)).toEqual([first.publicId, second.publicId]);
        expect(charges.every((charge) => charge.supersededByPaymentId !== null)).toBe(true);
        expect(new Set(charges.map((charge) => charge.supersededByPaymentId)).size).toBe(1);
        await expect(cashPayments.create(tenantId, appointment.publicId, {
          paymentMethodPublicId: cash.publicId, kind: 'PAYMENT', amountCents: 12_000,
        }, actor)).rejects.toMatchObject({ code: 'PAYMENT_EXCEEDS_APPOINTMENT_PRICE' });
      });

      it('faz rollback de Payment, comissão, superseding e auditoria quando o superseding falha', async () => {
        await gateway.upsertConfig(
          tenantId,
          { provider: 'test-provider', active: true, environment: 'SANDBOX', credentials: { secret: 'abc123' } },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        const charge = await gateway.createCharge(tenantId, appointment.publicId, 'test-provider', {
          amountCents: 4_000, currency: 'BRL', idempotencyKey: randomUUID(), kind: 'PAYMENT' as const,
        }, actor);
        const methods = await paymentMethods.list(tenantId);
        const cash = methods.items.find((method) => method.type === 'CASH');
        if (cash === undefined) throw new Error('Forma de pagamento CASH não provisionada.');

        const supersede = vi.spyOn(gateway as unknown as { supersedeCharges: () => Promise<void> }, 'supersedeCharges')
          .mockRejectedValue(new Error('falha simulada no superseding'));
        await expect(gateway.createManualPayment(tenantId, appointment.publicId, {
          paymentMethodPublicId: cash.publicId, kind: 'PAYMENT', amountCents: 4_000,
        }, actor)).rejects.toThrow('falha simulada no superseding');
        supersede.mockRestore();

        const persistedAppointment = await client.appointment.findFirstOrThrow({ where: { tenantId, publicId: appointment.publicId } });
        expect(await client.payment.count({ where: { tenantId, appointmentId: persistedAppointment.id } })).toBe(0);
        expect(await client.professionalCommission.count({ where: { tenantId, appointmentId: persistedAppointment.id } })).toBe(0);
        expect(await client.auditLog.count({ where: { tenantId, action: { in: ['payment.registered', 'payment.deposit_registered', 'commission.generated'] } } })).toBe(0);
        const persistedCharge = await client.paymentGatewayCharge.findFirstOrThrow({ where: { tenantId, publicId: charge.publicId } });
        expect(persistedCharge.supersededAt).toBeNull();
        expect(persistedCharge.supersededByPaymentId).toBeNull();
      });
    });

    describe('cancelamento de cobrança', () => {
      it('cancela quando o provedor suporta, e bloqueia cancelar uma cobrança já paga', async () => {
        await gateway.upsertConfig(
          tenantId,
          {
            provider: 'test-provider',
            active: true,
            environment: 'SANDBOX',
            credentials: { secret: 'abc123' },
          },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        const created = await gateway.createCharge(
          tenantId,
          appointment.publicId,
          'test-provider',
          {
            amountCents: 10_000,
            currency: 'BRL',
            idempotencyKey: randomUUID(),
            kind: 'PAYMENT' as const,
          },
          actor,
        );

        const canceled = await gateway.cancelCharge(
          tenantId,
          created.publicId,
          'Cliente desistiu',
          actor,
        );
        expect(canceled.status).toBe('CANCELED');

        await expect(
          gateway.cancelCharge(tenantId, canceled.publicId, 'Duplicado', actor),
        ).rejects.toMatchObject({ code: 'GATEWAY_CHARGE_NOT_CANCELABLE' });
      });

      it('recusa cancelamento quando o provedor não suporta', async () => {
        await gateway.upsertConfig(
          tenantId,
          {
            provider: 'test-provider-no-cancel',
            active: true,
            environment: 'SANDBOX',
            credentials: { secret: 'abc123' },
          },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        const created = await gateway.createCharge(
          tenantId,
          appointment.publicId,
          'test-provider-no-cancel',
          {
            amountCents: 10_000,
            currency: 'BRL',
            idempotencyKey: randomUUID(),
            kind: 'PAYMENT' as const,
          },
          actor,
        );
        await expect(
          gateway.cancelCharge(tenantId, created.publicId, 'Motivo', actor),
        ).rejects.toMatchObject({ code: 'GATEWAY_CANCEL_NOT_SUPPORTED' });
      });
    });

    describe('webhook', () => {
      it('processa um webhook válido, reconcilia o pagamento e deduplica pelo externalEventId', async () => {
        await gateway.upsertConfig(
          tenantId,
          {
            provider: 'test-provider',
            active: true,
            environment: 'SANDBOX',
            credentials: { secret: 'abc123' },
          },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        const created = await gateway.createCharge(
          tenantId,
          appointment.publicId,
          'test-provider',
          {
            amountCents: 10_000,
            currency: 'BRL',
            idempotencyKey: randomUUID(),
            kind: 'PAYMENT' as const,
          },
          actor,
        );

        const externalEventId = randomUUID();
        const rawBody = JSON.stringify({
          externalEventId,
          externalId: created.externalId,
          status: 'PAID',
        });

        const result = await gateway.handleWebhook(tenantPublicId, 'test-provider', rawBody, {
          'x-signature': 'abc123',
        });
        expect(result).toEqual({ deduplicated: false, matched: true });

        const refreshed = await gateway.getCharge(tenantId, created.publicId, false);
        expect(refreshed.status).toBe('PAID');
        expect(refreshed.paymentPublicId).not.toBeNull();

        const duplicate = await gateway.handleWebhook(tenantPublicId, 'test-provider', rawBody, {
          'x-signature': 'abc123',
        });
        expect(duplicate).toEqual({ deduplicated: true });

        const list = await cashPayments.listForAppointment(tenantId, appointment.publicId);
        expect(list.items).toHaveLength(1);
      });

      it('ignora webhook PAID tardio de charge superseded', async () => {
        await gateway.upsertConfig(tenantId, {
          provider: 'test-provider', active: true, environment: 'SANDBOX', credentials: { secret: 'abc123' },
        }, actor);
        const appointment = await appointments.create(tenantId, input(start), actor);
        const created = await gateway.createCharge(tenantId, appointment.publicId, 'test-provider', {
          amountCents: 4_000, currency: 'BRL', idempotencyKey: randomUUID(), kind: 'PAYMENT' as const,
        }, actor);
        const methods = await paymentMethods.list(tenantId);
        const cash = methods.items.find((method) => method.type === 'CASH');
        if (cash === undefined) throw new Error('Forma de pagamento CASH não provisionada.');
        const payment = await gateway.createManualPayment(tenantId, appointment.publicId, {
          paymentMethodPublicId: cash.publicId, kind: 'PAYMENT', amountCents: 4_000,
        }, actor);
        const persistedPayment = await client.payment.findFirstOrThrow({ where: { tenantId, publicId: payment.publicId } });
        await client.paymentGatewayCharge.update({ where: { publicId: created.publicId }, data: { supersededAt: new Date(), supersededByPaymentId: persistedPayment.id } });

        const result = await gateway.handleWebhook(tenantPublicId, 'test-provider', JSON.stringify({
          externalEventId: randomUUID(), externalId: created.externalId, status: 'PAID',
        }), { 'x-signature': 'abc123' });
        expect(result).toEqual({ deduplicated: false, matched: true });
        expect(await client.payment.count({ where: { tenantId, appointmentId: persistedPayment.appointmentId } })).toBe(1);
        expect((await gateway.getCharge(tenantId, created.publicId, false)).paymentPublicId).toBeNull();
      });

      it('ignora refresh PAID tardio de charge superseded', async () => {
        await gateway.upsertConfig(tenantId, {
          provider: 'test-provider', active: true, environment: 'SANDBOX', credentials: { secret: 'abc123' },
        }, actor);
        const appointment = await appointments.create(tenantId, input(start), actor);
        const created = await gateway.createCharge(tenantId, appointment.publicId, 'test-provider', {
          amountCents: 4_000, currency: 'BRL', idempotencyKey: randomUUID(), kind: 'PAYMENT' as const,
        }, actor);
        const methods = await paymentMethods.list(tenantId);
        const cash = methods.items.find((method) => method.type === 'CASH');
        if (cash === undefined) throw new Error('Forma de pagamento CASH não provisionada.');
        const payment = await gateway.createManualPayment(tenantId, appointment.publicId, {
          paymentMethodPublicId: cash.publicId, kind: 'PAYMENT', amountCents: 4_000,
        }, actor);
        const persistedPayment = await client.payment.findFirstOrThrow({ where: { tenantId, publicId: payment.publicId } });
        await client.paymentGatewayCharge.update({ where: { publicId: created.publicId }, data: { supersededAt: new Date(), supersededByPaymentId: persistedPayment.id } });
        testAdapter.nextStatus = 'PAID';

        const refreshed = await gateway.getCharge(tenantId, created.publicId, true);
        expect(refreshed.status).toBe('PAID');
        expect(refreshed.paymentPublicId).toBeNull();
        expect(await client.payment.count({ where: { tenantId, appointmentId: persistedPayment.appointmentId } })).toBe(1);
      });

      it('rejeita webhook com assinatura inválida', async () => {
        await gateway.upsertConfig(
          tenantId,
          {
            provider: 'test-provider',
            active: true,
            environment: 'SANDBOX',
            credentials: { secret: 'abc123' },
          },
          actor,
        );
        const rawBody = JSON.stringify({
          externalEventId: randomUUID(),
          externalId: 'ext-x',
          status: 'PAID',
        });
        await expect(
          gateway.handleWebhook(tenantPublicId, 'test-provider', rawBody, {
            'x-signature': 'wrong',
          }),
        ).rejects.toMatchObject({ code: 'GATEWAY_WEBHOOK_SIGNATURE_INVALID' });
      });
    });
  },
);
