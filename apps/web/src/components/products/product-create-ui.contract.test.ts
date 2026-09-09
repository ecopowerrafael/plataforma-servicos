import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const catalogSource = readFileSync(
  new URL('./ProductCatalog.tsx', import.meta.url),
  'utf8',
);
const formSource = readFileSync(new URL('./ProductForm.tsx', import.meta.url), 'utf8');
const rowSource = readFileSync(new URL('./ProductUIComponents.tsx', import.meta.url), 'utf8');
const imageUploadSource = readFileSync(
  new URL('./ProductImageUpload.tsx', import.meta.url),
  'utf8',
);

describe('product creation UI contract', () => {
  it('uses one catalog CTA/search experience instead of the duplicated ProductHeader', () => {
    expect(catalogSource).not.toContain('ProductHeader');
    expect(catalogSource).toContain('<PageHeader');
    expect(catalogSource).toContain('<PageToolbar>');
    expect(catalogSource).toContain('setCreating(true)');
  });

  it('opens creation in a dialog drawer with cancel and save actions inside the form', () => {
    expect(catalogSource).toContain('role="dialog"');
    expect(catalogSource).toContain('className="product-create-drawer"');
    expect(formSource).toContain('className="product-form-footer"');
    expect(formSource).toContain('Cancelar');
    expect(formSource).toContain('Salvar produto');
  });

  it('keeps the selected image locally before save and allows removal', () => {
    expect(formSource).toContain('selectedImage?: File | null');
    expect(catalogSource).toContain('const [selectedImage, setSelectedImage] = useState<File | null>(null)');
    expect(formSource).toContain('URL.createObjectURL(selectedImage)');
    expect(formSource).toContain('validateProductImageFile(file)');
    expect(formSource).toContain('onImageChange(null)');
    expect(formSource).toContain('Remover imagem selecionada');
  });

  it('creates the product, preserves initial stock movement, then uploads image to the existing endpoint', () => {
    const productCreateIndex = catalogSource.indexOf("httpClient.request('/tenant/products'");
    const stockMovementIndex = catalogSource.indexOf("httpClient.request('/tenant/stock-movements'");
    const imageUploadIndex = catalogSource.indexOf(
      '.request(`/tenant/products/${product.publicId}/image`',
    );

    expect(productCreateIndex).toBeGreaterThan(-1);
    expect(stockMovementIndex).toBeGreaterThan(productCreateIndex);
    expect(imageUploadIndex).toBeGreaterThan(productCreateIndex);
    expect(catalogSource).toContain('if (image !== null)');
    expect(catalogSource).toContain('image: selectedImage');
    expect(catalogSource).toContain("method: 'PUT'");
    expect(catalogSource).toContain('imageUploadFailed = true');
    expect(catalogSource).toContain('Produto salvo, mas a imagem não pôde ser enviada');
  });

  it('shares image validation with the existing product detail uploader', () => {
    expect(imageUploadSource).toContain('PRODUCT_IMAGE_ALLOWED_TYPES');
    expect(imageUploadSource).toContain('PRODUCT_IMAGE_MAX_BYTES');
    expect(imageUploadSource).toContain('validateProductImageFile');
    expect(imageUploadSource).toContain('image/jpeg');
    expect(imageUploadSource).toContain('image/png');
    expect(imageUploadSource).toContain('image/webp');
    expect(imageUploadSource).toContain('5 * 1024 * 1024');
  });

  it('renders catalog rows with thumbnail image support and a fallback initial', () => {
    expect(rowSource).toContain('imageUrl: string | null');
    expect(rowSource).toContain('TenantServiceImage');
    expect(rowSource).toContain("kind=\"products\"");
    expect(rowSource).toContain("name.slice(0, 1).toUpperCase()");
    expect(catalogSource).toContain('imageUrl={product.imageUrl}');
    expect(catalogSource).toContain('imageAlt={product.imageAlt ?? product.name}');
  });
});
