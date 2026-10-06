import {
  CustomerListResponseSchema,
  CustomerMembershipPublicSchema,
  type CustomerListItem,
  type CustomerMembershipPlanPublic,
} from '@plataforma/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { httpClient } from '../../lib/http.js';
import { EmptyState, InlineAlert, ListSkeleton } from '../ui/AppUi.js';
import './CustomerMembershipCreateDrawer.css';

const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  tenantPublicId: string;
  plans: CustomerMembershipPlanPublic[];
  onClose: () => void;
  onCreated: (
    membership: { publicId: string; status: string },
    customer: CustomerListItem,
    plan: CustomerMembershipPlanPublic,
  ) => Promise<void> | void;
}

export function CustomerMembershipCreateDrawer({
  tenantPublicId,
  plans,
  onClose,
  onCreated,
}: Props) {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerListItem | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<CustomerMembershipPlanPublic | null>(null);
  const [step, setStep] = useState<'customer' | 'plan' | 'confirm'>('customer');
  const navigate = useNavigate();
  const activePlans = plans.filter((plan) => plan.active);
  const customers = useQuery({
    queryKey: ['tenant', tenantPublicId, 'membership-new-customers', search],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', limit: '20', active: 'true' });
      if (search.trim() !== '') params.set('search', search.trim());
      return httpClient.request(`/tenant/customers?${params.toString()}`, {
        tenantPublicId,
        schema: CustomerListResponseSchema,
      });
    },
    retry: false,
  });
  const create = useMutation({
    mutationFn: () => {
      if (selectedCustomer === null || selectedPlan === null)
        throw new Error('Selecione um cliente e um plano de mensalidade.');
      return httpClient.request(`/tenant/customers/${selectedCustomer.publicId}/membership`, {
        method: 'POST',
        tenantPublicId,
        body: { planPublicId: selectedPlan.publicId },
        schema: CustomerMembershipPublicSchema,
      });
    },
    onSuccess: async (membership) => {
      if (selectedCustomer !== null && selectedPlan !== null)
        await onCreated(membership, selectedCustomer, selectedPlan);
    },
  });
  const errorMessage =
    create.error instanceof Error
      ? create.error.message
      : 'Não foi possível criar a mensalidade. Tente novamente.';
  return (
    <>
      <button className="membership-create-backdrop" aria-label="Fechar" onClick={onClose} />
      <aside
        className="app-drawer membership-create-drawer"
        role="dialog"
        aria-label="Novo assinante"
      >
        <header className="membership-create-header">
          <div>
            <span>Assinantes</span>
            <h2>Novo assinante</h2>
            <p>Crie uma mensalidade para um cliente existente.</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="membership-create-content">
          <nav className="membership-create-steps" aria-label="Etapas da criação">
            <span className={step === 'customer' ? 'is-active' : ''}>1. Cliente</span>
            <span className={step === 'plan' ? 'is-active' : ''}>2. Plano</span>
            <span className={step === 'confirm' ? 'is-active' : ''}>3. Confirmar</span>
          </nav>
          {step === 'customer' ? (
            <section className="membership-create-section">
              <label htmlFor="membership-customer-search">
                Buscar cliente por nome, telefone ou e-mail
              </label>
              <input
                id="membership-customer-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Digite para buscar..."
                autoFocus
              />
              {customers.isPending ? (
                <ListSkeleton count={3} />
              ) : customers.error ? (
                <InlineAlert tone="danger" title="Erro ao buscar clientes">
                  Não foi possível carregar os clientes.
                </InlineAlert>
              ) : customers.data?.items.length === 0 ? (
                <EmptyState
                  title="Nenhum cliente encontrado"
                  description="Cadastre o cliente antes de criar a mensalidade."
                />
              ) : (
                <div className="membership-create-options" role="listbox" aria-label="Clientes">
                  {customers.data?.items.map((customer) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedCustomer?.publicId === customer.publicId}
                      className={
                        selectedCustomer?.publicId === customer.publicId ? 'is-selected' : ''
                      }
                      key={customer.publicId}
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setStep('plan');
                      }}
                    >
                      <strong>{customer.socialName ?? customer.name}</strong>
                      <span>{customer.email ?? customer.phone ?? 'Contato não informado'}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}
          {step === 'plan' ? (
            <section className="membership-create-section">
              <div className="membership-create-selected">
                <span>Cliente selecionado</span>
                <strong>{selectedCustomer?.socialName ?? selectedCustomer?.name}</strong>
                <small>
                  {selectedCustomer?.email ?? selectedCustomer?.phone ?? 'Contato não informado'}
                </small>
                <button type="button" onClick={() => setStep('customer')}>
                  Trocar cliente
                </button>
              </div>
              <h3>Selecione o plano de mensalidade</h3>
              {activePlans.length === 0 ? (
                <EmptyState
                  title="Nenhum plano de mensalidade ativo"
                  description="Ative ou crie um plano antes de adicionar um assinante."
                  action={
                    <button
                      type="button"
                      className="membership-create-link"
                      onClick={() => navigate('/app/assinaturas/planos')}
                    >
                      Criar plano
                    </button>
                  }
                />
              ) : (
                <div
                  className="membership-create-options membership-create-plans"
                  role="listbox"
                  aria-label="Planos ativos"
                >
                  {activePlans.map((plan) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedPlan?.publicId === plan.publicId}
                      className={selectedPlan?.publicId === plan.publicId ? 'is-selected' : ''}
                      key={plan.publicId}
                      onClick={() => {
                        setSelectedPlan(plan);
                        setStep('confirm');
                      }}
                    >
                      <strong>{plan.name}</strong>
                      <b>
                        {money(plan.priceCents)}
                        <small>/mês</small>
                      </b>
                      <span>
                        {plan.benefits
                          .slice(0, 3)
                          .map((benefit) =>
                            benefit.type === 'UNLIMITED'
                              ? `${benefit.serviceName}: ilimitado`
                              : benefit.type === 'DISCOUNT'
                                ? `${benefit.discountPercent ?? 0}% em ${benefit.serviceName}`
                                : `${benefit.quantityPerCycle ?? 0}x ${benefit.serviceName}`,
                          )
                          .join(' · ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}
          {step === 'confirm' && selectedCustomer !== null && selectedPlan !== null ? (
            <section className="membership-create-section">
              <h3>Confirme os dados</h3>
              <dl className="membership-create-summary">
                <div>
                  <dt>Cliente</dt>
                  <dd>{selectedCustomer.socialName ?? selectedCustomer.name}</dd>
                </div>
                <div>
                  <dt>Plano</dt>
                  <dd>{selectedPlan.name}</dd>
                </div>
                <div>
                  <dt>Mensalidade</dt>
                  <dd>{money(selectedPlan.priceCents)}</dd>
                </div>
                <div>
                  <dt>Periodicidade</dt>
                  <dd>Mensal</dd>
                </div>
                <div>
                  <dt>Benefícios</dt>
                  <dd>{selectedPlan.benefits.map((benefit) => benefit.serviceName).join(', ')}</dd>
                </div>
              </dl>
              {create.error ? (
                <InlineAlert tone="danger" title="Não foi possível criar a mensalidade">
                  {errorMessage}
                </InlineAlert>
              ) : null}
              <div className="membership-create-actions">
                <button type="button" onClick={() => setStep('plan')} disabled={create.isPending}>
                  Voltar
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => create.mutate()}
                  disabled={create.isPending}
                >
                  {create.isPending ? 'Criando…' : 'Criar mensalidade'}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </>
  );
}
