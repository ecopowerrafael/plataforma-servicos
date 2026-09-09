import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const catalogSource = readFileSync(
  new URL('./ProductCatalog.tsx', import.meta.url),
  'utf8',
);
const createPageSource = readFileSync(
  new URL('./ProductCreatePage.tsx', import.meta.url),
  'utf8',
);
const formSource = readFileSync(new URL('./ProductForm.tsx', import.meta.url), 'utf8');
const rowSource = readFileSync(new URL('./ProductUIComponents.tsx', import.meta.url), 'utf8');
const imageUploadSource = readFileSync(
  new URL('./ProductImageUpload.tsx', import.meta.url),
  'utf8',
);
const routerSource = readFileSync(new URL('../../router.tsx', import.meta.url), 'utf8');
const homePageSource = readFileSync(new URL('../../routes/HomePage.tsx', import.meta.url), 'utf8');
const productStylesSource = readFileSync(
  new URL('../../styles/financial-products.css', import.meta.url),
  'utf8',
);

describe('product creation UI contract', () => {
  it('uses one catalog CTA/search experience and navigates creation to the dedicated page', () => {
    expect(catalogSource).not.toContain('ProductHeader');
    expect(catalogSource).not.toContain('<ProductForm');
    expect(catalogSource).toContain('<PageHeader');
    expect(catalogSource).toContain('<PageToolbar>');
    expect(catalogSource).toContain("navigate('/app/produtos/novo')");
  });

  it('renders product creation as a dedicated page, not a modal or drawer', () => {
    expect(catalogSource).not.toContain('product-create-drawer');
    expect(catalogSource).not.toContain('role="dialog"');
    expect(createPageSource).toContain('className="sessions-panel product-create-page"');
    expect(createPageSource).toContain('Novo produto');
    expect(createPageSource).toContain('Cadastre as informações, estoque e imagem do produto.');
    expect(createPageSource).toContain('<ProductForm');
    expect(formSource).toContain('className="product-form-footer"');
    expect(formSource).toContain('Cancelar');
    expect(formSource).toContain('Salvar produto');
  });

  it('registers /app/produtos/novo before /app/produtos/:id and excludes it from ProductProfile', () => {
    expect(routerSource.indexOf("path: '/app/produtos/novo'")).toBeGreaterThan(-1);
    expect(routerSource.indexOf("path: '/app/produtos/:id'")).toBeGreaterThan(
      routerSource.indexOf("path: '/app/produtos/novo'"),
    );
    expect(homePageSource).toContain("isRoute('/app/produtos/novo')");
    expect(homePageSource).toContain('ProductCreatePage');
    expect(homePageSource).toContain("'/app/produtos/novo'");
  });

  it('cancel returns explicitly to the catalog page', () => {
    expect(createPageSource).toContain("navigate('/app/produtos')");
    expect(createPageSource).not.toContain('navigate(-1)');
  });

  it('keeps the create form vertical and uses only inner grids for product information', () => {
    expect(productStylesSource).toContain(
      '.app-shell .product-create-page .platform-form.product-form',
    );
    expect(productStylesSource).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(productStylesSource).toContain('.product-form-section');
    expect(productStylesSource).toContain('grid-column: 1 / -1');
    expect(productStylesSource).toContain(
      'grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr)',
    );
    expect(productStylesSource).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(productStylesSource).not.toContain('repeat(4');
  });

  it('supports inline category creation for authorized product managers', () => {
    expect(formSource).toContain('onCreateCategory?: (name: string) => Promise<Category>');
    expect(formSource).toContain('+ Nova categoria');
    expect(formSource).toContain('product-inline-category');
    expect(createPageSource).toContain("httpClient.request('/tenant/product-categories'");
    expect(createPageSource).toContain('CreateProductCategoryRequestSchema.parse');
    expect(createPageSource).toContain('product-categories');
  });

  it('auto-selects the newly created category without clearing product form data', () => {
    expect(formSource).toContain("setValue('categoryPublicId', category.publicId");
    expect(formSource).toContain('setCategoryName');
    expect(formSource).toContain('setCreatingCategory(false)');
  });

  it('keeps the selected image locally before save and allows removal', () => {
    expect(formSource).toContain('selectedImage?: File | null');
    expect(createPageSource).toContain('const [selectedImage, setSelectedImage] = useState<File | null>(null)');
    expect(formSource).toContain('URL.createObjectURL(selectedImage)');
    expect(formSource).toContain('validateProductImageFile(file)');
    expect(formSource).toContain('onImageChange(null)');
    expect(formSource).toContain('Remover imagem selecionada');
  });

  it('creates the product, preserves initial stock movement, then uploads image to the existing endpoint', () => {
    const productCreateIndex = createPageSource.indexOf("httpClient.request('/tenant/products'");
    const stockMovementIndex = createPageSource.indexOf("httpClient.request('/tenant/stock-movements'");
    const imageUploadIndex = createPageSource.indexOf(
      '.request(`/tenant/products/${product.publicId}/image`',
    );

    expect(productCreateIndex).toBeGreaterThan(-1);
    expect(stockMovementIndex).toBeGreaterThan(productCreateIndex);
    expect(imageUploadIndex).toBeGreaterThan(productCreateIndex);
    expect(createPageSource).toContain('if (image !== null)');
    expect(createPageSource).toContain('image: selectedImage');
    expect(createPageSource).toContain("method: 'PUT'");
    expect(createPageSource).toContain('imageUploadFailed = true');
    expect(createPageSource).toContain('Produto salvo, mas a imagem não pôde ser enviada');
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
