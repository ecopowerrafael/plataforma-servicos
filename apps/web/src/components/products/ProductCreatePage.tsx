import {
  CreateProductRequestSchema,
  CreateStockMovementRequestSchema,
  ProductCategoryListResponseSchema,
  ProductPublicSchema,
  StockMovementPublicSchema,
  TenantUnitsResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ProductForm, type ProductSubmission } from './ProductForm.js';
import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton } from '../ui/AppUi.js';

export function ProductCreatePage({ tenantPublicId }: { tenantPublicId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const categories = useQuery({
    queryKey: ['tenant', tenantPublicId, 'product-categories'],
    queryFn: () =>
      httpClient.request('/tenant/product-categories', {
        schema: ProductCategoryListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const units = useQuery({
    queryKey: ['tenant', tenantPublicId, 'units'],
    queryFn: () =>
      httpClient.request('/tenant/units', {
        schema: TenantUnitsResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const activeUnits = (units.data?.units ?? []).filter((item) => item.status === 'ACTIVE');
  const create = useMutation({
    mutationFn: async ({
      body,
      initialStock,
      image,
    }: {
      body: ProductSubmission;
      initialStock: number;
      image: File | null;
    }) => {
      const product = await httpClient.request('/tenant/products', {
        method: 'POST',
        tenantPublicId,
        schema: ProductPublicSchema,
        body: CreateProductRequestSchema.parse(body),
      });
      const targetUnit = activeUnits[0]?.publicId;
      // Saldo inicial entra como movimentação, para não divergir do histórico.
      if (initialStock > 0 && targetUnit !== undefined)
        await httpClient.request('/tenant/stock-movements', {
          method: 'POST',
          tenantPublicId,
          schema: StockMovementPublicSchema,
          body: CreateStockMovementRequestSchema.parse({
            type: 'ENTRY',
            productPublicId: product.publicId,
            unitPublicId: targetUnit,
            quantity: initialStock,
            reason: 'Estoque inicial do cadastro.',
          }),
        });
      let imageUploadFailed = false;
      if (image !== null) {
        const imageBody = new FormData();
        imageBody.set('file', image, image.name);
        await httpClient
          .request(`/tenant/products/${product.publicId}/image`, {
            method: 'PUT',
            tenantPublicId,
            schema: ProductPublicSchema,
            body: imageBody,
          })
          .catch(() => {
            imageUploadFailed = true;
          });
      }
      return { product, imageUploadFailed };
    },
    onSuccess: async ({ product, imageUploadFailed }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'products'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'product-summary'] }),
      ]);
      setSelectedImage(null);
      if (imageUploadFailed)
        window.alert(
          'Produto salvo, mas a imagem não pôde ser enviada. Você pode tentar novamente na página de detalhe do produto.',
        );
      void navigate(`/app/produtos/${product.publicId}`);
    },
  });

  if (categories.isPending || units.isPending)
    return (
      <section className="sessions-panel product-create-page">
        <ListSkeleton rows={6} />
      </section>
    );

  if (categories.error instanceof Error || units.error instanceof Error)
    return (
      <section className="sessions-panel product-create-page">
        <button className="crm-back-button" onClick={() => void navigate('/app/produtos')}>
          ← Produtos
        </button>
        <EmptyState
          title="Não foi possível preparar o cadastro."
          description="Verifique sua conexão e tente novamente."
          action={
            <button className="secondary-button" onClick={() => void navigate('/app/produtos')}>
              Voltar aos produtos
            </button>
          }
        />
      </section>
    );

  return (
    <section className="sessions-panel product-create-page">
      <button className="crm-back-button" onClick={() => void navigate('/app/produtos')}>
        ← Produtos
      </button>
      <header className="product-create-page-header">
        <p className="ds-eyebrow">Catálogo</p>
        <h1>Novo produto</h1>
        <span>Cadastre as informações, estoque e imagem do produto.</span>
      </header>
      <ProductForm
        busy={create.isPending}
        categories={categories.data?.items ?? []}
        error={create.error instanceof Error ? create.error.message : null}
        selectedImage={selectedImage}
        showInitialStock={activeUnits.length > 0}
        onCancel={() => {
          void navigate('/app/produtos');
        }}
        onImageChange={setSelectedImage}
        onSave={(body, initialStock) =>
          create.mutateAsync({ body, initialStock, image: selectedImage }).then(() => undefined)
        }
      />
    </section>
  );
}
