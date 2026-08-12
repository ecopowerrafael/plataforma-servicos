import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateComboRequestSchema,
  type ComboPublicSchema,
  type ServicePublicSchema,
} from '@plataforma/shared';
import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';

import type { z } from 'zod';

type ComboInput = z.input<typeof CreateComboRequestSchema>;
export type ComboSubmission = z.output<typeof CreateComboRequestSchema>;
type Combo = z.infer<typeof ComboPublicSchema>;
type Service = z.infer<typeof ServicePublicSchema>;
type ItemField = 'servicePublicId' | 'sortOrder';

function itemFieldPath<Field extends ItemField>(
  index: number,
  field: Field,
): `items.${number}.${Field}` {
  return `items.${index.toString()}.${field}` as `items.${number}.${Field}`;
}

function defaults(combo?: Combo): ComboInput {
  if (combo === undefined) {
    return {
      name: '',
      description: null,
      imageAlt: null,
      priceCents: 0,
      sortOrder: 0,
      active: true,
      items: [
        { servicePublicId: '', sortOrder: 0 },
        { servicePublicId: '', sortOrder: 1 },
      ],
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
  const {
    register,
    handleSubmit,
    reset,
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<ComboInput, unknown, ComboSubmission>({
    defaultValues: defaults(combo),
    resolver: zodResolver(CreateComboRequestSchema),
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  useEffect(() => {
    reset(defaults(combo));
  }, [reset, combo]);

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
        {'Descrição'}
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
          defaultValue={Number(getValues('priceCents')) / 100}
          onChange={(event) => {
            setValue('priceCents', Math.round(Number(event.target.value.replace(',', '.')) * 100), {
              shouldDirty: true,
            });
          }}
        />
      </label>
      <label>
        Ordem de {'exibição'}
        <input
          min="0"
          max="999"
          type="number"
          {...register('sortOrder', { valueAsNumber: true })}
        />
      </label>
      <label>
        <input type="checkbox" {...register('active')} />
        {' Ativo'}
      </label>
      <fieldset>
        <legend>{'Serviços do combo (mínimo de dois)'}</legend>
        {fields.map((field, index) => (
          <div className="platform-form" key={field.id}>
            <label>
              {'Serviço'}
              <select {...register(itemFieldPath(index, 'servicePublicId'))}>
                <option value="">Selecionar</option>
                {services.map((service) => (
                  <option key={service.publicId} value={service.publicId}>
                    {service.name} ·{' '}
                    {(Number(service.priceCents) / 100).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}{' '}
                    · {service.durationMinutes} min
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ordem
              <input
                min="0"
                max="999"
                type="number"
                {...register(itemFieldPath(index, 'sortOrder'), { valueAsNumber: true })}
              />
            </label>
            <button
              disabled={fields.length <= 2}
              onClick={() => {
                remove(index);
              }}
              type="button"
            >
              Remover item
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            append({ servicePublicId: '', sortOrder: fields.length });
          }}
          type="button"
        >
          Adicionar item
        </button>
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
