import {
  CreateProfessionalUnavailabilityRequestSchema,
  ProfessionalListResponseSchema,
  ProfessionalUnavailabilityListResponseSchema,
  SetProfessionalUnavailabilityStatusRequestSchema,
  TenantContextResponseSchema,
  TenantUnitsResponseSchema,
  UpdateProfessionalUnavailabilityRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { httpClient } from '../../lib/http.js';

const types = ['BLOCK', 'DAY_OFF', 'VACATION', 'SICK_LEAVE', 'PERSONAL', 'OTHER'] as const;

interface FormState {
  type: (typeof types)[number];
  title: string;
  reason: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  repeatsWeekly: boolean;
  recurrenceEndsAt: string;
  unitPublicId: string;
}

const initialForm: FormState = {
  type: 'BLOCK',
  title: '',
  reason: '',
  startsAt: '',
  endsAt: '',
  allDay: false,
  repeatsWeekly: false,
  recurrenceEndsAt: '',
  unitPublicId: '',
};
const timeParts = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {});

const toIso = (value: string, timeZone: string) => {
  const naive = new Date(`${value}:00Z`);
  const parts = timeParts(naive, timeZone);
  const formattedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return new Date(naive.getTime() - (formattedAsUtc - naive.getTime())).toISOString();
};

const toInputValue = (value: string, timeZone: string) => {
  const parts = timeParts(new Date(value), timeZone);
  return `${parts.year ?? '0000'}-${parts.month ?? '00'}-${parts.day ?? '00'}T${parts.hour ?? '00'}:${parts.minute ?? '00'}`;
};

const formatInTimeZone = (value: string, timeZone: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone }).format(
    new Date(value),
  );

