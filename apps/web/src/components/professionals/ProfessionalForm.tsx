import { zodResolver } from '@hookform/resolvers/zod';
import { CreateProfessionalRequestSchema, UpdateProfessionalRequestSchema, type ProfessionalPublicSchema } from '@plataforma/shared';
import { useEffect, useRef } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { type z } from 'zod';

const FieldError = ({ message }: { message?: string }) =>
  message ? <span className="field-error" style={{ color: 'var(--color-red)', fontSize: '0.875rem', marginTop: '0.25rem', display: 'block' }}>{message}</span> : null;

import { MemberSelect } from '../tenants/MemberSelect.js';
import { UnitSelect } from '../tenants/UnitSelect.js';

type Professional = z.infer<typeof ProfessionalPublicSchema>;

const getSchema = (isCreate: boolean) =>
  isCreate ? CreateProfessionalRequestSchema : UpdateProfessionalRequestSchema;

type Input = z.input<typeof CreateProfessionalRequestSchema>;
type Value = z.output<typeof CreateProfessionalRequestSchema> | z.output<typeof UpdateProfessionalRequestSchema>;
export const parseProfessionalSpecialties = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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
  onCancel,
  section = 'profile',
}: {
  professional?: Professional;
  busy: boolean;
  error: string | null;
  terminology: string;
  tenantPublicId: string;
  onSave: (v: Value) => Promise<void>;
  onCancel?: () => void;
  section?: 'profile' | 'commission' | 'access';
}) {
  const firstErrorRef = useRef<HTMLInputElement | null>(null);
  const isCreate = professional === undefined;
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<Input, unknown, Value>({
    defaultValues: defaults(professional),
    resolver: zodResolver(getSchema(isCreate)),
  });
  useEffect(() => {
    reset(defaults(professional));
  }, [professional, reset]);

  const getFieldProps = (fieldName: keyof Input) => {
    const error = errors[fieldName];
    const errorId = error ? `error-${fieldName}` : undefined;
    return {
      'aria-invalid': error ? 'true' : 'false',
      'aria-describedby': errorId,
    };
  };
  const title =
    professional === undefined
      ? `Criar ${terminology.toLowerCase()}`
      : section === 'commission'
        ? 'Editar comissão'
        : section === 'access'
          ? 'Vincular conta'
          : `Editar ${terminology.toLowerCase()}`;
  const commissionMode = useWatch({ control, name: 'commissionType' });
  return (
    <form
      className={`platform-form professional-profile-form professional-profile-form--${section}`}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(onSave)();
      }}
    >
      <header className="profile-form-heading">
        <div>
          <p className="eyebrow">Edição</p>
          <h3>{title}</h3>
        </div>
        {onCancel !== undefined && (
          <button className="text-button" type="button" onClick={onCancel}>
            Fechar
          </button>
        )}
      </header>
      {Object.keys(errors).length > 0 && (
        <p className="form-error" style={{ marginBottom: '1rem' }}>
          Revise os campos destacados abaixo.
        </p>
      )}
      {section === 'profile' && (
        <>
          <label>
            Nome
            <input {...register('name')} {...getFieldProps('name')} ref={(el) => { if (errors.name && !firstErrorRef.current) firstErrorRef.current = el; }} />
            <FieldError message={errors.name?.message} />
          </label>
          <label>
            Nome de exibição
            <input {...register('publicName')} {...getFieldProps('publicName')} ref={(el) => { if (errors.publicName && !firstErrorRef.current) firstErrorRef.current = el; }} />
            <FieldError message={errors.publicName?.message} />
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
            <input type="email" {...register('email')} {...getFieldProps('email')} ref={(el) => { if (errors.email && !firstErrorRef.current) firstErrorRef.current = el; }} />
            <FieldError message={errors.email?.message} />
          </label>
          <label>
            Documento profissional
            <input {...register('professionalDocument')} />
          </label>
          <label>
            Especialidades
            <Controller
              control={control}
              name="specialties"
              render={({ field }) => (
                <input
                  value={(field.value ?? []).join(', ')}
                  onBlur={field.onBlur}
                  onChange={(event) => {
                    field.onChange(parseProfessionalSpecialties(event.target.value));
                  }}
                />
              )}
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
            Status
            <select {...register('active', { setValueAs: (value) => value === 'true' })}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
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
        </>
      )}
      {section === 'access' && (
        <label>
          Conta existente
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
      )}
      {section === 'commission' && (
        <>
          <label>
            Tipo de comissão
            <select {...register('commissionType')}>
              <option value="PERCENTAGE">Percentual</option>
              <option value="FIXED">Valor fixo</option>
            </select>
          </label>
          <label>
            {commissionMode === 'FIXED' ? 'Valor em centavos' : 'Percentual'}
            <div className="commission-input">
              <input
                min="0"
                max={commissionMode === 'PERCENTAGE' ? 100 : undefined}
                type="number"
                {...register('commissionValue', { valueAsNumber: true })}
              />
              <span>{commissionMode === 'PERCENTAGE' ? '%' : 'centavos'}</span>
            </div>
          </label>
        </>
      )}
      {error !== null && <p className="form-error">{error}</p>}
      {professional === undefined && (
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? 'Salvando…' : 'Salvar alterações'}
        </button>
      )}
      {professional !== undefined && (
        <div className="profile-unsaved-bar">
          <strong>{isDirty ? 'Alterações não salvas' : 'Modo de edição'}</strong>
          <div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                reset(defaults(professional));
                onCancel?.();
              }}
            >
              Descartar
            </button>
            <button className="primary-button" disabled={busy || !isDirty} type="submit">
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
