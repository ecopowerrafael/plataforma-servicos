import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { formatMoneyCents, formatShortDate } from '../../lib/format.js';
import { httpClient } from '../../lib/http.js';
import { EmptyState, ListSkeleton, PageHeader, Pagination } from '../ui/AppUi.js';
import { BotCobraDetailDrawer } from './BotCobraDetailDrawer.js';

interface DebtListItem {
  publicId: string;
  debtorName: string;
  debtorWhatsapp: string;
  originType: 'MANUAL' | 'APPOINTMENT';
  originalAmountCents: string;
  currentBalanceCents: string;
  status: string;
  dueDate: string;
  createdAt: string;
  collectionRulePublicId: string;
  activePromiseDate: string | null;
  hasPendingPix: boolean;
  lastAttemptType: string | null;
  lastAttemptAt: string | null;
}

interface DebtSummary {
  openBalanceCents: string;
  originalTotalCents: string;
  receivedTotalCents: string;
  activeCount: number;
  promiseActiveCount: number;
  promiseOverdueCount: number;
  humanSupportCount: number;
  disputedCount: number;
  paidCount: number;
  failedAttemptCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Em cobrança',
  PAUSED: 'Pausada',
  PROMISE_SCHEDULED: 'Promessa',
  HUMAN_SUPPORT: 'Atendimento humano',
  DISPUTED: 'Em disputa',
  PAID: 'Quitada',
  CANCELED: 'Cancelada',
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'text-red-600',
  PAUSED: 'text-gray-600',
  PROMISE_SCHEDULED: 'text-blue-600',
  HUMAN_SUPPORT: 'text-purple-600',
  DISPUTED: 'text-orange-600',
  PAID: 'text-green-600',
  CANCELED: 'text-gray-400',
};

export function BotCobraModule({ tenantPublicId }: { tenantPublicId: string }) {
  const location = useLocation();
  const section = location.pathname.split('/')[3] || undefined;

  if (section === 'cobrancas') {
    return <BotCobraDebtsSection tenantPublicId={tenantPublicId} />;
  }
  if (section === 'nova') {
    return <BotCobraNewDebtSection tenantPublicId={tenantPublicId} />;
  }
  if (section === 'campanhas') {
    return <BotCobraCampaignsSection tenantPublicId={tenantPublicId} />;
  }
  if (section === 'promessas') {
    return <BotCobraPromisesSection tenantPublicId={tenantPublicId} />;
  }
  if (section === 'atendimento') {
    return <BotCobraHumanSupportSection tenantPublicId={tenantPublicId} />;
  }
  if (section === 'configuracoes') {
    return <BotCobraSettingsSection tenantPublicId={tenantPublicId} />;
  }

  return <BotCobraOverviewSection tenantPublicId={tenantPublicId} />;
}