export function ProfessionalUnavailability({
  tenantPublicId,
  professionalPublicId,
}: {
  tenantPublicId: string;
  professionalPublicId: string;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(initialForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [selectedProfessionals, setSelectedProfessionals] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('true');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');
  const tenantContext = useQuery({
    queryKey: ['tenant', tenantPublicId, 'context'],
    queryFn: () =>
      httpClient.request('/tenant/context', {
        schema: TenantContextResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const timeZone = tenantContext.data?.tenant.timezone ?? 'UTC';
  const querySuffix = `${typeFilter ? `&type=${typeFilter}` : ''}${statusFilter === '' ? '' : `&active=${statusFilter}`}${fromFilter ? `&from=${encodeURIComponent(toIso(fromFilter, timeZone))}` : ''}${toFilter ? `&to=${encodeURIComponent(toIso(toFilter, timeZone))}` : ''}`;
  const data = useQuery({
    queryKey: [
      'professional-unavailabilities',
      professionalPublicId,
      typeFilter,
      statusFilter,
      fromFilter,
      toFilter,
    ],
    queryFn: () =>
      httpClient.request(
        `/tenant/professionals/${professionalPublicId}/unavailabilities?${querySuffix.slice(1)}`,
        { schema: ProfessionalUnavailabilityListResponseSchema, tenantPublicId },
      ),
    retry: false,
  });
  const units = useQuery({
    queryKey: ['tenant', tenantPublicId, 'units'],
    queryFn: () =>
      httpClient.request('/tenant/units', { schema: TenantUnitsResponseSchema, tenantPublicId }),
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
      queryKey: ['professional-unavailabilities', professionalPublicId],
    });
  };
  const body = (includeTargets: boolean) => ({
    type: form.type,
    title: form.title,
    reason: form.reason || null,
    startsAt: toIso(form.startsAt, timeZone),
    endsAt: toIso(form.endsAt, timeZone),
    allDay: form.allDay,
    repeatsWeekly: form.repeatsWeekly,
    recurrenceEndsAt: form.repeatsWeekly ? toIso(form.recurrenceEndsAt, timeZone) : null,
    unitPublicId: form.unitPublicId || null,
    active: true,
    ...(includeTargets ? { professionalPublicIds: selectedProfessionals } : {}),
  });
  const create = useMutation({
    mutationFn: () =>
      httpClient.request(`/tenant/professionals/${professionalPublicId}/unavailabilities`, {
        method: 'POST',
        body: CreateProfessionalUnavailabilityRequestSchema.parse(body(true)),
        schema: ProfessionalUnavailabilityListResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setForm(initialForm);
      setSelectedProfessionals([]);
      await invalidate();
    },
  });
  const update = useMutation({
    mutationFn: () => {
      if (editing === null) throw new Error('Nenhuma indisponibilidade selecionada.');
      return httpClient.request(
        `/tenant/professionals/${professionalPublicId}/unavailabilities/${editing}`,
        {
          method: 'PATCH',
          body: UpdateProfessionalUnavailabilityRequestSchema.parse(body(false)),
          schema: ProfessionalUnavailabilityListResponseSchema,
          tenantPublicId,
        },
      );
    },
    onSuccess: async () => {
      setEditing(null);
      setForm(initialForm);
      await invalidate();
    },
  });
  const status = useMutation({
    mutationFn: (input: { publicId: string; active: boolean }) =>
      httpClient.request(
        `/tenant/professionals/${professionalPublicId}/unavailabilities/${input.publicId}/status`,
        {
          method: 'PATCH',
          body: SetProfessionalUnavailabilityStatusRequestSchema.parse({ active: input.active }),
          schema: ProfessionalUnavailabilityListResponseSchema,
          tenantPublicId,
        },
      ),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (publicId: string) =>
      httpClient.request(
        `/tenant/professionals/${professionalPublicId}/unavailabilities/${publicId}`,
        { method: 'DELETE', schema: ProfessionalUnavailabilityListResponseSchema, tenantPublicId },
      ),
    onSuccess: invalidate,
  });
  const busy = create.isPending || update.isPending || status.isPending || remove.isPending;
  const error = create.error ?? update.error ?? status.error ?? remove.error;
  const change = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const edit = (item: NonNullable<typeof data.data>['items'][number]) => {
    setEditing(item.publicId);
    setForm({
      type: item.type,
      title: item.title,
      reason: item.reason ?? '',
      startsAt: toInputValue(item.startsAt, timeZone),
      endsAt: toInputValue(item.endsAt, timeZone),
      allDay: item.allDay,
      repeatsWeekly: item.repeatsWeekly,
      recurrenceEndsAt:
        item.recurrenceEndsAt === null || item.recurrenceEndsAt === undefined
          ? ''
          : toInputValue(item.recurrenceEndsAt, timeZone),
      unitPublicId: item.unitPublicId ?? '',
    });
  };
  const toggleProfessional = (id: string) => {
    setSelectedProfessionals((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };
  return (
    <section className="platform-form">
      <h4>{'Indisponibilidades'}</h4>
      <div className="form-grid">
        <label>
          Tipo
          <select
            value={form.type}
            onChange={(event) => {
              change('type', event.target.value as FormState['type']);
            }}
          >
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Título
          <input
            value={form.title}
            onChange={(event) => {
              change('title', event.target.value);
            }}
          />
        </label>
        <label>
          Motivo
          <input
            value={form.reason}
            onChange={(event) => {
              change('reason', event.target.value);
            }}
          />
        </label>
        <label>
          Início
          <input
            required
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) => {
              change('startsAt', event.target.value);
            }}
          />
        </label>
        <label>
          Fim
          <input
            required
            type="datetime-local"
            value={form.endsAt}
            onChange={(event) => {
              change('endsAt', event.target.value);
            }}
          />
        </label>
        <label>
          Unidade
          <select
            value={form.unitPublicId}
            onChange={(event) => {
              change('unitPublicId', event.target.value);
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
      <label>
        <input
          checked={form.allDay}
          type="checkbox"
          onChange={(event) => {
            change('allDay', event.target.checked);
          }}
        />
        Dia inteiro
      </label>
      <label>
        <input
          checked={form.repeatsWeekly}
          type="checkbox"
          onChange={(event) => {
            change('repeatsWeekly', event.target.checked);
          }}
        />
        Repetir semanalmente
      </label>
      {form.repeatsWeekly ? (
        <label>
          Repetir até
          <input
            required
            type="datetime-local"
            value={form.recurrenceEndsAt}
            onChange={(event) => {
              change('recurrenceEndsAt', event.target.value);
            }}
          />
        </label>
      ) : null}
      {editing === null ? (
        <fieldset>
          <legend>{'Aplicar a outros profissionais'}</legend>
          {professionals.data?.items
            .filter((professional) => professional.publicId !== professionalPublicId)
            .map((professional) => (
              <label key={professional.publicId}>
                <input
                  checked={selectedProfessionals.includes(professional.publicId)}
                  type="checkbox"
                  onChange={() => {
                    toggleProfessional(professional.publicId);
                  }}
                />
                {professional.publicName}
              </label>
            ))}
        </fieldset>
      ) : null}
      <button
        disabled={busy}
        type="button"
        onClick={() => {
          if (editing === null) void create.mutateAsync();
          else void update.mutateAsync();
        }}
      >
        {editing === null ? 'Criar indisponibilidade' : 'Salvar alterações'}
      </button>
      {editing !== null ? (
        <button
          disabled={busy}
          type="button"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
          }}
        >
          Cancelar edição
        </button>
      ) : null}
      {error instanceof Error ? <p role="alert">{error.message}</p> : null}
      <div className="form-grid">
        <label>
          Filtrar tipo
          <select
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
            }}
          >
            <option value="">Todos</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
            }}
          >
            <option value="true">Ativas</option>
            <option value="false">Inativas</option>
            <option value="">Todas</option>
          </select>
        </label>
        <label>
          Período inicial
          <input
            type="datetime-local"
            value={fromFilter}
            onChange={(event) => {
              setFromFilter(event.target.value);
            }}
          />
        </label>
        <label>
          Período final
          <input
            type="datetime-local"
            value={toFilter}
            onChange={(event) => {
              setToFilter(event.target.value);
            }}
          />
        </label>
      </div>
      {data.isPending ? <p>{'Carregando indisponibilidades\u2026'}</p> : null}
      {data.error instanceof Error ? <p role="alert">{data.error.message}</p> : null}
      <ul>
        {data.data?.items.map((item) => (
          <li key={item.publicId}>
            <span>{`${item.type}: ${item.title} — ${formatInTimeZone(item.startsAt, timeZone)} at\u00e9 ${formatInTimeZone(item.endsAt, timeZone)}`}</span>
            {!item.active ? ' (inativa)' : ''}
            <button
              disabled={busy}
              type="button"
              onClick={() => {
                edit(item);
              }}
            >
              Editar
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => {
                void status.mutateAsync({ publicId: item.publicId, active: !item.active });
              }}
            >
              {item.active ? 'Desativar' : 'Ativar'}
            </button>
            <button
              disabled={busy}
              type="button"
              onClick={() => {
                void remove.mutateAsync(item.publicId);
              }}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
