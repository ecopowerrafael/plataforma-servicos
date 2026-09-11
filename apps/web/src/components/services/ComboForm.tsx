import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateComboRequestSchema,
  type ComboPublicSchema,
  type ServicePublicSchema,
} from '@plataforma/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { IconClock, IconGripVertical, IconLayers, IconTag, IconUsers } from '@tabler/icons-react';

import type { z } from 'zod';

type ComboInput = z.input<typeof CreateComboRequestSchema>;
export type ComboSubmission = z.output<typeof CreateComboRequestSchema>;
type Combo = z.infer<typeof ComboPublicSchema>;
type Service = z.infer<typeof ServicePublicSchema>;

interface ComboEditorState {
  serviceIds: string[];
  professionalIds: string[];
  autoAssignByServices: boolean;
}

function defaults(combo?: Combo): ComboInput {
  if (combo === undefined) {
    return {
      name: '',
      description: null,
      imageAlt: null,
      priceCents: 0,
      sortOrder: 0,
      active: true,
      items: [],
    };
  }
  return {
    name: combo.name,
    description: combo.description,
    imageAlt: combo.imageAlt,
    priceCents: Number(combo.priceCents),
    sortOrder: combo.sortOrder,
    active: combo.active,
    items: combo.items.map((item) => ({
      servicePublicId: item.servicePublicId,
      sortOrder: item.sortOrder,
    })),
  };
}

