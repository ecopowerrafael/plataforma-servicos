import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateComboRequestSchema,
  type ComboPublicSchema,
  type ServicePublicSchema,
} from '@plataforma/shared';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { IconClock, IconSearch, IconStack2, IconTag, IconUsers } from '@tabler/icons-react';

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
  onSave,
  onCancel,
  onDeactivate,
}: {
  busy: boolean;
  error: string | null;
  combo?: Combo;
  services: Service[];
  servicesLoading?: boolean;
  onSave: (value: ComboSubmission) => Promise<void>;
  onCancel?: () => void;
  onDeactivate?: () => void;
  professionals?: { publicId: string; publicName: string }[];
  imageSection?: ReactNode;
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
      className="combo-form"
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
      <div className="combo-form-inner">
      <div className="combo-form-breadcrumb"><nav>Catálogo &gt; Combos &gt; <span>{combo === undefined ? 'Novo' : 'Editar'}</span></nav><h1>{form.watch('name') || (combo === undefined ? 'Novo combo' : 'Editar combo')}</h1></div>
      <section className="combo-form-card combo-info-card">
        <header className="combo-card-header"><h2><IconTag aria-hidden="true" size={18} /> Informações do combo</h2><p>Defina o nome, preço e como esta oferta será apresentada.</p></header>
        <div className="combo-form-grid combo-info-main-grid">
          <label>
            Nome do Combo
            <input {...register('name')} />
          </label>
          <label>
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
            {'Ordem'}
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
        </div>
      </section>
      <section className="combo-form-card combo-image-card">
        <header className="combo-card-header"><h2>Imagem do combo</h2><p>Use uma imagem que represente esta oferta para seus clientes.</p></header>
        <div className="combo-image-layout"><div>{imageSection}</div><label>Texto alternativo da imagem<input {...register('imageAlt')} /><small>Usado quando a imagem não pode ser exibida.</small></label></div>
      </section>
      <section className="combo-form-card combo-services-card">
        <header className="combo-card-header"><h2><IconStack2 aria-hidden="true" size={18} /> Serviços incluídos</h2><p>Escolha os serviços que fazem parte deste combo.</p></header>
        <div className="combo-picker-toolbar">
          <label className="app-search-field combo-service-search"><IconSearch aria-hidden="true" size={17} />
            <input
              type="search"
              value={search}
              placeholder="Buscar serviço..."
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
                <span className="combo-service-checkbox" aria-hidden="true" data-checked={selected ? 'true' : 'false'} />
                <span className="combo-service-body">
                  <strong>{service.name}</strong>
                  <small>
                    {money(service.priceCents)} • {service.durationMinutes} min
                  </small>
                </span>
                {selected && <span className="combo-service-order"><button type="button" disabled={selectedItems.findIndex((item) => item.servicePublicId === service.publicId) === 0} onClick={(event) => { event.stopPropagation(); const index = selectedItems.findIndex((item) => item.servicePublicId === service.publicId); const next = [...selectedItems]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setValue('items', next, { shouldDirty: true }); }}>↑</button><button type="button" disabled={selectedItems.findIndex((item) => item.servicePublicId === service.publicId) === selectedItems.length - 1} onClick={(event) => { event.stopPropagation(); const index = selectedItems.findIndex((item) => item.servicePublicId === service.publicId); const next = [...selectedItems]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; setValue('items', next, { shouldDirty: true }); }}>↓</button></span>}
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
      </section>
      <section className="combo-form-card combo-professionals-card">
        <header className="combo-card-header"><h2><IconUsers aria-hidden="true" size={18} /> Profissionais</h2><p>Defina quais profissionais podem executar este combo.</p></header>
        <label className="combo-toggle"><input type="checkbox" checked={editorState.autoAssignByServices} onChange={(event) => setAutoAssign(event.target.checked)} /> <span>Vincular automaticamente profissionais capacitados para todos os serviços do combo.</span></label>
        {professionals && professionals.length > 0 && <h3 className="combo-subheading">Profissionais disponíveis</h3>}
        {professionals && professionals.length > 0 ? <div className="professional-list">
          {professionals.map((professional) => <label className="professional-row" key={professional.publicId}>
            <span className="professional-avatar">{professional.publicName.charAt(0).toUpperCase()}</span><span>{professional.publicName}<small>Capacitado para o combo</small></span>
            <input type="checkbox" checked={autoAssign || assigned.has(professional.publicId)} disabled={autoAssign} onChange={(event) => setAssigned((current) => { const next = new Set(current); if (event.target.checked) next.add(professional.publicId); else next.delete(professional.publicId); return next; })} />
          </label>)}
        </div> : <p className="muted">Os profissionais aptos são carregados ao editar um combo salvo.</p>}
      </section>
      <section className="combo-form-card combo-summary-card">
        <header className="combo-card-header"><h2>Resumo financeiro</h2><p>Confira valores, duração e economia desta oferta.</p></header>
        <dl className="combo-price-summary">
          <div><dt>Valor individual</dt><dd>{money(String(regularPrice))}</dd></div>
          <div className="combo-price-highlight"><dt>Preço do combo</dt><dd>{money(String(comboPrice))}</dd></div>
          <div className={savings > 0 ? 'combo-saving-positive' : ''}><dt>Economia</dt><dd>{money(String(savings))} <small>{savingsPercentage.toFixed(1)}%</small></dd></div>
          <div><dt>Duração total</dt><dd>{totalDuration} min</dd></div>
        </dl>
      </section>
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
      <footer className="combo-form-actions"><span>{combo !== undefined && combo.active && <button className="danger-button" type="button" onClick={onDeactivate}>Desativar/Excluir</button>}</span><span><button type="button" onClick={onCancel}>Cancelar</button><button type="submit" disabled={busy} className="primary-button">{busy ? 'Salvando…' : (combo === undefined ? 'Criar combo' : 'Salvar alterações')}</button></span></footer>
      </div>
    </form>
  );
}
