import { zodResolver } from '@hookform/resolvers/zod';
import { blockedServiceMinutes, CreateServiceRequestSchema, DEFAULT_QUOTE_NOTICE, type ServiceCategoryPublicSchema, type ServicePublicSchema } from '@plataforma/shared';
import { useEffect, type ReactNode } from 'react';
import { useForm, useWatch, type UseFormRegister, type UseFormSetValue } from 'react-hook-form';
import { type z } from 'zod';
import { ServiceIconPicker } from './ServiceIconPicker.js';
import { Switch } from '../ui/AppUi.js';

type ServiceInput = z.input<typeof CreateServiceRequestSchema>;
export type ServiceSubmission = z.output<typeof CreateServiceRequestSchema>;
type Service = z.infer<typeof ServicePublicSchema>;
type Category = z.infer<typeof ServiceCategoryPublicSchema>;
type Register = UseFormRegister<ServiceInput>;
type SetValue = UseFormSetValue<ServiceInput>;

function defaults(service?: Service): ServiceInput {
  if (!service) return { name: '', description: null, imageAlt: null, iconKey: null, categoryPublicId: null, durationMinutes: 30, hasPostServiceBreak: false, postServiceBreakMinutes: 0, priceCents: 0, pricingMode: 'FIXED', quoteNotice: null, color: '#2563EB', sortOrder: 0, active: true };
  return { name: service.name, description: service.description, imageAlt: service.imageAlt, iconKey: service.iconKey, categoryPublicId: service.categoryPublicId, durationMinutes: service.durationMinutes, hasPostServiceBreak: service.hasPostServiceBreak, postServiceBreakMinutes: service.postServiceBreakMinutes, priceCents: Number(service.priceCents), pricingMode: service.pricingMode, quoteNotice: service.quoteNotice, color: service.color, sortOrder: service.sortOrder, active: service.active };
}

function Section({ title, description, children, className = '' }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return <section className={`service-create-section ${className}`}><header><h2>{title}</h2>{description && <p>{description}</p>}</header>{children}</section>;
}

function Basic({ register, categories, service }: { register: Register; categories: Category[]; service: Service | undefined }) {
  return <Section title="Informações básicas" description="Os dados essenciais para disponibilizar este atendimento."><div className="service-basic-grid"><label className="service-field--wide">Nome<input {...register('name')} /></label><label>Categoria<select {...register('categoryPublicId', { setValueAs: (v: string) => v === '' ? null : v })}><option value="">Sem categoria</option>{categories.filter((c) => c.active || c.publicId === service?.categoryPublicId).map((c) => <option key={c.publicId} value={c.publicId}>{c.name}</option>)}</select></label><label>Status<select {...register('active', { setValueAs: (v: string) => v === 'true' })}><option value="true">Ativo</option><option value="false">Inativo</option></select></label></div></Section>;
}

function PricingMode({ mode, setValue }: { mode: ServiceInput['pricingMode']; setValue: SetValue }) {
  return <div className="service-pricing-mode"><span>Tipo de cobrança</span><div className="service-pricing-selector" role="radiogroup" aria-label="Tipo de cobrança">{([['FIXED', 'Preço fixo', 'Exibe o valor ao cliente'], ['QUOTE', 'Sob orçamento', 'Valor definido depois']] as const).map(([value, label, hint]) => <label key={value} className={mode === value ? 'is-selected' : undefined}><input type="radio" value={value} checked={mode === value} onChange={() => { setValue('pricingMode', value, { shouldDirty: true }); if (value === 'QUOTE') setValue('priceCents', 0, { shouldDirty: true }); }} /><strong>{label}</strong><small>{hint}</small></label>)}</div></div>;
}

function Schedule({ register, setValue, mode, price, duration, hasBreak, breakMinutes }: { register: Register; setValue: SetValue; mode: ServiceInput['pricingMode']; price: number; duration: number; hasBreak: boolean; breakMinutes: number }) {
  const quote = mode === 'QUOTE';
  const total = blockedServiceMinutes(Number(duration) || 0, hasBreak, Number(breakMinutes) || 0);
  return <Section title="Preço e agenda" description="Defina como o cliente paga e quanto tempo este serviço ocupa."><PricingMode mode={mode} setValue={setValue}/><div className="service-schedule-row">{quote ? <label>Texto exibido no lugar do preço<input placeholder={DEFAULT_QUOTE_NOTICE} {...register('quoteNotice')} /><small>Sem preencher, o cliente vê “{DEFAULT_QUOTE_NOTICE}”.</small></label> : <label>Preço<div className="service-money-input"><span>R$</span><input min="0" inputMode="decimal" type="number" step="0.01" value={price / 100} onChange={(e) => setValue('priceCents', Math.round(Number(e.target.value.replace(',', '.')) * 100), { shouldDirty: true })}/></div></label>}<label>{quote ? 'Duração da avaliação (minutos)' : 'Duração (minutos)'}<input min="1" max="1440" type="number" list="service-duration-options" {...register('durationMinutes', { valueAsNumber: true })}/><datalist id="service-duration-options"><option value="30">30 min</option><option value="45">45 min</option><option value="60">1 h</option><option value="90">1 h 30</option><option value="120">2 h</option></datalist></label><label>Cor na agenda<input className="service-field--color" type="color" {...register('color')}/></label></div><Switch checked={hasBreak} label="Pausa após atendimento" description="Reserve alguns minutos antes do próximo horário." onChange={(checked) => { setValue('hasPostServiceBreak', checked, { shouldDirty: true }); if (!checked) setValue('postServiceBreakMinutes', 0, { shouldDirty: true }); }}/>{hasBreak && <label className="service-break-duration">Duração da pausa (minutos)<input min="1" max="240" type="number" {...register('postServiceBreakMinutes', { valueAsNumber: true })}/></label>}<p className="service-total-inline" role="status">⏱ Tempo ocupado na agenda: <strong>{total} min</strong></p></Section>;
}