const money = (cents: string) =>
  (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ComboForm({
  busy,
  error,
  combo,
  services,
  servicesLoading,
  professionals,
  imageSection,
  previewImage,
  onSave,
}: {
  busy: boolean;
  error: string | null;
  combo?: Combo;
  services: Service[];
  servicesLoading?: boolean;
  onSave: (value: ComboSubmission) => Promise<void>;
  professionals?: { publicId: string; publicName: string }[];
  imageSection?: ReactNode;
  previewImage?: ReactNode;
}) {
  const form = useForm<ComboInput, unknown, ComboSubmission>({
    defaultValues: defaults(combo),
    resolver: zodResolver(CreateComboRequestSchema),
  });
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const selectedItems = useWatch({ control, name: 'items' }) ?? [];
  const priceCents = useWatch({ control, name: 'priceCents' });
  const [search, setSearch] = useState('');
  const [autoAssign, setAutoAssign] = useState(true);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const assignmentKey = combo === undefined ? null : `combo-assignment:${combo.publicId}`;
  const selectedIds = useMemo(
    () => new Set(selectedItems.map((item) => item.servicePublicId)),
    [selectedItems],
  );
  const available = useMemo(
    () =>
      services.filter((service) =>
        service.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')),
      ),
    [search, services],
  );
  const selectedServices = useMemo(
    () => services.filter((service) => selectedIds.has(service.publicId)),
    [selectedIds, services],
  );
  const regularPrice = selectedServices.reduce(
    (total, service) => total + Number(service.priceCents),
    0,
  );

  useEffect(() => {
    reset(defaults(combo));
    if (assignmentKey === null) {
      setAutoAssign(true);
      setAssigned(new Set());
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(assignmentKey) ?? 'null') as { autoAssignByServices?: boolean; professionalIds?: string[] } | null;
      setAutoAssign(saved?.autoAssignByServices ?? true);
      setAssigned(new Set(saved?.professionalIds ?? []));
    } catch {
      setAutoAssign(true);
      setAssigned(new Set());
    }
  }, [assignmentKey, combo, reset]);

  const toggle = (service: Service) => {
    const index = selectedItems.findIndex((item) => item.servicePublicId === service.publicId);
    if (index >= 0) remove(index);
    else append({ servicePublicId: service.publicId, sortOrder: fields.length });
  };

  const comboPrice = Number(priceCents ?? 0);
  const savings = Math.max(0, regularPrice - comboPrice);
  const savingsPercentage = regularPrice > 0 ? (savings / regularPrice) * 100 : 0;
  const totalDuration = selectedServices.reduce((total, service) => total + service.durationMinutes, 0);
  const editorState: ComboEditorState = {
    serviceIds: selectedItems.map((item) => item.servicePublicId),
    professionalIds: autoAssign ? (professionals ?? []).map((professional) => professional.publicId) : [...assigned],
    autoAssignByServices: autoAssign,
  };

  return (
    <form
      id="combo-edit-form"
      className="platform-form combo-form combo-editor-layout"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit(async (value) => {
          if (assignmentKey !== null) {
            localStorage.setItem(assignmentKey, JSON.stringify(editorState));
          }
          await onSave(value);
        })();
      }}
    >
      <div className="combo-editor-main">
      <fieldset className="combo-form-section combo-card">
        <legend><IconTag aria-hidden="true" size={18} /> Informações gerais do combo</legend>
        <div className="combo-form-grid">
          <label className="combo-field--wide">
            Nome do Combo
            <input {...register('name')} />
          </label>
          <label className="combo-price-field">
            <span>Preço Final (R$)</span>
            <span className="combo-currency-input"><span aria-hidden="true">R$</span><input
              min="0"
              step="0.01"
              inputMode="decimal"
              type="number"
              value={comboPrice / 100}
              onChange={(event) => {
                setValue(
                  'priceCents',
                  Math.round(Number(event.target.value.replace(',', '.')) * 100),
                  { shouldDirty: true },
                );
              }}
            /></span>
            <small>{money(String(comboPrice))}</small>
          </label>
          <label>
            Status
            <select {...register('active', { setValueAs: (value: string) => value === 'true' })}>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </label>
          <label>
            {'Ordem de exibição'}
            <input
              min="0"
              max="999"
              type="number"
              {...register('sortOrder', { valueAsNumber: true })}
            />
          </label>
          <label className="combo-field--wide">
            {'Descrição'}
            <textarea rows={3} {...register('description')} />
          </label>
          <label className="combo-field--wide">
            Texto alternativo da imagem
            <input {...register('imageAlt')} />
            <small>Usado quando o combo tiver imagem publicada.</small>
          </label>
        </div>
        {imageSection}
      </fieldset>
      <fieldset className="combo-form-section combo-card">
        <legend><IconLayers aria-hidden="true" size={18} /> {'Serviços do combo & economia'}</legend>
        <div className="combo-picker-toolbar">
          <label>
            {'Buscar serviço'}
            <input
              type="search"
              value={search}
              placeholder="Digite o nome"
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </label>
          <span className="combo-selection-count">
            {`${String(selectedItems.length)} ${selectedItems.length === 1 ? 'serviço selecionado' : 'serviços selecionados'}`}
            {selectedItems.length < 2 ? ' — mínimo de dois' : ''}
          </span>
        </div>
        {selectedItems.length > 0 && <div className="combo-selected-list" aria-label="Serviços selecionados">
          {selectedItems.map((item, index) => {
            const service = services.find((candidate) => candidate.publicId === item.servicePublicId);
            if (!service) return null;
            return <div className="combo-selected-item" key={item.servicePublicId}>
              <IconGripVertical className="drag-handle" aria-hidden="true" size={18} />
              <span><strong>{service.name}</strong><small><span className="combo-duration-pill"><IconClock aria-hidden="true" size={12} /> {service.durationMinutes} min</span> · {money(service.priceCents)}</small></span>
              <button type="button" disabled={index === 0} onClick={() => { const next = [...selectedItems]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setValue('items', next, { shouldDirty: true }); }}>↑</button>
              <button type="button" disabled={index === selectedItems.length - 1} onClick={() => { const next = [...selectedItems]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; setValue('items', next, { shouldDirty: true }); }}>↓</button>
            </div>;
          })}
        </div>}
        {servicesLoading ? <div className="combo-service-grid" aria-label="Carregando serviços">
          {[1, 2, 3, 4].map((item) => <div className="combo-service-card combo-service-card--skeleton" key={item} />)}
        </div> : <div className="combo-service-grid">
          {available.map((service) => {
            const selected = selectedIds.has(service.publicId);
            return (
              <button
                className={`combo-service-card${selected ? ' is-selected' : ''}`}
                key={service.publicId}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  toggle(service);
                }}
              >
                <span className="combo-service-check" aria-hidden="true">
                  {selected ? '✓' : ''}
                </span>
                <span className="combo-service-body">
                  <strong>{service.name}</strong>
                  <small>
                    {money(service.priceCents)} • {service.durationMinutes} min
                  </small>
                </span>
              </button>
            );
          })}
        </div>}
        {!servicesLoading && available.length === 0 ? (
          <p className="muted">{'Nenhum serviço encontrado para esta busca.'}</p>
        ) : null}
        {selectedServices.length > 0 ? (
          <dl className="combo-price-summary">
            <div>
              <dt>Valor avulso</dt>
              <dd>{money(String(regularPrice))}</dd>
            </div>
            <div>
              <dt>Preço Combo</dt>
              <dd>{money(String(comboPrice))}</dd>
            </div>
            <div>
              <dt>Economia</dt>
              <dd>{money(String(savings))} <small>({savingsPercentage.toFixed(1)}%)</small></dd>
            </div>
            <div>
              <dt>Duração total</dt>
              <dd>{totalDuration} min</dd>
            </div>
          </dl>
        ) : null}
      </fieldset>
      <fieldset className="combo-form-section combo-card">
        <legend><IconUsers aria-hidden="true" size={18} /> Profissionais aptos</legend>
        <label className="combo-toggle"><input type="checkbox" checked={editorState.autoAssignByServices} onChange={(event) => setAutoAssign(event.target.checked)} /> <span>Vincular automaticamente profissionais capacitados para todos os serviços do combo.</span></label>
        {professionals && professionals.length > 0 ? <div className="professional-list">
          {professionals.map((professional) => <label className="professional-row" key={professional.publicId}>
            <span className="professional-avatar">{professional.publicName.charAt(0).toUpperCase()}</span><span>{professional.publicName}<small>Capacitado para o combo</small></span>
            <input type="checkbox" checked={autoAssign || assigned.has(professional.publicId)} disabled={autoAssign} onChange={(event) => setAssigned((current) => { const next = new Set(current); if (event.target.checked) next.add(professional.publicId); else next.delete(professional.publicId); return next; })} />
          </label>)}
        </div> : <p className="muted">Os profissionais aptos são carregados ao editar um combo salvo.</p>}
      </fieldset>
      </div>
      <aside className="combo-editor-sidebar" aria-label="Resumo do combo">
        <section className="combo-summary-card">
          <p className="combo-summary-eyebrow">Resumo financeiro</p>
          <div className="combo-summary-price">{money(String(comboPrice))}</div>
          <div className="combo-summary-metrics">
            <div><span>Duração total</span><strong>{totalDuration} min</strong></div>
            <div><span>Valor avulso</span><strong>{money(String(regularPrice))}</strong></div>
          </div>
          <div className="combo-savings-badge">
            Economia de {money(String(savings))} · {savingsPercentage.toFixed(1)}% OFF
          </div>
        </section>
        <section className="combo-preview-card">
          <p className="combo-preview-title">Visualização do Cliente <span><i aria-hidden="true" /> Live Preview</span></p>
          <div className="combo-preview-image" aria-hidden="true">
            {previewImage ?? <span>Imagem do combo</span>}
          </div>
          <h3>{form.watch('name') || 'Nome do combo'}</h3>
          <p>{totalDuration} min · {selectedItems.length} serviços inclusos</p>
          <div className="combo-preview-services">
            {selectedServices.slice(0, 3).map((service) => <span key={service.publicId}>{service.name}</span>)}
          </div>
          <strong>{money(String(comboPrice))}</strong>
        </section>
      </aside>
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
    </form>
  );
}
