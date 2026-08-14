import {
  CommercialPlanPublicSchema,
  PlanListResponseSchema,
  SuccessResponseSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';

import { PlanEditForm, type PlanFormSubmission } from './PlanEditForm.js';
import {
  ErrorState,
  formatCycle,
  formatDate,
  formatMoney,
  PageHeader,
  Pagination,
  StatusBadge,
} from './PlatformUi.js';
import { httpClient, HttpError } from '../../lib/http.js';
import { ConfirmationDialog, type ConfirmationRequest } from '../ConfirmationDialog.js';

const PlanResponse = z.object({ plan: CommercialPlanPublicSchema });
export function PlanModule({
  planPublicId,
  onOpen,
}: {
  planPublicId: string | undefined;
  onOpen: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [billingCycle, setBillingCycle] = useState('');
  const [visibility, setVisibility] = useState('');
  const [orderBy, setOrderBy] = useState('createdAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<string | null>(null);
  const selectedId = planPublicId ?? selected;
  const [editor, setEditor] = useState<'create' | 'edit' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const client = useQueryClient();
  const plans = useQuery({
    queryKey: ['platform', 'plans', page, status, billingCycle, visibility, orderBy, direction],
    queryFn: () => {
      const q = new URLSearchParams({ page: String(page), limit: '10', orderBy, direction });
      if (status) q.set('status', status);
      if (billingCycle) q.set('billingCycle', billingCycle);
      if (visibility) q.set('isPublic', visibility);
      return httpClient.request(`/platform/plans?${q.toString()}`, {
        schema: PlanListResponseSchema,
      });
    },
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['platform', 'plan', selectedId],
    queryFn: () =>
      httpClient.request(`/platform/plans/${selectedId ?? ''}`, { schema: PlanResponse }),
    enabled: selectedId !== null,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (input: {
      url: string;
      method?: 'POST' | 'PATCH' | 'DELETE';
      body?: unknown;
      schema?: z.ZodType;
    }) =>
      httpClient.request(input.url, {
        method: input.method ?? 'POST',
        ...(input.body === undefined ? {} : { body: input.body }),
        schema: input.schema ?? SuccessResponseSchema,
      }),
    onSuccess: async () => {
      setNotice('Operação concluída com sucesso.');
      setEditor(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['platform', 'plans'] }),
        client.invalidateQueries({ queryKey: ['platform', 'plan', selectedId] }),
      ]);
    },
  });
  const save = async (value: PlanFormSubmission) => {
    if (editor === 'create') {
      const result = PlanResponse.parse(
        await mutation.mutateAsync({ url: '/platform/plans', body: value, schema: PlanResponse }),
      );
      onOpen(result.plan.publicId);
    } else if (selectedId) {
      await mutation.mutateAsync({
        url: `/platform/plans/${selectedId}`,
        method: 'PATCH',
        body: value,
        schema: PlanResponse,
      });
    }
  };
  const action = (label: string, suffix: 'activate' | 'deactivate' | 'archive' | 'delete') => {
    if (!selectedId) return;
    setConfirmation({
      title: `${label} plano?`,
      description:
        suffix === 'delete'
          ? 'Esta ação é permanente e somente será aceita se o plano nunca foi utilizado.'
          : 'A disponibilidade comercial do plano será atualizada.',
      confirmLabel: label,
      requiresReason: false,
      variant: suffix === 'activate' ? 'default' : 'danger',
      onConfirm: async () => {
        await mutation.mutateAsync({
          url:
            suffix === 'delete'
              ? `/platform/plans/${selectedId}`
              : `/platform/plans/${selectedId}/${suffix}`,
          ...(suffix === 'delete' ? { method: 'DELETE' as const } : {}),
        });
      },
    });
  };
  const selectedPlan = detail.data?.plan;
  if (planPublicId) {
    return (
      <section className="platform-detail-page">
        <Link className="platform-back-link" to="/platform/plans">
          ← Planos
        </Link>
        {detail.isPending ? (
          <i className="platform-skeleton" />
        ) : detail.error instanceof Error ? (
          <ErrorState
            message={detail.error.message}
            retry={() => {
              void detail.refetch();
            }}
          />
        ) : selectedPlan ? (
          <>
            <PageHeader
              title="Editar plano"
              description={`${selectedPlan.name} · ${selectedPlan.code}`}
              action={
                <div className="form-actions">
                  <StatusBadge value={selectedPlan.status} />
                  {selectedPlan.status === 'ACTIVE' ? (
                    <button
                      onClick={() => {
                        action('Desativar', 'deactivate');
                      }}
                      type="button"
                    >
                      Desativar
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        action('Ativar', 'activate');
                      }}
                      type="button"
                    >
                      Ativar
                    </button>
                  )}
                  <button
                    onClick={() => {
                      action('Excluir', 'delete');
                    }}
                    type="button"
                  >
                    Excluir
                  </button>
                </div>
              }
            />
            {notice ? <p className="success-message">{notice}</p> : null}
            <div className="platform-full-form">
              <PlanEditForm
                busy={mutation.isPending}
                error={mutation.error instanceof Error ? mutation.error.message : null}
                plan={selectedPlan}
                onSave={save}
              />
              <div className="form-actions platform-final-actions">
                <Link className="secondary-button" to="/platform/plans">
                  Cancelar
                </Link>
              </div>
            </div>
          </>
        ) : null}
        {confirmation ? (
          <ConfirmationDialog
            request={confirmation}
            onClose={() => {
              setConfirmation(null);
            }}
          />
        ) : null}
      </section>
    );
  }
  return (
    <section>
      <PageHeader
        title="Planos"
        description="Gerencie precos, ciclos, limites e disponibilidade comercial."
        action={
          <button
            onClick={() => {
              setEditor('create');
            }}
            type="button"
          >
            + Criar plano
          </button>
        }
      />
      {notice ? <p className="success-message">{notice}</p> : null}
      {mutation.error instanceof Error ? (
        <div className="platform-action-error">
          <p>{mutation.error.message}</p>
          {mutation.error instanceof HttpError &&
          mutation.error.code === 'PLAN_IN_USE' &&
          selectedPlan?.status === 'ACTIVE' ? (
            <button
              onClick={() => {
                action('Desativar', 'deactivate');
              }}
              type="button"
            >
              Desativar plano
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="platform-filter-bar">
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">Todos</option>
            <option value="ACTIVE">Ativo</option>
            <option value="INACTIVE">Inativo</option>
            <option value="ARCHIVED">Arquivado</option>
          </select>
        </label>
        <label>
          Ciclo
          <select
            value={billingCycle}
            onChange={(e) => {
              setPage(1);
              setBillingCycle(e.target.value);
            }}
          >
            <option value="">Todos</option>
            {['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'].map((c) => (
              <option key={c} value={c}>
                {formatCycle(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Visibilidade
          <select
            value={visibility}
            onChange={(e) => {
              setPage(1);
              setVisibility(e.target.value);
            }}
          >
            <option value="">Todas</option>
            <option value="true">Publico</option>
            <option value="false">Interno</option>
          </select>
        </label>
        <label>
          Ordenar
          <select
            value={orderBy}
            onChange={(e) => {
              setOrderBy(e.target.value);
            }}
          >
            <option value="createdAt">Criacao</option>
            <option value="name">Nome</option>
            <option value="status">Status</option>
          </select>
        </label>
        <label>
          Direcao
          <select
            value={direction}
            onChange={(e) => {
              setDirection(e.target.value as 'asc' | 'desc');
            }}
          >
            <option value="desc">Decrescente</option>
            <option value="asc">Crescente</option>
          </select>
        </label>
      </div>
      {plans.isPending ? (
        <div className="platform-table-skeleton">
          <i className="platform-skeleton" />
          <i className="platform-skeleton" />
        </div>
      ) : plans.error instanceof Error ? (
        <ErrorState
          message={plans.error.message}
          retry={() => {
            void plans.refetch();
          }}
        />
      ) : !plans.data?.items.length ? (
        <div className="platform-empty">
          <h3>Nenhum plano encontrado</h3>
          <p>Tente alterar os filtros ou crie um novo plano.</p>
        </div>
      ) : (
        <>
          <div className="platform-table-wrap">
            <table className="platform-table platform-plan-table">
              <thead>
                <tr>
                  <th>Plano</th>
                  <th>Cobranca</th>
                  <th>Visibilidade</th>
                  <th>Status</th>
                  <th>Atualizado</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {plans.data.items.map((plan) => (
                  <tr
                    key={plan.publicId}
                    onClick={() => {
                      onOpen(plan.publicId);
                    }}
                  >
                    <td>
                      <strong>{plan.name}</strong>
                      <span>{plan.code}</span>
                      <span>{plan.shortDescription ?? plan.description ?? 'Sem descricao'}</span>
                    </td>
                    <td>
                      <strong>{formatMoney(plan.priceCents, plan.currency)}</strong>
                      <span>
                        {plan.billingOptions
                          .filter((o) => o.active)
                          .map((o) => formatCycle(o.billingCycle))
                          .join(' · ') || formatCycle(plan.billingCycle)}
                      </span>
                    </td>
                    <td>{plan.isPublic ? 'Publico' : 'Interno'}</td>
                    <td>
                      <StatusBadge value={plan.status} />
                    </td>
                    <td>{formatDate(plan.updatedAt)}</td>
                    <td>
                      <button
                        aria-label={`Editar ${plan.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(plan.publicId);
                        }}
                        type="button"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={plans.data.page.totalPages}
            total={plans.data.page.total}
            limit={plans.data.page.limit}
            onPage={setPage}
          />
        </>
      )}
      {selectedPlan ? (
        <Drawer
          close={() => {
            setSelected(null);
          }}
        >
          <header className="platform-detail-heading">
            <div>
              <h3>{selectedPlan.name}</h3>
              <span>{selectedPlan.code}</span>
            </div>
            <StatusBadge value={selectedPlan.status} />
          </header>
          <p>{selectedPlan.description ?? 'Sem descricao.'}</p>
          <dl className="platform-details">
            <div>
              <dt>Visibilidade</dt>
              <dd>{selectedPlan.isPublic ? 'Publico' : 'Interno'}</dd>
            </div>
            <div>
              <dt>Criado em</dt>
              <dd>{formatDate(selectedPlan.createdAt, true)}</dd>
            </div>
            <div>
              <dt>Atualizado em</dt>
              <dd>{formatDate(selectedPlan.updatedAt, true)}</dd>
            </div>
            {selectedPlan.trialDays !== null ? (
              <div>
                <dt>Periodo de teste</dt>
                <dd>{selectedPlan.trialDays} dias</dd>
              </div>
            ) : null}
          </dl>
          <h4>Cobranca</h4>
          <div className="platform-option-grid">
            {(selectedPlan.billingOptions.filter((o) => o.active).length
              ? selectedPlan.billingOptions.filter((o) => o.active)
              : [
                  {
                    publicId: 'legacy',
                    billingCycle: selectedPlan.billingCycle,
                    priceCents: selectedPlan.priceCents,
                    active: true,
                    sortOrder: 0,
                    recommended: true,
                  },
                ]
            ).map((o) => (
              <article key={o.publicId}>
                <strong>{formatCycle(o.billingCycle)}</strong>
                <span>{formatMoney(o.priceCents, selectedPlan.currency)}</span>
                {o.recommended ? <small>Recomendado</small> : null}
              </article>
            ))}
          </div>
          <h4>Limites e recursos</h4>
          <ul className="platform-resource-list">
            {selectedPlan.limits.map((limit) => (
              <li key={limit.key}>
                <span>{friendlyLimit(limit.key)}</span>
                <strong>
                  {limit.booleanValue !== null
                    ? limit.booleanValue
                      ? 'Incluido'
                      : 'Nao incluido'
                    : (limit.integerValue ?? 'Ilimitado')}
                </strong>
              </li>
            ))}
          </ul>
          <div className="form-actions">
            <button
              onClick={() => {
                setEditor('edit');
              }}
              type="button"
            >
              Editar
            </button>
            {selectedPlan.status === 'ACTIVE' ? (
              <button
                onClick={() => {
                  action('Desativar', 'deactivate');
                }}
                type="button"
              >
                Desativar
              </button>
            ) : (
              <button
                onClick={() => {
                  action('Ativar', 'activate');
                }}
                type="button"
              >
                Ativar
              </button>
            )}
            <button
              onClick={() => {
                action('Excluir', 'delete');
              }}
              type="button"
            >
              Excluir
            </button>
          </div>
        </Drawer>
      ) : null}
      {editor ? (
        <Drawer
          close={() => {
            setEditor(null);
          }}
        >
          <PlanEditForm
            busy={mutation.isPending}
            error={mutation.error instanceof Error ? mutation.error.message : null}
            {...(editor === 'edit' && selectedPlan ? { plan: selectedPlan } : {})}
            onSave={save}
          />
        </Drawer>
      ) : null}
      {confirmation ? (
        <ConfirmationDialog
          request={confirmation}
          onClose={() => {
            setConfirmation(null);
          }}
        />
      ) : null}
    </section>
  );
}
function Drawer({ children, close }: { children: React.ReactNode; close: () => void }) {
  return (
    <>
      <button className="platform-backdrop" aria-label="Fechar" onClick={close} type="button" />
      <aside className="platform-drawer platform-drawer--detail" role="dialog" aria-modal="true">
        <button className="platform-drawer-close" aria-label="Fechar" onClick={close} type="button">
          ×
        </button>
        {children}
      </aside>
    </>
  );
}
const labels: Record<string, string> = {
  'units.max': 'Unidades',
  'professionals.max': 'Profissionais',
  'members.max': 'Membros da equipe',
  'services.max': 'Serviços',
  'monthly_appointments.max': 'Agendamentos mensais',
  'branding.customization.enabled': 'Personalização da marca',
  'custom_domain.enabled': 'Domínio próprio',
  'advanced_reports.enabled': 'Relatórios avançados',
  'products.enabled': 'Produtos',
  'stock.enabled': 'Estoque',
  'commissions.enabled': 'Comissões',
  'waitlist.enabled': 'Lista de espera',
  'automations.enabled': 'Automações',
  'whatsapp.enabled': 'WhatsApp',
  'integrations.enabled': 'Integrações',
  'loyalty.enabled': 'Fidelidade',
  'coupons.enabled': 'Cupons',
};
export const friendlyLimit = (key: string) => labels[key] ?? key;
