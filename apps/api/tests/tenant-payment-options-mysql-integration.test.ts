import { randomUUID } from 'node:crypto';

import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createPrismaClient } from '../src/database/connection.js';
import { AppointmentRepository } from '../src/modules/appointments/appointment.repository.js';
import { AppointmentService } from '../src/modules/appointments/appointment.service.js';
import { AvailabilityRepository } from '../src/modules/calendar/availability.repository.js';
import { AvailabilityService } from '../src/modules/calendar/availability.service.js';
import { CredentialsCipher } from '../src/modules/payments/gateway/credentials-cipher.js';
import {
  type HttpClient,
  type HttpResponse,
} from '../src/modules/payments/gateway/mercadopago/http-client.js';
import { MercadoPagoProviderAdapter } from '../src/modules/payments/gateway/mercadopago/mercadopago.provider.js';
import { PaymentGatewayService } from '../src/modules/payments/gateway/payment-gateway.service.js';
import { buildPixBrCode } from '../src/modules/payments/gateway/pix-brcode.js';
import { PixLocalProviderAdapter } from '../src/modules/payments/gateway/pix-local.provider.js';
import { PaymentGatewayProviderRegistry } from '../src/modules/payments/gateway/provider-registry.js';
import { TenantPaymentOptionsService } from '../src/modules/payments/gateway/tenant-payment-options.service.js';
import { PaymentMethodService } from '../src/modules/payments/payment-method.service.js';
import { PaymentService } from '../src/modules/payments/payment.service.js';
import { TenantWhiteLabelRepository } from '../src/modules/tenants/tenant-white-label.repository.js';

config({ path: '../../.env' });
const url = process.env.DATABASE_URL;

/**
 * HttpClient fake para o Mercado Pago: nenhuma chamada de rede real ocorre nesta suíte.
 * Nunca é registrado na composição real da aplicação (connection.ts usa FetchHttpClient).
 */
class FakeMercadoPagoHttpClient implements HttpClient {
  public paymentStatus = 'pending';
  public nextExternalId = 'mp-1';
  public calls: { method: string; url: string }[] = [];

  public request(input: {
    method: 'GET' | 'POST' | 'PUT';
    url: string;
    headers: Record<string, string>;
    body?: unknown;
  }): Promise<HttpResponse> {
    this.calls.push({ method: input.method, url: input.url });
    if (input.method === 'POST' && input.url.endsWith('/v1/payments')) {
      return Promise.resolve({
        status: 201,
        body: {
          id: this.nextExternalId,
          status: this.paymentStatus,
          point_of_interaction: { transaction_data: { qr_code: '00020101fake' } },
        },
      });
    }
    if (input.method === 'GET') {
      return Promise.resolve({
        status: 200,
        body: { id: this.nextExternalId, status: this.paymentStatus },
      });
    }
    return Promise.resolve({ status: 200, body: {} });
  }
}

