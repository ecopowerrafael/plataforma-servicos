import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const moduleSource = readFileSync(new URL('./AppointmentModule.tsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../../appointments-console.css', import.meta.url), 'utf8');

function cssBlock(selector: string) {
  const start = stylesSource.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = stylesSource.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return stylesSource.slice(start, end);
}

describe('appointment status filter chips UI contract', () => {
  it('renders status filters in the isolated appointments chip group', () => {
    expect(moduleSource).toContain('className="appointments-chips"');
    expect(moduleSource).toContain('Filtros rápidos');
    for (const label of [
      'Todos',
      'Pendentes',
      'Confirmados',
      'Em atendimento',
      'Concluídos',
      'Cancelados',
      'Faltas',
      'Hoje',
    ]) {
      expect(moduleSource).toContain(label);
    }
  });

  it('keeps appointment status chips compact without relying on global buttons', () => {
    const consoleStyles = cssBlock('.appointments-console');
    const containerStyles = cssBlock('.appointments-chips');
    const chipStyles = cssBlock('.app-shell .appointments-chips button');
    expect(consoleStyles).toContain('display: flex;');
    expect(consoleStyles).toContain('flex-direction: column;');
    expect(consoleStyles).toContain('gap: 12px;');
    expect(containerStyles).toContain('align-items: center;');
    expect(containerStyles).toContain('align-content: flex-start;');
    expect(containerStyles).toContain('align-self: start;');
    expect(containerStyles).toContain('display: flex;');
    expect(containerStyles).toContain('flex-wrap: wrap;');
    expect(containerStyles).toContain('gap: 8px;');
    expect(containerStyles).toContain('margin: 0;');
    expect(chipStyles).toContain('height: 36px;');
    expect(chipStyles).toContain('min-height: 36px;');
    expect(chipStyles).toContain('max-height: 36px;');
    expect(chipStyles).toContain('padding: 0 14px;');
    expect(chipStyles).toContain('line-height: 1;');
    expect(chipStyles).toContain('font-size: 13px;');
    expect(chipStyles).toContain('display: inline-flex;');
    expect(chipStyles).toContain('white-space: nowrap;');
    expect(chipStyles).not.toContain('min-height: 2.1rem;');
    expect(chipStyles).not.toContain('padding: 0.3rem 0.85rem;');
  });
});
