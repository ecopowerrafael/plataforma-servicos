import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateServiceRequestSchema,
  blockedServiceMinutes,
  type ServicePublicSchema,
  type ServiceCategoryPublicSchema,
} from '@plataforma/shared';
import { useEffect, type ReactNode } from 'react';
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

/**
 * `fields` escolhe o recorte exibido, mas o formulário sempre envia o serviço
 * completo: as regras e os valores atuais continuam em um único lugar.
 */
export function ServiceForm({
  busy,
  error,
  service,
  categories = [],
  fields = 'all',
  submitLabel,
  imageSlot,
  onCancel,
  onSave,
}: {
  busy: boolean;
  error: string | null;
  service?: Service;
  categories?: Category[];
  fields?: 'all' | 'operational' | 'public';
  submitLabel?: string;
  /** Seletor de imagem exibido na seção de apresentação, no cadastro. */
  imageSlot?: ReactNode;
  onCancel?: () => void;
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
    setValue,
    formState: { errors },
  } = form;
  const [duration, hasBreak, breakMinutes, priceCents] = useWatch({
    control,
    name: ['durationMinutes', 'hasPostServiceBreak', 'postServiceBreakMinutes', 'priceCents'],
  });
  useEffect(() => {
    reset(defaults(service));
  }, [reset, service]);
  const total = blockedServiceMinutes(
    Number(duration) || 0,
    hasBreak === true,
    Number(breakMinutes) || 0,
  );
  const formatMoney = (value: number) =>
    (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const nameField = (
    <label className="service-field--wide">
      Nome
      <input {...register('name')} />
    </label>
  );
  const categoryField = (
    <label>
      Categoria
      <select
        {...register('categoryPublicId', {
          setValueAs: (value: string) => (value === '' ? null : value),
        })}
      >
        <option value="">Sem categoria</option>
        {categories
          .filter((category) => category.active || category.publicId === service?.categoryPublicId)
          .map((category) => (
            <option key={category.publicId} value={category.publicId}>
              {category.name}
            </option>
          ))}
      </select>
    </label>
  );
  const statusField = (
    <label>
      Status
      <select {...register('active', { setValueAs: (value: string) => value === 'true' })}>
        <option value="true">Ativo</option>
        <option value="false">Inativo</option>
      </select>
    </label>
  );
  const durationField = (
    <label>
      {'Duração (minutos)'}
      <input
        min="1"
        max="1440"
        type="number"
        list="service-duration-options"
        {...register('durationMinutes', { valueAsNumber: true })}
      />
      <datalist id="service-duration-options">
        <option value="30">30 min</option>
        <option value="45">45 min</option>
        <option value="60">1 h</option>
        <option value="90">1 h 30</option>
        <option value="120">2 h</option>
      </datalist>
    </label>
  );
  const priceField = (
    <label>
      {'Preço'}
      <input
        min="0"
        inputMode="decimal"
        type="number"
        step="0.01"
        value={Number(priceCents ?? 0) / 100}
        onChange={(event) => {
          setValue('priceCents', Math.round(Number(event.target.value.replace(',', '.')) * 100), {
            shouldDirty: true,
          });
        }}
      />
      <small>{formatMoney(Number(priceCents) || 0)}</small>
    </label>
  );
  const colorField = (
    <label>
      Cor na agenda
      <input className="service-field--color" type="color" {...register('color')} />
    </label>
  );
  const breakFields = (
    <>
      <label className="service-form-check service-field--wide">
        <input type="checkbox" {...register('hasPostServiceBreak')} />
        {' Adicionar uma pausa após este atendimento?'}
      </label>
      {hasBreak ? (
        <label>
          {'Duração da pausa (minutos)'}
          <input
            min="1"
            max="240"
            type="number"
            {...register('postServiceBreakMinutes', { valueAsNumber: true })}
          />
        </label>
      ) : null}
      <p className="muted service-field--wide">
        {`Tempo total bloqueado na agenda: ${String(total)} minutos`}
      </p>
    </>
  );
  const sortOrderField = (
    <label>
      {'Ordem de exibição'}
      <input min="0" max="999" type="number" {...register('sortOrder', { valueAsNumber: true })} />
    </label>
  );
  const descriptionField = (
    <label className="service-field--wide">
      {'Descrição pública'}
      <textarea
        rows={4}
        placeholder="Como este atendimento aparece para o cliente."
        {...register('description')}
      />
    </label>
  );
  const imageAltField = (
    <label className="service-field--wide">
      Texto alternativo da imagem
      <input {...register('imageAlt')} />
      <small>Descreve a imagem para leitores de tela.</small>
    </label>
  );

  return (
    <form
      className="platform-form service-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(onSave)();
      }}
    >
      {fields === 'all' ? (
        <>
          <fieldset className="service-form-section">
            <legend>Informações principais</legend>
            <div className="service-form-grid">
              {nameField}
              {categoryField}
              {statusField}
            </div>
          </fieldset>
          <fieldset className="service-form-section">
            <legend>Preço e duração</legend>
            <div className="service-form-grid">
              {priceField}
              {durationField}
              {colorField}
              {breakFields}
            </div>
          </fieldset>
          <fieldset className="service-form-section">
            <legend>Apresentação pública</legend>
            <div className="service-form-grid">
              {imageSlot === undefined ? null : (
                <div className="service-field--wide">{imageSlot}</div>
              )}
              {descriptionField}
              {imageAltField}
              {sortOrderField}
            </div>
          </fieldset>
        </>
      ) : null}
      {fields === 'operational' ? (
        <div className="service-form-grid">
          {nameField}
          {categoryField}
          {durationField}
          {priceField}
          {colorField}
          {statusField}
          {sortOrderField}
          {breakFields}
        </div>
      ) : null}
      {fields === 'public' ? (
        <div className="service-form-grid">
          {descriptionField}
          {imageAltField}
        </div>
      ) : null}
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
      <div className="service-form-actions">
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? 'Salvando…' : (submitLabel ?? 'Salvar')}
        </button>
        {onCancel !== undefined && (
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
