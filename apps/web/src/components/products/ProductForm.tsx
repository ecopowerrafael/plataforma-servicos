import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateProductRequestSchema,
  type ProductCategoryPublicSchema,
  type ProductPublic,
} from '@plataforma/shared';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { money } from './product-format.js';
import { validateProductImageFile } from './ProductImageUpload.js';

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
  selectedImage = null,
  onCancel,
  onCreateCategory,
  onImageChange,
  onSave,
}: {
  busy: boolean;
  error: string | null;
  product?: ProductPublic;
  categories?: Category[];
  showInitialStock?: boolean;
  selectedImage?: File | null;
  onCancel?: () => void;
  onCreateCategory?: (name: string) => Promise<Category>;
  onImageChange?: (file: File | null) => void;
  onSave: (value: ProductSubmission, initialStock: number) => Promise<void>;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [initialStock, setInitialStock] = useState('0');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryBusy, setCategoryBusy] = useState(false);
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
  useEffect(() => {
    if (selectedImage === null) {
      setImagePreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedImage);
    setImagePreview(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedImage]);
  const chooseImage = (file: File | undefined) => {
    if (file === undefined || onImageChange === undefined) return;
    const validationError = validateProductImageFile(file);
    if (validationError !== null) {
      setImageError(validationError);
      onImageChange(null);
      return;
    }
    setImageError(null);
    onImageChange(file);
  };
  const createCategory = async () => {
    const name = categoryName.trim();
    if (onCreateCategory === undefined) return;
    if (name.length < 2) {
      setCategoryError('Informe um nome com pelo menos 2 caracteres.');
      return;
    }
    setCategoryBusy(true);
    setCategoryError(null);
    try {
      const category = await onCreateCategory(name);
      setValue('categoryPublicId', category.publicId, { shouldDirty: true });
      setCategoryName('');
      setCreatingCategory(false);
    } catch (caught) {
      setCategoryError(
        caught instanceof Error ? caught.message : 'Não foi possível criar a categoria.',
      );
    } finally {
      setCategoryBusy(false);
    }
  };
  return (
    <form
      className="product-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit((value) => onSave(value, Number(initialStock) || 0))();
      }}
    >
      {onImageChange !== undefined && (
        <section className="product-form-section product-form-image-section">
          <h3>Imagem</h3>
          <div className="product-image-picker">
            <div className="product-image-picker-preview">
              {imagePreview === null ? (
                <span aria-hidden="true">+</span>
              ) : (
                <img alt="Pré-visualização da imagem do produto" src={imagePreview} />
              )}
            </div>
            <div className="product-image-picker-actions">
              <label className="secondary-button">
                {selectedImage === null ? 'Escolher imagem' : 'Trocar imagem'}
                <input
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  type="file"
                  onChange={(event) => {
                    chooseImage(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </label>
              <small>JPEG, PNG ou WebP • até 5 MB</small>
              {selectedImage !== null && (
                <button
                  className="text-button"
                  disabled={busy}
                  type="button"
                  onClick={() => {
                    setImageError(null);
                    onImageChange(null);
                  }}
                >
                  Remover imagem selecionada
                </button>
              )}
            </div>
          </div>
          {imageError !== null && (
            <p className="form-error" role="alert">
              {imageError}
            </p>
          )}
        </section>
      )}
      <section className="product-form-section">
        <h3>Informações do produto</h3>
        <div className="product-form-grid product-info-fields">
          <label>
            Nome *
            <input {...register('name')} placeholder="Ex.: Pomada modeladora" />
          </label>
          <label>
            Categoria
            <span className="product-category-select-row">
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
              {onCreateCategory !== undefined && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setCreatingCategory(true);
                  }}
                >
                  + Nova categoria
                </button>
              )}
            </span>
            {creatingCategory && onCreateCategory !== undefined && (
              <span className="product-inline-category">
                <strong>Nova categoria</strong>
                <input
                  placeholder="Nome"
                  value={categoryName}
                  onChange={(event) => {
                    setCategoryName(event.target.value);
                  }}
                />
                {categoryError !== null && (
                  <small className="form-error" role="alert">
                    {categoryError}
                  </small>
                )}
                <span>
                  <button
                    className="secondary-button"
                    disabled={categoryBusy}
                    type="button"
                    onClick={() => {
                      setCategoryName('');
                      setCategoryError(null);
                      setCreatingCategory(false);
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    className="primary-button"
                    disabled={categoryBusy}
                    type="button"
                    onClick={() => {
                      void createCategory();
                    }}
                  >
                    {categoryBusy ? 'Criando…' : 'Criar categoria'}
                  </button>
                </span>
              </span>
            )}
          </label>
        </div>
        <label className="product-description-field">
            Descrição
            <textarea
              {...register('description', { setValueAs: (v: string) => (v === '' ? null : v) })}
            />
        </label>
      </section>
      <section className="product-form-section">
        <h3>Preços e estoque</h3>
        <div className="product-form-grid product-form-price-grid">
          <MoneyField
            label="Preço de venda *"
            value={asCents(salePriceCents)}
            onChange={(cents) => {
              setValue('salePriceCents', cents, { shouldDirty: true });
            }}
          />
          <MoneyField
            label="Preço de custo"
            value={asCents(costPriceCents)}
            onChange={(cents) => {
              setValue('costPriceCents', cents, { shouldDirty: true });
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
      </section>
      <section className="product-form-section">
        <h3>Configurações complementares</h3>
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
            <label>
              Texto alternativo da imagem
              <input
                {...register('imageAlt', { setValueAs: (v: string) => (v === '' ? null : v) })}
              />
            </label>
            <label className="product-form-check">
              <input type="checkbox" {...register('active')} />
              Produto ativo
            </label>
          </>
        )}
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
      <footer className="product-form-footer">
        {onCancel !== undefined && (
          <button className="secondary-button" disabled={busy} type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button className="primary-button" disabled={busy} type="submit">
          {busy ? 'Salvando…' : 'Salvar produto'}
        </button>
      </footer>
    </form>
  );
}
