import {
  ProfessionalScheduleResponseSchema,
  UpsertProfessionalScheduleRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { httpClient } from '../../lib/http.js';

const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const workdays = [1, 2, 3, 4, 5];
interface Pause { startsAt: string; endsAt: string }
interface Day { active: boolean; startsAt: string; endsAt: string; pauses: Pause[] }
type Week = Record<number, Day>;

export function buildSchedulePeriods(
  draft: { weekday: string; startsAt: string; endsAt: string; unitPublicId: string },
  lunchBreak?: Pause,
) {
  const windows = lunchBreak === undefined ? [{ startsAt: draft.startsAt, endsAt: draft.endsAt }] : [{ startsAt: draft.startsAt, endsAt: lunchBreak.startsAt }, { startsAt: lunchBreak.endsAt, endsAt: draft.endsAt }];
  return windows.map((window) => ({ weekday: Number(draft.weekday), ...window, unitPublicId: draft.unitPublicId || null, active: true }));
}

const defaultDay = (active = false): Day => ({ active, startsAt: '09:00', endsAt: '18:00', pauses: active ? [{ startsAt: '12:00', endsAt: '13:00' }] : [] });
const defaultWeek = (): Week => Object.fromEntries(days.map((_, weekday) => [weekday, defaultDay(weekday > 0)]));
const cloneDay = (day: Day): Day => ({ ...day, pauses: day.pauses.map((pause) => ({ ...pause })) });

const toWeek = (items: { weekday: number; startsAt: string; endsAt: string; active: boolean }[]): Week => {
  const week = defaultWeek();
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const periods = items.filter((item) => item.weekday === weekday && item.active).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    if (periods.length === 0) { week[weekday] = defaultDay(false); continue; }
    const pauses: Pause[] = [];
    for (let index = 1; index < periods.length; index += 1) {
      const before = periods[index - 1]; const after = periods[index];
      if (before !== undefined && after !== undefined && before.endsAt < after.startsAt) pauses.push({ startsAt: before.endsAt, endsAt: after.startsAt });
    }
    const first = periods[0]; const last = periods.at(-1);
    if (first !== undefined && last !== undefined) week[weekday] = { active: true, startsAt: first.startsAt, endsAt: last.endsAt, pauses };
  }
  return week;
};

const validate = (week: Week) => {
  for (const day of Object.values(week)) {
    if (!day.active) continue;
    if (day.endsAt <= day.startsAt) return 'O horário final deve ser posterior ao inicial.';
    for (const pause of day.pauses) {
      if (pause.endsAt <= pause.startsAt) return 'O final da pausa deve ser posterior ao início.';
      if (pause.startsAt < day.startsAt || pause.endsAt > day.endsAt) return 'A pausa deve estar dentro do horário de atendimento.';
    }
    const pauses = [...day.pauses].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    if (pauses.some((pause, index) => index > 0 && pause.startsAt < (pauses[index - 1]?.endsAt ?? ''))) return 'As pausas não podem se sobrepor.';
  }
  return null;
};

const toPeriods = (week: Week) => Object.entries(week).flatMap(([key, day]) => {
  const weekday = Number(key);
  const value = day;
  if (!value.active) return [];
  const bounds = [value.startsAt, ...value.pauses.flatMap((pause) => [pause.startsAt, pause.endsAt]), value.endsAt];
  return Array.from({ length: bounds.length / 2 }, (_, index) => ({ weekday, startsAt: bounds[index * 2] ?? value.startsAt, endsAt: bounds[index * 2 + 1] ?? value.endsAt, unitPublicId: null, active: true }));
});

