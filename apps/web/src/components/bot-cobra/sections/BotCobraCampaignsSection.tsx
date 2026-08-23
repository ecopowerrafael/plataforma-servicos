import { IconPlus, IconClock, IconBolt, IconPlayerPause } from '@tabler/icons-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CollectionRuleListResponseSchema } from '@plataforma/shared';
import { httpClient } from '../../../lib/http.js';
import { PageHeader, ListSkeleton, EmptyState } from '../../ui/AppUi.js';
import { BotCobraCard } from '../ui/BotCobraCard.js';
import { BotCobraSectionCard } from '../ui/BotCobraSectionCard.js';
import { BotCobraStatusBadge } from '../ui/BotCobraStatusBadge.js';

export function BotCobraCampaignsSection({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    startHour: 9,
    endHour: 18,
    maxAttemptsPerDay: 3,
    minMinutesBetweenAttempts: 120,
    consecutiveDays: 7,
    pauseDaysAfterCycle: 1,
    maxCycles: 5,
    active: true,
  });

  const previewText = `Cobranças entre ${String(formData.startHour).padStart(2, '0')}:00 e ${String(formData.endHour).padStart(2, '0')}:00 | Até ${formData.maxAttemptsPerDay} tentativas/dia (intervalo mín. ${formData.minMinutesBetweenAttempts}min) | ${formData.consecutiveDays} dias | Pausa ${formData.pauseDaysAfterCycle}d | Max ${formData.maxCycles} ciclos`;

  const { data: campaignsData, isLoading } = useQuery({
    queryKey: ['bot-cobra-campaigns', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/collection-rules', {
        method: 'GET',
        schema: CollectionRuleListResponseSchema,
        tenantPublicId,
      }),
  });

  const campaigns = campaignsData?.items ?? [];

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: formData.name,
        active: formData.active,
        cadenceType: 'CUSTOM_DAYS',
        allowedStartHour: formData.startHour,
        allowedEndHour: formData.endHour,
        maxAttemptsPerDay: formData.maxAttemptsPerDay,
        minMinutesBetweenAttempts: formData.minMinutesBetweenAttempts,
        consecutiveDays: formData.consecutiveDays,
        pauseDaysAfterCycle: formData.pauseDaysAfterCycle,
        maxCycles: formData.maxCycles,
        skipSundays: true,
        partialPaymentEnabled: true,
        partialOfferPercentages: [20, 30, 50],
        askPromiseAfterPartialPayment: true,
        promiseQuickOptionsDays: [1, 3, 7, 10],
        noResponseFollowupNextDay: true,
      };
      if (editingId && editingId !== 'new') {
        return httpClient.request(`/tenant/collection-rules/${editingId}`, {
          method: 'PATCH',
          body: payload,
          schema: CollectionRuleListResponseSchema.shape.items.element,
          tenantPublicId,
        });
      }
      return httpClient.request('/tenant/collection-rules', {
        method: 'POST',
        body: payload,
        schema: CollectionRuleListResponseSchema.shape.items.element,
        tenantPublicId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bot-cobra-campaigns'] });
      setEditingId(null);
      setFormData({
        name: '',
        startHour: 9,
        endHour: 18,
        maxAttemptsPerDay: 3,
        minMinutesBetweenAttempts: 120,
        consecutiveDays: 7,
        pauseDaysAfterCycle: 1,
        maxCycles: 5,
        active: true,
      });
    },
    onError: (error: any) => {
      console.error('Erro ao salvar campanha:', error);
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <PageHeader title="Campanhas de Cobrança" description="Gerenciar campanhas e réguas de cobrança automática" />

      <div className="px-4 md:px-6 py-6 max-w-6xl">
        {/* Edit Form */}
        {editingId && (
          <BotCobraSectionCard title="Editar Campanha" className="mb-8">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nome da Campanha *
                </label>
                <input
                  type="text"
                  placeholder="Ex: Cobrança padrão"
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Nome interno para identificar esta régua de cobrança
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Horário de Cobrança
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400 block mb-2">Início</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="23"
                        className="w-20 px-3 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={formData.startHour}
                        onChange={(e) => setFormData({ ...formData, startHour: parseInt(e.target.value) })}
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">:00</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400 block mb-2">Fim</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="23"
                        className="w-20 px-3 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        value={formData.endHour}
                        onChange={(e) => setFormData({ ...formData, endHour: parseInt(e.target.value) })}
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">:00</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Horários em que o Bot Cobra pode enviar mensagens automáticas
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tentativas por Dia *
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={formData.maxAttemptsPerDay}
                    onChange={(e) => setFormData({ ...formData, maxAttemptsPerDay: parseInt(e.target.value) })}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Máximo por cobrança/dia</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Intervalo Mínimo (min) *
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="1440"
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={formData.minMinutesBetweenAttempts}
                    onChange={(e) => setFormData({ ...formData, minMinutesBetweenAttempts: parseInt(e.target.value) })}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Tempo mínimo entre duas cobranças automáticas
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Dias Consecutivos *
                  </label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={formData.consecutiveDays}
                    onChange={(e) => setFormData({ ...formData, consecutiveDays: parseInt(e.target.value) })}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Duração do ciclo</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Pausa Entre Ciclos *
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={formData.pauseDaysAfterCycle}
                    onChange={(e) => setFormData({ ...formData, pauseDaysAfterCycle: parseInt(e.target.value) })}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Descanso após cada ciclo</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Máximo de Ciclos *
                </label>
                <input
                  type="number"
                  min="1"
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={formData.maxCycles}
                  onChange={(e) => setFormData({ ...formData, maxCycles: parseInt(e.target.value) })}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Limite de repetições</p>
              </div>

              <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <input
                  type="checkbox"
                  id="active-checkbox"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="active-checkbox" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Campanha ativa
                </label>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-2">Configuração</p>
                <p className="text-xs text-blue-800 dark:text-blue-300">{previewText}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
                >
                  {saveMutation.isPending ? 'Salvando...' : 'Salvar Campanha'}
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="px-6 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-900/50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </BotCobraSectionCard>
        )}

        {/* New Campaign Button */}
        {!editingId && (
          <div className="mb-8">
            <button
              onClick={() => {
                setEditingId('new');
                setFormData({
                  name: '',
                  startHour: 9,
                  endHour: 18,
                  maxAttemptsPerDay: 3,
                  minMinutesBetweenAttempts: 120,
                  consecutiveDays: 7,
                  pauseDaysAfterCycle: 1,
                  maxCycles: 5,
                  active: true,
                });
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
            >
              <IconPlus className="w-4 h-4" />
              Nova Campanha
            </button>
          </div>
        )}

        {/* Campaigns Grid */}
        {isLoading ? (
          <ListSkeleton />
        ) : campaigns && campaigns.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {campaigns.map((campaign) => (
              <BotCobraCard key={campaign.publicId} className="flex flex-col h-full">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{campaign.name}</h3>
                    <BotCobraStatusBadge
                      status={campaign.active ? 'OPEN' : 'CANCELED'}
                      label={campaign.active ? 'Ativa' : 'Inativa'}
                    />
                  </div>
                </div>

                <div className="space-y-3 mb-6 flex-1">
                  <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <IconClock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    {String(campaign.allowedStartHour).padStart(2, '0')}:00 -{' '}
                    {String(campaign.allowedEndHour).padStart(2, '0')}:00
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <IconBolt className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    {campaign.maxAttemptsPerDay}x/dia | Intervalo: {campaign.minMinutesBetweenAttempts}min
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <IconPlayerPause className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    {campaign.consecutiveDays}d ciclo | {campaign.pauseDaysAfterCycle}d pausa | {campaign.maxCycles} ciclos max
                  </div>
                </div>

                <button
                  onClick={() => {
                    setEditingId(campaign.publicId);
                    setFormData({
                      name: campaign.name,
                      startHour: campaign.allowedStartHour,
                      endHour: campaign.allowedEndHour,
                      maxAttemptsPerDay: campaign.maxAttemptsPerDay,
                      minMinutesBetweenAttempts: campaign.minMinutesBetweenAttempts,
                      consecutiveDays: campaign.consecutiveDays,
                      pauseDaysAfterCycle: campaign.pauseDaysAfterCycle,
                      maxCycles: campaign.maxCycles || 0,
                      active: campaign.active,
                    });
                  }}
                  className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  Editar
                </button>
              </BotCobraCard>
            ))}
          </div>
        ) : (
          <EmptyState title="Nenhuma campanha criada" message="Crie uma campanha para começar a cobrar" />
        )}
      </div>
    </div>
  );
}