function BotCobraOverviewSection({ tenantPublicId }: { tenantPublicId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [originType, setOriginType] = useState<string | null>(null);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['bot-cobra-summary', tenantPublicId],
    queryFn: async () => {
      const res = await httpClient.get(`/tenant/debts/summary`);
      return res.json() as Promise<DebtSummary>;
    },
  });

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['bot-cobra-list', tenantPublicId, page, pageSize, search, status, originType],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        ...(search && { search }),
        ...(status && { status }),
        ...(originType && { originType }),
      });
      const res = await httpClient.get(`/tenant/debts?${params}`);
      return res.json() as Promise<{
        items: DebtListItem[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>;
    },
  });

  return (
    <>
      <PageHeader title="Bot Cobra" description="Gerenciar cobranças e dívidas" />

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-100 rounded h-20 animate-pulse" />
          ))}
        </div>
      ) : summaryData ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <SummaryCard
            label="Em aberto"
            value={`R$ ${formatMoneyCents(BigInt(summaryData.openBalanceCents))}`}
            count={summaryData.activeCount}
          />
          <SummaryCard
            label="Recebido"
            value={`R$ ${formatMoneyCents(BigInt(summaryData.receivedTotalCents))}`}
            variant="success"
          />
          <SummaryCard
            label="Promessas"
            value={summaryData.promiseActiveCount}
            subvalue={`${summaryData.promiseOverdueCount} atrasadas`}
            variant="info"
          />
          <SummaryCard
            label="Atendimento"
            value={summaryData.humanSupportCount}
            variant="warning"
          />
          <SummaryCard
            label="Quitadas"
            value={summaryData.paidCount}
            variant="success"
          />
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex-1 min-w-64">
          <div className="relative">
            <IconSearch className="absolute left-2 top-2.5 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              className="w-full pl-8 pr-3 py-2 border rounded-md"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <select
          className="px-3 py-2 border rounded-md text-sm"
          value={status ?? ''}
          onChange={(e) => {
            setStatus(e.target.value || null);
            setPage(1);
          }}
        >
          <option value="">Status</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="px-3 py-2 border rounded-md text-sm"
          value={originType ?? ''}
          onChange={(e) => {
            setOriginType(e.target.value || null);
            setPage(1);
          }}
        >
          <option value="">Origem</option>
          <option value="MANUAL">Manual</option>
          <option value="APPOINTMENT">Agendamento</option>
        </select>
      </div>

      {/* List */}
      {listLoading ? (
        <ListSkeleton />
      ) : !listData?.items.length ? (
        <EmptyState message="Nenhuma dívida encontrada" />
      ) : (
        <>
          <div className="space-y-2">
            {listData.items.map((debt) => (
              <div
                key={debt.publicId}
                className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer transition"
                onClick={() => setSelectedDebtId(debt.publicId)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{debt.debtorName}</div>
                    <div className="text-xs text-gray-600">{debt.debtorWhatsapp}</div>
                    <div className="flex gap-2 mt-1 text-xs">
                      <span className={`${STATUS_COLORS[debt.status] || 'text-gray-600'}`}>
                        {STATUS_LABELS[debt.status] || debt.status}
                      </span>
                      {debt.activePromiseDate && (
                        <span className="text-blue-600">Promessa até {formatShortDate(debt.activePromiseDate)}</span>
                      )}
                      {debt.hasPendingPix && <span className="text-orange-600">PIX pendente</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-sm">R$ {formatMoneyCents(BigInt(debt.currentBalanceCents))}</div>
                    <div className="text-xs text-gray-600">
                      de R$ {formatMoneyCents(BigInt(debt.originalAmountCents))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {listData && listData.totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={listData.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {/* Detail Drawer */}
      {selectedDebtId && (
        <BotCobraDetailDrawer
          debtPublicId={selectedDebtId}
          isOpen={!!selectedDebtId}
          onClose={() => setSelectedDebtId(null)}
        />
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  subvalue,
  count,
  variant = 'default',
}: {
  label: string;
  value: string | number;
  subvalue?: string;
  count?: number;
  variant?: 'default' | 'success' | 'warning' | 'info';
}) {
  const bgColor = {
    default: 'bg-blue-50 border-blue-200',
    success: 'bg-green-50 border-green-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-purple-50 border-purple-200',
  }[variant];

  const textColor = {
    default: 'text-blue-900',
    success: 'text-green-900',
    warning: 'text-yellow-900',
    info: 'text-purple-900',
  }[variant];

  return (
    <div className={`${bgColor} border rounded-lg p-3`}>
      <div className="text-xs text-gray-600 font-medium">{label}</div>
      <div className={`text-lg font-bold ${textColor} mt-1`}>{value}</div>
      {subvalue && <div className="text-xs text-gray-600 mt-1">{subvalue}</div>}
      {count !== undefined && <div className="text-xs text-gray-600 mt-1">{count} registros</div>}
    </div>
  );
}

function BotCobraDebtsSection({ tenantPublicId }: { tenantPublicId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [originType, setOriginType] = useState<string | null>(null);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['bot-cobra-list-full', tenantPublicId, page, pageSize, search, status, originType],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        ...(search && { search }),
        ...(status && { status }),
        ...(originType && { originType }),
      });
      const res = await httpClient.get(`/tenant/debts?${params}`);
      return res.json() as Promise<{
        items: DebtListItem[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>;
    },
  });

  return (
    <>
      <PageHeader title="Cobranças" description="Lista completa de todas as cobranças" />

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="flex-1 min-w-64">
          <div className="relative">
            <IconSearch className="absolute left-2 top-2.5 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              className="w-full pl-8 pr-3 py-2 border rounded-md"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <select
          className="px-3 py-2 border rounded-md text-sm"
          value={status ?? ''}
          onChange={(e) => {
            setStatus(e.target.value || null);
            setPage(1);
          }}
        >
          <option value="">Todos os status</option>
          <option value="OPEN">Em cobrança</option>
          <option value="PROMISE_SCHEDULED">Promessa</option>
          <option value="HUMAN_SUPPORT">Atendimento humano</option>
          <option value="DISPUTED">Em disputa</option>
          <option value="PAID">Quitada</option>
          <option value="CANCELED">Cancelada</option>
        </select>
        <select
          className="px-3 py-2 border rounded-md text-sm"
          value={originType ?? ''}
          onChange={(e) => {
            setOriginType(e.target.value || null);
            setPage(1);
          }}
        >
          <option value="">Todas as origens</option>
          <option value="MANUAL">Manual</option>
          <option value="APPOINTMENT">Agendamento</option>
        </select>
      </div>

      {listLoading ? (
        <ListSkeleton count={5} />
      ) : listData && listData.items.length > 0 ? (
        <>
          <div className="space-y-2">
            {listData.items.map((debt) => (
              <div
                key={debt.publicId}
                className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition"
                onClick={() => setSelectedDebtId(debt.publicId)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-sm">{debt.debtorName}</div>
                    <div className="text-xs text-gray-600">{debt.debtorWhatsapp}</div>
                    <div className="flex gap-2 mt-1 text-xs flex-wrap">
                      <span className={`${STATUS_COLORS[debt.status] || 'text-gray-600'}`}>
                        {STATUS_LABELS[debt.status] || debt.status}
                      </span>
                      <span className="text-gray-600">{debt.originType === 'MANUAL' ? 'Manual' : 'Agendamento'}</span>
                      {debt.activePromiseDate && (
                        <span className="text-blue-600">Promessa até {formatShortDate(debt.activePromiseDate)}</span>
                      )}
                      {debt.hasPendingPix && <span className="text-orange-600">PIX pendente</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-sm">R$ {formatMoneyCents(BigInt(debt.currentBalanceCents))}</div>
                    <div className="text-xs text-gray-600">
                      de R$ {formatMoneyCents(BigInt(debt.originalAmountCents))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {listData && listData.totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={listData.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      ) : (
        <EmptyState message="Nenhuma cobrança encontrada" />
      )}

      {selectedDebtId && (
        <BotCobraDetailDrawer
          debtPublicId={selectedDebtId}
          isOpen={!!selectedDebtId}
          onClose={() => setSelectedDebtId(null)}
        />
      )}
    </>
  );
}

function BotCobraNewDebtSection({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    whatsapp: '',
    phone: '',
    email: '',
    valueCents: '',
    dueDate: '',
    description: '',
    collectionRulePublicId: '',
    notes: '',
    startCollection: true,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await httpClient.post(`/tenant/debts`, {
        debtorName: formData.name,
        debtorWhatsapp: formData.whatsapp,
        debtorPhone: formData.phone || null,
        debtorEmail: formData.email || null,
        originalAmountCents: Math.round(parseFloat(formData.valueCents) * 100),
        dueDate: formData.dueDate,
        description: formData.description,
        collectionRulePublicId: formData.collectionRulePublicId,
        internalNotes: formData.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-cobra'] });
      setFormData({
        name: '',
        whatsapp: '',
        phone: '',
        email: '',
        valueCents: '',
        dueDate: '',
        description: '',
        collectionRulePublicId: '',
        notes: '',
        startCollection: true,
      });
      alert('Cobrança criada com sucesso!');
    },
  });

  const isValid =
    formData.name.trim() &&
    formData.whatsapp.trim() &&
    formData.valueCents &&
    parseFloat(formData.valueCents) > 0 &&
    formData.dueDate &&
    formData.collectionRulePublicId;

  return (
    <>
      <PageHeader title="Nova Cobrança" description="Criar uma nova cobrança manual" />
      <form
        className="max-w-2xl space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          createMutation.mutate();
        }}
      >
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h3 className="font-semibold text-sm">Informações do Devedor</h3>
          <input
            type="text"
            placeholder="Nome do devedor *"
            className="w-full px-3 py-2 border rounded-md"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="WhatsApp *"
            className="w-full px-3 py-2 border rounded-md"
            value={formData.whatsapp}
            onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
            required
          />
          <input
            type="text"
            placeholder="Telefone (opcional)"
            className="w-full px-3 py-2 border rounded-md"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
          <input
            type="email"
            placeholder="E-mail (opcional)"
            className="w-full px-3 py-2 border rounded-md"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>

        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h3 className="font-semibold text-sm">Informações Financeiras</h3>
          <input
            type="number"
            step="0.01"
            placeholder="Valor *"
            className="w-full px-3 py-2 border rounded-md"
            value={formData.valueCents}
            onChange={(e) => setFormData({ ...formData, valueCents: e.target.value })}
            required
          />
          <input
            type="date"
            className="w-full px-3 py-2 border rounded-md"
            value={formData.dueDate}
            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
            required
          />
          <textarea
            placeholder="Descrição (opcional)"
            className="w-full px-3 py-2 border rounded-md"
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div className="bg-white rounded-lg border p-6 space-y-4">
          <h3 className="font-semibold text-sm">Configuração</h3>
          <input
            type="text"
            placeholder="ID da Campanha *"
            className="w-full px-3 py-2 border rounded-md text-xs"
            value={formData.collectionRulePublicId}
            onChange={(e) => setFormData({ ...formData, collectionRulePublicId: e.target.value })}
            required
          />
          <textarea
            placeholder="Observações internas (opcional)"
            className="w-full px-3 py-2 border rounded-md"
            rows={2}
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.startCollection}
              onChange={(e) => setFormData({ ...formData, startCollection: e.target.checked })}
            />
            <span className="text-sm">Iniciar cobrança automática agora</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={!isValid || createMutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Criando...' : 'Criar Cobrança'}
        </button>
      </form>
    </>
  );
}

function BotCobraCampaignsSection({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    startHour: 9,
    endHour: 18,
    maxAttemptsPerDay: 3,
    consecutiveDays: 7,
    pauseDaysAfterCycle: 1,
    maxCycles: 5,
    active: true,
  });

  const previewText = `Cobranças entre ${String(formData.startHour).padStart(2, '0')}:00 e ${String(formData.endHour).padStart(2, '0')}:00 | Até ${formData.maxAttemptsPerDay} tentativas/dia | ${formData.consecutiveDays} dias consecutivos | ${formData.pauseDaysAfterCycle} dia(s) de pausa | ${formData.maxCycles} ciclo(s)`;

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['bot-cobra-campaigns', tenantPublicId],
    queryFn: async () => {
      const res = await httpClient.get(`/tenant/collection-rules`);
      return (await res.json()) as Array<{
        publicId: string;
        name: string;
        startHour: number;
        endHour: number;
        maxAttemptsPerDay: number;
        consecutiveDays: number;
        pauseDaysAfterCycle: number;
        maxCycles: number;
        active: boolean;
      }>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        await httpClient.patch(`/tenant/collection-rules/${editingId}`, formData);
      } else {
        await httpClient.post(`/tenant/collection-rules`, formData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-cobra-campaigns'] });
      setEditingId(null);
      setFormData({
        name: '',
        startHour: 9,
        endHour: 18,
        maxAttemptsPerDay: 3,
        consecutiveDays: 7,
        pauseDaysAfterCycle: 1,
        maxCycles: 5,
        active: true,
      });
    },
  });

  return (
    <>
      <PageHeader title="Campanhas" description="Gerenciar campanhas e réguas de cobrança" />

      {editingId && (
        <div className="bg-white rounded-lg border p-6 mb-6 space-y-6">
          <h3 className="font-semibold text-sm">Editar Campanha</h3>

          <div>
            <label className="block text-sm font-medium mb-2">Nome da campanha</label>
            <input
              type="text"
              placeholder="Ex: Cobrança padrão"
              className="w-full px-3 py-2 border rounded-md"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            <p className="text-xs text-gray-600 mt-1">Nome interno para identificar esta régua de cobrança</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3">Horário de cobrança</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-600">Início</label>
                <div className="flex items-center">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    className="w-16 px-3 py-2 border rounded-md"
                    value={formData.startHour}
                    onChange={(e) => setFormData({ ...formData, startHour: parseInt(e.target.value) })}
                  />
                  <span className="ml-2 text-sm">:00</span>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">Fim</label>
                <div className="flex items-center">
                  <input
                    type="number"
                    min="0"
                    max="23"
                    className="w-16 px-3 py-2 border rounded-md"
                    value={formData.endHour}
                    onChange={(e) => setFormData({ ...formData, endHour: parseInt(e.target.value) })}
                  />
                  <span className="ml-2 text-sm">:00</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2">Horários em que o Bot Cobra pode enviar mensagens automáticas</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Tentativas por dia</label>
              <div className="flex items-center">
                <input
                  type="number"
                  min="1"
                  className="w-20 px-3 py-2 border rounded-md"
                  value={formData.maxAttemptsPerDay}
                  onChange={(e) => setFormData({ ...formData, maxAttemptsPerDay: parseInt(e.target.value) })}
                />
                <span className="ml-2 text-sm text-gray-600">tentativas</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">Máximo por cobrança/dia</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Dias consecutivos</label>
              <div className="flex items-center">
                <input
                  type="number"
                  min="1"
                  className="w-20 px-3 py-2 border rounded-md"
                  value={formData.consecutiveDays}
                  onChange={(e) => setFormData({ ...formData, consecutiveDays: parseInt(e.target.value) })}
                />
                <span className="ml-2 text-sm text-gray-600">dias</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">Duração do ciclo</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Pausa entre ciclos</label>
              <div className="flex items-center">
                <input
                  type="number"
                  min="0"
                  className="w-20 px-3 py-2 border rounded-md"
                  value={formData.pauseDaysAfterCycle}
                  onChange={(e) => setFormData({ ...formData, pauseDaysAfterCycle: parseInt(e.target.value) })}
                />
                <span className="ml-2 text-sm text-gray-600">dia(s)</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">Descanso após cada ciclo</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Máximo de ciclos</label>
              <div className="flex items-center">
                <input
                  type="number"
                  min="1"
                  className="w-20 px-3 py-2 border rounded-md"
                  value={formData.maxCycles}
                  onChange={(e) => setFormData({ ...formData, maxCycles: parseInt(e.target.value) })}
                />
                <span className="ml-2 text-sm text-gray-600">ciclos</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">Limite de repetições</p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer p-3 bg-gray-50 rounded-md">
            <input
              type="checkbox"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
            />
            <span className="text-sm font-medium">Campanha ativa</span>
          </label>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <p className="text-sm font-medium text-blue-900 mb-2">Como funciona</p>
            <p className="text-xs text-blue-800">{previewText}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Salvando...' : 'Salvar campanha'}
            </button>
            <button
              onClick={() => setEditingId(null)}
              className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          setEditingId('new');
          setFormData({
            name: '',
            startHour: 9,
            endHour: 18,
            maxAttemptsPerDay: 3,
            consecutiveDays: 7,
            pauseDaysAfterCycle: 1,
            maxCycles: 5,
            active: true,
          });
        }}
        className="mb-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm flex items-center gap-2"
      >
        <IconPlus className="w-4 h-4" />
        Nova Campanha
      </button>

      {isLoading ? (
        <ListSkeleton count={3} />
      ) : campaigns && campaigns.length > 0 ? (
        <div className="space-y-2">
          {campaigns.map((campaign) => (
            <div
              key={campaign.publicId}
              className="border rounded-lg p-4 bg-white hover:bg-gray-50"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-sm">{campaign.name}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    {campaign.startHour}:00 - {campaign.endHour}:00 | {campaign.maxAttemptsPerDay}x/dia | {campaign.consecutiveDays}d | Pausa {campaign.pauseDaysAfterCycle}d | Max {campaign.maxCycles} ciclos
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    Status: {campaign.active ? <span className="text-green-600">Ativa</span> : <span className="text-gray-600">Inativa</span>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setEditingId(campaign.publicId);
                    setFormData({
                      name: campaign.name,
                      startHour: campaign.startHour,
                      endHour: campaign.endHour,
                      maxAttemptsPerDay: campaign.maxAttemptsPerDay,
                      consecutiveDays: campaign.consecutiveDays,
                      pauseDaysAfterCycle: campaign.pauseDaysAfterCycle,
                      maxCycles: campaign.maxCycles,
                      active: campaign.active,
                    });
                  }}
                  className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                >
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="Nenhuma campanha criada" />
      )}
    </>
  );
}

function BotCobraPromisesSection({ tenantPublicId }: { tenantPublicId: string }) {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  const { data: promises, isLoading } = useQuery({
    queryKey: ['bot-cobra-promises', tenantPublicId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      const res = await httpClient.get(`/tenant/payment-promises?${params}`);
      return (await res.json()) as Array<{
        publicId: string;
        debtPublicId: string;
        debtorName: string;
        promisedDate: string;
        status: string;
        source: string;
        currentBalanceCents: string;
        createdAt: string;
      }>;
    },
  });

  const STATUS_LABELS_PROMISE: Record<string, string> = {
    ACTIVE: 'Ativa',
    FULFILLED: 'Cumprida',
    OVERDUE: 'Vencida',
    REPLACED: 'Substituída',
    CANCELED: 'Cancelada',
  };

  return (
    <>
      <PageHeader title="Promessas" description="Gerenciar promessas de pagamento" />

      <div className="mb-4 flex gap-2">
        <select
          className="px-3 py-2 border rounded-md text-sm"
          value={statusFilter ?? ''}
          onChange={(e) => setStatusFilter(e.target.value || null)}
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativa</option>
          <option value="FULFILLED">Cumprida</option>
          <option value="OVERDUE">Vencida</option>
          <option value="REPLACED">Substituída</option>
          <option value="CANCELED">Cancelada</option>
        </select>
      </div>

      {isLoading ? (
        <ListSkeleton count={5} />
      ) : promises && promises.length > 0 ? (
        <div className="space-y-2">
          {promises.map((promise) => (
            <div
              key={promise.publicId}
              className="border rounded-lg p-4 bg-white hover:bg-gray-50 cursor-pointer"
              onClick={() => setSelectedDebtId(promise.debtPublicId)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-sm">{promise.debtorName}</div>
                  <div className="text-xs text-gray-600 mt-1">Promessa até {formatShortDate(promise.promisedDate)}</div>
                  <div className="flex gap-2 mt-1 text-xs">
                    <span className="text-gray-600">{STATUS_LABELS_PROMISE[promise.status] || promise.status}</span>
                    <span className="text-gray-600">{promise.source}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm">R$ {formatMoneyCents(BigInt(promise.currentBalanceCents))}</div>
                  <div className="text-xs text-gray-600 mt-1">{formatShortDate(promise.createdAt)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="Nenhuma promessa encontrada" />
      )}

      {selectedDebtId && (
        <BotCobraDetailDrawer
          debtPublicId={selectedDebtId}
          isOpen={!!selectedDebtId}
          onClose={() => setSelectedDebtId(null)}
        />
      )}
    </>
  );
}

function BotCobraHumanSupportSection({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  const { data: listData, isLoading } = useQuery({
    queryKey: ['bot-cobra-human-support', tenantPublicId, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        status: 'HUMAN_SUPPORT',
      });
      const res = await httpClient.get(`/tenant/debts?${params}`);
      return res.json() as Promise<{
        items: DebtListItem[];
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      }>;
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (debtPublicId: string) =>
      httpClient.post(`/tenant/debts/${debtPublicId}/resume-from-human-support`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-cobra-human-support'] });
    },
  });

  return (
    <>
      <PageHeader title="Atendimento Humano" description="Cobranças aguardando atendimento" />

      {isLoading ? (
        <ListSkeleton count={5} />
      ) : listData && listData.items.length > 0 ? (
        <>
          <div className="space-y-2">
            {listData.items.map((debt) => (
              <div
                key={debt.publicId}
                className="border rounded-lg p-4 bg-white hover:bg-gray-50"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 cursor-pointer" onClick={() => setSelectedDebtId(debt.publicId)}>
                    <div className="font-medium text-sm">{debt.debtorName}</div>
                    <div className="text-xs text-gray-600">{debt.debtorWhatsapp}</div>
                    {debt.activePromiseDate && (
                      <div className="text-xs text-blue-600 mt-1">Promessa até {formatShortDate(debt.activePromiseDate)}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-sm">R$ {formatMoneyCents(BigInt(debt.currentBalanceCents))}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      de R$ {formatMoneyCents(BigInt(debt.originalAmountCents))}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <a
                    href={`https://wa.me/${debt.debtorWhatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                  >
                    WhatsApp
                  </a>
                  <button
                    onClick={() => setSelectedDebtId(debt.publicId)}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                  >
                    Ver cobrança
                  </button>
                  <button
                    onClick={() => resumeMutation.mutate(debt.publicId)}
                    disabled={resumeMutation.isPending}
                    className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200 disabled:opacity-50"
                  >
                    Retomar
                  </button>
                </div>
              </div>
            ))}
          </div>

          {listData && listData.totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={listData.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      ) : (
        <EmptyState message="Nenhuma cobrança em atendimento humano" />
      )}

      {selectedDebtId && (
        <BotCobraDetailDrawer
          debtPublicId={selectedDebtId}
          isOpen={!!selectedDebtId}
          onClose={() => setSelectedDebtId(null)}
        />
      )}
    </>
  );
}

function BotCobraSettingsSection({ tenantPublicId }: { tenantPublicId: string }) {
  const { data: tenant, isLoading } = useQuery({
    queryKey: ['bot-cobra-settings', tenantPublicId],
    queryFn: async () => {
      const res = await httpClient.get(`/tenant/info`);
      return (await res.json()) as {
        publicId: string;
        timezone: string;
        whatsappEnabled: boolean;
        botCobraEnabled: boolean;
      };
    },
  });

  return (
    <>
      <PageHeader title="Configurações do Bot Cobra" description="Gerenciar comportamento e integrações" />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-100 h-32 rounded animate-pulse" />
          ))}
        </div>
      ) : tenant ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          {/* Bot Cobra Status */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-sm mb-4">Bot Cobra</h3>
            <div className="mb-4">
              <div className={`px-3 py-2 rounded text-sm font-medium inline-block ${
                tenant.botCobraEnabled
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {tenant.botCobraEnabled ? '✓ Ativo' : 'Inativo'}
              </div>
            </div>
            <p className="text-xs text-gray-600">Controla se novas cobranças automáticas podem ser processadas para este estabelecimento.</p>
          </div>

          {/* WhatsApp Integration */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-sm mb-4">WhatsApp</h3>
            <div className="mb-4">
              <div className={`px-3 py-2 rounded text-sm font-medium inline-block ${
                tenant.whatsappEnabled
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {tenant.whatsappEnabled ? '✓ Conectado' : 'Desconectado'}
              </div>
            </div>
            <p className="text-xs text-gray-600 mb-3">O Bot Cobra utiliza esta integração para enviar mensagens e receber respostas dos clientes.</p>
            {!tenant.whatsappEnabled && (
              <button className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                Configurar WhatsApp →
              </button>
            )}
          </div>

          {/* Timezone */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-sm mb-4">Horário do estabelecimento</h3>
            <div className="bg-gray-50 rounded p-3 mb-3">
              <div className="font-mono text-sm">{tenant.timezone}</div>
              <div className="text-xs text-gray-600 mt-1">
                {tenant.timezone === 'America/Sao_Paulo' && 'São Paulo — UTC-3'}
                {tenant.timezone === 'America/Manaus' && 'Manaus — UTC-4'}
                {tenant.timezone === 'America/Fortaleza' && 'Fortaleza — UTC-3'}
                {!['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza'].includes(tenant.timezone) && tenant.timezone}
              </div>
            </div>
            <p className="text-xs text-gray-600">Os horários das campanhas são calculados usando este fuso horário.</p>
          </div>

          {/* Comportamento */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold text-sm mb-4">Recursos disponíveis</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <div>
                  <div className="font-medium">Cobranças automáticas</div>
                  <div className="text-gray-600">Envio de mensagens via WhatsApp</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <div>
                  <div className="font-medium">Promessas de pagamento</div>
                  <div className="text-gray-600">Registro e acompanhamento</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <div>
                  <div className="font-medium">PIX dinâmico</div>
                  <div className="text-gray-600">Geração de QR codes</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <div>
                  <div className="font-medium">Atendimento humano</div>
                  <div className="text-gray-600">Escalação para análise manual</div>
                </div>
              </div>
            </div>
          </div>

          {/* Help & Documentation */}
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
            <h3 className="font-semibold text-sm mb-3 text-blue-900">Gerenciar</h3>
            <div className="space-y-2 text-sm">
              <button className="block text-blue-600 hover:text-blue-700 font-medium text-left">
                Ver campanhas disponíveis →
              </button>
              <button className="block text-blue-600 hover:text-blue-700 font-medium text-left">
                Alterar timezone →
              </button>
              <button className="block text-blue-600 hover:text-blue-700 font-medium text-left">
                Configurar WhatsApp →
              </button>
            </div>
          </div>

          {/* Status técnico */}
          <div className="bg-white rounded-lg border p-6 text-xs">
            <h3 className="font-semibold text-sm mb-3">Status operacional</h3>
            <div className="space-y-2 text-gray-600">
              <div className="flex justify-between">
                <span>WhatsApp</span>
                <span className={tenant.whatsappEnabled ? 'text-green-600' : 'text-gray-400'}>
                  {tenant.whatsappEnabled ? '• Conectado' : '• Não configurado'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Agendador</span>
                <span className="text-green-600">• Ativo</span>
              </div>
              <div className="flex justify-between">
                <span>PIX</span>
                <span className="text-green-600">• Disponível</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg border p-6 text-center">
          <p className="text-gray-600 text-sm">Não foi possível carregar as configurações.</p>
        </div>
      )}
    </>
  );
}