export function ProfessionalSchedule({ tenantPublicId, professionalPublicId }: { tenantPublicId: string; professionalPublicId: string }) {
  const client = useQueryClient();
  const [week, setWeek] = useState<Week>(defaultWeek);
  const [saved, setSaved] = useState<Week>(defaultWeek);
  const [copyFrom, setCopyFrom] = useState<number | null>(null);
  const [copyDays, setCopyDays] = useState<number[]>([]);
  const key = ['professional-schedule', professionalPublicId];
  const schedule = useQuery({ queryKey: key, queryFn: () => httpClient.request(`/tenant/professionals/${professionalPublicId}/schedule`, { schema: ProfessionalScheduleResponseSchema, tenantPublicId }), retry: false });
  // The query result is the persistent source of truth; hydrate the editable draft when it arrives.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (schedule.data !== undefined) { const value = toWeek(schedule.data.items); setWeek(value); setSaved(value); } }, [schedule.data]);
  const error = validate(week);
  const dirty = JSON.stringify(week) !== JSON.stringify(saved);
  const save = useMutation({
    mutationFn: () => httpClient.request(`/tenant/professionals/${professionalPublicId}/schedule`, { method: 'PUT', body: UpsertProfessionalScheduleRequestSchema.parse({ periods: toPeriods(week) }), schema: ProfessionalScheduleResponseSchema, tenantPublicId }),
    onSuccess: async (data) => { const value = toWeek(data.items); setWeek(value); setSaved(value); await client.invalidateQueries({ queryKey: key }); },
  });
  const updateDay = (weekday: number, change: Partial<Day>) => { setWeek((current) => ({ ...current, [weekday]: { ...(current[weekday] ?? defaultDay()), ...change } })); };
  const copy = () => { if (copyFrom === null) return; setWeek((current) => { const next = { ...current }; const source = current[copyFrom] ?? defaultDay(); for (const day of copyDays) next[day] = cloneDay(source); return next; }); setCopyFrom(null); setCopyDays([]); };
  const summary = useMemo(() => {
    const weekdaysSame = workdays.every((day) => JSON.stringify(week[day]) === JSON.stringify(week[1]));
    const monday = week[1] ?? defaultDay(); const saturday = week[6] ?? defaultDay(); const sunday = week[0] ?? defaultDay();
    return `${weekdaysSame ? `Seg–Sex ${monday.active ? `${monday.startsAt}–${monday.endsAt}` : 'fechado'}` : 'Horários personalizados'} · Sáb ${saturday.active ? `${saturday.startsAt}–${saturday.endsAt}` : 'fechado'} · Dom ${sunday.active ? `${sunday.startsAt}–${sunday.endsAt}` : 'fechado'}`;
  }, [week]);
  if (schedule.isPending) return <section className="professional-settings-card"><p>Carregando agenda…</p></section>;
  return <section className="professional-settings-card weekly-schedule" aria-label="Agenda semanal">
    <header className="settings-card-header"><div><span className="settings-card-icon" aria-hidden="true">◷</span><div><h4>Agenda semanal</h4><p>{summary}</p></div></div><button className="secondary-button" type="button" onClick={() => { const value = defaultWeek(); setWeek(value); }}>Usar agenda padrão</button></header>
    {schedule.data?.items.length === 0 ? <div className="schedule-empty"><strong>Este profissional ainda não tem agenda.</strong><span>Use a agenda padrão como ponto de partida e ajuste quando quiser.</span></div> : null}
    <div className="week-grid">
      {days.map((name, weekday) => { const day = week[weekday] ?? defaultDay(); return <article className={`week-day${day.active ? '' : ' closed'}`} key={name}>
        <div className="week-day-heading"><strong>{name}</strong><label className="toggle"><input checked={day.active} type="checkbox" onChange={(event) => { updateDay(weekday, { active: event.target.checked, pauses: event.target.checked ? day.pauses : [] }); }} /><span />Atende neste dia</label></div>
        {!day.active ? <p>Fechado</p> : <><div className="time-row"><input aria-label={`Início ${name}`} type="time" value={day.startsAt} onChange={(event) => { updateDay(weekday, { startsAt: event.target.value }); }} /><span>—</span><input aria-label={`Fim ${name}`} type="time" value={day.endsAt} onChange={(event) => { updateDay(weekday, { endsAt: event.target.value }); }} /></div>
          {day.pauses.map((pause, index) => <div className="pause-row" key={`${String(weekday)}-${String(index)}`}><small>Pausa</small><input type="time" value={pause.startsAt} onChange={(event) => { updateDay(weekday, { pauses: day.pauses.map((item, itemIndex) => itemIndex === index ? { ...item, startsAt: event.target.value } : item) }); }} /><span>—</span><input type="time" value={pause.endsAt} onChange={(event) => { updateDay(weekday, { pauses: day.pauses.map((item, itemIndex) => itemIndex === index ? { ...item, endsAt: event.target.value } : item) }); }} /><button className="text-button" type="button" onClick={() => { updateDay(weekday, { pauses: day.pauses.filter((_, itemIndex) => itemIndex !== index) }); }}>Remover</button></div>)}
           <div className="day-actions"><button className="text-button" type="button" onClick={() => { updateDay(weekday, { pauses: [...day.pauses, { startsAt: '12:00', endsAt: '13:00' }] }); }}>+ Adicionar pausa</button><button className="text-button" type="button" onClick={() => { setCopyFrom(weekday); setCopyDays([]); }}>Copiar horário</button>{workdays.includes(weekday) ? <button className="text-button" type="button" onClick={() => { setWeek((current) => ({ ...current, ...Object.fromEntries(workdays.filter((item) => item !== weekday).map((item) => [item, cloneDay(current[weekday] ?? defaultDay())])) })); }}>Aplicar aos dias úteis</button> : null}</div></>}
      </article>; })}
    </div>
    {error !== null ? <p className="form-error" role="alert">{error}</p> : null}
    {save.error instanceof Error ? <p className="form-error" role="alert">{save.error.message}</p> : null}
    {dirty ? <div className="schedule-save-bar"><span>Alterações não salvas</span><div><button className="secondary-button" type="button" onClick={() => { setWeek(saved); }}>Descartar</button><button className="primary-button" disabled={error !== null || save.isPending} type="button" onClick={() => { save.mutate(); }}>{save.isPending ? 'Salvando…' : 'Salvar agenda'}</button></div></div> : null}
    {copyFrom !== null ? <div className="schedule-copy-modal" role="dialog" aria-modal="true" aria-label="Copiar horário"><div><h4>Copiar configuração de {days[copyFrom]}</h4><p>Copie atendimento e pausas. Exceções por data não são alteradas.</p><div className="copy-options">{days.map((name, day) => day === copyFrom ? null : <label key={name}><input checked={copyDays.includes(day)} type="checkbox" onChange={() => { setCopyDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day]); }} />{name}</label>)}</div><div className="form-actions"><button className="secondary-button" type="button" onClick={() => { setCopyDays(workdays.filter((day) => day !== copyFrom)); }}>Selecionar dias úteis</button><button className="secondary-button" type="button" onClick={() => { setCopyDays(days.map((_, day) => day).filter((day) => day !== copyFrom)); }}>Selecionar todos</button><button className="primary-button" disabled={copyDays.length === 0} type="button" onClick={copy}>Aplicar</button><button className="text-button" type="button" onClick={() => { setCopyFrom(null); }}>Cancelar</button></div></div></div> : null}
  </section>;
}
