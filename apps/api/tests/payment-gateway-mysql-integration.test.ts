import { randomUUID } from 'node:crypto';

import { type PaymentGatewayChargeStatus } from '@plataforma/shared';
import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
    const cashPayments = new PaymentService(client);
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
    );
    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let tenantPublicId: string;
    let otherTenantId: bigint;
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
