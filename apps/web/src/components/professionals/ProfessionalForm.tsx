import { zodResolver } from '@hookform/resolvers/zod';
import { CreateProfessionalRequestSchema, type ProfessionalPublicSchema } from '@plataforma/shared';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { type z } from 'zod';

import { MemberSelect } from '../tenants/MemberSelect.js';
import { UnitSelect } from '../tenants/UnitSelect.js';
type Input = z.input<typeof CreateProfessionalRequestSchema>;
type Value = z.output<typeof CreateProfessionalRequestSchema>;
type Professional = z.infer<typeof ProfessionalPublicSchema>;
const defaults = (p?: Professional): Input =>
  p === undefined
    ? {
        name: '',
        publicName: '',
        bio: null,
        phone: null,
        email: null,
        professionalDocument: null,
        specialties: [],
        calendarColor: '#2563EB',
        sortOrder: 0,
        active: true,
        primaryUnitPublicId: null,
        userPublicId: null,
        commissionType: 'PERCENTAGE',
        commissionValue: 0,
        customFields: {},
      }
    : {
        name: p.name,
        publicName: p.publicName,
        bio: p.bio,
        phone: p.phone,
        email: p.email,
        professionalDocument: p.professionalDocument,
        specialties: p.specialties,
        calendarColor: p.calendarColor,
        sortOrder: p.sortOrder,
        active: p.active,
        primaryUnitPublicId: p.primaryUnitPublicId,
        userPublicId: p.userPublicId,
        commissionType: p.commissionType,
        commissionValue: p.commissionValue,
        customFields: p.customFields,
      };
export function ProfessionalForm({
  professional,
  busy,
  error,
  terminology,
  tenantPublicId,
  onSave,
}: {
  professional?: Professional;
  busy: boolean;
  error: string | null;
  terminology: string;
  tenantPublicId: string;
  onSave: (v: Value) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<Input, unknown, Value>({
    defaultValues: defaults(professional),
    resolver: zodResolver(CreateProfessionalRequestSchema),
  });
  useEffect(() => {
    reset(defaults(professional));
  }, [professional, reset]);
  return (
    <form
      className="platform-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(onSave)();
      }}
    >
      <h3>
        {professional === undefined
          ? `Criar ${terminology.toLowerCase()}`
          : `Editar ${terminology.toLowerCase()}`}
      </h3>
      <label>
        Nome
        <input {...register('name')} />
      </label>
      <label>
        Nome p\u00fablico
        <input {...register('publicName')} />
      </label>
      <label>
        Biografia
        <textarea {...register('bio')} />
      </label>
      <label>
        Telefone
        <input {...register('phone')} />
      </label>
      <label>
        E-mail
        <input type="email" {...register('email')} />
      </label>
      <label>
        Documento profissional
        <input {...register('professionalDocument')} />
      </label>
      <label>
        Especialidades (separadas por v\u00edrgula)
        <input
          {...register('specialties', {
            setValueAs: (value: string) =>
              value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
          })}
        />
      </label>
      <label>
        Cor na agenda
        <input type="color" {...register('calendarColor')} />
      </label>
      <label>
        Ordem
        <input type="number" min="0" {...register('sortOrder', { valueAsNumber: true })} />
      </label>
      <label>
        Unidade principal
        <Controller
          control={control}
          name="primaryUnitPublicId"
          render={({ field }) => (
            <UnitSelect
              emptyLabel="Nenhuma unidade"
              tenantPublicId={tenantPublicId}
              value={field.value ?? ''}
              onChange={(value) => {
                field.onChange(value === '' ? null : value);
              }}
            />
          )}
        />
      </label>
      <label>
        Usuário vinculado (acesso ao painel do profissional)
        <Controller
          control={control}
          name="userPublicId"
          render={({ field }) => (
            <MemberSelect
              tenantPublicId={tenantPublicId}
              value={field.value ?? ''}
              onChange={(value) => {
                field.onChange(value === '' ? null : value);
              }}
            />
          )}
        />
      </label>
      <label>
        Tipo de comissão
        <select {...register('commissionType')}>
          <option value="PERCENTAGE">Percentual</option>
          <option value="FIXED">Fixa</option>
        </select>
      </label>
      <label>
        Valor da comissão
        <input min="0" type="number" {...register('commissionValue', { valueAsNumber: true })} />
      </label>
      {Object.keys(errors).length > 0 && <p className="form-error">Revise os campos informados.</p>}
      {error !== null && <p className="form-error">{error}</p>}
      <button disabled={busy} type="submit">
        {busy ? 'Salvando\u2026' : 'Salvar'}
      </button>
    </form>
  );
}
