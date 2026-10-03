import { zodResolver } from '@hookform/resolvers/zod';
import { CreateServiceCategoryRequestSchema, type ServiceCategoryPublicSchema } from '@plataforma/shared';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { type z } from 'zod';

import { Switch } from '../ui/AppUi.js';

type Input = z.input<typeof CreateServiceCategoryRequestSchema>;
type Value = z.output<typeof CreateServiceCategoryRequestSchema>;
type Category = z.infer<typeof ServiceCategoryPublicSchema>;
const values = (category?: Category): Input => category === undefined
  ? { name: '', description: null, color: '#2563EB', icon: null, sortOrder: 0, active: true }
  : { name: category.name, description: category.description, color: category.color, icon: category.icon, sortOrder: category.sortOrder, active: category.active };

export function ServiceCategoryForm({ category, busy, error, onSave, onCancel, submitLabel }: {
  category?: Category; busy: boolean; error: string | null; onSave: (value: Value) => Promise<void>;
  onCancel?: () => void; submitLabel?: string;
}) {
  const initialValues = values(category);
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<Input, unknown, Value>({ defaultValues: initialValues, resolver: zodResolver(CreateServiceCategoryRequestSchema) });
  const active = useWatch({ name: 'active' });
  const color = useWatch({ name: 'color' });
  useEffect(() => { reset(values(category)); }, [category, reset]);
  return <form className="service-category-form" onSubmit={(event) => { event.preventDefault(); void handleSubmit(onSave)(); }}>
    <label className="service-category-form-field">Nome<input {...register('name')} /></label>
    <label className="service-category-form-field">Descrição<textarea rows={3} {...register('description')} /></label>
    <div className="service-category-form-grid">
      <label className="service-category-form-field">Cor<span className="service-category-color-field"><input className="service-category-color-input" type="color" {...register('color')} /><span>{color}</span></span></label>
      <label className="service-category-form-field">Ícone<input placeholder="ex.: estrela" {...register('icon')} /><small>Nome do ícone usado no catálogo.</small></label>
    </div>
    <div className="service-category-form-grid service-category-form-grid--lower">
      <label className="service-category-form-field service-category-order-field">Ordem<input min="0" max="999" type="number" {...register('sortOrder', { valueAsNumber: true })} /></label>
      <Switch checked={Boolean(active)} disabled={busy} label="Categoria ativa" description="Disponível no catálogo público." onChange={(checked) => { setValue('active', checked, { shouldDirty: true }); }} />
    </div>
    {Object.keys(errors).length > 0 && <p className="form-error" role="alert">Revise os campos informados.</p>}
    {error !== null && <p className="form-error" role="alert">{error}</p>}
    <div className="service-category-form-actions">{onCancel ? <button className="secondary-button" disabled={busy} onClick={onCancel} type="button">Cancelar</button> : <span /> }<button className="primary-button" disabled={busy} type="submit">{busy ? 'Salvando…' : submitLabel ?? 'Salvar categoria'}</button></div>
  </form>;
}
