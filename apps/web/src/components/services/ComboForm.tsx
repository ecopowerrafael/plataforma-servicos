import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateComboRequestSchema,
  type ComboPublicSchema,
  type ServicePublicSchema,
} from '@plataforma/shared';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import type { z } from 'zod';

type ComboInput = z.input<typeof CreateComboRequestSchema>;
export type ComboSubmission = z.output<typeof CreateComboRequestSchema>;
type Combo = z.infer<typeof ComboPublicSchema>;
type Service = z.infer<typeof ServicePublicSchema>;

function defaults(combo?: Combo): ComboInput {
  if (combo === undefined) {
    return {
      name: '',
      description: null,
      imageAlt: null,
      priceCents: 0,
      sortOrder: 0,
      active: true,
      items: [],
    };
  }
  return {
    name: combo.name,
    description: combo.description,
    imageAlt: combo.imageAlt,
    priceCents: Number(combo.priceCents),
    sortOrder: combo.sortOrder,
    active: combo.active,
    items: combo.items.map((item) => ({
      servicePublicId: item.servicePublicId,
      sortOrder: item.sortOrder,
    })),
  };
}

const money = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ComboForm({
  busy,
  error,
  combo,
  services,
  onSave,
}: {
  busy: boolean;
  error: string | null;
  combo?: Combo;
  services: Service[];
  onSave: (value: ComboSubmission) => Promise<void>;
}) {
  const form = useForm<ComboInput, unknown, ComboSubmission>({
    defaultValues: defaults(combo),
    resolver: zodResolver(CreateComboRequestSchema),
  });
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const selectedItems = useWatch({ control, name: 'items' }) ?? [];
  const priceCents = useWatch({ control, name: 'priceCents' });
  const [search, setSearch] = useState('');
  const selectedIds = useMemo(
    () => new Set(selectedItems.map((item) => item.servicePublicId)),
    [selectedItems],
  );
  const available = useMemo(
    () =>
      services.filter((service) =>
        service.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')),
      ),
    [search, services],
  );
  const selectedServices = useMemo(
    () => services.filter((service) => selectedIds.has(service.publicId)),
    [selectedIds, services],
  );
  const regularPrice = selectedServices.reduce(
    (total, service) => total + Number(service.priceCents),
    0,
  );

  useEffect(() => {
    reset(defaults(combo));
  }, [combo, reset]);

  const toggle = (service: Service) => {
    const index = selectedItems.findIndex((item) => item.servicePublicId === service.publicId);
    if (index >= 0) remove(index);
    else append({ servicePublicId: service.publicId, sortOrder: fields.length });
  };

  return (
    <form
      className="platform-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(onSave)();
      }}
    >
      <h3>{combo === undefined ? 'Criar combo' : 'Editar combo'}</h3>
      <label>
        Nome
        <input {...register('name')} />
      </label>
      <label>
        Descrição
        <textarea {...register('description')} />
      </label>
      <label>
        Texto alternativo da imagem
        <input {...register('imageAlt')} />
      </label>
      <label>
        Preço do combo
        <input
          min="0"
          step="0.01"
          inputMode="decimal"
          type="number"
          value={Number(priceCents ?? 0) / 100}
          onChange={(event) => {
            setValue('priceCents', Math.round(Number(event.target.value.replace(',', '.')) * 100), {
              shouldDirty: true,
            });
          }}
        />
      </label>
      {selectedServices.length > 0 && (
        <p className="muted">
          Preço avulso: {money(String(regularPrice))} · Economia:{' '}
          {money(String(Math.max(0, regularPrice - Number(priceCents ?? 0))))}
        </p>
      )}
      <label>
        Ordem de exibição
        <input
          min="0"
          max="999"
          type="number"
          {...register('sortOrder', { valueAsNumber: true })}
        />
      </label>
      <label>
        <input type="checkbox" {...register('active')} /> Ativo
      </label>
      <fieldset>
        <legend>Serviços do combo (mínimo de dois)</legend>
        <label>
          Pesquisar serviços
          <input
            type="search"
            value={search}
            placeholder="Digite o nome do serviço"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="service-picker">
          {available.map((service) => {
            const selected = selectedIds.has(service.publicId);
            return (
              <button
                className={selected ? 'selected' : ''}
                key={service.publicId}
                type="button"
                onClick={() => toggle(service)}
              >
                <strong>
                  {selected ? '✓ ' : ''}
                  {service.name}
                </strong>
                <span>
                  {money(service.priceCents)} · {service.durationMinutes} min
                </span>
              </button>
            );
          })}
        </div>
        <p className="muted">
          {selectedItems.length} serviço(s) selecionado(s). A ordem segue a seleção.
        </p>
      </fieldset>
      {Object.keys(errors).length > 0 && (
        <p className="form-error" role="alert">
          Revise os campos informados.
        </p>
      )}
      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button disabled={busy} type="submit">
        {busy ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  );
}
