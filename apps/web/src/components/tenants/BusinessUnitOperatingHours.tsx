import {
  BusinessUnitOperatingHoursResponseSchema,
  ReplaceBusinessUnitOperatingHoursRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient, HttpError } from '../../lib/http.js';

const weekdays = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

interface DraftPeriod {
  weekday: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

export function BusinessUnitOperatingHours({
  tenantPublicId,
  unitPublicId,
}: {
  tenantPublicId: string;
  unitPublicId: string;
}) {
  const queryClient = useQueryClient();
  const [edited, setEdited] = useState<DraftPeriod[] | null>(null);
  const url = `/tenant/units/${unitPublicId}/operating-hours`;
  const hours = useQuery({
    queryKey: ['unit-operating-hours', url],
    queryFn: () =>
      httpClient.request(url, { schema: BusinessUnitOperatingHoursResponseSchema, tenantPublicId }),
    retry: false,
  });
  const periods =
    edited ??
    hours.data?.items.map((item) => ({
      weekday: item.weekday,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      active: item.active,
    })) ??
    [];
  const save = useMutation({
    mutationFn: () =>
      httpClient.request(url, {
        method: 'PUT',
        body: ReplaceBusinessUnitOperatingHoursRequestSchema.parse({ periods }),
        schema: BusinessUnitOperatingHoursResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setEdited(null);
      await queryClient.invalidateQueries({ queryKey: ['unit-operating-hours', url] });
    },
  });
  const addPeriod = () => {
    setEdited([...periods, { weekday: 1, startsAt: '09:00', endsAt: '18:00', active: true }]);
  };
  const updatePeriod = (index: number, changes: Partial<DraftPeriod>) => {
    setEdited(periods.map((period, i) => (i === index ? { ...period, ...changes } : period)));
  };
  const removePeriod = (index: number) => {
    setEdited(periods.filter((_period, i) => i !== index));
  };
  const errorMessage =
    save.error instanceof HttpError
      ? save.error.message
      : save.error instanceof Error
        ? save.error.message
        : null;
  return (
    <section className="platform-form">
      <h4>Horário de funcionamento</h4>
      {hours.isPending ? <p>Carregando horário…</p> : null}
      {hours.error instanceof Error ? (
        <p className="form-error">Não foi possível carregar o horário de funcionamento.</p>
      ) : null}
      {periods.length === 0 ? (
        <p>
          Nenhum horário configurado. A unidade não terá restrição de horário na disponibilidade.
        </p>
      ) : null}
      {periods.map((period, index) => (
        <div className="form-grid" key={`${String(index)}-${String(period.weekday)}`}>
          <label>
            Dia da semana
            <select
              value={period.weekday}
              onChange={(event) => {
                updatePeriod(index, { weekday: Number(event.target.value) });
              }}
            >
              {weekdays.map((name, day) => (
                <option key={name} value={day}>
                  {name}
                </option>
              ))}
            </select>
          </label>
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
          <label>
            <input
              checked={period.active}
              type="checkbox"
              onChange={(event) => {
                updatePeriod(index, { active: event.target.checked });
              }}
            />
            {' Aberto'}
          </label>
          <button
            type="button"
            onClick={() => {
              removePeriod(index);
            }}
          >
            Remover
          </button>
        </div>
      ))}
      <button type="button" onClick={addPeriod}>
        Adicionar período
      </button>
      <button disabled={save.isPending} type="button" onClick={() => void save.mutateAsync()}>
        {save.isPending ? 'Salvando…' : 'Salvar horário de funcionamento'}
      </button>
      {errorMessage !== null && (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
