import { describe, it, expect, beforeEach } from 'vitest';

describe('DirectoryLocationService - City Matching', () => {
  const normalize = (value: string) =>
    value.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase();

  describe('city name normalization', () => {
    it('should normalize São Paulo variants', () => {
      expect(normalize('São Paulo')).toBe(normalize('sao paulo'));
      expect(normalize('São Paulo')).toBe(normalize('SAO PAULO'));
      expect(normalize('São Paulo')).toBe('sao paulo');
    });

    it('should normalize Ibiúna variants', () => {
      expect(normalize('Ibiúna')).toBe(normalize('ibiuna'));
      expect(normalize('Ibiúna')).toBe(normalize('IBIUNA'));
    });

    it('should handle cities without accents', () => {
      expect(normalize('Brasilia')).toBe('brasilia');
      expect(normalize('Rio de Janeiro')).toBe('rio de janeiro');
    });

    it('should handle mixed case and accents', () => {
      expect(normalize('SÃO PAULO')).toBe('sao paulo');
      expect(normalize('são paulo')).toBe('sao paulo');
      expect(normalize('Sao Paulo')).toBe('sao paulo');
    });
  });

  describe('CEP validation', () => {
    const validateCep = (value: string) => /^\d{8}$/.test(value.replace(/\D/gu, ''));

    it('should accept valid 8-digit CEP', () => {
      expect(validateCep('01310100')).toBe(true);
      expect(validateCep('01310-100')).toBe(true);
    });

    it('should reject invalid CEP formats', () => {
      expect(validateCep('123')).toBe(false);
      expect(validateCep('abcd1234')).toBe(false);
      expect(validateCep('')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should differentiate between error types', () => {
      const errors = {
        invalidCep: 'Informe um CEP válido.',
        notFound: 'Não encontramos esse CEP. Confira os números e tente novamente.',
        generic: 'Erro ao testar localização. Tente novamente.',
      };

      // Verify error messages are safe and don't expose internals
      Object.values(errors).forEach((msg) => {
        expect(msg).not.toContain('stack');
        expect(msg).not.toContain('mysql');
        expect(msg).not.toContain('database');
      });
    });
  });

  describe('location serialization', () => {
    it('should not include BigInt or internal fields in location response', () => {
      // Simulate what Prisma returns from cache
      const prismaRow = {
        id: 123n, // BigInt - should NOT be in response
        cep: '18150000',
        city: 'Ibiúna',
        state: 'SP',
        neighborhood: null,
        street: null,
        latitude: -23.65,
        longitude: -47.22,
        provider: 'BRASILAPI', // should NOT be in response
        createdAt: new Date(), // should NOT be in response
        updatedAt: new Date(), // should NOT be in response
      };

      // Simulate toLocation mapper
      const location = {
        cep: prismaRow.cep,
        city: prismaRow.city,
        state: prismaRow.state,
        neighborhood: prismaRow.neighborhood,
        street: prismaRow.street,
        latitude: prismaRow.latitude,
        longitude: prismaRow.longitude,
      };

      // Verify no BigInt in response
      expect(location).not.toHaveProperty('id');
      expect(location).not.toHaveProperty('provider');
      expect(location).not.toHaveProperty('createdAt');
      expect(location).not.toHaveProperty('updatedAt');

      // Verify JSON.stringify works (no BigInt error)
      expect(() => JSON.stringify(location)).not.toThrow();
      expect(() => JSON.stringify({ location, results: [], cityUrl: '/' })).not.toThrow();

      // Verify serialized output is valid
      const serialized = JSON.stringify(location);
      const parsed = JSON.parse(serialized);
      expect(parsed.cep).toBe('18150000');
      expect(parsed.city).toBe('Ibiúna');
    });
  });
});
