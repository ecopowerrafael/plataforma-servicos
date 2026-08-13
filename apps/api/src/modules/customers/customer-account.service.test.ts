import { CustomerPasswordSchema, CustomerResetPasswordRequestSchema } from '@plataforma/shared';
import { describe, expect, it, vi } from 'vitest';

import { CustomerAuthService } from './customer-auth.service.js';
import { CustomerPhotoService } from './customer-photo.service.js';

import type { PrismaClient } from '../../database-client/client.js';
import type { ServiceImageStorage } from '../services/service-image.storage.js';

const tenant = { id: 1n, publicId: 't-1' };
const customer = {
  id: 5n,
  publicId: 'c-1',
  name: 'Ana',
  email: 'ana@exemplo.com',
  phone: null,
  passwordHash: 'hash',
  photoPath: null as string | null,
  updatedAt: new Date('2026-01-01T10:00:00Z'),
  tenant: { publicId: 't-1' },
};

function authService({
  found = customer as typeof customer | null,
  consumed = true,
  emailAvailable = true,
}) {
  const createPasswordReset = vi.fn().mockResolvedValue(undefined);
  const consumePasswordReset = vi.fn().mockResolvedValue(consumed);
  const send = vi.fn().mockResolvedValue(undefined);
  const service = new CustomerAuthService(
    { findByEmail: vi.fn().mockResolvedValue(found) } as never,
    { createPasswordReset, consumePasswordReset } as never,
    { findActiveTenantBySlug: vi.fn().mockResolvedValue(tenant) } as never,
    { hash: vi.fn().mockResolvedValue('novo-hash') } as never,
    { sessionTtlHours: 168, passwordResetTtlMinutes: 60, appWebUrl: 'https://app' },
    { available: emailAvailable, send },
  );
  return { service, createPasswordReset, consumePasswordReset, send };
}

describe('recuperação de senha do cliente', () => {
  it('responde de forma neutra e não envia nada quando a conta não existe', async () => {
    const { service, createPasswordReset, send } = authService({ found: null });
    await expect(
      service.forgotPassword('barbearia', 'ninguem@exemplo.com', {
        ipAddress: null,
        userAgent: null,
      }),
    ).resolves.toBeUndefined();
    expect(createPasswordReset).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('guarda apenas o hash do token e envia o link por e-mail', async () => {
    const { service, createPasswordReset, send } = authService({});
    await service.forgotPassword('barbearia', 'ana@exemplo.com', {
      ipAddress: '1.1.1.1',
      userAgent: null,
    });
    const input = createPasswordReset.mock.calls[0]?.[0] as {
      tokenHash: string;
      expiresAt: Date;
      tenantId: bigint;
    };
    expect(input.tokenHash).toHaveLength(64);
    expect(input.tenantId).toBe(tenant.id);
    expect(input.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const message = send.mock.calls[0]?.[0] as { to: string; text: string };
    expect(message.to).toBe('ana@exemplo.com');
    expect(message.text).toContain('/public/barbearia/redefinir-senha?token=');
    // O token puro nunca é persistido.
    expect(message.text).not.toContain(input.tokenHash);
  });

  it('redefine a senha com token válido', async () => {
    const { service, consumePasswordReset } = authService({});
    await expect(
      service.resetPassword('barbearia', 'a'.repeat(48), 'minhasenha'),
    ).resolves.toBeUndefined();
    expect(consumePasswordReset).toHaveBeenCalledWith(
      tenant.id,
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      'novo-hash',
      expect.any(Date),
    );
  });

  it('recusa token expirado, já usado ou de outro tenant', async () => {
    const { service } = authService({ consumed: false });
    await expect(
      service.resetPassword('barbearia', 'a'.repeat(48), 'minhasenha'),
    ).rejects.toMatchObject({ code: 'CUSTOMER_PASSWORD_RESET_INVALID', statusCode: 400 });
  });

  it('valida a nova senha com a política do cliente, não a de staff', () => {
    expect(
      CustomerResetPasswordRequestSchema.safeParse({
        token: 'a'.repeat(48),
        newPassword: 'minhasenha',
      }).success,
    ).toBe(true);
    expect(
      CustomerResetPasswordRequestSchema.safeParse({ token: 'a'.repeat(48), newPassword: '123' })
        .success,
    ).toBe(false);
    expect(CustomerPasswordSchema.safeParse('minhasenha').success).toBe(true);
  });
});

function photoService(record: typeof customer | null) {
  const update = vi.fn().mockImplementation((args: { data: { photoPath: string | null } }) =>
    Promise.resolve({ ...customer, photoPath: args.data.photoPath }),
  );
  const findFirst = vi.fn().mockResolvedValue(record);
  const client = { customer: { findFirst, update } } as unknown as PrismaClient;
  const save = vi.fn().mockResolvedValue({ key: 't-1/c-1/foto.webp', mimeType: 'image/webp' });
  const read = vi.fn().mockResolvedValue({ buffer: Buffer.from('x'), mimeType: 'image/webp' });
  const remove = vi.fn().mockResolvedValue(undefined);
  const images = { save, read, remove } as unknown as ServiceImageStorage;
  return { service: new CustomerPhotoService(client, images), findFirst, update, save, read, remove };
}

describe('foto do cliente', () => {
  it('salva a imagem isolada por tenant e cliente e vincula ao registro', async () => {
    const { service, save, update } = photoService(customer);
    const result = await service.replace(1n, 5n, Buffer.from('img'));
    expect(save).toHaveBeenCalledWith('t-1', 'c-1', expect.any(Buffer));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { photoPath: 't-1/c-1/foto.webp' } }),
    );
    expect(result.photoPath).toBe('t-1/c-1/foto.webp');
  });

  it('substitui removendo o arquivo anterior', async () => {
    const { service, remove } = photoService({ ...customer, photoPath: 'antiga.webp' });
    await service.replace(1n, 5n, Buffer.from('img'));
    expect(remove).toHaveBeenCalledWith('antiga.webp');
  });

  it('remove a foto e limpa o vínculo', async () => {
    const { service, remove, update } = photoService({ ...customer, photoPath: 'antiga.webp' });
    const result = await service.remove(1n, 5n);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { photoPath: null } }));
    expect(remove).toHaveBeenCalledWith('antiga.webp');
    expect(result.photoPath).toBeNull();
  });

  it('lê a foto existente e recusa quando não há', async () => {
    const withPhoto = photoService({ ...customer, photoPath: 'foto.webp' });
    await expect(withPhoto.service.read(1n, 5n)).resolves.toMatchObject({
      mimeType: 'image/webp',
    });
    const without = photoService(customer);
    await expect(without.service.read(1n, 5n)).rejects.toMatchObject({
      code: 'CUSTOMER_PHOTO_NOT_FOUND',
    });
  });

  it('mantém o isolamento por tenant', async () => {
    const { service, findFirst } = photoService(null);
    await expect(service.replace(9n, 5n, Buffer.from('img'))).rejects.toMatchObject({
      code: 'CUSTOMER_NOT_FOUND',
      statusCode: 404,
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 5n, tenantId: 9n } }),
    );
  });
});
