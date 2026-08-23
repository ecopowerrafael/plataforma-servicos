import { IconCheck, IconX, IconRobot, IconBrandWhatsapp, IconClock, IconBolt } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { TenantInfoSchema } from '@plataforma/shared';
import { httpClient } from '../../../lib/http.js';
import { PageHeader } from '../../ui/AppUi.js';
import { BotCobraCard } from '../ui/BotCobraCard.js';
import { BotCobraSectionCard } from '../ui/BotCobraSectionCard.js';

export function BotCobraSettingsSection({ tenantPublicId }: { tenantPublicId: string }) {
  const { data: tenant, isLoading } = useQuery({
    queryKey: ['bot-cobra-settings', tenantPublicId],
    queryFn: () =>
      httpClient.request('/tenant/info', {
        method: 'GET',
        schema: TenantInfoSchema,
        tenantPublicId,
      }),
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <PageHeader title="Configurações" description="Gerenciar comportamento e integrações do Bot Cobra" />

      <div className="px-4 md:px-6 py-6 max-w-6xl">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-40 bg-gray-200 dark:bg-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : tenant ? (
          <div className="space-y-6">
            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Bot Cobra */}
              <BotCobraCard>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Bot Cobra</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Controla se novas cobranças automáticas podem ser processadas
                    </p>
                  </div>
                  <IconRobot className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="mt-4">
                  {tenant.botCobraEnabled ? (
                    <div className="inline-flex items-center gap-2 px-3 py-2 bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 rounded-lg font-medium text-sm">
                      <IconCheck className="w-4 h-4" />
                      Ativo
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-400 rounded-lg font-medium text-sm">
                      <IconX className="w-4 h-4" />
                      Inativo
                    </div>
                  )}
                </div>
              </BotCobraCard>

              {/* WhatsApp */}
              <BotCobraCard>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">WhatsApp</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Integração para enviar mensagens e receber respostas
                    </p>
                  </div>
                  <IconBrandWhatsapp className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="mt-4">
                  {tenant.whatsappEnabled ? (
                    <div className="inline-flex items-center gap-2 px-3 py-2 bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 rounded-lg font-medium text-sm">
                      <IconCheck className="w-4 h-4" />
                      Conectado
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-400 rounded-lg font-medium text-sm">
                        <IconX className="w-4 h-4" />
                        Desconectado
                      </div>
                      <button className="block text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium mt-2">
                        Configurar WhatsApp →
                      </button>
                    </div>
                  )}
                </div>
              </BotCobraCard>

              {/* Timezone */}
              <BotCobraCard>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Fuso Horário</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Usado para calcular os horários das campanhas
                    </p>
                  </div>
                  <IconClock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="mt-4 bg-gray-50 dark:bg-slate-900 rounded-lg p-3">
                  <div className="font-mono text-sm font-medium text-gray-900 dark:text-white">{tenant.timezone}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {tenant.timezone === 'America/Sao_Paulo' && 'São Paulo — UTC-3'}
                    {tenant.timezone === 'America/Manaus' && 'Manaus — UTC-4'}
                    {tenant.timezone === 'America/Fortaleza' && 'Fortaleza — UTC-3'}
                    {!['America/Sao_Paulo', 'America/Manaus', 'America/Fortaleza'].includes(tenant.timezone) &&
                      tenant.timezone}
                  </div>
                </div>
              </BotCobraCard>

              {/* Resources */}
              <BotCobraCard>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Recursos</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Funcionalidades disponíveis para este estabelecimento
                    </p>
                  </div>
                  <IconBolt className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <IconCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-gray-700 dark:text-gray-300">Cobranças automáticas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <IconCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-gray-700 dark:text-gray-300">Promessas de pagamento</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <IconCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-gray-700 dark:text-gray-300">PIX dinâmico</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <IconCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <span className="text-gray-700 dark:text-gray-300">Atendimento humano</span>
                  </div>
                </div>
              </BotCobraCard>
            </div>

            {/* Operational Status */}
            <BotCobraSectionCard title="Status Operacional" subtitle="Estado atual dos serviços">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">WhatsApp</h4>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${tenant.whatsappEnabled ? 'bg-green-500' : 'bg-gray-400'}`}
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {tenant.whatsappEnabled ? 'Conectado' : 'Não configurado'}
                    </span>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Agendador</h4>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Ativo</span>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">PIX</h4>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Disponível</span>
                  </div>
                </div>
              </div>
            </BotCobraSectionCard>

            {/* Quick Actions */}
            <BotCobraCard className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-4">Gerenciar</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button className="text-left px-4 py-3 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-medium text-sm transition-colors">
                  Ver campanhas disponíveis →
                </button>
                <button className="text-left px-4 py-3 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-medium text-sm transition-colors">
                  Alterar timezone →
                </button>
                <button className="text-left px-4 py-3 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 font-medium text-sm transition-colors">
                  Configurar WhatsApp →
                </button>
              </div>
            </BotCobraCard>
          </div>
        ) : (
          <BotCobraCard>
            <div className="text-center py-8">
              <p className="text-gray-600 dark:text-gray-400">Não foi possível carregar as configurações.</p>
            </div>
          </BotCobraCard>
        )}
      </div>
    </div>
  );
}
