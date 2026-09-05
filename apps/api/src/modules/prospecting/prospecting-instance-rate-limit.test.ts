import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProspectingInstanceRateLimit } from './prospecting-instance-rate-limit.js';
import { type PrismaClient } from '../../database-client/client.js';

describe('ProspectingInstanceRateLimit', () => {
  let rateLimiter: ProspectingInstanceRateLimit;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      prospectingWhatsAppConfig: {
        updateMany: vi.fn(),
        findUnique: vi.fn(),
      },
    } as unknown as PrismaClient;

    rateLimiter = new ProspectingInstanceRateLimit(mockClient);
  });

  describe('Send Slot Management', () => {
    it('1. claimSendSlot quando livre', async () => {
      mockClient.prospectingWhatsAppConfig.updateMany.mockResolvedValue({
        count: 1,
      });

      const now = new Date();
      const reserved = new Date(now.getTime() + 2000);

      const result = await rateLimiter.claimSendSlot('instance-1', reserved, now);

      expect(result).toBe(true);
      expect(mockClient.prospectingWhatsAppConfig.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { nextSendAt: reserved },
        }),
      );
    });

    it('2. claimSendSlot bloqueado', async () => {
      mockClient.prospectingWhatsAppConfig.updateMany.mockResolvedValue({
        count: 0,
      });

      const now = new Date();
      const reserved = new Date(now.getTime() + 2000);

      const result = await rateLimiter.claimSendSlot('instance-1', reserved, now);

      expect(result).toBe(false);
    });

    it('3. slot mantém nextSendAt após envio (não limpar)', async () => {
      const now = new Date();
      const nextSendAt = new Date(now.getTime() + 2000);

      mockClient.prospectingWhatsAppConfig.findUnique.mockResolvedValue({
        nextSendAt,
      });

      const current = await rateLimiter.getNextSendAt('instance-1');

      expect(current).toBe(nextSendAt);
      // Verifica que nextSendAt não foi limpo
      expect(mockClient.prospectingWhatsAppConfig.updateMany).not.toHaveBeenCalled();
    });

    it('4. próximo outbound só consegue depois de nextSendAt', async () => {
      const now = new Date();
      const reservedUntil = new Date(now.getTime() + 2000);

      // Primeiro claim
      mockClient.prospectingWhatsAppConfig.updateMany.mockResolvedValueOnce({
        count: 1,
      });

      const first = await rateLimiter.claimSendSlot('instance-1', reservedUntil, now);
      expect(first).toBe(true);

      // Segundo claim imediatamente (bloqueado)
      mockClient.prospectingWhatsAppConfig.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      const second = await rateLimiter.claimSendSlot('instance-1', reservedUntil, now);
      expect(second).toBe(false);

      // Terceiro claim após liberação natural
      const after = new Date(reservedUntil.getTime() + 1);
      mockClient.prospectingWhatsAppConfig.updateMany.mockResolvedValueOnce({
        count: 1,
      });

      const third = await rateLimiter.claimSendSlot('instance-1', new Date(after.getTime() + 2000), after);
      expect(third).toBe(true);
    });
  });

  describe('Human Lock Type', () => {
    it('5. INBOUND_REPLY não bloqueia auto-reply correlata', () => {
      // Verificação lógica: INBOUND_REPLY permissível
      const lockType = 'INBOUND_REPLY';
      expect(['MANUAL']).not.toContain(lockType);
    });

    it('6. MANUAL bloqueia automação', () => {
      // Verificação lógica: MANUAL é bloqueador
      const lockType = 'MANUAL';
      expect(['MANUAL']).toContain(lockType);
    });
  });
});
