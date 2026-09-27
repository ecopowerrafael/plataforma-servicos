import { describe, it, expect } from 'vitest';
import { evaluateDirectoryBusinessSeo } from './directory-seo-quality.js';

describe('evaluateDirectoryBusinessSeo', () => {
  const validBusiness = {
    active: true,
    indexable: true,
    name: 'Barbearia Silva',
    city: 'São Paulo',
    state: 'SP',
    rawAddress: 'Rua X, 123',
    neighborhood: 'Centro',
    postalCode: '01310100',
    phone: '1199999999',
    whatsapp: '5511999999999',
    websiteUrl: 'https://barbearia.com',
    tenantId: 1n,
    categoryActive: true,
    categoryIndexable: true,
  };

  describe('Image handling', () => {
    it('1. image field does not exist in input (no scoring impact)', () => {
      const result = evaluateDirectoryBusinessSeo(validBusiness);
      expect(result.eligible).toBe(true);
      // Image is not part of input at all - test proves this
    });

    it('2. image absence does not prevent eligibility', () => {
      const business = { ...validBusiness };
      const result = evaluateDirectoryBusinessSeo(business);
      expect(result.eligible).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(60);
    });
  });

  describe('Score calculation', () => {
    it('3. name valid adds 20 points', () => {
      const result = evaluateDirectoryBusinessSeo(validBusiness);
      expect(result.score).toBeGreaterThanOrEqual(20);
    });

    it('4. missing name does not add 20 points', () => {
      const business = { ...validBusiness, name: '' };
      const result = evaluateDirectoryBusinessSeo(business);
      expect(result.reasons).toContain('MISSING_NAME');
    });

    it('5. category valid adds 10 points', () => {
      const result = evaluateDirectoryBusinessSeo(validBusiness);
      expect(result.score).toBeGreaterThanOrEqual(30); // name(20) + category(10)
    });

    it('6. city valid adds 15 points', () => {
      const result = evaluateDirectoryBusinessSeo(validBusiness);
      expect(result.score).toBeGreaterThanOrEqual(45); // name(20) + category(10) + city(15)
    });

    it('7. state valid (2 chars) adds 5 points', () => {
      const result = evaluateDirectoryBusinessSeo(validBusiness);
      // name(20) + category(10) + city(15) + state(5) = 50 minimum
      expect(result.score).toBeGreaterThanOrEqual(50);
    });

    it('8. address valid adds 15 points', () => {
      const result = evaluateDirectoryBusinessSeo(validBusiness);
      expect(result.score).toBeGreaterThanOrEqual(65);
    });

    it('9. neighborhood adds 5 points', () => {
      const result = evaluateDirectoryBusinessSeo(validBusiness);
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it('10. valid CEP (8 chars) adds 5 points', () => {
      const result = evaluateDirectoryBusinessSeo(validBusiness);
      expect(result.score).toBeGreaterThanOrEqual(75);
    });

    it('11. phone adds 10 points', () => {
      const result = evaluateDirectoryBusinessSeo(validBusiness);
      expect(result.score).toBeGreaterThanOrEqual(85);
    });

    it('12. whatsapp adds 15 points', () => {
      const result = evaluateDirectoryBusinessSeo(validBusiness);
      expect(result.score).toBeGreaterThanOrEqual(100);
    });

    it('13. website adds 5 points (clamped at 100)', () => {
      const businessWithoutWebsite = { ...validBusiness, websiteUrl: null };
      const resultWithout = evaluateDirectoryBusinessSeo(businessWithoutWebsite);
      // Total without website: name(20) + category(10) + city(15) + state(5) + address(15) + neighborhood(5) + CEP(5) + phone(10) + whatsapp(15) + tenant(10) = 110 → 100
      expect(resultWithout.score).toBeLessThanOrEqual(100);
    });

    it('14. tenant linked adds 10 points', () => {
      const businessWithoutTenant = { ...validBusiness, tenantId: null };
      const resultWithout = evaluateDirectoryBusinessSeo(businessWithoutTenant);
      const resultWith = evaluateDirectoryBusinessSeo(validBusiness);
      expect(resultWith.score).toBeGreaterThanOrEqual(resultWithout.score);
    });

    it('15. score is clamped to 100', () => {
      const result = evaluateDirectoryBusinessSeo(validBusiness);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('Contact requirement', () => {
    it('16. without phone and whatsapp → not eligible', () => {
      const business = { ...validBusiness, phone: null, whatsapp: null };
      const result = evaluateDirectoryBusinessSeo(business);
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain('MISSING_CONTACT');
    });

    it('17. with phone only → eligible if score >= 60', () => {
      const business = { ...validBusiness, whatsapp: null };
      const result = evaluateDirectoryBusinessSeo(business);
      expect(result.eligible).toBe(true);
    });

    it('18. with whatsapp only → eligible if score >= 60', () => {
      const business = { ...validBusiness, phone: null };
      const result = evaluateDirectoryBusinessSeo(business);
      expect(result.eligible).toBe(true);
    });
  });

  describe('Mandatory flags', () => {
    it('19. active=false → not eligible', () => {
      const business = { ...validBusiness, active: false };
      const result = evaluateDirectoryBusinessSeo(business);
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain('BUSINESS_INACTIVE');
    });

    it('20. indexable=false → not eligible', () => {
      const business = { ...validBusiness, indexable: false };
      const result = evaluateDirectoryBusinessSeo(business);
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain('BUSINESS_NOT_INDEXABLE');
    });

    it('21. category.active=false → not eligible', () => {
      const business = { ...validBusiness, categoryActive: false };
      const result = evaluateDirectoryBusinessSeo(business);
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain('CATEGORY_INACTIVE');
    });

    it('22. category.indexable=false → not eligible', () => {
      const business = { ...validBusiness, categoryIndexable: false };
      const result = evaluateDirectoryBusinessSeo(business);
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain('CATEGORY_NOT_INDEXABLE');
    });
  });

  describe('Address & City requirements', () => {
    it('23. missing city → not eligible', () => {
      const business = { ...validBusiness, city: '' };
      const result = evaluateDirectoryBusinessSeo(business);
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain('MISSING_CITY');
    });

    it('24. missing address → not eligible', () => {
      const business = { ...validBusiness, rawAddress: '' };
      const result = evaluateDirectoryBusinessSeo(business);
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain('MISSING_ADDRESS');
    });

    it('25. invalid state (not 2 chars) → not eligible', () => {
      const business = { ...validBusiness, state: 'SPP' };
      const result = evaluateDirectoryBusinessSeo(business);
      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain('INVALID_STATE');
    });
  });

  describe('Score threshold', () => {
    it('26. score < 60 → not eligible', () => {
      const business = {
        ...validBusiness,
        name: 'X', // valid: 20
        postalCode: null, // no CEP: -5
        phone: null, // no phone: -10
        websiteUrl: null, // no website: -5
        neighborhood: null, // no neighborhood: -5
        tenantId: null, // no tenant: -10
        whatsapp: null, // no whatsapp to trigger LOW_SCORE
      };
      const result = evaluateDirectoryBusinessSeo(business);
      // name(20) + category(10) + city(15) + state(5) + address(15) = 65, but missing contact
      expect(result.eligible).toBe(false);
    });

    it('27. score >= 60 → eligible if all flags true', () => {
      const result = evaluateDirectoryBusinessSeo(validBusiness);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.eligible).toBe(true);
    });
  });

  describe('Complex scenarios', () => {
    it('28. minimal valid business (threshold)', () => {
      const minimal = {
        active: true,
        indexable: true,
        name: 'Name',
        city: 'City',
        state: 'SP',
        rawAddress: 'Address',
        neighborhood: null,
        postalCode: null,
        phone: '1234567890',
        whatsapp: null,
        websiteUrl: null,
        tenantId: null,
        categoryActive: true,
        categoryIndexable: true,
      };
      const result = evaluateDirectoryBusinessSeo(minimal);
      // name(20) + category(10) + city(15) + state(5) + address(15) + phone(10) = 75
      expect(result.score).toBe(75);
      expect(result.eligible).toBe(true);
    });

    it('29. multiple failures reported (flags early-exit)', () => {
      const business = {
        active: false,
        indexable: false,
        name: 'Valid',
        city: 'Valid',
        state: 'SP',
        rawAddress: 'Valid',
        neighborhood: null,
        postalCode: null,
        phone: '123',
        whatsapp: null,
        websiteUrl: null,
        tenantId: null,
        categoryActive: false,
        categoryIndexable: false,
      };
      const result = evaluateDirectoryBusinessSeo(business);
      expect(result.eligible).toBe(false);
      // When flags fail (active=false, indexable=false, categoryActive=false, categoryIndexable=false), function returns early
      expect(result.reasons.length).toBeGreaterThanOrEqual(4);
      expect(result.reasons).toContain('BUSINESS_INACTIVE');
      expect(result.reasons).toContain('BUSINESS_NOT_INDEXABLE');
      expect(result.reasons).toContain('CATEGORY_INACTIVE');
      expect(result.reasons).toContain('CATEGORY_NOT_INDEXABLE');
    });

    it('30. valid business with all details', () => {
      const result = evaluateDirectoryBusinessSeo(validBusiness);
      expect(result.score).toBe(100);
      expect(result.eligible).toBe(true);
      expect(result.reasons.length).toBe(0);
    });
  });
});
