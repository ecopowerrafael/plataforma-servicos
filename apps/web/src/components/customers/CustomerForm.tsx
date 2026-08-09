import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateCustomerRequestSchema,
  type CustomerPublicSchema,
  type TenantCustomFieldResponseSchema,
} from '@plataforma/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { type z } from 'zod';

import { CustomFieldInputs } from '../CustomFieldInputs.js';

type Input = z.input<typeof CreateCustomerRequestSchema>;
type Value = z.output<typeof CreateCustomerRequestSchema>;
type Customer = z.infer<typeof CustomerPublicSchema>;
type Field = z.infer<typeof TenantCustomFieldResponseSchema>;

function defaults(customer?: Customer): Input {
  return customer === undefined
    ? { name: '', acceptsCommunications: false, customFields: {}, status: 'ACTIVE' }
    : {
        name: customer.name,
        socialName: customer.socialName,
        phone: customer.phone,
        whatsapp: customer.whatsapp,
        email: customer.email,
        birthDate: customer.birthDate,
        document: customer.document,
        notes: customer.notes,
        source: customer.source,
        acceptsCommunications: customer.acceptsCommunications,
        primaryUnitPublicId: customer.primaryUnitPublicId,
        customFields: customer.customFields,
        status: customer.status,
      };
}

export function CustomerForm({
  customer,
  fields,
  busy,
  error,
  terminology,
  onSave,
}: {
  customer?: Customer;
  fields: Field[];
  busy: boolean;
  error: string | null;
  terminology: string;
  onSave: (value: Value) => Promise<void>;
}) {
  const form = useForm<Input, unknown, Value>({
    defaultValues: defaults(customer),
    resolver: zodResolver(CreateCustomerRequestSchema),
  });
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors },
  } = form;
  useEffect(() => {
    reset(defaults(customer));
  }, [customer, reset]);
  return (
    <form
      className="platform-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(onSave)();
      }}
    >
      <h3>
        {customer === undefined
          ? `Criar ${terminology.toLowerCase()}`
          : `Editar ${terminology.toLowerCase()}`}
      </h3>
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
      <label>
        Observações
        <textarea {...register('notes')} />
      </label>
      <label>
        <input type="checkbox" {...register('acceptsCommunications')} /> Aceita comunicações
      </label>
      <CustomFieldInputs
        fields={fields}
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
