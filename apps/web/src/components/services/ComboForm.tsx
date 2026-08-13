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

  const comboPrice = Number(priceCents ?? 0);
  const savings = Math.max(0, regularPrice - comboPrice);

  return (
    <form
      className="platform-form combo-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(onSave)();
      }}
    >
      <fieldset className="combo-form-section">
        <legend>Dados do combo</legend>
        <div className="combo-form-grid">
          <label className="combo-field--wide">
            Nome
            <input {...register('name')} />
          </label>
          <label>
            {'Preço do combo'}
            <input
              min="0"
              step="0.01"
              inputMode="decimal"
              type="number"
              value={comboPrice / 100}
              onChange={(event) => {
                setValue(
                  'priceCents',
                  Math.round(Number(event.target.value.replace(',', '.')) * 100),
                  { shouldDirty: true },
                );
              }}
            />
            <small>{money(String(comboPrice))}</small>
          </label>
          <label>
            Status
            <select {...register('active', { setValueAs: (value: string) => value === 'true' })}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </label>
          <label>
            {'Ordem de exibição'}
            <input
              min="0"
              max="999"
              type="number"
              {...register('sortOrder', { valueAsNumber: true })}
            />
          </label>
          <label className="combo-field--wide">
            {'Descrição'}
            <textarea rows={3} {...register('description')} />
          </label>
          <label className="combo-field--wide">
            Texto alternativo da imagem
            <input {...register('imageAlt')} />
            <small>Usado quando o combo tiver imagem publicada.</small>
          </label>
        </div>
      </fieldset>
      <fieldset className="combo-form-section">
        <legend>{'Serviços do combo'}</legend>
        <div className="combo-picker-toolbar">
          <label>
            {'Buscar serviço'}
            <input
              type="search"
              value={search}
              placeholder="Digite o nome"
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </label>
          <span className="combo-selection-count">
            {`${String(selectedItems.length)} ${selectedItems.length === 1 ? 'serviço selecionado' : 'serviços selecionados'}`}
            {selectedItems.length < 2 ? ' — mínimo de dois' : ''}
          </span>
        </div>
        <div className="combo-service-grid">
          {available.map((service) => {
            const selected = selectedIds.has(service.publicId);
            return (
              <button
                className={`combo-service-card${selected ? ' is-selected' : ''}`}
                key={service.publicId}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  toggle(service);
                }}
              >
                <span className="combo-service-check" aria-hidden="true">
                  {selected ? '✓' : ''}
                </span>
                <span className="combo-service-body">
                  <strong>{service.name}</strong>
                  <small>
                    {money(service.priceCents)} • {service.durationMinutes} min
                  </small>
                </span>
              </button>
            );
          })}
        </div>
        {available.length === 0 ? (
          <p className="muted">{'Nenhum serviço encontrado para esta busca.'}</p>
        ) : null}
        {selectedServices.length > 0 ? (
          <dl className="combo-price-summary">
            <div>
              <dt>Valor avulso</dt>
              <dd>{money(String(regularPrice))}</dd>
            </div>
            <div>
              <dt>Valor do combo</dt>
              <dd>{money(String(comboPrice))}</dd>
            </div>
            <div>
              <dt>Economia</dt>
              <dd>{money(String(savings))}</dd>
            </div>
          </dl>
        ) : null}
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
      <div className="combo-form-actions">
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? 'Salvando…' : 'Salvar combo'}
        </button>
      </div>
    </form>
  );
}
