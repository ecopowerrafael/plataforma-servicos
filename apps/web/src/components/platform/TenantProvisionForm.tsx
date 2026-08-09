import { zodResolver } from '@hookform/resolvers/zod';
import {
  BusinessProfileCatalog,
  BusinessProfileCodeSchema,
  CreatePlatformTenantRequestSchema,
} from '@plataforma/shared';
import { useForm } from 'react-hook-form';
import { type z } from 'zod';

import type { PlanListResponseSchema } from '@plataforma/shared';

type ProvisionRequest = z.infer<typeof CreatePlatformTenantRequestSchema>;
type ProvisionInput = z.input<typeof CreatePlatformTenantRequestSchema>;

const defaultValues: ProvisionInput = {
  legalName: '',
  displayName: '',
  slug: '',
  timezone: 'America/Sao_Paulo',
  locale: 'pt-BR',
  currency: 'BRL',
  businessProfile: 'GENERIC',
  ownerEmail: '',
  planPublicId: '',
  trial: true,
  settings: {
    allowMultipleUnits: false,
    defaultAppointmentIntervalMinutes: 15,
    weekStartsOn: 'MONDAY',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24H',
  },
  initialUnit: {
    name: '',
    slug: '',
    postalCode: '',
    street: '',
    number: '',
    complement: '',
    district: '',
    city: '',
    state: '',
    countryCode: 'BR',
  },
};

export function TenantProvisionForm({
  busy,
  error,
  plans,
  onProvision,
}: {
  busy: boolean;
  error: string | null;
  plans: z.infer<typeof PlanListResponseSchema>['items'];
  onProvision: (value: ProvisionRequest) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProvisionInput, unknown, ProvisionRequest>({
    defaultValues,
    resolver: zodResolver(CreatePlatformTenantRequestSchema),
  });

  return (
    <form
      className="platform-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(onProvision)();
      }}
    >
      <h3>{'Provisionar estabelecimento'}</h3>
      <label>
        {'Raz\u00e3o social'}
        <input {...register('legalName')} autoComplete="organization" />
      </label>
      <label>
        {'Nome comercial'}
        <input {...register('displayName')} />
      </label>
      <label>
        Slug
        <input {...register('slug')} />
      </label>
      <label>
        Perfil de negócio
        <select {...register('businessProfile')}>
          {BusinessProfileCodeSchema.options.map((profile) => (
            <option key={profile} value={profile}>
              {BusinessProfileCatalog[profile].publicName}
            </option>
          ))}
        </select>
      </label>
      <label>
        {'E-mail do propriet\u00e1rio'}
        <input {...register('ownerEmail')} autoComplete="email" type="email" />
      </label>
      <label>
        Plano
        <select {...register('planPublicId')}>
          <option value="">{'Selecione um plano'}</option>
          {plans.map((plan) => (
            <option key={plan.publicId} value={plan.publicId}>
              {plan.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {'In\u00edcio da assinatura (opcional)'}
        <input {...register('startsAt')} placeholder="2026-08-04T12:00:00.000Z" />
      </label>
      <label>
        {'Unidade matriz'}
        <input {...register('initialUnit.name')} />
      </label>
      <label>
        {'Slug da unidade'}
        <input {...register('initialUnit.slug')} />
      </label>
      <label>
        Timezone
        <input {...register('timezone')} />
      </label>
      <label>
        Locale
        <input {...register('locale')} />
      </label>
      <label>
        {'Moeda'}
        <input {...register('currency')} />
      </label>
      <label>
        <input {...register('trial')} type="checkbox" />
        {' Iniciar com per\u00edodo de trial'}
      </label>
      {Object.keys(errors).length > 0 && (
        <p className="form-error" role="alert">
          {'Revise os campos obrigat\u00f3rios e os formatos informados.'}
        </p>
      )}
      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button disabled={busy || plans.length === 0} type="submit">
          {busy ? 'Provisionando\u2026' : 'Provisionar estabelecimento'}
        </button>
      </div>
    </form>
  );
}
