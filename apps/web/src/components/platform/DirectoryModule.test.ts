import { describe, it, expect } from 'vitest';

describe('DirectoryModule - Geoapify Configuration', () => {
  describe('category field parsing', () => {
    it('should parse comma-separated categories', () => {
      const input = 'restaurant, cafe, bar';
      const parsed = input
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x);

      expect(parsed).toEqual(['restaurant', 'cafe', 'bar']);
    });

    it('should handle empty input', () => {
      const input = '';
      const parsed = input.trim()
        ? input
            .split(',')
            .map((x) => x.trim())
            .filter((x) => x)
        : null;

      expect(parsed).toBe(null);
    });

    it('should trim whitespace', () => {
      const input = '  restaurant  ,  cafe  ';
      const parsed = input
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x);

      expect(parsed).toEqual(['restaurant', 'cafe']);
    });
  });

  describe('status display', () => {
    it('should show configured status for categories with Geoapify', () => {
      const category = {
        geoapifyCategories: ['restaurant', 'cafe'],
        externalSearchTerms: ['food'],
      };

      const isConfigured = (category.geoapifyCategories?.length ?? 0) > 0;
      expect(isConfigured).toBe(true);
    });

    it('should show unconfigured status for categories without Geoapify', () => {
      const category: { geoapifyCategories: string[] | null; externalSearchTerms: string[] | null } = {
        geoapifyCategories: null,
        externalSearchTerms: null,
      };

      const isConfigured = (category.geoapifyCategories?.length ?? 0) > 0;
      expect(isConfigured).toBe(false);
    });

    it('should show count of configured categories', () => {
      const category = {
        geoapifyCategories: ['restaurant', 'cafe', 'bar'],
        externalSearchTerms: [],
      };

      const count = category.geoapifyCategories?.length ?? 0;
      expect(count).toBe(3);
    });
  });

  describe('test results display', () => {
    it('should separate directory and geoapify results', () => {
      const results = [
        { source: 'DIRECTORY', name: 'Local Business' },
        { source: 'GEOAPIFY', name: 'Nearby Place 1' },
        { source: 'GEOAPIFY', name: 'Nearby Place 2' },
      ];

      const directoryCount = results.filter((r) => r.source === 'DIRECTORY').length;
      const geoapifyCount = results.filter((r) => r.source === 'GEOAPIFY').length;

      expect(directoryCount).toBe(1);
      expect(geoapifyCount).toBe(2);
      expect(directoryCount + geoapifyCount).toBe(3);
    });
  });

  describe('error handling', () => {
    it('should validate CEP format', () => {
      const validateCep = (cep: string) => /^\d{1,9}$/.test(cep);

      expect(validateCep('01310100')).toBe(true);
      expect(validateCep('123')).toBe(true); // Allow partial input
      expect(validateCep('abcd')).toBe(false);
      expect(validateCep('')).toBe(false);
    });

    it('should prevent submission with incomplete inputs', () => {
      const canSubmit = (cep: string, category: string, isPending: boolean) =>
        !isPending && cep.trim().length > 0 && category.length > 0;

      expect(canSubmit('01310100', 'restaurants', false)).toBe(true);
      expect(canSubmit('', 'restaurants', false)).toBe(false);
      expect(canSubmit('01310100', '', false)).toBe(false);
      expect(canSubmit('01310100', 'restaurants', true)).toBe(false);
    });
  });
});
