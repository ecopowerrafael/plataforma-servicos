import {
  CustomerMembershipPlanListResponseSchema,
  CustomerMembershipPlanPublicSchema,
  ServiceListResponseSchema,
  type CustomerMembershipPlanPublic,
  type MembershipBenefitType,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import './CustomerMembershipPlansModule.css';
import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader } from '../ui/AppUi.js';
import { CustomerMembershipSubscribersSection } from './CustomerMembershipSubscribersSection.js';

type MembershipSection = 'overview' | 'plans' | 'subscribers' | 'usage';

interface BenefitDraft {
  publicId?: string;
  servicePublicId: string;
  type: MembershipBenefitType;
  quantityPerCycle: string;
  discountPercent: string;
}

interface PlanDraft {
  name: string;
  description: string;
  price: string;
  active: boolean;
  benefits: BenefitDraft[];
}

const emptyPlan = (): PlanDraft => ({
  name: '',
  description: '',
  price: '',
  active: true,
  benefits: [],
});

const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const planToDraft = (plan: CustomerMembershipPlanPublic): PlanDraft => ({
  name: plan.name,
  description: plan.description ?? '',
  price: (plan.priceCents / 100).toFixed(2).replace('.', ','),
  active: plan.active,
  benefits: plan.benefits.map((benefit) => ({
    publicId: benefit.publicId,
    servicePublicId: benefit.servicePublicId,
    type: benefit.type,
    quantityPerCycle: benefit.quantityPerCycle?.toString() ?? '',
    discountPercent: benefit.discountPercent?.toString() ?? '',
  })),
});

