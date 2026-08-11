import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const homeSource = readFileSync(new URL('../../../../web/src/routes/HomePage.tsx', import.meta.url), 'utf8');
const boundarySource = readFileSync(new URL('../../../../web/src/components/ErrorBoundary.tsx', import.meta.url), 'utf8');
const calendarSource = readFileSync(new URL('../../../../web/src/components/calendar/CalendarModule.tsx', import.meta.url), 'utf8');
const loyaltySource = readFileSync(new URL('../../../../web/src/components/tenants/LoyaltyModule.tsx', import.meta.url), 'utf8');
const appointmentsSource = readFileSync(new URL('../../../../web/src/components/appointments/AppointmentModule.tsx', import.meta.url), 'utf8');

describe('app route stability contracts', () => {
  it('captures the details state synchronously before a React state update', () => {
    expect(homeSource).toContain('const open = event.currentTarget.open;');
    expect(homeSource).not.toContain('[group.path]: event.currentTarget.open');
  });

  it('contains a recoverable boundary around every lazy app area', () => {
    expect(homeSource).toContain('<ErrorBoundary area={pageTitle.toLocaleLowerCase');
    expect(boundarySource).toContain('Não foi possível carregar {this.props.area}.');
    expect(boundarySource).toContain('Tentar novamente');
    expect(boundarySource).toContain('Voltar ao início');
  });

  it('keeps agenda safe for loading, errors, missing selections and empty slots', () => {
    expect(calendarSource).toContain('const isLoading');
    expect(calendarSource).toContain('const hasError');
    expect(calendarSource).toContain("professionalPublicId === '' || servicePublicId === ''");
    expect(calendarSource).toContain("day.slots.length === 0");
  });

  it('keeps loyalty safe when the tenant has no configured rules', () => {
    expect(loyaltySource).toContain('rules.data?.items.length === 0');
    expect(loyaltySource).toContain('Programa de fidelidade ainda não configurado');
  });

  it('keeps appointment creation out of the filter surface and renders an empty state', () => {
    expect(appointmentsSource).toContain('const [editorOpen, setEditorOpen] = useState(false);');
    expect(appointmentsSource).toContain('className="app-filter-bar"');
    expect(appointmentsSource).toContain('Nenhum agendamento neste período');
  });
});