describe.skipIf(url === undefined)(
  'meios de pagamento reais por tenant (Etapa 14) com MySQL local',
  () => {
    const client = createPrismaClient(url ?? 'mysql://invalid');
    const cipher = new CredentialsCipher(
      '807d15aaaa7796bd7ca1d604c597cc077b854680fa938e9328edcaf498d95edb',
    );
    const registry = new PaymentGatewayProviderRegistry();
    registry.register(new PixLocalProviderAdapter());
    const mpHttp = new FakeMercadoPagoHttpClient();
    registry.register(new MercadoPagoProviderAdapter(mpHttp));
    const paymentMethods = new PaymentMethodService(client);
    const payments = new PaymentService(client);
    const gateway = new PaymentGatewayService(client, registry, cipher, paymentMethods, payments);
    const tenantWhiteLabelRepository = new TenantWhiteLabelRepository(client);
    const options = new TenantPaymentOptionsService(
      client,
      gateway,
      payments,
      tenantWhiteLabelRepository,
    );
    const appointments = new AppointmentService(
      new AppointmentRepository(client),
      new AvailabilityService(new AvailabilityRepository(client)),
    );

    const suffix = randomUUID().slice(0, 8);
    let tenantId: bigint;
    let tenantSlug: string;
    let otherTenantId: bigint;
    let customerId = '';
    let professionalId = '';
    let serviceId = '';
    let userId: bigint;
    let actor = { userId: 1n, sessionId: 1n };
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
      mpHttp.paymentStatus = 'pending';
      mpHttp.nextExternalId = `mp-${randomUUID().slice(0, 8)}`;
      mpHttp.calls = [];

      const user = await client.user.create({
        data: {
          publicId: randomUUID(),
          email: `tpo-${randomUUID()}@test.invalid`,
          normalizedEmail: `tpo-${randomUUID()}@test.invalid`,
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

      const slug = `tpo-${suffix}-${randomUUID().slice(0, 4)}`;
      const tenant = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug,
          legalName: 'Salão TPO Ltda',
          displayName: 'Salão TPO',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      await client.tenantSettings.create({
        data: { tenantId: tenant.id, payLocalEnabled: true },
      });
      const other = await client.tenant.create({
        data: {
          publicId: randomUUID(),
          slug: `tpo-other-${suffix}-${randomUUID().slice(0, 4)}`,
          legalName: 'Outro',
          displayName: 'Outro',
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          currency: 'BRL',
        },
      });
      await client.tenantSettings.create({
        data: { tenantId: other.id, payLocalEnabled: true },
      });
      tenantId = tenant.id;
      tenantSlug = slug;
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
      await client.tenantSettings.deleteMany({ where: { tenantId: { in: ids } } });
      await client.tenant.deleteMany({ where: { id: { in: ids } } });
      await client.userSession.deleteMany({ where: { userId } });
      await client.user.deleteMany({ where: { id: userId } });
    });

    describe('BR Code PIX (unidade pura)', () => {
      it('gera payload válido com CRC16 e valor correto', () => {
        const payload = buildPixBrCode({
          pixKey: 'chave@exemplo.com',
          receiverName: 'Salão Teste',
          city: 'São Paulo',
          amountCents: 15000n,
          referenceId: 'ref123456',
        });
        expect(payload).toContain('br.gov.bcb.pix');
        expect(payload).toContain('150.00');
        expect(payload.slice(-4)).toMatch(/^[0-9A-F]{4}$/u);
      });
    });

    describe('configurações independentes por tenant', () => {
      it('permite combinações independentes entre local, PIX e Mercado Pago', async () => {
        await options.updatePayLocal(tenantId, { active: true }, actor);
        await options.upsertPixLocal(
          tenantId,
          {
            active: true,
            keyType: 'EMAIL',
            key: 'salao@exemplo.com',
            receiverName: 'Salao Teste',
            city: 'Sao Paulo',
          },
          actor,
        );
        await options.upsertMercadoPago(tenantId, { active: false, environment: 'SANDBOX' }, actor);

        const overview = await options.getOverview(tenantId);
        expect(overview.payLocal.active).toBe(true);
        expect(overview.pixLocal.active).toBe(true);
        expect(overview.pixLocal.hasCredentials).toBe(true);
        expect(overview.mercadoPago.active).toBe(false);

        const otherOverview = await options.getOverview(otherTenantId);
        expect(otherOverview.pixLocal.active).toBe(false);
        expect(otherOverview.pixLocal.hasCredentials).toBe(false);
      });

      it('isola a chave PIX entre tenants', async () => {
        await options.upsertPixLocal(
          tenantId,
          {
            active: true,
            keyType: 'EMAIL',
            key: 'tenant-a@exemplo.com',
            receiverName: 'Tenant A',
            city: 'Sao Paulo',
          },
          actor,
        );
        await options.upsertPixLocal(
          otherTenantId,
          {
            active: true,
            keyType: 'EMAIL',
            key: 'tenant-b@exemplo.com',
            receiverName: 'Tenant B',
            city: 'Rio de Janeiro',
          },
          actor,
        );

        const appointment = await appointments.create(tenantId, input(start), actor);
        const charge = await options.createPixCharge(
          tenantId,
          appointment.publicId,
          { kind: 'PAYMENT' },
          actor,
        );
        expect(charge.charge.pixCopyPaste).not.toBeNull();
        expect(charge.charge.pixCopyPaste).not.toContain('tenant-b@exemplo.com');
      });
    });

    describe('pagamento no local', () => {
      it('não cria pagamento fictício e mantém o saldo pendente', async () => {
        await options.updatePayLocal(tenantId, { active: true }, actor);
        const appointment = await appointments.create(tenantId, input(start), actor);

        const optionsForAppointment = await options.getAvailableOptionsForAppointment(
          tenantId,
          appointment.publicId,
        );
        expect(optionsForAppointment.payLocalAvailable).toBe(true);
        expect(optionsForAppointment.balanceCents).toBe('15000');

        const list = await payments.listForAppointment(tenantId, appointment.publicId);
        expect(list.items).toHaveLength(0);
        expect(list.summary.balanceCents).toBe('15000');
      });
    });

    describe('cobrança PIX local', () => {
      it('gera BR Code, copia-e-cola e QR Code com o valor correto', async () => {
        await options.upsertPixLocal(
          tenantId,
          {
            active: true,
            keyType: 'RANDOM',
            key: 'chave-aleatoria-123',
            receiverName: 'Salao Teste',
            city: 'Sao Paulo',
          },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);

        const result = await options.createPixCharge(
          tenantId,
          appointment.publicId,
          { kind: 'PAYMENT' },
          actor,
        );
        expect(result.charge.status).toBe('PENDING');
        expect(result.charge.amountCents).toBe('15000');
        expect(result.charge.pixCopyPaste).toContain('150.00');
        expect(result.qrCodeDataUrl.startsWith('data:image/')).toBe(true);

        const raw = await client.paymentGatewayCharge.findFirst({
          where: { tenantId, publicId: result.charge.publicId },
        });
        expect(raw?.pixCopyPaste).not.toBeNull();
      });

      it('não confirma pagamento automaticamente; confirmação manual reaproveita PaymentService', async () => {
        await options.upsertPixLocal(
          tenantId,
          {
            active: true,
            keyType: 'RANDOM',
            key: 'chave-aleatoria-123',
            receiverName: 'Salao Teste',
            city: 'Sao Paulo',
          },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        const result = await options.createPixCharge(
          tenantId,
          appointment.publicId,
          { kind: 'PAYMENT' },
          actor,
        );
        expect(result.charge.status).toBe('PENDING');

        const refreshed = await gateway.getCharge(tenantId, result.charge.publicId, true);
        expect(refreshed.status).toBe('PENDING');
        expect(refreshed.paymentPublicId).toBeNull();

        const confirmed = await gateway.confirmManualCharge(
          tenantId,
          result.charge.publicId,
          actor,
        );
        expect(confirmed.status).toBe('PAID');
        expect(confirmed.paymentPublicId).not.toBeNull();

        const list = await payments.listForAppointment(tenantId, appointment.publicId);
        expect(list.items).toHaveLength(1);
        expect(list.summary.balanceCents).toBe('0');
      });
    });

    describe('sinal obrigatório', () => {
      it('bloqueia pagamento exclusivamente no local e permite PIX cobrir o sinal', async () => {
        await options.updatePayLocal(tenantId, { active: true }, actor);
        await options.upsertPixLocal(
          tenantId,
          {
            active: true,
            keyType: 'EMAIL',
            key: 'salao@exemplo.com',
            receiverName: 'Salao Teste',
            city: 'Sao Paulo',
          },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        await client.appointment.updateMany({
          where: { tenantId, publicId: appointment.publicId },
          data: { depositType: 'FIXED', depositAmountCents: 5000n },
        });

        const optionsForAppointment = await options.getAvailableOptionsForAppointment(
          tenantId,
          appointment.publicId,
        );
        expect(optionsForAppointment.depositRequired).toBe(true);
        expect(optionsForAppointment.payLocalAvailable).toBe(false);
        expect(optionsForAppointment.pixLocalAvailable).toBe(true);

        const depositCharge = await options.createPixCharge(
          tenantId,
          appointment.publicId,
          { kind: 'DEPOSIT' },
          actor,
        );
        expect(depositCharge.charge.amountCents).toBe('5000');
        await gateway.confirmManualCharge(tenantId, depositCharge.charge.publicId, actor);

        const afterDeposit = await options.getAvailableOptionsForAppointment(
          tenantId,
          appointment.publicId,
        );
        expect(afterDeposit.depositRequired).toBe(false);
        expect(afterDeposit.payLocalAvailable).toBe(true);
        expect(afterDeposit.balanceCents).toBe('10000');
      });
    });

    describe('Mercado Pago', () => {
      it('cria cobrança PIX via Mercado Pago com credenciais próprias do tenant e é idempotente', async () => {
        await options.upsertMercadoPago(
          tenantId,
          {
            active: true,
            environment: 'SANDBOX',
            accessToken: 'TEST-token-tenant-a',
            webhookSecret: 'webhook-secret-a',
          },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);

        const first = await options.createMercadoPagoCharge(
          tenantId,
          appointment.publicId,
          { kind: 'PAYMENT' },
          actor,
        );
        expect(first.status).toBe('PENDING');
        expect(mpHttp.calls.filter((c) => c.method === 'POST')).toHaveLength(1);

        const second = await options.createMercadoPagoCharge(
          tenantId,
          appointment.publicId,
          { kind: 'PAYMENT' },
          actor,
        );
        expect(second.publicId).toBe(first.publicId);
        expect(mpHttp.calls.filter((c) => c.method === 'POST')).toHaveLength(1);
      });

      it('recusa cobrança quando o provedor está desativado', async () => {
        await options.upsertMercadoPago(
          tenantId,
          { active: false, environment: 'SANDBOX', accessToken: 'TEST-token' },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        await expect(
          options.createMercadoPagoCharge(
            tenantId,
            appointment.publicId,
            { kind: 'PAYMENT' },
            actor,
          ),
        ).rejects.toMatchObject({ code: 'GATEWAY_NOT_CONFIGURED' });
      });

      it('processa webhook válido e reconcilia com Payment; rejeita assinatura inválida; deduplica repetição', async () => {
        await options.upsertMercadoPago(
          tenantId,
          {
            active: true,
            environment: 'SANDBOX',
            accessToken: 'TEST-token-tenant-a',
            webhookSecret: 'webhook-secret-a',
          },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        const created = await options.createMercadoPagoCharge(
          tenantId,
          appointment.publicId,
          { kind: 'PAYMENT' },
          actor,
        );

        const tenant = await client.tenant.findFirst({ where: { id: tenantId } });
        const rawBody = JSON.stringify({
          id: 999888777,
          type: 'payment',
          data: { id: created.externalId },
        });

        await expect(
          gateway.handleWebhook(tenant?.publicId ?? '', 'mercadopago', rawBody, {
            'x-signature': 'ts=1,v1=deadbeef',
            'x-request-id': 'req-1',
          }),
        ).rejects.toMatchObject({ code: 'GATEWAY_WEBHOOK_SIGNATURE_INVALID' });

        const { createHmac } = await import('node:crypto');
        const ts = '1700000000';
        const manifest = `id:${created.externalId ?? ''};request-id:req-1;ts:${ts};`;
        const v1 = createHmac('sha256', 'webhook-secret-a').update(manifest).digest('hex');
        const headers = { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' };

        const first = await gateway.handleWebhook(
          tenant?.publicId ?? '',
          'mercadopago',
          rawBody,
          headers,
        );
        expect(first).toMatchObject({ deduplicated: false, matched: true });

        const duplicate = await gateway.handleWebhook(
          tenant?.publicId ?? '',
          'mercadopago',
          rawBody,
          headers,
        );
        expect(duplicate).toMatchObject({ deduplicated: true });

        mpHttp.paymentStatus = 'approved';
        const refreshed = await gateway.getCharge(tenantId, created.publicId, true);
        expect(refreshed.status).toBe('PAID');
        expect(refreshed.paymentPublicId).not.toBeNull();

        const list = await payments.listForAppointment(tenantId, appointment.publicId);
        expect(list.items).toHaveLength(1);
      });
    });

    describe('fluxo público de reserva', () => {
      it('Tenant A: local e PIX ativos, MP inativo -> cliente vê apenas local e PIX', async () => {
        await options.updatePayLocal(tenantId, { active: true }, actor);
        await options.upsertPixLocal(
          tenantId,
          {
            active: true,
            keyType: 'EMAIL',
            key: 'salao@exemplo.com',
            receiverName: 'Salao Teste',
            city: 'Sao Paulo',
          },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        const publicOptions = await options.getPublicOptionsForAppointment(
          tenantSlug,
          appointment.publicId,
        );
        expect(publicOptions.payLocalAvailable).toBe(true);
        expect(publicOptions.pixLocalAvailable).toBe(true);
        expect(publicOptions.mercadoPagoAvailable).toBe(false);
      });

      it('Tenant B: só MP ativo -> cliente não tem local nem PIX local disponíveis', async () => {
        await options.updatePayLocal(tenantId, { active: false }, actor);
        await options.upsertMercadoPago(
          tenantId,
          { active: true, environment: 'SANDBOX', accessToken: 'TEST-token' },
          actor,
        );
        const appointment = await appointments.create(tenantId, input(start), actor);
        const publicOptions = await options.getPublicOptionsForAppointment(
          tenantSlug,
          appointment.publicId,
        );
        expect(publicOptions.payLocalAvailable).toBe(false);
        expect(publicOptions.pixLocalAvailable).toBe(false);
        expect(publicOptions.mercadoPagoAvailable).toBe(true);
      });

      it('Tenant C: só local ativo -> agenda sem pagamento online, saldo pendente', async () => {
        await options.updatePayLocal(tenantId, { active: true }, actor);
        const appointment = await appointments.create(tenantId, input(start), actor);
        const publicOptions = await options.getPublicOptionsForAppointment(
          tenantSlug,
          appointment.publicId,
        );
        expect(publicOptions.payLocalAvailable).toBe(true);
        expect(publicOptions.pixLocalAvailable).toBe(false);
        expect(publicOptions.mercadoPagoAvailable).toBe(false);
        expect(publicOptions.balanceCents).toBe('15000');
      });

      it('tenant sem nenhum meio online configurado: apenas local, se habilitado', async () => {
        const appointment = await appointments.create(tenantId, input(start), actor);
        const publicOptions = await options.getPublicOptionsForAppointment(
          tenantSlug,
          appointment.publicId,
        );
        expect(publicOptions.pixLocalAvailable).toBe(false);
        expect(publicOptions.mercadoPagoAvailable).toBe(false);
      });
    });
  },
);
