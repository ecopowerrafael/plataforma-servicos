import { zodResolver } from '@hookform/resolvers/zod';
import { CreateBusinessUnitRequestSchema, type BusinessUnitSchema } from '@plataforma/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { type z } from 'zod';

type Input = z.input<typeof CreateBusinessUnitRequestSchema>;
type Value = z.output<typeof CreateBusinessUnitRequestSchema>;
type Unit = z.infer<typeof BusinessUnitSchema>;

const values = (unit?: Unit): Input =>
  unit === undefined
    ? {
        name: '',
        slug: '',
        timezone: '',
        postalCode: '',
        street: '',
        number: '',
        complement: '',
        district: '',
        city: '',
        state: '',
        countryCode: '',
        googleMapsUrl: '',
      }
    : {
        name: unit.name,
        slug: unit.slug,
        timezone: unit.timezone,
        postalCode: unit.postalCode ?? '',
        street: unit.street ?? '',
        number: unit.number ?? '',
        complement: unit.complement ?? '',
        district: unit.district ?? '',
        city: unit.city ?? '',
        state: unit.state ?? '',
        countryCode: unit.countryCode ?? '',
        latitude: unit.latitude ?? undefined,
        longitude: unit.longitude ?? undefined,
        googleMapsUrl: unit.googleMapsUrl ?? '',
      };

const optional = (value: string) => (value.trim() === '' ? undefined : value.trim());

export function BusinessUnitForm({
  unit,
  busy,
  error,
  onSave,
}: {
  unit?: Unit;
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
    defaultValues: values(unit),
    resolver: zodResolver(CreateBusinessUnitRequestSchema),
  });
  useEffect(() => {
    reset(values(unit));
  }, [unit, reset]);
  return (
    <form
      className="platform-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(onSave)();
      }}
    >
      <h3>{unit === undefined ? 'Criar unidade' : 'Editar unidade'}</h3>
      <label>
        Nome
        <input {...register('name')} />
      </label>
      <label>
        Slug
        <input {...register('slug')} />
      </label>
      <label>
        Timezone (IANA, opcional)
        <input
          placeholder="America/Sao_Paulo"
          {...register('timezone', { setValueAs: optional })}
        />
      </label>
      <label>
        CEP
        <input {...register('postalCode', { setValueAs: optional })} />
      </label>
      <label>
        Rua
        <input {...register('street', { setValueAs: optional })} />
      </label>
      <label>
        Número
        <input {...register('number', { setValueAs: optional })} />
      </label>
      <label>
        Complemento
        <input {...register('complement', { setValueAs: optional })} />
      </label>
      <label>
        Bairro
        <input {...register('district', { setValueAs: optional })} />
      </label>
      <label>
        Cidade
        <input {...register('city', { setValueAs: optional })} />
      </label>
      <label>
        Estado
        <input {...register('state', { setValueAs: optional })} />
      </label>
      <label>
        País (código de 2 letras)
        <input
          maxLength={2}
          placeholder="BR"
          {...register('countryCode', { setValueAs: optional })}
        />
      </label>
      <label>
        Link do estabelecimento no Google Maps
        <input type="url" {...register('googleMapsUrl', { setValueAs: optional })} />
      </label>
      <input type="hidden" {...register('latitude', { setValueAs: (value) => value === '' ? undefined : Number(value) })} />
      <input type="hidden" {...register('longitude', { setValueAs: (value) => value === '' ? undefined : Number(value) })} />
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
