import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateServiceRequestSchema,
  blockedServiceMinutes,
  type ServicePublicSchema,
  type ServiceCategoryPublicSchema,
} from '@plataforma/shared';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import type { z } from 'zod';

type ServiceInput = z.input<typeof CreateServiceRequestSchema>;
export type ServiceSubmission = z.output<typeof CreateServiceRequestSchema>;
type Service = z.infer<typeof ServicePublicSchema>;
type Category = z.infer<typeof ServiceCategoryPublicSchema>;

function defaults(service?: Service): ServiceInput {
  if (service === undefined) {
    return {
      name: '',
      description: null,
      imageAlt: null,
      categoryPublicId: null,
      durationMinutes: 30,
      hasPostServiceBreak: false,
      postServiceBreakMinutes: 0,
      priceCents: 0,
      color: '#2563EB',
      sortOrder: 0,
      active: true,
    };
  }
  return {
    name: service.name,
    description: service.description,
    imageAlt: service.imageAlt,
    categoryPublicId: service.categoryPublicId,
    durationMinutes: service.durationMinutes,
    hasPostServiceBreak: service.hasPostServiceBreak,
    postServiceBreakMinutes: service.postServiceBreakMinutes,
    priceCents: Number(service.priceCents),
    color: service.color,
    sortOrder: service.sortOrder,
    active: service.active,
  };
}

export function ServiceForm({
  busy,
  error,
  service,
  terminology,
  categories = [],
  onSave,
}: {
  busy: boolean;
  error: string | null;
  service?: Service;
  terminology: string;
  categories?: Category[];
  onSave: (value: ServiceSubmission) => Promise<void>;
}) {
  const form = useForm<ServiceInput, unknown, ServiceSubmission>({
    defaultValues: defaults(service),
    resolver: zodResolver(CreateServiceRequestSchema),
  });
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = form;
  const [duration, hasBreak, breakMinutes] = useWatch({
    control,
    name: ['durationMinutes', 'hasPostServiceBreak', 'postServiceBreakMinutes'],
  });
  useEffect(() => {
    reset(defaults(service));
  }, [reset, service]);
  const total = blockedServiceMinutes(
    Number(duration) || 0,
    hasBreak === true,
    Number(breakMinutes) || 0,
  );

  return (
    <form
      className="platform-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(onSave)();
      }}
    >
      <h3>
        {service === undefined
          ? `Criar ${terminology.toLowerCase()}`
          : `Editar ${terminology.toLowerCase()}`}
      </h3>
      <label>
        Nome
        <input {...register('name')} />
      </label>
      <label>
        {'Descri\u00e7\u00e3o'}
        <textarea {...register('description')} />
      </label>
      <label>
        Categoria
        <select
          {...register('categoryPublicId', {
            setValueAs: (value: string) => (value === '' ? null : value),
          })}
        >
          <option value="">Sem categoria</option>
          {categories
            .filter(
              (category) => category.active || category.publicId === service?.categoryPublicId,
            )
            .map((category) => (
              <option key={category.publicId} value={category.publicId}>
                {category.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Texto alternativo da imagem
        <input {...register('imageAlt')} />
      </label>
      <label>
        {'Dura\u00e7\u00e3o em minutos'}
        <input
          min="1"
          max="1440"
          type="number"
          {...register('durationMinutes', { valueAsNumber: true })}
        />
      </label>
      <label>
        {'Pre\u00e7o em centavos'}
        <input min="0" type="number" {...register('priceCents', { valueAsNumber: true })} />
      </label>
      <label>
        Cor para agenda
        <input type="color" {...register('color')} />
      </label>
      <label>
        Ordem de {'exibi\u00e7\u00e3o'}
        <input
          min="0"
          max="999"
          type="number"
          {...register('sortOrder', { valueAsNumber: true })}
        />
      </label>
      <label>
        <input type="checkbox" {...register('hasPostServiceBreak')} />
        {' Adicionar uma pausa ap\u00f3s este servi\u00e7o?'}
      </label>
      {hasBreak && (
        <label>
          {'Dura\u00e7\u00e3o da pausa em minutos'}
          <input
            min="1"
            max="240"
            type="number"
            {...register('postServiceBreakMinutes', { valueAsNumber: true })}
          />
        </label>
      )}
      <p className="muted">{`Tempo total bloqueado na agenda: ${String(total)} minutos`}</p>
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
        {busy ? 'Salvando\u2026' : 'Salvar'}
      </button>
    </form>
  );
}
