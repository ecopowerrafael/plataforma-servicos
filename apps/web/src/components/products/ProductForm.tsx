import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateProductRequestSchema,
  type ProductCategoryPublicSchema,
  type ProductPublic,
} from '@plataforma/shared';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { money } from './product-format.js';

import type { z } from 'zod';

type ProductInput = z.input<typeof CreateProductRequestSchema>;
export type ProductSubmission = z.output<typeof CreateProductRequestSchema>;
type Category = z.infer<typeof ProductCategoryPublicSchema>;

function defaults(product?: ProductPublic): ProductInput {
  if (product === undefined)
    return {
      name: '',
      description: null,
      sku: null,
      barcode: null,
      imageAlt: null,
      categoryPublicId: null,
      costPriceCents: '0',
      salePriceCents: '0',
      commissionType: null,
      commissionValue: null,
      active: true,
    };
  return {
    name: product.name,
    description: product.description,
    sku: product.sku,
    barcode: product.barcode,
    imageAlt: product.imageAlt,
    categoryPublicId: product.categoryPublicId,
    costPriceCents: product.costPriceCents,
    salePriceCents: product.salePriceCents,
    commissionType: product.commissionType,
    commissionValue: product.commissionValue,
    active: product.active,
  };
}

/** O schema aceita vários formatos de entrada; a UI trabalha sempre com centavos em texto. */
const asCents = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
    ? String(value)
    : '0';

/** Campo monetário em reais; o backend continua recebendo centavos. */
function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (cents: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        min="0"
        step="0.01"
        type="number"
        inputMode="decimal"
        value={Number(value || '0') / 100}
        onChange={(event) => {
          const parsed = Number(event.target.value.replace(',', '.'));
          onChange(String(Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0));
        }}
      />
      <small>{money(value || '0')}</small>
    </label>
  );
}

export function ProductForm({
  busy,
  error,
  product,
  categories = [],
  showInitialStock = false,
  onSave,
}: {
  busy: boolean;
  error: string | null;
  product?: ProductPublic;
  categories?: Category[];
  showInitialStock?: boolean;
  onSave: (value: ProductSubmission, initialStock: number) => Promise<void>;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [initialStock, setInitialStock] = useState('0');
  const form = useForm<ProductInput, unknown, ProductSubmission>({
    defaultValues: defaults(product),
    resolver: zodResolver(CreateProductRequestSchema),
  });
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = form;
  const [costPriceCents, salePriceCents] = useWatch({
    control,
    name: ['costPriceCents', 'salePriceCents'],
  });
  useEffect(() => {
    reset(defaults(product));
  }, [reset, product]);
  return (
    <form
      className="platform-form product-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit((value) => onSave(value, Number(initialStock) || 0))();
      }}
    >
      <label>
        Nome
        <input {...register('name')} placeholder="Ex.: Pomada modeladora" />
      </label>
      <div className="product-form-grid">
        <MoneyField
          label="Preço de venda"
          value={asCents(salePriceCents)}
          onChange={(cents) => {
            setValue('salePriceCents', cents, { shouldDirty: true });
          }}
        />
        {showInitialStock && (
          <label>
            Estoque inicial
            <input
              min="0"
              type="number"
              value={initialStock}
              onChange={(event) => {
                setInitialStock(event.target.value);
              }}
            />
            <small>Registrado como entrada no histórico.</small>
          </label>
        )}
      </div>
      <button
        className="secondary-button product-form-toggle"
        type="button"
        onClick={() => {
          setAdvanced((value) => !value);
        }}
      >
        {advanced ? 'Ocultar configurações complementares' : 'Configurações complementares'}
      </button>
      {advanced && (
        <>
          <div className="product-form-grid">
            <MoneyField
              label="Preço de custo"
              value={asCents(costPriceCents)}
              onChange={(cents) => {
                setValue('costPriceCents', cents, { shouldDirty: true });
              }}
            />
            <label>
              Categoria
              <select
                {...register('categoryPublicId', {
                  setValueAs: (value: string) => (value === '' ? null : value),
                })}
              >
                <option value="">Sem categoria</option>
                {categories
                  .filter(
                    (category) => category.active || category.publicId === product?.categoryPublicId,
                  )
                  .map((category) => (
                    <option key={category.publicId} value={category.publicId}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="product-form-grid">
            <label>
              SKU
              <input
                {...register('sku', { setValueAs: (v: string) => (v === '' ? null : v) })}
              />
            </label>
            <label>
              Código de barras
              <input
                {...register('barcode', { setValueAs: (v: string) => (v === '' ? null : v) })}
              />
            </label>
          </div>
          <label>
            Descrição
            <textarea
              {...register('description', { setValueAs: (v: string) => (v === '' ? null : v) })}
            />
          </label>
          <label>
            Texto alternativo da imagem
            <input
              {...register('imageAlt', { setValueAs: (v: string) => (v === '' ? null : v) })}
            />
          </label>
          <div className="product-form-grid">
            <label>
              Comissão
              <select
                {...register('commissionType', {
                  setValueAs: (value: string) => (value === '' ? null : value),
                })}
              >
                <option value="">Sem comissão</option>
                <option value="PERCENTAGE">Percentual</option>
                <option value="FIXED">Valor fixo</option>
              </select>
            </label>
            <label>
              Valor da comissão
              <input
                min="0"
                type="number"
                {...register('commissionValue', {
                  setValueAs: (value: string) => (value === '' ? null : Number(value)),
                })}
              />
            </label>
          </div>
          <label className="product-form-check">
            <input type="checkbox" {...register('active')} />
            Produto ativo
          </label>
        </>
      )}
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
      <button className="primary-button" disabled={busy} type="submit">
        {busy ? 'Salvando…' : 'Salvar produto'}
      </button>
    </form>
  );
}
