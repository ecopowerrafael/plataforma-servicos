import {
  RecoveryEligibleListResponseSchema,
  RecoveryExecutionListResponseSchema,
  RecoveryRuleListResponseSchema,
  RecoveryRulePublicSchema,
  RecoveryRunResponseSchema,
} from '@plataforma/shared';
import { IconBrandWhatsapp, IconDots, IconPlayerPlay, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  EXECUTION_LABELS,
  EXECUTION_TONE,
  formatDateTime,
  formatPhone,
  formatShortDate,
  groupExecutions,
  initials,
  phoneLink,
  RULE_LABELS,
  RULE_ORDER,
  ruleDescription,
  usesDays,
  whatsappLink,
  type RecoveryRule,
} from './customer-recovery.js';
import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader, SectionCard } from '../ui/AppUi.js';

type Eligible = ReturnType<typeof RecoveryEligibleListResponseSchema.parse>['items'][number];
type Rule = ReturnType<typeof RecoveryRulePublicSchema.parse>;

export function CustomerRecoveryModule({
  tenantPublicId,
  canManage,
  canCreateAppointments = false,
  canReadCustomers = false,
}: {
  tenantPublicId: string;
  canManage: boolean;
  canCreateAppointments?: boolean;
  canReadCustomers?: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [ruleFilter, setRuleFilter] = useState<'' | RecoveryRule>('');
  const [editing, setEditing] = useState<Rule | null>(null);
  const [confirmRun, setConfirmRun] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const rules = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customer-recovery'],
    queryFn: () =>
      httpClient.request('/tenant/customer-recovery', {
        schema: RecoveryRuleListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  // Uma única consulta cobre todas as réguas: contagens e lista saem juntas.
  const eligible = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customer-recovery', 'eligible'],
    queryFn: () =>
      httpClient.request('/tenant/customer-recovery/eligible', {
        schema: RecoveryEligibleListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const executions = useQuery({
    queryKey: ['tenant', tenantPublicId, 'customer-recovery', 'executions'],
    queryFn: () =>
      httpClient.request('/tenant/customer-recovery/executions', {
        schema: RecoveryExecutionListResponseSchema,
        tenantPublicId,
      }),
    retry: false,
  });

  const save = useMutation({
    mutationFn: ({ rule, active, days }: { rule: RecoveryRule; active: boolean; days: number }) =>
      httpClient.request(`/tenant/customer-recovery/${rule}`, {
        method: 'PUT',
        body: { active, days },
        schema: RecoveryRulePublicSchema,
        tenantPublicId,
      }),
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'customer-recovery'],
      });
    },
  });

  const run = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/customer-recovery/run', {
        method: 'POST',
        body: {},
        schema: RecoveryRunResponseSchema,
        tenantPublicId,
      }),
    onSuccess: async (result) => {
      setConfirmRun(false);
      setFeedback(`Recuperação executada: ${String(result.processed)} cliente(s) processado(s).`);
      await queryClient.invalidateQueries({
        queryKey: ['tenant', tenantPublicId, 'customer-recovery'],
      });
    },
  });

  const ruleItems = useMemo(() => {
    const byRule = new Map((rules.data?.items ?? []).map((item) => [item.rule, item]));
    return RULE_ORDER.flatMap((rule) => {
      const item = byRule.get(rule);
      return item === undefined ? [] : [item];
    });
  }, [rules.data]);
  const activeRules = ruleItems.filter((item) => item.active);
  const counts = eligible.data?.counts ?? {};
  const totalEligible = eligible.data?.items.length ?? 0;

  const items = (eligible.data?.items ?? []).filter((item) => {
    if (ruleFilter !== '' && item.rule !== ruleFilter) return false;
    if (search.trim() === '') return true;
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (
      item.name.toLocaleLowerCase('pt-BR').includes(term) ||
      (item.phone ?? '').includes(search.trim())
    );
  });

  const openCustomer = (customerPublicId: string) => {
    void navigate(`/app/clientes/${customerPublicId}`);
  };

  const actionsMenu = (item: Eligible) => (
    <div className="recovery-menu">
      <button
        className="secondary-button button--sm"
        type="button"
        aria-haspopup="menu"
        aria-expanded={openMenu === item.customerPublicId}
        aria-label="Mais ações"
        onClick={() => {
          setOpenMenu(openMenu === item.customerPublicId ? null : item.customerPublicId);
        }}
      >
        <IconDots size={16} aria-hidden="true" />
      </button>
      {openMenu === item.customerPublicId && (
        <ul className="recovery-menu-list" role="menu">
          {canReadCustomers && (
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpenMenu(null);
                  openCustomer(item.customerPublicId);
                }}
              >
                Abrir ficha
              </button>
            </li>
          )}
          {canCreateAppointments && (
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpenMenu(null);
                  void navigate(
                    `/app/agenda/agendamentos?customerPublicId=${item.customerPublicId}&returnTo=/app/clientes/recuperacao`,
                  );
                }}
              >
                Novo agendamento
              </button>
            </li>
          )}
          {item.phone !== null && (
            <li>
              <a
                role="menuitem"
                href={phoneLink(item.phone)}
                onClick={() => {
                  setOpenMenu(null);
                }}
              >
                Ligar
              </a>
            </li>
          )}
        </ul>
      )}
    </div>
  );

  const whatsappButton = (item: Eligible) =>
    item.phone === null ? null : (
      <a
        className="secondary-button button--sm recovery-whatsapp"
        href={whatsappLink(item.phone)}
        target="_blank"
        rel="noreferrer"
      >
        <IconBrandWhatsapp size={15} aria-hidden="true" /> WhatsApp
      </a>
    );

  return (
    <div className="ds-stack recovery-page" aria-label="Recuperação de clientes">
      <PageHeader
        eyebrow="Relacionamento"
        title="Recuperação de clientes"
        description="Reative clientes no momento certo e acompanhe quem precisa de contato."
        actions={
          canManage ? (
            <button
              className="primary-button"
              type="button"
              disabled={activeRules.length === 0}
              onClick={() => {
                setConfirmRun(true);
              }}
            >
              <IconPlayerPlay size={16} aria-hidden="true" /> Executar recuperação
            </button>
          ) : undefined
        }
      />

      {feedback !== null && (
        <p className="success-message" role="status">
          {feedback}
        </p>
      )}

      {eligible.isPending ? (
        <div className="ds-list-skeleton recovery-metrics-skeleton">
          <i />
        </div>
      ) : eligible.error instanceof Error ? (
        <div className="ds-inline-alert ds-inline-alert--danger">
          <div>
            <strong>Não foi possível carregar os clientes elegíveis.</strong>
          </div>
          <button
            className="secondary-button button--sm"
            type="button"
            onClick={() => {
              void eligible.refetch();
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <div className="ds-stat-grid">
            <div className="ds-stat-card ds-stat-card--warning">
              <small>Elegíveis agora</small>
              <strong>{totalEligible}</strong>
              <small>Somando as réguas configuradas</small>
            </div>
            <div className="ds-stat-card">
              <small>Clientes inativos</small>
              <strong>{counts.INACTIVE ?? 0}</strong>
            </div>
            <div className="ds-stat-card">
              <small>Cancelaram e não reagendaram</small>
              <strong>{counts.CANCELED_NO_REBOOK ?? 0}</strong>
            </div>
            <div className="ds-stat-card">
              <small>Pós-atendimento sem retorno</small>
              <strong>{counts.POST_SERVICE_NO_RETURN ?? 0}</strong>
            </div>
            <div className="ds-stat-card">
              <small>Não compareceram</small>
              <strong>{counts.NO_SHOW_NO_REBOOK ?? 0}</strong>
            </div>
          </div>

          <div className="recovery-rules">
            {rules.isPending ? (
              <ListSkeleton rows={3} />
            ) : (
              ruleItems.map((item) => (
                <article className="recovery-rule-card" key={item.rule}>
                  <header>
                    <strong>{RULE_LABELS[item.rule]}</strong>
                    <span
                      className={`ds-badge ds-badge--${item.active ? 'success' : 'muted'}`}
                    >
                      {item.active ? 'Ativa' : 'Inativa'}
                    </span>
                  </header>
                  <p>{ruleDescription(item.rule, item.days)}</p>
                  <strong className="recovery-rule-count">
                    {counts[item.rule] ?? 0} cliente(s) elegível(is)
                  </strong>
                  <div className="ds-form-actions">
                    <button
                      className="secondary-button button--sm"
                      type="button"
                      onClick={() => {
                        setRuleFilter(item.rule);
                      }}
                    >
                      Ver clientes
                    </button>
                    {canManage && (
                      <button
                        className="secondary-button button--sm"
                        type="button"
                        onClick={() => {
                          setEditing(item);
                        }}
                      >
                        Configurar
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>

          <SectionCard
            title="Clientes para recuperar"
            description="Quem já entrou na janela das réguas configuradas."
          >
            <div className="app-filter-bar recovery-filters">
              <label className="recovery-filter-search">
                Buscar
                <span className="recovery-search-field">
                  <IconSearch size={16} aria-hidden="true" />
                  <input
                    type="search"
                    value={search}
                    placeholder="Nome ou telefone"
                    onChange={(event) => {
                      setSearch(event.target.value);
                    }}
                  />
                </span>
              </label>
              <label>
                Régua
                <select
                  value={ruleFilter}
                  onChange={(event) => {
                    setRuleFilter(event.target.value as '' | RecoveryRule);
                  }}
                >
                  <option value="">Todas</option>
                  {RULE_ORDER.map((rule) => (
                    <option value={rule} key={rule}>
                      {RULE_LABELS[rule]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {items.length === 0 ? (
              <EmptyState
                title="Nenhum cliente precisa de recuperação neste momento."
                description="Assim que alguém entrar na janela das réguas ativas, aparece aqui."
              />
            ) : (
              <>
                <div className="ds-table-scroll recovery-table-wrap">
                  <table className="platform-table ds-data-table recovery-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Motivo</th>
                        <th>Última visita</th>
                        <th>Dias sem retorno</th>
                        <th>Último serviço</th>
                        <th>Profissional</th>
                        <th>Próximo agendamento</th>
                        <th aria-label="Ações" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={`${item.rule}-${item.customerPublicId}`}>
                          <td>
                            <div className="recovery-identity">
                              <span className="recovery-avatar" aria-hidden="true">
                                {initials(item.name)}
                              </span>
                              <span>
                                {canReadCustomers ? (
                                  <button
                                    className="text-button"
                                    type="button"
                                    onClick={() => {
                                      openCustomer(item.customerPublicId);
                                    }}
                                  >
                                    {item.name}
                                  </button>
                                ) : (
                                  <strong>{item.name}</strong>
                                )}
                                {item.phone !== null && <small>{formatPhone(item.phone)}</small>}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="ds-badge ds-badge--warning">
                              {RULE_LABELS[item.rule]}
                            </span>
                          </td>
                          <td>{formatShortDate(item.referenceAt) ?? '—'}</td>
                          <td>{item.daysSinceReference ?? '—'}</td>
                          <td>{item.lastServiceName ?? '—'}</td>
                          <td>{item.lastProfessionalName ?? '—'}</td>
                          <td>
                            {item.nextAppointmentAt === null
                              ? 'Sem agendamento'
                              : formatDateTime(item.nextAppointmentAt)}
                          </td>
                          <td>
                            <div className="ds-row-actions recovery-row-actions">
                              {whatsappButton(item)}
                              {actionsMenu(item)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="recovery-cards">
                  {items.map((item) => (
                    <li className="recovery-card" key={`${item.rule}-${item.customerPublicId}`}>
                      <div className="recovery-identity">
                        <span className="recovery-avatar" aria-hidden="true">
                          {initials(item.name)}
                        </span>
                        <span>
                          {canReadCustomers ? (
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => {
                                openCustomer(item.customerPublicId);
                              }}
                            >
                              {item.name}
                            </button>
                          ) : (
                            <strong>{item.name}</strong>
                          )}
                          {item.phone !== null && <small>{formatPhone(item.phone)}</small>}
                        </span>
                      </div>
                      <span className="ds-badge ds-badge--warning">{RULE_LABELS[item.rule]}</span>
                      <dl className="recovery-card-facts">
                        <div>
                          <dt>Última visita</dt>
                          <dd>
                            {formatShortDate(item.referenceAt) ?? '—'}
                            {item.lastServiceName === null ? '' : ` · ${item.lastServiceName}`}
                          </dd>
                        </div>
                        <div>
                          <dt>Sem retorno</dt>
                          <dd>
                            {item.daysSinceReference === null
                              ? '—'
                              : `${String(item.daysSinceReference)} dias`}
                          </dd>
                        </div>
                        <div>
                          <dt>Profissional</dt>
                          <dd>{item.lastProfessionalName ?? '—'}</dd>
                        </div>
                        <div>
                          <dt>Próximo</dt>
                          <dd>
                            {item.nextAppointmentAt === null
                              ? 'Sem agendamento'
                              : formatDateTime(item.nextAppointmentAt)}
                          </dd>
                        </div>
                      </dl>
                      <div className="ds-row-actions recovery-row-actions">
                        {whatsappButton(item)}
                        {canReadCustomers && (
                          <button
                            className="secondary-button button--sm"
                            type="button"
                            onClick={() => {
                              openCustomer(item.customerPublicId);
                            }}
                          >
                            Abrir cliente
                          </button>
                        )}
                        {actionsMenu(item)}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SectionCard>
        </>
      )}

      <SectionCard
        title="Execuções recentes"
        description="O que já foi disparado, para não repetir contato sem contexto."
      >
        {executions.isPending ? (
          <ListSkeleton rows={3} />
        ) : executions.error instanceof Error ? (
          <div className="ds-inline-alert ds-inline-alert--danger">
            <div>
              <strong>Não foi possível carregar o histórico.</strong>
            </div>
            <button
              className="secondary-button button--sm"
              type="button"
              onClick={() => {
                void executions.refetch();
              }}
            >
              Tentar novamente
            </button>
          </div>
        ) : (executions.data?.items.length ?? 0) === 0 ? (
          <p className="ds-form-hint">Nenhuma execução registrada até agora.</p>
        ) : (
          <ul className="recovery-executions">
            {groupExecutions(executions.data?.items ?? []).map((group) => (
              <li key={group.key}>
                <details>
                  <summary>
                    <span>
                      <strong>{RULE_LABELS[group.rule]}</strong>
                      <small>{formatDateTime(group.at)}</small>
                    </span>
                    <span className="recovery-execution-counts">
                      <span className="ds-badge ds-badge--muted">{group.total} processados</span>
                      <span className="ds-badge ds-badge--success">{group.sent} enviados</span>
                      {group.skipped > 0 && (
                        <span className="ds-badge ds-badge--muted">{group.skipped} ignorados</span>
                      )}
                      {group.failed > 0 && (
                        <span className="ds-badge ds-badge--danger">{group.failed} falhas</span>
                      )}
                    </span>
                  </summary>
                  <ul className="recovery-execution-items">
                    {group.items.map((item) => (
                      <li key={item.publicId}>
                        <span>{item.customerName}</span>
                        <span className={`ds-badge ds-badge--${EXECUTION_TONE[item.status]}`}>
                          {EXECUTION_LABELS[item.status]}
                        </span>
                        <small>{formatDateTime(item.createdAt)}</small>
                        {item.error !== null && <small>{item.error}</small>}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {editing !== null && (
        <RuleDialog
          rule={editing}
          busy={save.isPending}
          error={save.error instanceof Error ? save.error.message : null}
          onClose={() => {
            setEditing(null);
          }}
          onSave={(active, days) => {
            save.mutate({ rule: editing.rule, active, days });
          }}
        />
      )}

      {confirmRun && (
        <div className="dialog-backdrop" role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-run">
            <h3 id="recovery-run">Executar recuperação</h3>
            <p>As réguas ativas serão executadas agora para os clientes elegíveis.</p>
            <ul className="recovery-run-list">
              {activeRules.map((item) => (
                <li key={item.rule}>
                  <span>{RULE_LABELS[item.rule]}</span>
                  <strong>{counts[item.rule] ?? 0} elegíveis</strong>
                </li>
              ))}
            </ul>
            <p className="recovery-run-total">
              Total: {activeRules.reduce((sum, item) => sum + (counts[item.rule] ?? 0), 0)}{' '}
              cliente(s)
            </p>
            {run.error instanceof Error && (
              <p className="form-error" role="alert">
                {run.error.message}
              </p>
            )}
            <div className="ds-form-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={run.isPending}
                onClick={() => {
                  setConfirmRun(false);
                }}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={run.isPending}
                onClick={() => {
                  run.mutate();
                }}
              >
                {run.isPending ? 'Executando…' : 'Executar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleDialog({
  rule,
  busy,
  error,
  onClose,
  onSave,
}: {
  rule: Rule;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (active: boolean, days: number) => void;
}) {
  const [active, setActive] = useState(rule.active);
  const [days, setDays] = useState(String(rule.days));
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-rule">
        <h3 id="recovery-rule">{RULE_LABELS[rule.rule]}</h3>
        <p>{ruleDescription(rule.rule, Number(days) || rule.days)}</p>
        <fieldset className="ds-form-section">
          <label className="ds-switch-field">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => {
                setActive(event.target.checked);
              }}
            />
            <span>Régua ativa</span>
          </label>
          {usesDays(rule.rule) && (
            <label>
              Considerar elegível após (dias)
              <input
                type="number"
                min={1}
                max={730}
                value={days}
                onChange={(event) => {
                  setDays(event.target.value);
                }}
              />
            </label>
          )}
        </fieldset>
        {error !== null && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="ds-form-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => {
              onSave(active, Math.min(Math.max(Number(days) || rule.days, 1), 730));
            }}
          >
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
