import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const homeSource = readFileSync(new URL('../../../../web/src/routes/HomePage.tsx', import.meta.url), 'utf8');
const boundarySource = readFileSync(new URL('../../../../web/src/components/ErrorBoundary.tsx', import.meta.url), 'utf8');
const calendarSource = readFileSync(new URL('../../../../web/src/components/calendar/CalendarModule.tsx', import.meta.url), 'utf8');
const loyaltySource = readFileSync(new URL('../../../../web/src/components/tenants/LoyaltyModule.tsx', import.meta.url), 'utf8');
const appointmentsSource = readFileSync(new URL('../../../../web/src/components/appointments/AppointmentModule.tsx', import.meta.url), 'utf8');
const agendaOverviewSource = readFileSync(new URL('../../../../web/src/components/agenda/AgendaOverviewModule.tsx', import.meta.url), 'utf8');

describe('app route stability contracts', () => {
  it('captures the details state synchronously before a React state update', () => {
    expect(homeSource).toContain('const open = event.currentTarget.open;');
    expect(homeSource).not.toContain('[group.path]: event.currentTarget.open');
  });

  it('contains a recoverable boundary around every lazy app area', () => {
    // A prop continua a mesma; só a formatação passou a quebrar linha.
    expect(homeSource).toMatch(/<ErrorBoundary\s+area=\{pageTitle\.toLocaleLowerCase/u);
    expect(boundarySource).toContain('Não foi possível carregar {this.props.area}.');
    expect(boundarySource).toContain('Tentar novamente');
    expect(boundarySource).toContain('Voltar ao início');
  });

  it('keeps agenda safe for loading, errors, missing selections and empty slots', () => {
    // Os estados passaram a vir direto das queries, mas a cobertura é a mesma.
    expect(calendarSource).toContain('appointments.isPending');
    expect(calendarSource).toContain('<AgendaSkeleton />');
    expect(calendarSource).toContain('appointments.error instanceof Error');
    expect(calendarSource).toContain('Não foi possível carregar a agenda.');
    expect(calendarSource).toContain('availability.error instanceof Error');
    expect(calendarSource).toContain("professionalPublicId !== '' && servicePublicId === ''");
    expect(calendarSource).toContain('slotsByDate[date] ?? []');
  });

  it('keeps the agenda overview loading, error and empty states independent', () => {
    expect(agendaOverviewSource).toContain('overview.isPending');
    expect(agendaOverviewSource).toContain('overview.error instanceof Error');
    expect(agendaOverviewSource).toContain('list.error instanceof Error');
    // Falha de um bloco não pode derrubar o outro: cada consulta tem seu retry.
    expect(agendaOverviewSource).toContain('void overview.refetch();');
    expect(agendaOverviewSource).toContain('void list.refetch();');
    expect(agendaOverviewSource).toContain('Nenhum atendimento neste período');
  });

  it('keeps loyalty safe when the tenant has no configured rules', () => {
    expect(loyaltySource).toContain('(rules.data?.items.length ?? 0) === 0');
    expect(loyaltySource).toContain('Programa de fidelidade ainda não configurado');
  });

  it('keeps appointment creation out of the filter surface and renders an empty state', () => {
    // A criação virou um diálogo próprio, acionado pelo cabeçalho — nunca pela barra de filtros.
    expect(appointmentsSource).toContain('<AppointmentEditorDialog');
    expect(appointmentsSource).toContain('setEditor({ appointment: null });');
    expect(appointmentsSource).toContain('className="app-filter-bar appointments-filters"');
    expect(appointmentsSource).toContain('Nenhum agendamento encontrado com estes filtros.');
    expect(appointmentsSource).toContain('list.error instanceof Error');
    expect(appointmentsSource).toContain('Não foi possível carregar os agendamentos.');
  });
});
