import { describe, expect, it } from 'vitest';

import { getLinkedSelectionIds } from './ProfessionalServiceLinks.js';

describe('getLinkedSelectionIds', () => {
  it('hydrates all linked services for a professional', () => {
    const selected = getLinkedSelectionIds(
      [
        { servicePublicId: 'service-1', professionalPublicId: 'professional-1' },
        { servicePublicId: 'service-2', professionalPublicId: 'professional-1' },
        { servicePublicId: 'service-3', professionalPublicId: 'professional-1' },
        { servicePublicId: 'service-4', professionalPublicId: 'professional-1' },
      ],
      true,
    );

    expect(selected).toEqual(new Set(['service-1', 'service-2', 'service-3', 'service-4']));
    expect(selected.size).toBe(4);
  });
});
