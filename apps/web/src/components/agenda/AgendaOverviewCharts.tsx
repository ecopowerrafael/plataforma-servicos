import { type AgendaOverviewResponse } from '@plataforma/shared';

import { initials, percentOf, STATUS_COLORS } from './agenda-overview.js';
import { APPOINTMENT_STATUS_LABELS } from '../appointments/appointment-status.js';

/** Donut leve em SVG: o projeto não usa biblioteca de gráficos e não vale adicionar uma. */
export function AgendaStatusDonut({ byStatus }: { byStatus: AgendaOverviewResponse['byStatus'] }) {
  const entries = byStatus.filter((entry) => entry.total > 0);
  const total = entries.reduce((sum, entry) => sum + entry.total, 0);
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  // Deslocamento acumulado de cada fatia, calculado antes da renderização.
  const arcs = entries.map((entry, index) => {
    const previous = entries
      .slice(0, index)
      .reduce((sum, item) => sum + (item.total / total) * circumference, 0);
    return { entry, length: (entry.total / total) * circumference, offset: previous };
  });
  return (
    <div className="agenda-donut">
      <svg viewBox="0 0 160 160" role="img" aria-label="Agendamentos por status">
        <circle cx="80" cy="80" r={radius} className="agenda-donut-track" />
        {arcs.map(({ entry, length, offset }) => {
          const dash = `${String(length)} ${String(circumference - length)}`;
          const rotation = -90 + (offset / circumference) * 360;
          return (
            <circle
              key={entry.status}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={STATUS_COLORS[entry.status]}
              strokeWidth="20"
              strokeDasharray={dash}
              transform={`rotate(${String(rotation)} 80 80)`}
            />
          );
        })}
        <text x="80" y="76" className="agenda-donut-value">
          {total}
        </text>
        <text x="80" y="94" className="agenda-donut-label">
          agendamentos
        </text>
      </svg>
      <ul className="agenda-donut-legend">
        {byStatus.map((entry) => (
          <li key={entry.status}>
            <i style={{ background: STATUS_COLORS[entry.status] }} />
            <span>{APPOINTMENT_STATUS_LABELS[entry.status]}</span>
            <strong>{entry.total}</strong>
            <small>{percentOf(entry.total, total)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AgendaProfessionalRanking({
  items,
  selected,
  onSelect,
}: {
  items: AgendaOverviewResponse['byProfessional'];
  selected: string;
  onSelect: (professionalPublicId: string) => void;
}) {
  const max = items.reduce((highest, item) => Math.max(highest, item.total), 0);
  return (
    <ul className="agenda-ranking">
      {items.map((item) => (
        <li key={item.professionalPublicId}>
          <button
            type="button"
            className={selected === item.professionalPublicId ? 'is-active' : ''}
            aria-pressed={selected === item.professionalPublicId}
            onClick={() => {
              onSelect(selected === item.professionalPublicId ? '' : item.professionalPublicId);
            }}
          >
            <span className="agenda-avatar" aria-hidden="true">
              {initials(item.professionalName)}
            </span>
            <span className="agenda-ranking-name">{item.professionalName}</span>
            <span className="ds-usage">
              <span style={{ width: `${String(max === 0 ? 0 : (item.total / max) * 100)}%` }} />
            </span>
            <strong>{item.total}</strong>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AgendaHourChart({ items }: { items: AgendaOverviewResponse['byHour'] }) {
  const max = items.reduce((highest, item) => Math.max(highest, item.total), 0);
  const first = items[0]?.hour ?? 8;
  const last = items[items.length - 1]?.hour ?? 18;
  const hours = Array.from({ length: last - first + 1 }, (_, index) => first + index);
  return (
    <ul className="agenda-hour-chart">
      {hours.map((hour) => {
        const total = items.find((item) => item.hour === hour)?.total ?? 0;
        return (
          <li key={hour}>
            <span
              className="agenda-hour-bar"
              style={{ height: `${String(max === 0 ? 0 : (total / max) * 100)}%` }}
              title={`${String(total)} agendamento(s)`}
            />
            <strong>{total}</strong>
            <small>{String(hour).padStart(2, '0')}h</small>
          </li>
        );
      })}
    </ul>
  );
}
