import { zodResolver } from '@hookform/resolvers/zod';
import {
  UpdateCustomerProfileRequestSchema,
  type CustomerProfileResponseSchema,
} from '@plataforma/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { type z } from 'zod';

import { CustomFieldInputs } from './CustomFieldInputs.js';

type Input = z.input<typeof UpdateCustomerProfileRequestSchema>;
type Value = z.output<typeof UpdateCustomerProfileRequestSchema>;
type ProfileResponse = z.infer<typeof CustomerProfileResponseSchema>;

function defaults(response: ProfileResponse): Input {
  return {
    name: response.profile.name,
    socialName: response.profile.socialName,
    phone: response.profile.phone,
    whatsapp: response.profile.whatsapp,
    email: response.profile.email,
    birthDate: response.profile.birthDate,
    document: response.profile.document,
    acceptsCommunications: response.profile.acceptsCommunications,
    customFields: response.profile.customFields,
  };
}

export function CustomerProfileForm({
  profile,
  busy,
  error,
  onSave,
}: {
  profile: ProfileResponse;
  busy: boolean;
  error: string | null;
  onSave: (value: Value) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<Input, unknown, Value>({
    defaultValues: defaults(profile),
    resolver: zodResolver(UpdateCustomerProfileRequestSchema),
  });
  useEffect(() => {
    reset(defaults(profile));
  }, [profile, reset]);
  return (
    <form
      className="platform-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(onSave)();
      }}
    >
      <h4>Meus dados</h4>
      <label>
        Nome
        <input {...register('name')} />
      </label>
      <label>
        Nome social
        <input {...register('socialName')} />
      </label>
      <label>
        Telefone
        <input {...register('phone')} />
      </label>
      <label>
        WhatsApp
        <input {...register('whatsapp')} />
      </label>
      <label>
        E-mail
        <input type="email" {...register('email')} />
      </label>
      <label>
        Data de nascimento
        <input type="date" {...register('birthDate')} />
      </label>
      <label>
        Documento
        <input {...register('document')} />
      </label>
      <label className="checkbox-label">
        <input type="checkbox" {...register('acceptsCommunications')} />
        Aceito receber comunicações (confirmações, lembretes e novidades)
      </label>
      <CustomFieldInputs
        fields={profile.fields}
        getValue={(key) => getValues(`customFields.${key}`)}
        setFieldValue={(key, value) => {
          setValue(`customFields.${key}`, value, { shouldDirty: true });
        }}
      />
      {Object.keys(errors).length > 0 && <p className="form-error">Revise os campos informados.</p>}
      {error !== null && <p className="form-error">{error}</p>}
      <button disabled={busy} type="submit">
        {busy ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  );
}
