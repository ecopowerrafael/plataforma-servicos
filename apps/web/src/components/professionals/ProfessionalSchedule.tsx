import {
  ProfessionalListResponseSchema,
  ProfessionalSchedulePeriodInputSchema,
  ProfessionalScheduleResponseSchema,
  SetProfessionalSchedulePeriodStatusRequestSchema,
  TenantUnitsResponseSchema,
  UpdateProfessionalSchedulePeriodRequestSchema,
  UpsertProfessionalScheduleRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

const weekdays = [
  'Domingo',
  'Segunda-feira',
  'Ter\u00e7a-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'S\u00e1bado',
] as const;

interface DraftPeriod {
  weekday: string;
  startsAt: string;
  endsAt: string;
  unitPublicId: string;
}

const initialDraft: DraftPeriod = {
  weekday: '1',
  startsAt: '09:00',
  endsAt: '18:00',
  unitPublicId: '',
};

export function ProfessionalSchedule({
  tenantPublicId,
  professionalPublicId,
}: {
  tenantPublicId: string;
  professionalPublicId: string;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftPeriod>(initialDraft);
  const [copyToWeekdays, setCopyToWeekdays] = useState<number[]>([]);
  const [professionalPublicIds, setProfessionalPublicIds] = useState<string[]>([]);
  const [editingPeriodPublicId, setEditingPeriodPublicId] = useState<string | null>(null);

  const schedule = useQuery({
    queryKey: ['professional-schedule', professionalPublicId],
    queryFn: () =>
      httpClient.request(`/tenant/professionals/${professionalPublicId}/schedule`, {
        schema: ProfessionalScheduleResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const units = useQuery({
    queryKey: ['tenant', tenantPublicId, 'units'],
    queryFn: () =>
      httpClient.request('/tenant/units', {
        schema: TenantUnitsResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const professionals = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals'],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['professional-schedule', professionalPublicId],
    });
  };
  const create = useMutation({
    mutationFn: () =>
      httpClient.request(`/tenant/professionals/${professionalPublicId}/schedule`, {
        method: 'POST',
        body: UpsertProfessionalScheduleRequestSchema.parse({
          periods: [
            ProfessionalSchedulePeriodInputSchema.parse({
              weekday: Number(draft.weekday),
              startsAt: draft.startsAt,
              endsAt: draft.endsAt,
              unitPublicId: draft.unitPublicId || null,
              active: true,
            }),
          ],
          copyToWeekdays,
          professionalPublicIds,
        }),
        schema: ProfessionalScheduleResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setCopyToWeekdays([]);
      setProfessionalPublicIds([]);
      await invalidate();
    },
  });
  const update = useMutation({
    mutationFn: () => {
      if (editingPeriodPublicId === null) throw new Error('Nenhum per\u00edodo selecionado.');
      return httpClient.request(
        `/tenant/professionals/${professionalPublicId}/schedule/${editingPeriodPublicId}`,
        {
          method: 'PATCH',
          body: UpdateProfessionalSchedulePeriodRequestSchema.parse({
            weekday: Number(draft.weekday),
            startsAt: draft.startsAt,
            endsAt: draft.endsAt,
            unitPublicId: draft.unitPublicId || null,
            active: true,
          }),
          schema: ProfessionalScheduleResponseSchema,
          tenantPublicId,
        },
      );
    },
    onSuccess: async () => {
      setEditingPeriodPublicId(null);
      setDraft(initialDraft);
      await invalidate();
    },
  });
  const setStatus = useMutation({
    mutationFn: ({ periodPublicId, active }: { periodPublicId: string; active: boolean }) =>
      httpClient.request(
        `/tenant/professionals/${professionalPublicId}/schedule/${periodPublicId}/status`,
        {
          method: 'PATCH',
          body: SetProfessionalSchedulePeriodStatusRequestSchema.parse({ active }),
          schema: ProfessionalScheduleResponseSchema,
          tenantPublicId,
        },
      ),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (periodPublicId: string) =>
      httpClient.request(
        `/tenant/professionals/${professionalPublicId}/schedule/${periodPublicId}`,
        {
          method: 'DELETE',
          schema: ProfessionalScheduleResponseSchema,
          tenantPublicId,
        },
      ),
    onSuccess: invalidate,
  });

  const busy = create.isPending || update.isPending || setStatus.isPending || remove.isPending;
  const error = create.error ?? update.error ?? setStatus.error ?? remove.error;
  const savePeriod = () => {
    if (editingPeriodPublicId === null) {
      void create.mutateAsync();
      return;
    }
    void update.mutateAsync();
  };
  const editPeriod = (period: {
    publicId: string;
    weekday: number;
    startsAt: string;
    endsAt: string;
    unitPublicId?: string | null | undefined;
  }) => {
    setEditingPeriodPublicId(period.publicId);
    setDraft({
      weekday: String(period.weekday),
      startsAt: period.startsAt,
      endsAt: period.endsAt,
      unitPublicId: period.unitPublicId ?? '',
    });
  };
  const toggleDayCopy = (day: number) => {
    setCopyToWeekdays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day],
    );
  };
  const toggleProfessional = (id: string) => {
    setProfessionalPublicIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  return (
    <section className="platform-form">
      <h4>{'Jornada semanal'}</h4>
      <p>{`Total semanal: ${String(schedule.data?.weeklyMinutes ?? 0)} minutos`}</p>
      {schedule.isPending ? <p>{'Carregando jornada\u2026'}</p> : null}
      {schedule.error instanceof Error ? <p role="alert">{schedule.error.message}</p> : null}
      <div className="form-grid">
        <label>
          {'Dia da semana'}
          <select
            value={draft.weekday}
            onChange={(event) => {
              setDraft((current) => ({ ...current, weekday: event.target.value }));
            }}
          >
            {weekdays.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {'In\u00edcio'}
          <input
            type="time"
            value={draft.startsAt}
            onChange={(event) => {
              setDraft((current) => ({ ...current, startsAt: event.target.value }));
            }}
          />
        </label>
        <label>
          {'T\u00e9rmino'}
          <input
            type="time"
            value={draft.endsAt}
            onChange={(event) => {
              setDraft((current) => ({ ...current, endsAt: event.target.value }));
            }}
          />
        </label>
        <label>
          Unidade (opcional)
          <select
            value={draft.unitPublicId}
            onChange={(event) => {
              setDraft((current) => ({ ...current, unitPublicId: event.target.value }));
            }}
          >
            <option value="">Todas as unidades</option>
            {units.data?.units.map((unit) => (
              <option key={unit.publicId} value={unit.publicId}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {editingPeriodPublicId === null ? (
        <>
          <fieldset>
            <legend>{'Copiar para outros dias'}</legend>
            {weekdays.map((name, day) => (
              <label key={name}>
                <input
                  checked={copyToWeekdays.includes(day)}
                  type="checkbox"
                  onChange={() => {
                    toggleDayCopy(day);
                  }}
                />
                {name}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>{'Aplicar a outros profissionais'}</legend>
            {professionals.data?.items
              .filter((professional) => professional.publicId !== professionalPublicId)
              .map((professional) => (
                <label key={professional.publicId}>
                  <input
                    checked={professionalPublicIds.includes(professional.publicId)}
                    type="checkbox"
                    onChange={() => {
                      toggleProfessional(professional.publicId);
                    }}
                  />
                  {professional.publicName}
                </label>
              ))}
          </fieldset>
        </>
      ) : null}
      <button disabled={busy} type="button" onClick={savePeriod}>
        {editingPeriodPublicId === null ? 'Adicionar per\u00edodo' : 'Salvar altera\u00e7\u00f5es'}
      </button>
      {editingPeriodPublicId !== null ? (
        <button
          disabled={busy}
          type="button"
          onClick={() => {
            setEditingPeriodPublicId(null);
            setDraft(initialDraft);
          }}
        >
          {'Cancelar edi\u00e7\u00e3o'}
        </button>
      ) : null}
      {error instanceof Error ? <p role="alert">{error.message}</p> : null}
      {schedule.data?.items.length === 0 && !schedule.isPending ? (
        <p>{'Nenhum per\u00edodo cadastrado.'}</p>
      ) : null}
      <ul>
        {schedule.data?.items.map((period) => {
          const weekday = weekdays[period.weekday] ?? 'Dia';
          return (
            <li key={period.publicId}>
              <span>{`${weekday}: ${period.startsAt} \u2013 ${period.endsAt}`}</span>
              <span>
                {period.unitPublicId === null ? ' Todas as unidades' : ' Unidade espec\u00edfica'}
              </span>
              {!period.active ? ' (inativo)' : ''}
              <button
                disabled={busy}
                type="button"
                onClick={() => {
                  editPeriod(period);
                }}
              >
                Editar
              </button>
              <button
                disabled={busy}
                type="button"
                onClick={() => {
                  void setStatus.mutateAsync({
                    periodPublicId: period.publicId,
                    active: !period.active,
                  });
                }}
              >
                {period.active ? 'Desativar' : 'Ativar'}
              </button>
              <button
                disabled={busy}
                type="button"
                onClick={() => {
                  void remove.mutateAsync(period.publicId);
                }}
              >
                Remover
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
