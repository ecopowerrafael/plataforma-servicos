import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CollectionRuleListResponseSchema, DebtPublicSchema } from '@plataforma/shared';
import { httpClient } from '../../../lib/http.js';
import { PageHeader } from '../../ui/AppUi.js';
import { BotCobraCard } from '../ui/BotCobraCard.js';
import { BotCobraSectionCard } from '../ui/BotCobraSectionCard.js';

export function BotCobraNewDebtSection({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    whatsapp: '',
    email: '',
    valueCents: '',
    dueDate: '',
    description: '',
    collectionRulePublicId: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);

  const { data: campaignsData } = useQuery({
    queryKey: ['bot-cobra-campaigns-select', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/collection-rules', {
        method: 'GET',
        schema: CollectionRuleListResponseSchema,
        tenantPublicId,
      }),
  });

  const campaigns = campaignsData?.items?.filter((c) => c.active) ?? [];

  const isValid =
    formData.name.trim() &&
    formData.whatsapp.trim() &&
    formData.valueCents &&
    parseFloat(formData.valueCents) > 0 &&
    formData.dueDate &&
    formData.description.trim() &&
    formData.collectionRulePublicId;

  const createMutation = useMutation({
    mutationFn: () =>
      httpClient.request('/tenant/debts', {
        method: 'POST',
        body: {
          debtorName: formData.name,
          debtorWhatsapp: formData.whatsapp,
          debtorEmail: formData.email || null,
          amountCents: Math.round(parseFloat(formData.valueCents) * 100),
          dueDate: formData.dueDate,
          description: formData.description,
          collectionRulePublicId: formData.collectionRulePublicId,
          notes: formData.notes || null,
        },
        schema: DebtPublicSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-cobra-summary'] });
      queryClient.invalidateQueries({ queryKey: ['bot-cobra-list'] });
      queryClient.invalidateQueries({ queryKey: ['bot-cobra-list-full'] });
      setError(null);
      navigate('/app/bot-cobra/cobrancas');
    },
    onError: (err: any) => {
      setError(err?.message || 'Não foi possível criar a cobrança.');
      console.error('Erro ao criar cobrança:', err);
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <PageHeader title="Nova Cobrança" description="Criar uma nova cobrança manual" />

      <div className="px-4 md:px-6 py-6 max-w-4xl">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          {/* Devedor */}
          <BotCobraSectionCard title="Informações do Devedor" subtitle="Dados de contato do cliente">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nome do Devedor *
                </label>
                <input
                  type="text"
                  placeholder="Ex: João Silva"
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  WhatsApp *
                </label>
                <input
                  type="text"
                  placeholder="Ex: (11) 99999-9999"
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={formData.whatsapp}
                  onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  E-mail (Opcional)
                </label>
                <input
                  type="email"
                  placeholder="Ex: joao@email.com"
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>
          </BotCobraSectionCard>

          {/* Financeiro */}
          <BotCobraSectionCard title="Informações Financeiras" subtitle="Detalhes da dívida">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Valor *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={formData.valueCents}
                    onChange={(e) => setFormData({ ...formData, valueCents: e.target.value })}
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Em reais (R$)</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Data de Vencimento *
                  </label>
                  <input
                    type="date"
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Descrição *
                </label>
                <textarea
                  placeholder="Descreva o motivo da dívida (ex: Serviços prestados, Venda de produto)"
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                />
              </div>
            </div>
          </BotCobraSectionCard>

          {/* Configuração */}
          <BotCobraSectionCard title="Configuração de Cobrança" subtitle="Escolha a campanha e adicione observações">
            <div className="space-y-4">
              {campaigns.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Campanha de Cobrança *
                  </label>
                  <select
                    value={formData.collectionRulePublicId}
                    onChange={(e) => setFormData({ ...formData, collectionRulePublicId: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Selecione uma campanha...</option>
                    {campaigns.map((c) => (
                      <option key={c.publicId} value={c.publicId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-900 dark:text-amber-200">
                    Nenhuma campanha disponível.{' '}
                    <button
                      type="button"
                      onClick={() => navigate('/app/bot-cobra/campanhas')}
                      className="font-medium hover:underline"
                    >
                      Criar uma campanha
                    </button>
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Observações Internas (Opcional)
                </label>
                <textarea
                  placeholder="Notas internas sobre esta dívida..."
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>
          </BotCobraSectionCard>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={!isValid || createMutation.isPending}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {createMutation.isPending ? 'Criando...' : 'Criar Cobrança'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/app/bot-cobra')}
              className="px-6 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-900/50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
