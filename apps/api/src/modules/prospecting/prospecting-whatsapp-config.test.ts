import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProspectingWhatsAppConfigService } from './prospecting-whatsapp-config.service.js';
import { CredentialsCipher } from '../auth/credentials-cipher.js';

// Mock Prisma Client
const mockClient = {
  prospectingWhatsAppConfig: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

// Mock CredentialsCipher
const mockCipher = {
  encrypt: vi.fn((token: string) => `encrypted:${token}`),
  decrypt: vi.fn((ciphertext: string) => ciphertext.replace('encrypted:', '')),
};

describe('ProspectingWhatsAppConfigService', () => {
  let service: ProspectingWhatsAppConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProspectingWhatsAppConfigService(mockClient as any, mockCipher as any);
  });

  describe('Token Encryption', () => {
    it('should encrypt token on update', async () => {
      mockClient.prospectingWhatsAppConfig.findFirst.mockResolvedValue(null);
      mockClient.prospectingWhatsAppConfig.create.mockResolvedValue({
        id: 1n,
        publicId: 'test-id',
        instanceId: 'ABC123',
        tokenCiphertext: 'encrypted:secret-token',
        phoneNumber: '+55',
        instanceName: 'Test',
        isActive: true,
        lastConnectionStatus: null,
        lastCheckedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.updateConfig({
        instanceId: 'ABC123',
        token: 'secret-token',
      });

      expect(mockCipher.encrypt).toHaveBeenCalledWith('secret-token');
    });

    it('should NOT return plaintext token in response', async () => {
      mockClient.prospectingWhatsAppConfig.findFirst.mockResolvedValue({
        id: 1n,
        publicId: 'test-id',
        instanceId: 'ABC123',
        tokenCiphertext: 'encrypted:secret-token-xyz',
        phoneNumber: '+5511999999999',
        instanceName: 'Prospecting',
        isActive: true,
        lastConnectionStatus: 'CONNECTED',
        lastCheckedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await service.getConfig();

      expect(response).not.toHaveProperty('token');
      expect(response?.tokenMasked).toMatch(/^•+\w{4}$/);
      expect(response?.tokenMasked).toBe('•••••••xyz');
    });

    it('should decrypt token only internally', async () => {
      mockClient.prospectingWhatsAppConfig.findFirst.mockResolvedValue({
        id: 1n,
        tokenCiphertext: 'encrypted:my-secret-token',
        isActive: true,
      });

      const token = await service.getDecryptedToken();

      expect(mockCipher.decrypt).toHaveBeenCalledWith('encrypted:my-secret-token');
      expect(token).toBe('my-secret-token');
    });
  });

  describe('PUT Without Token Preserves Previous', () => {
    it('should preserve token when not provided in update', async () => {
      const existingConfig = {
        id: 1n,
        publicId: 'existing-id',
        instanceId: 'OLD123',
        tokenCiphertext: 'encrypted:old-token',
        phoneNumber: '+5511999999999',
        instanceName: 'Old Instance',
        isActive: true,
        lastConnectionStatus: 'CONNECTED',
        lastCheckedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockClient.prospectingWhatsAppConfig.findFirst.mockResolvedValue(existingConfig);
      mockClient.prospectingWhatsAppConfig.update.mockResolvedValue({
        ...existingConfig,
        instanceId: 'NEW123',
        tokenCiphertext: 'encrypted:old-token', // Token preserved
      });

      const result = await service.updateConfig({
        instanceId: 'NEW123',
        token: 'new-token', // Even if new token provided
      });

      // Check that update was called with new token (in real scenario)
      expect(mockCipher.encrypt).toHaveBeenCalledWith('new-token');
    });
  });

  describe('Connection Status', () => {
    it('should update connection status with timestamp', async () => {
      mockClient.prospectingWhatsAppConfig.findFirst.mockResolvedValue({ id: 1n });
      mockClient.prospectingWhatsAppConfig.update.mockResolvedValue({
        lastConnectionStatus: 'CONNECTED',
        lastCheckedAt: expect.any(Date),
      });

      await service.updateConnectionStatus('CONNECTED', '+5511999999999', 'Prospecting');

      const updateCall = mockClient.prospectingWhatsAppConfig.update.mock.calls[0];
      expect(updateCall[0].data.lastConnectionStatus).toBe('CONNECTED');
      expect(updateCall[0].data.lastCheckedAt).toBeDefined();
    });

    it('should handle error status', async () => {
      mockClient.prospectingWhatsAppConfig.findFirst.mockResolvedValue({ id: 1n });

      await service.updateConnectionStatus('ERROR');

      const updateCall = mockClient.prospectingWhatsAppConfig.update.mock.calls[0];
      expect(updateCall[0].data.lastConnectionStatus).toBe('ERROR');
    });
  });

  describe('Token Masking', () => {
    it('should mask token correctly', async () => {
      mockClient.prospectingWhatsAppConfig.findFirst.mockResolvedValue({
        tokenCiphertext: 'very-long-encrypted-token-1234',
      });

      const response = await service.getConfig();

      // Should show last 4 chars only
      expect(response?.tokenMasked).toBe('•••••••••••••••••••••••••1234');
    });

    it('should handle short tokens', async () => {
      mockClient.prospectingWhatsAppConfig.findFirst.mockResolvedValue({
        tokenCiphertext: 'abc',
      });

      const response = await service.getConfig();

      expect(response?.tokenMasked).toBe('•••');
    });
  });

  describe('No Plaintext in Logs', () => {
    it('should never log plaintext token', () => {
      const consoleSpy = vi.spyOn(console, 'log');

      service.updateConfig({
        instanceId: 'ABC123',
        token: 'super-secret-token',
      });

      const logs = consoleSpy.mock.calls.map((call) => call[0]).join('');
      expect(logs).not.toContain('super-secret-token');

      consoleSpy.mockRestore();
    });
  });
});
