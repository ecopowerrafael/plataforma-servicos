import {
  CreateProductSaleRequestSchema,
  CustomerListResponseSchema,
  PaymentMethodListResponseSchema,
  ProductListResponseSchema,
  ProductSalePublicSchema,
  ProfessionalListResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { money } from './product-format.js';
import { httpClient } from '../../lib/http.js';
import { UnitSelect } from '../tenants/UnitSelect.js';

/** Venda simples de produto: baixa de estoque, comissão e caixa ficam no backend. */
export function ProductSaleDrawer({
  tenantPublicId,
  defaultUnitPublicId = '',
  onClose,
}: {
  tenantPublicId: string;
  defaultUnitPublicId?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [unit, setUnit] = useState(defaultUnitPublicId);
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [customer, setCustomer] = useState('');
  const [professional, setProfessional] = useState('');
  const [method, setMethod] = useState('');
  const [validation, setValidation] = useState<string | null>(null);
  const products = useQuery({
    queryKey: ['tenant', tenantPublicId, 'products', 'sale-picker'],
    queryFn: () =>
      httpClient.request('/tenant/products?limit=100&active=true', {
        schema: ProductListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const customers = useQuery({
    queryKey: ['tenant', tenantPublicId, 'sale-customers'],
    queryFn: () =>
      httpClient.request('/tenant/customers?limit=100&active=true', {
        schema: CustomerListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const professionals = useQuery({
    queryKey: ['tenant', tenantPublicId, 'sale-professionals'],
    queryFn: () =>
      httpClient.request('/tenant/professionals?limit=100&active=true', {
        schema: ProfessionalListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const methods = useQuery({
    queryKey: ['tenant', tenantPublicId, 'sale-payment-methods'],
    queryFn: () =>
      httpClient.request('/tenant/payment-methods', {
        schema: PaymentMethodListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });
  const selected = products.data?.items.find((item) => item.publicId === product);
  const create = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/product-sales', {
        method: 'POST',
        tenantPublicId,
        schema: ProductSalePublicSchema,
        body: CreateProductSaleRequestSchema.parse({
          unitPublicId: unit,
          customerPublicId: customer === '' ? null : customer,
          professionalPublicId: professional === '' ? null : professional,
          paymentMethodPublicId: method,
          items: [{ productPublicId: product, quantity }],
        }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'products'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'product-sales'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'stock-movements'] }),
        queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'product-summary'] }),
      ]);
      onClose();
    },
  });
  const submit = () => {
    if (unit === '' || product === '' || method === '') {
      setValidation('Informe unidade, produto e forma de pagamento.');
      return;
    }
    setValidation(null);
    create.mutate();
  };
  const total =
    selected === undefined ? null : Number(selected.salePriceCents) * (Number(quantity) || 0);
  return (
    <div className="app-drawer" role="dialog" aria-label="Registrar venda de produto">
      <div className="drawer-header">
        <h3>Registrar venda</h3>
        <button className="secondary-button" type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
      <label>
        Unidade
        <UnitSelect
          tenantPublicId={tenantPublicId}
          value={unit}
          onChange={setUnit}
          includeAllOption={false}
          onlyActive
        />
      </label>
      <label>
        Produto
        <select
          value={product}
          onChange={(event) => {
            setProduct(event.target.value);
          }}
        >
          <option value="">Selecione</option>
          {products.data?.items.map((item) => (
            <option key={item.publicId} value={item.publicId}>
              {item.name} — {money(item.salePriceCents)} ({item.stockQuantity} em estoque)
            </option>
          ))}
        </select>
      </label>
      <label>
        Quantidade
        <input
          min="1"
          type="number"
          value={quantity}
          onChange={(event) => {
            setQuantity(event.target.value);
          }}
        />
      </label>
      <label>
        Cliente
        <select
          value={customer}
          onChange={(event) => {
            setCustomer(event.target.value);
          }}
        >
          <option value="">Sem cliente</option>
          {customers.data?.items.map((item) => (
            <option key={item.publicId} value={item.publicId}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Profissional
        <select
          value={professional}
          onChange={(event) => {
            setProfessional(event.target.value);
          }}
        >
          <option value="">Sem profissional</option>
          {professionals.data?.items.map((item) => (
            <option key={item.publicId} value={item.publicId}>
              {item.publicName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Forma de pagamento
        <select
          value={method}
          onChange={(event) => {
            setMethod(event.target.value);
          }}
        >
          <option value="">Selecione</option>
          {methods.data?.items.map((item) => (
            <option key={item.publicId} value={item.publicId}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      {total !== null && <p className="muted">Total: {money(total)}</p>}
      {validation !== null && (
        <p className="form-error" role="alert">
          {validation}
        </p>
      )}
      {create.error instanceof Error && (
        <p className="form-error" role="alert">
          {create.error.message}
        </p>
      )}
      <button className="primary-button" disabled={create.isPending} type="button" onClick={submit}>
        {create.isPending ? 'Registrando…' : 'Concluir venda'}
      </button>
    </div>
  );
}
