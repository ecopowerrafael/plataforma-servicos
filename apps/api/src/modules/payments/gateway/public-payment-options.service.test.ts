import {
  CustomerPasswordSchema,
  CustomerRegisterRequestSchema,
  PasswordSchema,
} from '@plataforma/shared';
import { describe, expect, it, vi } from 'vitest';

import { TenantPaymentOptionsService } from './tenant-payment-options.service.js';

import type { PaymentGatewayService } from './payment-gateway.service.js';
import type { PrismaClient } from '../../../database-client/client.js';
import type { TenantWhiteLabelRepository } from '../../tenants/tenant-white-label.repository.js';
import type { PaymentService } from '../payment.service.js';

function build({
  payLocalEnabled = true,
  pixActive = false,
  pixCredentials = true,
  mpActive = false,
  mpCredentials = true,
  summary = {
    depositAmountCents: null as string | null,
    depositPaidCents: '0',
    balanceCents: '5000',
  },
}) {
  const client = {
    tenantSettings: { findFirst: vi.fn().mockResolvedValue({ payLocalEnabled }) },
    paymentGatewayConfig: {
      findFirst: vi
        .fn()
        .mockResolvedValue(
          pixActive ? { active: true, credentialsCiphertext: pixCredentials ? 'x' : null } : null,
        ),
    },
  } as unknown as PrismaClient;
  const gateway = {
    getConfig: vi
      .fn()
      .mockResolvedValue({ active: mpActive, hasCredentials: mpCredentials, environment: 'SANDBOX' }),
  } as unknown as PaymentGatewayService;
  const payments = {
    listForAppointment: vi.fn().mockResolvedValue({ summary }),
  } as unknown as PaymentService;
  const tenants = {
    findActiveTenantBySlug: vi.fn().mockResolvedValue({ id: 1n }),
  } as unknown as TenantWhiteLabelRepository;
  return new TenantPaymentOptionsService(client, gateway, payments, tenants);
}

describe('opções públicas de pagamento', () => {
  it('sem gateway online, só resta pagamento no local (o site agenda direto)', async () => {
    const options = await build({}).getPublicSiteOptions('barbearia');
    expect(options).toEqual({
      payLocalAvailable: true,
      pixLocalAvailable: false,
      mercadoPagoAvailable: false,
    });
  });

  it('com apenas uma forma online e sem pagamento local, não há escolha a apresentar', async () => {
    const options = await build({ payLocalEnabled: false, pixActive: true }).getPublicSiteOptions(
      'barbearia',
    );
    expect(options).toEqual({
      payLocalAvailable: false,
      pixLocalAvailable: true,
      mercadoPagoAvailable: false,
    });
  });

  it('com online e local ativos, as duas opções são oferecidas', async () => {
    const options = await build({ pixActive: true, mpActive: true }).getPublicSiteOptions(
      'barbearia',
    );
    expect(options).toEqual({
      payLocalAvailable: true,
      pixLocalAvailable: true,
      mercadoPagoAvailable: true,
    });
  });

  it('ignora gateway ativo sem credenciais', async () => {
    const options = await build({
      pixActive: true,
      pixCredentials: false,
      mpActive: true,
      mpCredentials: false,
    }).getPublicSiteOptions('barbearia');
    expect(options.pixLocalAvailable).toBe(false);
    expect(options.mercadoPagoAvailable).toBe(false);
  });

  it('exigindo sinal, o pagamento no local deixa de ser oferecido para o agendamento', async () => {
    const service = build({
      pixActive: true,
      summary: { depositAmountCents: '3000', depositPaidCents: '0', balanceCents: '5000' },
    });
    const options = await service.getAvailableOptionsForAppointment(
      1n,
      '00000000-0000-4000-8000-000000000001',
    );
    expect(options).toMatchObject({ depositRequired: true, payLocalAvailable: false });
  });

  it('sem saldo em aberto, não há valor a cobrar novamente', async () => {
    const service = build({
      pixActive: true,
      summary: { depositAmountCents: null, depositPaidCents: '0', balanceCents: '0' },
    });
    const options = await service.getAvailableOptionsForAppointment(
      1n,
      '00000000-0000-4000-8000-000000000001',
    );
    expect(options).toMatchObject({ depositRequired: false, balanceCents: '0' });
  });
});

describe('senha da conta de cliente', () => {
  it('aceita senha simples de 8 caracteres, sem exigir número', () => {
    expect(CustomerPasswordSchema.safeParse('minhasenha').success).toBe(true);
    expect(CustomerRegisterRequestSchema.safeParse({
      name: 'Ana',
      email: 'ana@exemplo.com',
      password: 'minhasenha',
    }).success).toBe(true);
  });

  it('rejeita senha curta e comum com mensagem explicativa, nunca "Invalid input"', () => {
    const short = CustomerPasswordSchema.safeParse('123');
    expect(short.success).toBe(false);
    expect(short.error?.issues[0]?.message).toContain('pelo menos 8 caracteres');
    expect(CustomerPasswordSchema.safeParse('12345678').success).toBe(false);
  });

  it('não enfraquece a senha de administradores', () => {
    expect(PasswordSchema.safeParse('minhasenha').success).toBe(false);
    expect(PasswordSchema.safeParse('minhasenha1').success).toBe(true);
  });
});
