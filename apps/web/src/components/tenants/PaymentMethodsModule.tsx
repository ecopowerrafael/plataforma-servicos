import { PaymentMethodListResponseSchema, PaymentMethodPublicSchema } from '@plataforma/shared';
import {
  IconBuildingBank,
  IconCash,
  IconCreditCard,
  IconDots,
  IconPlus,
  IconQrcode,
  IconWallet,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { httpClient, HttpError } from '../../lib/http.js';
import {
  EmptyState,
  FormSection,
  InlineAlert,
  ListSkeleton,
  PageHeader,
  SectionCard,
  StatusBadge,
} from '../ui/AppUi.js';

const typeLabels: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  DEBIT_CARD: 'Cartão de débito',
  CREDIT_CARD: 'Cartão de crédito',
  BANK_TRANSFER: 'Transferência',
  OTHER: 'Outro',
};

const typeDescriptions: Record<string, string> = {
  CASH: 'Pagamento presencial',
  PIX: 'Pagamento via Pix',
  DEBIT_CARD: 'Cartão de débito na maquininha',
  CREDIT_CARD: 'Cartão de crédito na maquininha',
  BANK_TRANSFER: 'Transferência bancária',
  OTHER: 'Outra forma de pagamento',
};

const typeIcons: Record<string, ReactNode> = {
  CASH: <IconCash size={20} aria-hidden="true" />,
  PIX: <IconQrcode size={20} aria-hidden="true" />,
  DEBIT_CARD: <IconCreditCard size={20} aria-hidden="true" />,
  CREDIT_CARD: <IconCreditCard size={20} aria-hidden="true" />,
  BANK_TRANSFER: <IconBuildingBank size={20} aria-hidden="true" />,
  OTHER: <IconDots size={20} aria-hidden="true" />,
};

export function PaymentMethodsModule({
  tenantPublicId,
  canManage,
}: {
  tenantPublicId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState('CASH');
  const [open, setOpen] = useState(false);

  const queryKey = ['tenant', tenantPublicId, 'payment-methods'];

  const methods = useQuery({
    queryKey,
    queryFn: () =>
      httpClient.request('/tenant/payment-methods', {
        schema: PaymentMethodListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const items = methods.data?.items ?? [];

  const create = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/payment-methods', {
        method: 'POST',
        // A ordem não é uma decisão do lojista: a nova forma entra no fim da lista.
        body: { name, type, sortOrder: items.length },
        schema: PaymentMethodPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      setName('');
      setType('CASH');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const toggleActive = useMutation({
    mutationFn: (input: { publicId: string; active: boolean }) =>
      httpClient.request(`/tenant/payment-methods/${input.publicId}`, {
        method: 'PATCH',
        body: { active: !input.active },
        schema: PaymentMethodPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const createError =
    create.error instanceof HttpError
      ? create.error.message
      : create.error instanceof Error
        ? create.error.message
        : null;

  return (
    <div className="ds-stack" aria-label="Formas de pagamento">
      <PageHeader
        eyebrow="Financeiro"
        title="Formas de pagamento"
        description="Como seus clientes podem pagar no balcão."
      />

      <SectionCard
        title="Formas disponíveis"
        description="Ative ou desative as formas aceitas pelo seu estabelecimento."
        actions={
          canManage && !open ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setOpen(true);
              }}
            >
              <IconPlus size={16} aria-hidden="true" /> Adicionar forma de pagamento
            </button>
          ) : undefined
        }
      >
        {methods.isPending ? <ListSkeleton rows={4} /> : null}
        {methods.error instanceof Error ? (
          <InlineAlert
            tone="danger"
            title="Não foi possível carregar as formas de pagamento"
            action={
              <button
                className="secondary-button"
                type="button"
                onClick={() => void methods.refetch()}
              >
                Tentar novamente
              </button>
            }
          >
            Verifique sua conexão e tente novamente.
          </InlineAlert>
        ) : null}

        {open && canManage && (
          <form
            className="app-card payment-method-form"
            aria-label="Adicionar forma de pagamento"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <FormSection legend="Nova forma de pagamento" columns={2}>
              <label>
                Nome
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
              </label>
              <label>
                Tipo
                <select
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value);
                  }}
                >
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </FormSection>
            {createError !== null && (
              <p className="form-error" role="alert">
                {createError}
              </p>
            )}
            <div className="ds-form-actions">
              <button
                className="primary-button"
                disabled={create.isPending || name.trim() === ''}
                type="submit"
              >
                {create.isPending ? 'Adicionando…' : 'Adicionar forma de pagamento'}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setOpen(false);
                  setName('');
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {methods.data !== undefined &&
          (items.length === 0 ? (
            <EmptyState
              icon={<IconWallet size={22} aria-hidden="true" />}
              title="Nenhuma forma de pagamento cadastrada."
              description="Cadastre as formas aceitas para registrar pagamentos no caixa."
            />
          ) : (
            <div className="data-list payment-method-list">
              {items.map((item) => (
                <div className="data-row payment-method-row" key={item.publicId}>
                  <span className="payment-method-icon" aria-hidden="true">
                    {typeIcons[item.type] ?? <IconWallet size={20} />}
                  </span>
                  <div className="payment-method-info">
                    <strong>{item.name}</strong>
                    <small className="muted">
                      {typeDescriptions[item.type] ?? typeLabels[item.type] ?? item.type}
                    </small>
                  </div>
                  <StatusBadge active={item.active}>
                    {item.active ? 'Ativo' : 'Inativo'}
                  </StatusBadge>
                  <div className="ds-row-actions">
                    {canManage && (
                      <button
                        className="secondary-button button--sm"
                        disabled={toggleActive.isPending}
                        type="button"
                        onClick={() => {
                          toggleActive.mutate({ publicId: item.publicId, active: item.active });
                        }}
                      >
                        {item.active ? 'Desativar' : 'Ativar'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
      </SectionCard>
    </div>
  );
}
