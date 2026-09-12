import { IconClock, IconX } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { DebtDetailFullSchema } from '@plataforma/shared';
import { formatMoneyCents, formatShortDate } from '../../lib/format.js';
import { httpClient } from '../../lib/http.js';
import { useState } from 'react';

interface DebtDetailFull {
  debt: {
    publicId: string;
    debtorName: string;
    debtorWhatsapp: string;
    debtorEmail: string | null;
    originType: 'MANUAL' | 'APPOINTMENT';
    originalAmountCents: string;
    currentBalanceCents: string;
    status: string;
    dueDate: string;
    createdAt: string;
    paidAt: string | null;
    collectionRulePublicId: string;
  };
  activePromise: {
    promisedDate: string;
    status: string;
    source: string;
    createdAt: string;
  } | null;
  allocations: Array<{
    amountCents: string;
    source: string;
    createdAt: string;
  }>;
  charges: Array<{
    amountCents: string;
    status: string;
    provider: string;
    createdAt: string;
    hasPaid: boolean;
  }>;
  attempts: Array<{
    attemptType: string;
    status: string;
    scheduledAt: string;
    sentAt: string | null;
    respondedAt: string | null;
    technicalRetryCount: number;
    lastError: string | null;
  }>;
  events: Array<{
    eventType: string;
    createdAt: string;
    metadata: Record<string, unknown> | null;
  }>;
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

const EVENT_LABELS: Record<string, string> = {
  DEBT_CREATED: 'Dívida criada',
  COLLECTION_ATTEMPT_SENT: 'Cobrança enviada',
  COLLECTION_ATTEMPT_FAILED: 'Cobrança falhou',
  COLLECTION_RESPONSE_RECEIVED: 'Resposta recebida',
  PAYMENT_PROMISE_CREATED: 'Promessa de pagamento',
  PAYMENT_PROMISE_OVERDUE: 'Promessa vencida',
  PARTIAL_PAYMENT_RECEIVED: 'Pagamento parcial',
  DEBT_PAYMENT_OVERFLOW: 'Excedente',
  DEBT_PAID: 'Dívida quitada',
  HUMAN_SUPPORT_REQUESTED: 'Atendimento humano',
  DEBT_DISPUTED: 'Disputa registrada',
  COLLECTION_RESUMED_FROM_HUMAN_SUPPORT: 'Retomada automática',
};

export function BotCobraDetailDrawer({
  debtPublicId,
  tenantPublicId,
  isOpen,
  onClose,
}: {
  debtPublicId: string;
  tenantPublicId: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['bot-cobra-detail-full', debtPublicId],
    queryFn: () =>
      httpClient.request(`/tenant/debts/${debtPublicId}/full`, {
        method: 'GET',
        schema: DebtDetailFullSchema,
        tenantPublicId,
      }),
    enabled: isOpen,
  });