const priceToCents = (value: string): number => {
  const normalized = value.replace(/\s/gu, '').replace(/\./gu, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : -1;
};

const benefitLabel = (benefit: CustomerMembershipPlanPublic['benefits'][number]) => {
  if (benefit.type === 'UNLIMITED') return `${benefit.serviceName} ilimitado`;
  if (benefit.type === 'DISCOUNT')
    return `${String(benefit.discountPercent ?? 0)}% em ${benefit.serviceName}`;
  return `${String(benefit.quantityPerCycle ?? 0)}x ${benefit.serviceName} por mês`;
};

function validateDraft(draft: PlanDraft): string | null {
  if (draft.name.trim().length === 0) return 'Informe o nome do plano.';
  if (priceToCents(draft.price) < 0) return 'Informe um preço válido.';
  if (draft.benefits.length === 0) return 'Adicione ao menos um benefício.';
  const services = new Set<string>();
  for (const benefit of draft.benefits) {
    if (!benefit.servicePublicId) return 'Selecione o serviço de todos os benefícios.';
    if (services.has(benefit.servicePublicId))
      return 'O mesmo serviço não pode aparecer duas vezes no plano.';
    services.add(benefit.servicePublicId);
    if (benefit.type === 'QUANTITY' && Number(benefit.quantityPerCycle) <= 0)
      return 'A quantidade por ciclo deve ser maior que zero.';
    if (
      benefit.type === 'DISCOUNT' &&
      (Number(benefit.discountPercent) <= 0 || Number(benefit.discountPercent) > 100)
    )
      return 'O desconto deve estar entre 1% e 100%.';
  }
  return null;
}

export function CustomerMembershipPlansModule({
  tenantPublicId,
  section,
  canManage,
}: {
  tenantPublicId: string;
  section: MembershipSection;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CustomerMembershipPlanPublic | 'new' | null>(null);
  const [draft, setDraft] = useState<PlanDraft>(emptyPlan);
  const [formError, setFormError] = useState<string | null>(null);

  const plans = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customer-membership-plans'],
    queryFn: () =>
      httpClient.request('/tenant/customer-membership-plans', {
        tenantPublicId,
        schema: CustomerMembershipPlanListResponseSchema,
      }),
    retry: false,
  });
  const services = useQuery({
    queryKey: ['tenant', tenantPublicId, 'membership-benefit-services'],
    queryFn: () =>
      httpClient.request('/tenant/services?limit=100&active=true', {
        tenantPublicId,
        schema: ServiceListResponseSchema,
      }),
    enabled: editing !== null,
    retry: false,
  });

  const openEditor = (plan: CustomerMembershipPlanPublic | 'new') => {
    setEditing(plan);
    setDraft(plan === 'new' ? emptyPlan() : planToDraft(plan));
    setFormError(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      const error = validateDraft(draft);
      if (error !== null) throw new Error(error);
      const planBody = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        priceCents: priceToCents(draft.price),
        billingInterval: 'MONTHLY' as const,
        active: draft.active,
        sortOrder: editing === 'new' ? (plans.data?.items.length ?? 0) : editing.sortOrder,
      };
      const plan =
        editing === 'new'
          ? await httpClient.request('/tenant/customer-membership-plans', {
              method: 'POST',
              tenantPublicId,
              body: planBody,
              schema: CustomerMembershipPlanPublicSchema,
            })
          : await httpClient.request(`/tenant/customer-membership-plans/${editing.publicId}`, {
              method: 'PATCH',
              tenantPublicId,
              body: planBody,
              schema: CustomerMembershipPlanPublicSchema,
            });

      const retained = new Set(draft.benefits.flatMap((item) => item.publicId ?? []));
      if (editing !== 'new') {
        await Promise.all(
          editing.benefits
            .filter((benefit) => !retained.has(benefit.publicId))
            .map((benefit) =>
              httpClient.request(
                `/tenant/customer-membership-plans/${plan.publicId}/benefits/${benefit.publicId}`,
                { method: 'DELETE', tenantPublicId, schema: z.unknown() },
              ),
            ),
        );
      }

      await Promise.all(
        draft.benefits.map((benefit) => {
          const body = {
            servicePublicId: benefit.servicePublicId,
            type: benefit.type,
            quantityPerCycle: benefit.type === 'QUANTITY' ? Number(benefit.quantityPerCycle) : null,
            discountPercent: benefit.type === 'DISCOUNT' ? Number(benefit.discountPercent) : null,
          };
          const path =
            benefit.publicId === undefined
              ? `/tenant/customer-membership-plans/${plan.publicId}/benefits`
              : `/tenant/customer-membership-plans/${plan.publicId}/benefits/${benefit.publicId}`;
          return httpClient.request(path, {
            method: benefit.publicId === undefined ? 'POST' : 'PATCH',
            tenantPublicId,
            body,
            schema: z.unknown(),
          });
        }),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'customer-membership-plans'],
      });
      setEditing(null);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar o plano.');
    },
  });

  const toggle = useMutation({
    mutationFn: (plan: CustomerMembershipPlanPublic) =>
      httpClient.request(`/tenant/customer-membership-plans/${plan.publicId}`, {
        method: 'PATCH',
        tenantPublicId,
        body: {
          name: plan.name,
          description: plan.description,
          priceCents: plan.priceCents,
          billingInterval: 'MONTHLY',
          active: !plan.active,
          sortOrder: plan.sortOrder,
        },
        schema: CustomerMembershipPlanPublicSchema,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'customer-membership-plans'],
      });
    },
  });

  const activePlans = useMemo(
    () => plans.data?.items.filter((plan) => plan.active) ?? [],
    [plans.data?.items],
  );
  const benefitCount = activePlans.reduce((total, plan) => total + plan.benefits.length, 0);

  // Subscribers section - use dedicated component to avoid conditional hooks
  if (section === 'subscribers') {
    return <CustomerMembershipSubscribersSection tenantPublicId={tenantPublicId} plans={plans} />;
  }

  // Usage section (still placeholder)
  if (section === 'usage')
    return (
      <section className="sessions-panel membership-plans-module">
        <PageHeader
          eyebrow="Assinaturas"
          title="Consumo"
          description="Acompanhe o consumo de benefícios por cliente."
        />
        <EmptyState
          title="Ledger de consumo em preparação"
          description="Esta visão será habilitada no próximo bloco funcional."
        />
      </section>
    );

  return (
    <section className="sessions-panel membership-plans-module">
      <PageHeader
        eyebrow="Assinaturas"
        title={section === 'overview' ? 'Visão geral' : 'Planos'}
        description="Crie mensalidades do estabelecimento usando os serviços reais do catálogo."
        actions={
          section === 'plans' && canManage ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                openEditor('new');
              }}
            >
              + Novo plano
            </button>
          ) : undefined
        }
      />

      {plans.isPending ? (
        <ListSkeleton rows={4} />
      ) : plans.error instanceof Error ? (
        <EmptyState
          title="Não foi possível carregar os planos."
          description={plans.error.message}
          action={<button onClick={() => void plans.refetch()}>Tentar novamente</button>}
        />
      ) : section === 'overview' ? (
        <div className="membership-overview-grid">
          <article>
            <span>Planos ativos</span>
            <strong>{activePlans.length}</strong>
          </article>
          <article>
            <span>Benefícios configurados</span>
            <strong>{benefitCount}</strong>
          </article>
          <article>
            <span>Ciclo disponível na V1</span>
            <strong>Mensal</strong>
          </article>
          <article>
            <span>Modelo financeiro</span>
            <strong>Payment canônico</strong>
          </article>
        </div>
      ) : plans.data.items.length === 0 ? (
        <EmptyState
          title="Crie o primeiro plano do estabelecimento"
          description="Defina o valor mensal e vincule benefícios aos serviços que já existem."
          action={
            canManage ? (
              <button
                onClick={() => {
                  openEditor('new');
                }}
              >
                + Criar plano
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="membership-plan-grid">
          {plans.data.items.map((plan) => (
            <article className="membership-plan-card" key={plan.publicId}>
              <header>
                <div>
                  <span>Plano mensal</span>
                  <h3>{plan.name}</h3>
                </div>
                <StatusBadge active={plan.active}>{plan.active ? 'Ativo' : 'Inativo'}</StatusBadge>
              </header>
              <strong className="membership-plan-price">
                {money(plan.priceCents)}
                <small>/mês</small>
              </strong>
              {plan.description ? <p>{plan.description}</p> : null}
              <ul>
                {plan.benefits.map((benefit) => (
                  <li key={benefit.publicId}>{benefitLabel(benefit)}</li>
                ))}
              </ul>
              <footer>
                {canManage ? (
                  <button
                    onClick={() => {
                      openEditor(plan);
                    }}
                  >
                    Editar
                  </button>
                ) : null}
                {canManage ? (
                  <button
                    disabled={toggle.isPending}
                    onClick={() => {
                      toggle.mutate(plan);
                    }}
                  >
                    {plan.active ? 'Desativar' : 'Reativar'}
                  </button>
                ) : null}
              </footer>
            </article>
          ))}
        </div>
      )}

      {editing !== null ? (
        <>
          <button
            className="membership-drawer-backdrop"
            aria-label="Fechar"
            onClick={() => {
              setEditing(null);
            }}
          />
          <aside
            className="membership-plan-drawer"
            aria-label={editing === 'new' ? 'Novo plano' : 'Editar plano'}
          >
            <header>
              <div>
                <span>Assinaturas</span>
                <h2>{editing === 'new' ? 'Novo plano' : 'Editar plano'}</h2>
              </div>
              <button
                aria-label="Fechar"
                onClick={() => {
                  setEditing(null);
                }}
              >
                ×
              </button>
            </header>
            <label>
              Nome do plano
              <input
                value={draft.name}
                onChange={(event) => {
                  setDraft((value) => ({ ...value, name: event.target.value }));
                }}
                placeholder="Ex.: Plano Black"
              />
            </label>
            <label>
              Descrição
              <textarea
                value={draft.description}
                onChange={(event) => {
                  setDraft((value) => ({ ...value, description: event.target.value }));
                }}
                rows={3}
              />
            </label>
            <div className="membership-plan-fields">
              <label>
                Preço mensal
                <input
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(event) => {
                    setDraft((value) => ({ ...value, price: event.target.value }));
                  }}
                  placeholder="119,90"
                />
              </label>
              <label>
                Ciclo
                <select disabled value="MONTHLY">
                  <option value="MONTHLY">Mensal</option>
                </select>
              </label>
            </div>
            <label className="membership-plan-active">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) => {
                  setDraft((value) => ({ ...value, active: event.target.checked }));
                }}
              />{' '}
              Plano disponível para novas assinaturas
            </label>
            <div className="membership-benefit-heading">
              <div>
                <span>Benefícios</span>
                <small>Use serviços existentes do catálogo.</small>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraft((value) => ({
                    ...value,
                    benefits: [
                      ...value.benefits,
                      {
                        servicePublicId: '',
                        type: 'QUANTITY',
                        quantityPerCycle: '1',
                        discountPercent: '',
                      },
                    ],
                  }));
                }}
              >
                + Adicionar
              </button>
            </div>
            <div className="membership-benefit-list">
              {draft.benefits.map((benefit, index) => (
                <article key={benefit.publicId ?? `new-${String(index)}`}>
                  <label>
                    Serviço
                    <select
                      value={benefit.servicePublicId}
                      onChange={(event) => {
                        setDraft((value) => ({
                          ...value,
                          benefits: value.benefits.map((item, position) =>
                            position === index
                              ? { ...item, servicePublicId: event.target.value }
                              : item,
                          ),
                        }));
                      }}
                    >
                      <option value="">Selecione</option>
                      {services.data?.items.map((service) => (
                        <option key={service.publicId} value={service.publicId}>
                          {service.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Tipo
                    <select
                      value={benefit.type}
                      onChange={(event) => {
                        setDraft((value) => ({
                          ...value,
                          benefits: value.benefits.map((item, position) =>
                            position === index
                              ? {
                                  ...item,
                                  type: event.target.value as MembershipBenefitType,
                                  quantityPerCycle:
                                    event.target.value === 'QUANTITY'
                                      ? item.quantityPerCycle || '1'
                                      : '',
                                  discountPercent:
                                    event.target.value === 'DISCOUNT'
                                      ? item.discountPercent || '10'
                                      : '',
                                }
                              : item,
                          ),
                        }));
                      }}
                    >
                      <option value="QUANTITY">Quantidade</option>
                      <option value="UNLIMITED">Ilimitado</option>
                      <option value="DISCOUNT">Desconto</option>
                    </select>
                  </label>
                  {benefit.type === 'QUANTITY' ? (
                    <label>
                      Por mês
                      <input
                        type="number"
                        min="1"
                        value={benefit.quantityPerCycle}
                        onChange={(event) => {
                          setDraft((value) => ({
                            ...value,
                            benefits: value.benefits.map((item, position) =>
                              position === index
                                ? { ...item, quantityPerCycle: event.target.value }
                                : item,
                            ),
                          }));
                        }}
                      />
                    </label>
                  ) : null}
                  {benefit.type === 'DISCOUNT' ? (
                    <label>
                      Desconto %
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={benefit.discountPercent}
                        onChange={(event) => {
                          setDraft((value) => ({
                            ...value,
                            benefits: value.benefits.map((item, position) =>
                              position === index
                                ? { ...item, discountPercent: event.target.value }
                                : item,
                            ),
                          }));
                        }}
                      />
                    </label>
                  ) : null}
                  <button
                    className="membership-benefit-remove"
                    aria-label="Remover benefício"
                    onClick={() => {
                      setDraft((value) => ({
                        ...value,
                        benefits: value.benefits.filter((_, position) => position !== index),
                      }));
                    }}
                  >
                    Remover
                  </button>
                </article>
              ))}
            </div>
            {formError ? <p className="form-error">{formError}</p> : null}
            <footer>
              <button
                onClick={() => {
                  setEditing(null);
                }}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                disabled={save.isPending}
                onClick={() => {
                  save.mutate();
                }}
              >
                {save.isPending ? 'Salvando…' : 'Salvar plano'}
              </button>
            </footer>
          </aside>
        </>
      ) : null}
    </section>
  );
}
