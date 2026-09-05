import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import {
  ErrorState,
  formatDate,
  PageHeader,
  StatusBadge,
  Pagination,
} from './PlatformUi.js';

interface Lead {
  id: bigint | string;
  publicId: string;
  nameSnapshot: string;
  phoneSnapshot: string;
  status: string;
  lastOutboundAt?: string;
  lastInboundAt?: string;
  respondedAt?: string;
  currentStep?: number;
  followUpCount?: number;
}

interface LeadsResponse {
  items: Lead[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

const leadsResponseSchema = z.object({
  items: z.array(z.object({
    publicId: z.string(),
    nameSnapshot: z.string(),
    phoneSnapshot: z.string(),
    status: z.string(),
    campaign: z.object({ publicId: z.string(), name: z.string() }).optional(),
    lastOutboundAt: z.string().optional(),
    lastInboundAt: z.string().optional(),
    respondedAt: z.string().optional(),
    currentStep: z.number().optional(),
    followUpCount: z.number().optional(),
  })),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

const leadDetailSchema = z.object({
  publicId: z.string(),
  nameSnapshot: z.string(),
  phoneSnapshot: z.string(),
  city: z.string().optional(),
  status: z.string(),
  currentStep: z.number().optional(),
  followUpCount: z.number().optional(),
  lastOutboundAt: z.string().optional(),
  lastInboundAt: z.string().optional(),
  respondedAt: z.string().optional(),
  nextActionAt: z.string().optional(),
  humanLockType: z.string().optional(),
  humanLockUntil: z.string().optional(),
  humanLockReason: z.string().optional(),
});

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Pendente', tone: 'muted' },
  SCHEDULED: { label: 'Agendado', tone: 'info' },
  WAITING_REPLY: { label: 'Aguardando resposta', tone: 'warning' },
  RESPONDED: { label: 'Respondeu', tone: 'success' },
  QUALIFYING: { label: 'Qualificando', tone: 'info' },
  INTERESTED: { label: 'Interessado', tone: 'success' },
  FOLLOW_UP: { label: 'Follow-up', tone: 'warning' },
  WON: { label: 'Ganho', tone: 'success' },
  LOST: { label: 'Perdido', tone: 'neutral' },
  SUPPRESSED: { label: 'Opt-out', tone: 'danger' },
  FAILED: { label: 'Falha', tone: 'danger' },
  NEEDS_REVIEW: { label: 'Precisa revisão', tone: 'warning' },
};

export function ProspectingLeadsView({
  campaigns,
  onLeadSelect,
}: {
  campaigns: Array<{ publicId: string; name: string }>;
  onLeadSelect?: (publicId: string) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const campaignId = searchParams.get('campaignPublicId') ?? 'all';
  const statusFilter = searchParams.get('status') ?? 'all';
  const searchTerm = searchParams.get('search') ?? '';
  const cityFilter = searchParams.get('city') ?? '';
  const page = Number(searchParams.get('page') ?? 1);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const updateSearchParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
      params.set('page', '1');
    } else {
      params.delete(key);
    }
    setSearchParams(params);
  };

  const leads = useQuery({
    queryKey: ['prospecting', 'leads', campaignId, statusFilter, searchTerm, cityFilter, page],
    queryFn: () => {
      if (campaignId === 'all') {
        return { items: [], pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 } };
      }

      const params = new URLSearchParams({
        page: String(page),
        pageSize: '25',
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchTerm) params.set('search', searchTerm);
      if (cityFilter) params.set('city', cityFilter);

      return httpClient.request(
        `/platform/prospecting/campaigns/${campaignId}/leads?${params.toString()}`,
        { schema: leadsResponseSchema }
      );
    },
  });

  const detail = useQuery({
    queryKey: ['prospecting', 'lead', selectedLead?.publicId],
    queryFn: () =>
      httpClient.request(
        `/platform/prospecting/campaigns/${campaignId}/leads/${selectedLead?.publicId ?? ''}`,
        { schema: leadDetailSchema }
      ),
    enabled: selectedLead !== null && campaignId !== 'all',
  });

  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
    setShowDetail(true);
    onLeadSelect?.(lead.publicId);
  };

  return (
    <section>
      <PageHeader
        title="Leads"
        description="Acompanhe leads de prospecção por campanha."
      />

      <div className="platform-filter-bar">
        <label>
          Campanha
          <select
            value={campaignId}
            onChange={(e) => updateSearchParams('campaignPublicId', e.target.value)}
          >
            <option value="all">Selecione uma campanha</option>
            {campaigns.map((c) => (
              <option key={c.publicId} value={c.publicId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        {campaignId !== 'all' && (
          <>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(e) => updateSearchParams('status', e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="PENDING">Pendente</option>
                <option value="SCHEDULED">Agendado</option>
                <option value="WAITING_REPLY">Aguardando resposta</option>
                <option value="RESPONDED">Respondeu</option>
                <option value="QUALIFYING">Qualificando</option>
                <option value="INTERESTED">Interessado</option>
                <option value="FOLLOW_UP">Follow-up</option>
                <option value="WON">Ganho</option>
                <option value="LOST">Perdido</option>
                <option value="SUPPRESSED">Opt-out</option>
                <option value="NEEDS_REVIEW">Precisa revisão</option>
              </select>
            </label>

            <label>
              Buscar empresa ou telefone
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => updateSearchParams('search', e.target.value)}
                placeholder="Digite para filtrar..."
              />
            </label>

            <label>
              Cidade
              <input
                type="text"
                value={cityFilter}
                onChange={(e) => updateSearchParams('city', e.target.value)}
                placeholder="Digite a cidade..."
              />
            </label>
          </>
        )}
      </div>

      {campaignId === 'all' ? (
        <div className="platform-empty">
          <h3>Selecione uma campanha</h3>
          <p>Escolha uma campanha acima para visualizar seus leads.</p>
        </div>
      ) : leads.isPending ? (
        <div className="platform-table-skeleton">
          <i className="platform-skeleton" />
          <i className="platform-skeleton" />
          <i className="platform-skeleton" />
        </div>
      ) : leads.error instanceof Error ? (
        <ErrorState
          message={leads.error.message}
          retry={() => void leads.refetch()}
        />
      ) : !leads.data?.items || leads.data.items.length === 0 ? (
        <div className="platform-empty">
          <h3>Nenhum lead encontrado</h3>
          <p>
            {searchTerm || statusFilter !== 'all' || cityFilter
              ? 'Nenhum lead corresponde aos filtros selecionados.'
              : 'Esta campanha ainda não possui leads.'}
          </p>
        </div>
      ) : (
        <>
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Telefone</th>
                  <th>Status</th>
                  <th>Último envio</th>
                  <th>Última resposta</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(leads.data?.items || []).map((lead) => {
                  const statusInfo = STATUS_LABELS[lead.status] || {
                    label: lead.status,
                    tone: 'neutral',
                  };
                  return (
                    <tr
                      key={lead.publicId}
                      className={
                        lead.status === 'NEEDS_REVIEW' ? 'row-needs-review' : ''
                      }
                    >
                      <td>{lead.nameSnapshot}</td>
                      <td>{lead.phoneSnapshot}</td>
                      <td>
                        <span className={`status-badge tone-${statusInfo.tone}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td>
                        {lead.lastOutboundAt ? formatDate(lead.lastOutboundAt) : '—'}
                      </td>
                      <td>
                        {lead.lastInboundAt ? formatDate(lead.lastInboundAt) : '—'}
                      </td>
                      <td>
                        <button
                          className="secondary-button"
                          onClick={() => handleLeadClick(lead)}
                          type="button"
                        >
                          Ver detalhe
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {leads.data?.pagination?.totalPages > 1 && leads.data?.pagination && (
            <Pagination
              page={leads.data.pagination.page}
              totalPages={leads.data.pagination.totalPages}
              total={leads.data.pagination.total}
              limit={leads.data.pagination.pageSize}
              onPage={(p) => updateSearchParams('page', String(p))}
            />
          )}
        </>
      )}

      {showDetail && selectedLead && (
        <LeadDetailDrawer
          lead={selectedLead}
          detail={detail.data}
          isLoading={detail.isPending}
          onClose={() => {
            setShowDetail(false);
            setSelectedLead(null);
          }}
        />
      )}
    </section>
  );
}

function LeadDetailDrawer({
  lead,
  detail,
  isLoading,
  onClose,
}: {
  lead: Lead;
  detail?: any;
  isLoading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="prospecting-form-backdrop" onClick={onClose}>
      <div className="prospecting-form-drawer detail-drawer" onClick={(e) => e.stopPropagation()}>
        <button
          className="drawer-close"
          onClick={onClose}
          type="button"
          aria-label="Fechar"
        >
          ×
        </button>

        {isLoading ? (
          <div style={{ padding: '2rem' }}>
            <i className="platform-skeleton" style={{ height: '400px', display: 'block' }} />
          </div>
        ) : detail ? (
          <div className="lead-detail-content">
            <h2>{detail.nameSnapshot || lead.nameSnapshot}</h2>

            <section className="detail-section">
              <h3>Informações</h3>
              <dl>
                <div>
                  <dt>Telefone</dt>
                  <dd>{detail.phoneSnapshot || lead.phoneSnapshot}</dd>
                </div>
                <div>
                  <dt>Cidade</dt>
                  <dd>{detail.city || '—'}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>{detail.state || '—'}</dd>
                </div>
              </dl>
            </section>

            <section className="detail-section">
              <h3>Status</h3>
              <dl>
                <div>
                  <dt>Status atual</dt>
                  <dd>
                    <span
                      className={`status-badge tone-${
                        STATUS_LABELS[detail.status]?.tone || 'neutral'
                      }`}
                    >
                      {STATUS_LABELS[detail.status]?.label || detail.status}
                    </span>
                  </dd>
                </div>
                {detail.status === 'NEEDS_REVIEW' && (
                  <div>
                    <dt>Aviso</dt>
                    <dd className="needs-review-hint">
                      Este lead precisa de revisão manual antes de continuar a automação.
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Passo atual</dt>
                  <dd>{detail.currentStep || 0}</dd>
                </div>
                <div>
                  <dt>Follow-ups</dt>
                  <dd>{detail.followUpCount || 0}</dd>
                </div>
              </dl>
            </section>

            <section className="detail-section">
              <h3>Automação</h3>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>
                    {!detail.humanLockUntil ? (
                      <span className="lock-status free">Livre</span>
                    ) : detail.humanLockType === 'MANUAL' ? (
                      <span className="lock-status manual">Atendimento manual</span>
                    ) : (
                      <span className="lock-status inbound">
                        Aguardando atendimento
                      </span>
                    )}
                  </dd>
                </div>
                {detail.humanLockUntil && (
                  <div>
                    <dt>Bloqueio até</dt>
                    <dd>{formatDate(detail.humanLockUntil, true)}</dd>
                  </div>
                )}
                {detail.humanLockReason && (
                  <div>
                    <dt>Motivo</dt>
                    <dd>{detail.humanLockReason}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="detail-section">
              <h3>Interações</h3>
              <dl>
                <div>
                  <dt>Último envio</dt>
                  <dd>
                    {detail.lastOutboundAt ? formatDate(detail.lastOutboundAt, true) : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Última resposta</dt>
                  <dd>
                    {detail.lastInboundAt ? formatDate(detail.lastInboundAt, true) : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Respondeu em</dt>
                  <dd>
                    {detail.respondedAt ? formatDate(detail.respondedAt, true) : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Interessado em</dt>
                  <dd>
                    {detail.interestedAt ? formatDate(detail.interestedAt, true) : '—'}
                  </dd>
                </div>
                <div>
                  <dt>Próxima ação</dt>
                  <dd>
                    {detail.nextActionAt ? formatDate(detail.nextActionAt, true) : '—'}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <p>Falha ao carregar detalhe</p>
          </div>
        )}
      </div>
    </div>
  );
}