  const pauseMutation = useMutation({
    mutationFn: () =>
      httpClient.request(`/tenant/debts/${debtPublicId}/pause`, {
        method: 'POST',
        body: { reason: 'Bot Cobra' },
        schema: z.object({}),
        tenantPublicId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-cobra-detail-full', debtPublicId] });
      setActionInProgress(null);
    },
  });

  const humanSupportMutation = useMutation({
    mutationFn: () =>
      httpClient.request(`/tenant/debts/${debtPublicId}/mark-human-support`, {
        method: 'POST',
        body: {},
        schema: z.object({}),
        tenantPublicId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-cobra-detail-full', debtPublicId] });
      setActionInProgress(null);
    },
  });

  const disputeMutation = useMutation({
    mutationFn: async () => {
      if (!window.confirm('Tem certeza que deseja marcar como disputa?')) return;
      return httpClient.request(`/tenant/debts/${debtPublicId}/mark-disputed`, {
        method: 'POST',
        body: {},
        schema: z.object({}),
        tenantPublicId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-cobra-detail-full', debtPublicId] });
      setActionInProgress(null);
    },
  });

  if (!isOpen) return null;

  const debt = data?.debt;

  return (
    <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose}>
      <div
        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl transform transition-transform z-50 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Detalhes da Dívida</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-md transition"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-gray-100 h-20 rounded animate-pulse" />
            ))}
          </div>
        ) : debt ? (
          <div className="p-4 space-y-6">
            {/* Devedor */}
            <Section title="Devedor">
              <Field label="Nome" value={debt.debtorName} />
              <Field label="WhatsApp" value={debt.debtorWhatsapp} />
              {debt.debtorEmail && <Field label="Email" value={debt.debtorEmail} />}
            </Section>

            {/* Financeiro */}
            <Section title="Financeiro">
              <Field
                label="Valor Original"
                value={`R$ ${formatMoneyCents(BigInt(debt.originalAmountCents))}`}
              />
              <Field
                label="Saldo Atual"
                value={`R$ ${formatMoneyCents(BigInt(debt.currentBalanceCents))}`}
              />
              <Field
                label="Recebido"
                value={`R$ ${formatMoneyCents(
                  BigInt(debt.originalAmountCents) - BigInt(debt.currentBalanceCents),
                )}`}
              />
            </Section>

            {/* Status */}
            <Section title="Status">
              <Field label="Status" value={STATUS_LABELS[debt.status] || debt.status} />
              <Field label="Origem" value={debt.originType === 'MANUAL' ? 'Manual' : 'Agendamento'} />
              <Field label="Vencimento" value={formatShortDate(debt.dueDate)} />
              <Field label="Criada em" value={formatShortDate(debt.createdAt)} />
              {debt.paidAt && <Field label="Quitada em" value={formatShortDate(debt.paidAt)} />}
            </Section>

            {/* Promessa */}
            {data?.activePromise && (
              <Section title="Promessa de Pagamento">
                <Field label="Data Prometida" value={formatShortDate(data.activePromise.promisedDate)} />
                <Field label="Status" value={data.activePromise.status} />
                <Field label="Fonte" value={data.activePromise.source} />
              </Section>
            )}

            {/* Pagamentos */}
            {data?.allocations && data.allocations.length > 0 && (
              <Section title={`Pagamentos (${data.allocations.length})`}>
                {data.allocations.map((alloc, i) => (
                  <div key={i} className="text-sm border-t pt-2 first:border-t-0 first:pt-0">
                    <Field
                      label={`Alocação ${i + 1}`}
                      value={`R$ ${formatMoneyCents(BigInt(alloc.amountCents))}`}
                    />
                    <Field label="Fonte" value={alloc.source} />
                    <Field label="Data" value={formatShortDate(alloc.createdAt)} />
                  </div>
                ))}
              </Section>
            )}

            {/* PIX */}
            {data?.charges && data.charges.length > 0 && (
              <Section title={`PIX Gerado (${data.charges.length})`}>
                {data.charges.map((charge, i) => (
                  <div key={i} className="text-sm border-t pt-2 first:border-t-0 first:pt-0">
                    <Field label="Valor" value={`R$ ${formatMoneyCents(BigInt(charge.amountCents))}`} />
                    <Field
                      label="Status"
                      value={charge.status === 'PAID' ? '✓ Pago' : charge.status}
                    />
                    <Field label="Provider" value={charge.provider} />
                    <Field label="Data" value={formatShortDate(charge.createdAt)} />
                  </div>
                ))}
              </Section>
            )}

            {/* Timeline */}
            {data?.events && data.events.length > 0 && (
              <Section title={`Timeline (${data.events.length})`}>
                <div className="space-y-3">
                  {data.events.map((event, i) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <IconClock className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {EVENT_LABELS[event.eventType] || event.eventType}
                        </div>
                        <div className="text-gray-500 text-xs">{formatShortDate(event.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Ações */}
            <Section title="Ações">
              <div className="flex gap-2 flex-col">
                <ActionButton
                  label="Pausar"
                  variant="secondary"
                  isLoading={pauseMutation.isPending}
                  onClick={() => pauseMutation.mutate()}
                />
                <ActionButton
                  label="Atendimento Humano"
                  variant="warning"
                  isLoading={humanSupportMutation.isPending}
                  onClick={() => humanSupportMutation.mutate()}
                />
                <ActionButton
                  label="Marcar Disputa"
                  variant="danger"
                  isLoading={disputeMutation.isPending}
                  onClick={() => disputeMutation.mutate()}
                />
              </div>
            </Section>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function ActionButton({
  label,
  variant = 'primary',
  isLoading = false,
  onClick,
}: {
  label: string;
  variant?: 'primary' | 'secondary' | 'warning' | 'danger';
  isLoading?: boolean;
  onClick?: () => void;
}) {
  const colors = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900',
    warning: 'bg-yellow-600 hover:bg-yellow-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };

  return (
    <button
      className={`px-3 py-2 rounded-md text-sm font-medium transition disabled:opacity-50 ${colors[variant]}`}
      onClick={onClick}
      disabled={isLoading}
    >
      {isLoading ? 'Processando...' : label}
    </button>
  );
}
