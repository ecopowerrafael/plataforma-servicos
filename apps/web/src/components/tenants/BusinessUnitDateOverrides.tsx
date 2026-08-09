import {
  BusinessUnitDateOverridesResponseSchema,
  BusinessUnitDateOverrideDaySchema,
  BusinessUnitDateOverrideStatusResponseSchema,
  ReplaceBusinessUnitDateOverrideRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient, HttpError } from '../../lib/http.js';

interface DraftPeriod {
  startsAt: string;
  endsAt: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDaysIso = (days: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export function BusinessUnitDateOverrides({
  tenantPublicId,
  unitPublicId,
}: {
  tenantPublicId: string;
  unitPublicId: string;
}) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayIso());
  const [type, setType] = useState<'EXCEPTION' | 'HOLIDAY'>('EXCEPTION');
  const [closed, setClosed] = useState(true);
  const [title, setTitle] = useState('');
  const [periods, setPeriods] = useState<DraftPeriod[]>([{ startsAt: '09:00', endsAt: '18:00' }]);

  const from = todayIso();
  const to = addDaysIso(180);
  const listUrl = `/tenant/units/${unitPublicId}/date-overrides?from=${from}&to=${to}`;
  const list = useQuery({
    queryKey: ['unit-date-overrides', unitPublicId, from, to],
    queryFn: () =>
      httpClient.request(listUrl, {
        schema: BusinessUnitDateOverridesResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['unit-date-overrides', unitPublicId] });

  const save = useMutation({
    mutationFn: () =>
      httpClient.request(`/tenant/units/${unitPublicId}/date-overrides/${date}`, {
        method: 'PUT',
        body: ReplaceBusinessUnitDateOverrideRequestSchema.parse({
          type,
          closed,
          title: title.trim() === '' ? null : title.trim(),
          periods: closed ? [] : periods,
        }),
        schema: BusinessUnitDateOverrideDaySchema,
        tenantPublicId,
      }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (overrideDate: string) =>
      httpClient.request(`/tenant/units/${unitPublicId}/date-overrides/${overrideDate}`, {
        method: 'DELETE',
        schema: BusinessUnitDateOverrideStatusResponseSchema,
        tenantPublicId,
      }),
    onSuccess: invalidate,
  });

  const load = (item: {
    date: string;
    type: 'EXCEPTION' | 'HOLIDAY';
    closed: boolean;
    title: string | null;
    periods: DraftPeriod[];
  }) => {
    setDate(item.date);
    setType(item.type);
    setClosed(item.closed);
    setTitle(item.title ?? '');
    setPeriods(item.periods.length > 0 ? item.periods : [{ startsAt: '09:00', endsAt: '18:00' }]);
  };

  const addPeriod = () => {
    setPeriods((current) => [...current, { startsAt: '09:00', endsAt: '18:00' }]);
  };
  const updatePeriod = (index: number, changes: Partial<DraftPeriod>) => {
    setPeriods((current) =>
      current.map((period, i) => (i === index ? { ...period, ...changes } : period)),
    );
  };
  const removePeriod = (index: number) => {
    setPeriods((current) => current.filter((_period, i) => i !== index));
  };

  const errorMessage =
    save.error instanceof HttpError
      ? save.error.message
      : save.error instanceof Error
        ? save.error.message
        : null;

  return (
    <section className="platform-form">
      <h4>Exceções e feriados</h4>
      <p className="muted">
        Uma exceção específica da data tem prioridade sobre um feriado, que tem prioridade sobre o
        horário semanal.
      </p>
      <div className="form-grid">
        <label>
          Data
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
            }}
          />
        </label>
        <label>
          Tipo
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value as 'EXCEPTION' | 'HOLIDAY');
            }}
          >
            <option value="EXCEPTION">Exceção</option>
            <option value="HOLIDAY">Feriado</option>
          </select>
        </label>
        <label>
          Título (opcional)
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </label>
        <label>
          <input
            checked={closed}
            type="checkbox"
            onChange={(event) => {
              setClosed(event.target.checked);
            }}
          />
          {' Fechar o dia inteiro'}
        </label>
      </div>
      {!closed && (
        <fieldset>
          <legend>Horário especial</legend>
          {periods.map((period, index) => (
            <div className="form-grid" key={String(index)}>
              <label>
                Início
                <input
                  type="time"
                  value={period.startsAt}
                  onChange={(event) => {
                    updatePeriod(index, { startsAt: event.target.value });
                  }}
                />
              </label>
              <label>
                Término
                <input
                  type="time"
                  value={period.endsAt}
                  onChange={(event) => {
                    updatePeriod(index, { endsAt: event.target.value });
                  }}
                />
              </label>
              <button
                disabled={periods.length <= 1}
                type="button"
                onClick={() => {
                  removePeriod(index);
                }}
              >
                Remover período
              </button>
            </div>
          ))}
          <button type="button" onClick={addPeriod}>
            Adicionar período
          </button>
        </fieldset>
      )}
      <button disabled={save.isPending} type="button" onClick={() => void save.mutateAsync()}>
        {save.isPending ? 'Salvando…' : 'Salvar exceção/feriado'}
      </button>
      {errorMessage !== null && (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      )}
      {list.isPending ? <p>Carregando exceções…</p> : null}
      {list.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar as exceções.</p>
      ) : null}
      {list.data?.items.length === 0 ? (
        <p>Nenhuma exceção ou feriado nos próximos 180 dias.</p>
      ) : null}
      <ul>
        {list.data?.items.map((item) => (
          <li key={item.date}>
            <span>{`${item.date} · ${item.type === 'HOLIDAY' ? 'Feriado' : 'Exceção'}${item.title === null ? '' : ` · ${item.title}`}`}</span>
            <span>
              {item.closed
                ? ' Fechado'
                : ` ${item.periods.map((period) => `${period.startsAt}-${period.endsAt}`).join(', ')}`}
            </span>
            <button
              type="button"
              onClick={() => {
                load(item);
              }}
            >
              Editar
            </button>
            <button
              disabled={remove.isPending}
              type="button"
              onClick={() => void remove.mutateAsync(item.date)}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
