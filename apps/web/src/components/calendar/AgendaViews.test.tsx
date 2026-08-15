import { AppointmentPublicSchema, AvailabilitySlotSchema } from '@plataforma/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AppointmentCard, CalendarDay, CalendarMonth } from './AgendaViews.js';

const appointment = AppointmentPublicSchema.parse({
  publicId: '00000000-0000-4000-8000-000000000001',
  protocol: 'AG-001',
  customerPublicId: '00000000-0000-4000-8000-000000000002',
  customerPhone: '11999999999',
  customerName: 'Cliente da agenda',
  professionalPublicId: '00000000-0000-4000-8000-000000000003',
  professionalName: 'Profissional real',
  servicePublicId: '00000000-0000-4000-8000-000000000004',
  serviceName: 'Serviço cadastrado',
  unitPublicId: null,
  unitName: null,
  startsAt: '2026-08-11T12:00:00.000Z',
  endsAt: '2026-08-11T12:40:00.000Z',
  durationMinutes: 40,
  postServiceBreakMinutes: 0,
  priceCents: '5000',
  status: 'CONFIRMED',
  notes: null,
  source: 'INTERNAL',
  canceledReason: null,
  rescheduleReason: null,
  isFitIn: false,
  fitInReason: null,
  checkedInAt: null,
  depositType: null,
  depositPercentage: null,
  depositAmountCents: null,
  createdAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
});

describe('AgendaViews', () => {
  it('exibe as informações operacionais reais no card', () => {
    const markup = renderToStaticMarkup(<AppointmentCard item={appointment} onOpen={vi.fn()} />);

    expect(markup).toContain('Cliente da agenda');
    expect(markup).toContain('Serviço cadastrado');
    expect(markup).toContain('Profissional real');
    expect(markup).toContain('40 min');
    expect(markup).toContain('Confirmado');
  });

  it('não apresenta como livre um slot sobreposto a um agendamento', () => {
    const overlappingSlot = AvailabilitySlotSchema.parse({
      startsAt: '2026-08-11T12:30:00.000Z',
      endsAt: '2026-08-11T13:00:00.000Z',
      state: 'AVAILABLE',
      reason: null,
    });
    const markup = renderToStaticMarkup(
      <CalendarDay
        date="2026-08-11"
        appointments={[appointment]}
        slots={[overlappingSlot]}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(markup).not.toContain('Horário livre');
    expect(markup).toContain('Cliente da agenda');
  });

  it('resume o número real de agendamentos no mês', () => {
    const secondAppointment = {
      ...appointment,
      publicId: '00000000-0000-4000-8000-000000000005',
      startsAt: '2026-08-11T14:00:00.000Z',
      endsAt: '2026-08-11T14:40:00.000Z',
    };
    const markup = renderToStaticMarkup(
      <CalendarMonth
        date="2026-08-11"
        appointments={[appointment, secondAppointment]}
        onSelectDay={vi.fn()}
      />,
    );

    expect(markup).toContain('2 agendamentos');
    expect(markup).not.toContain('% ocupado');
  });
});
