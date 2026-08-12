import { ProfessionalPublicSchema } from '@plataforma/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CommissionOverview, ProfileOverview, ProfileTabs } from './ProfessionalProfileViews.js';

const professional = ProfessionalPublicSchema.parse({
  publicId: '00000000-0000-4000-8000-000000000001',
  name: 'Nome cadastrado',
  publicName: 'Nome público',
  bio: 'Biografia profissional',
  photoUrl: null,
  phone: '(11) 99999-9999',
  email: 'profissional@example.com',
  professionalDocument: 'REG-123',
  specialties: ['Especialidade cadastrada'],
  calendarColor: '#2563EB',
  sortOrder: 0,
  active: true,
  primaryUnitPublicId: null,
  userPublicId: null,
  commissionType: 'PERCENTAGE',
  commissionValue: 20,
  customFields: {},
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
});

describe('ProfessionalProfileViews', () => {
  it('apresenta o perfil em modo visual com os dados persistidos', () => {
    const markup = renderToStaticMarkup(
      <ProfileOverview
        professional={professional}
        unitName="Unidade cadastrada"
        onEdit={vi.fn()}
      />,
    );

    expect(markup).toContain('Nome cadastrado');
    expect(markup).toContain('Nome público');
    expect(markup).toContain('profissional@example.com');
    expect(markup).toContain('Unidade cadastrada');
    expect(markup).toContain('Editar informações');
  });

  it('traduz a comissão percentual para leitura humana', () => {
    const markup = renderToStaticMarkup(
      <CommissionOverview professional={professional} onEdit={vi.fn()} />,
    );

    expect(markup).toContain('20%');
    expect(markup).toContain('Editar regra');
  });

  it('marca a guia ativa para navegação direta', () => {
    const markup = renderToStaticMarkup(<ProfileTabs value="schedule" onChange={vi.fn()} />);

    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('Agenda');
  });
});
