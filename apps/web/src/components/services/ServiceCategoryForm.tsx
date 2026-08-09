import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateServiceCategoryRequestSchema,
  type ServiceCategoryPublicSchema,
} from '@plataforma/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { type z } from 'zod';

type Input = z.input<typeof CreateServiceCategoryRequestSchema>;
type Value = z.output<typeof CreateServiceCategoryRequestSchema>;
type Category = z.infer<typeof ServiceCategoryPublicSchema>;
const values = (category?: Category): Input =>
  category === undefined
    ? { name: '', description: null, color: '#2563EB', icon: null, sortOrder: 0, active: true }
    : {
        name: category.name,
        description: category.description,
        color: category.color,
        icon: category.icon,
        sortOrder: category.sortOrder,
        active: category.active,
      };
export function ServiceCategoryForm({
  category,
  busy,
  error,
  onSave,
}: {
  category?: Category;
  busy: boolean;
  error: string | null;
  onSave: (value: Value) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Input, unknown, Value>({
    defaultValues: values(category),
    resolver: zodResolver(CreateServiceCategoryRequestSchema),
  });
  useEffect(() => {
    reset(values(category));
  }, [category, reset]);
  return (
    <form
      className="platform-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(onSave)();
      }}
    >
      <h3>{category === undefined ? 'Criar categoria' : 'Editar categoria'}</h3>
      <label>
        Nome
        <input {...register('name')} />
      </label>
      <label>
        {'Descri\u00e7\u00e3o'}
        <textarea {...register('description')} />
      </label>
      <label>
        Cor
        <input type="color" {...register('color')} />
      </label>
      <label>
        {'\u00cdcone'}
        <input placeholder="ex.: estrela" {...register('icon')} />
      </label>
      <label>
        Ordem
        <input
          min="0"
          max="999"
          type="number"
          {...register('sortOrder', { valueAsNumber: true })}
        />
      </label>
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
