import { describe, expect, it } from 'vitest';

import { UpdateMyProfessionalProfileRequestSchema } from '@plataforma/shared';

describe('perfil SELF do profissional', () => {
  it('aceita somente dados de apresentação e contato', () => {
    expect(UpdateMyProfessionalProfileRequestSchema.safeParse({ name: 'Ana', publicName: 'Ana', phone: '11999999999', bio: 'Cabeleireira' }).success).toBe(true);
    for (const field of ['commissionPercentage', 'role', 'tenantId', 'status'])
      expect(UpdateMyProfessionalProfileRequestSchema.safeParse({ name: 'Ana', publicName: 'Ana', [field]: 'alterar' }).success).toBe(false);
  });
});