function Public({ register, imageSlot, iconKey, setValue }: { register: Register; imageSlot?: ReactNode; iconKey: string | null; setValue: SetValue }) {
  return <Section title="Apresentação pública" description="Defina como este serviço aparece para o cliente." className="service-public-section"><div className="service-public-layout">{imageSlot !== undefined && <div className="service-public-image">{imageSlot}</div>}<div className="service-public-fields"><label>Descrição pública<textarea rows={3} placeholder="Como este atendimento aparece para o cliente." {...register('description')}/></label><ServiceIconPicker value={iconKey} onChange={(value) => setValue('iconKey', value, { shouldDirty: true })}/></div></div></Section>;
}

function Advanced({ register }: { register: Register }) {
  return <details className="service-advanced"><summary>Opções avançadas</summary><div className="service-advanced-grid"><label>Texto alternativo da imagem<input {...register('imageAlt')}/><small>Descreve a imagem para leitores de tela.</small></label><label>Ordem de exibição<input min="0" max="999" type="number" {...register('sortOrder', { valueAsNumber: true })}/></label></div></details>;
}

export function ServiceForm({ busy, error, service, categories = [], fields = 'all', submitLabel, imageSlot, onCancel, onSave }: { busy: boolean; error: string | null; service?: Service; categories?: Category[]; fields?: 'all' | 'operational' | 'public'; submitLabel?: string; imageSlot?: ReactNode; onCancel?: () => void; onSave: (value: ServiceSubmission) => Promise<void> }) {
  const form = useForm<ServiceInput, unknown, ServiceSubmission>({ defaultValues: defaults(service), resolver: zodResolver(CreateServiceRequestSchema) });
  const { register, handleSubmit, reset, control, setValue, formState: { errors } } = form;
  const [duration, hasBreak, breakMinutes, price, iconKey, mode] = useWatch({ control, name: ['durationMinutes', 'hasPostServiceBreak', 'postServiceBreakMinutes', 'priceCents', 'iconKey', 'pricingMode'] });
  useEffect(() => { reset(defaults(service)); }, [reset, service]);
  const content = fields === 'all' ? <><Basic register={register} categories={categories} service={service}/><Schedule register={register} setValue={setValue} mode={mode} price={Number(price ?? 0)} duration={Number(duration ?? 0)} hasBreak={hasBreak === true} breakMinutes={Number(breakMinutes ?? 0)}/><Public register={register} imageSlot={imageSlot} iconKey={typeof iconKey === 'string' ? iconKey : null} setValue={setValue}/><Advanced register={register}/></> : fields === 'public' ? <Public register={register} iconKey={typeof iconKey === 'string' ? iconKey : null} setValue={setValue}/> : <><Section title="Dados operacionais"><div className="service-form-grid"><label>Nome<input {...register('name')}/></label><label>Categoria<select {...register('categoryPublicId', { setValueAs: (v: string) => v === '' ? null : v })}><option value="">Sem categoria</option>{categories.map((c) => <option key={c.publicId} value={c.publicId}>{c.name}</option>)}</select></label><label>{mode === 'QUOTE' ? 'Texto exibido no lugar do preço' : 'Preço'}<input type="number" step="0.01" value={mode === 'QUOTE' ? undefined : Number(price ?? 0) / 100} {...(mode === 'QUOTE' ? register('quoteNotice') : {})} onChange={mode === 'QUOTE' ? undefined : (e) => setValue('priceCents', Math.round(Number(e.target.value) * 100), { shouldDirty: true })}/></label><label>Duração (minutos)<input type="number" {...register('durationMinutes', { valueAsNumber: true })}/></label><label>Status<select {...register('active', { setValueAs: (v: string) => v === 'true' })}><option value="true">Ativo</option><option value="false">Inativo</option></select></label></div><PricingMode mode={mode} setValue={setValue}/><Switch checked={hasBreak === true} label="Pausa após atendimento" onChange={(checked) => { setValue('hasPostServiceBreak', checked, { shouldDirty: true }); if (!checked) setValue('postServiceBreakMinutes', 0, { shouldDirty: true }); }}/></Section></>;
  return <form className="platform-form service-form" onSubmit={(e) => { e.preventDefault(); void handleSubmit(onSave)(); }}>{content}{Object.keys(errors).length > 0 && <p className="form-error" role="alert">Revise os campos informados.</p>}{error && <p className="form-error" role="alert">{error}</p>}<footer className="service-form-footer">{onCancel && <button className="secondary-button" type="button" onClick={onCancel}>Cancelar</button>}<button className="primary-button" disabled={busy} type="submit">{busy ? 'Salvando…' : (submitLabel ?? 'Salvar')}</button></footer></form>;
}
