import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { ErrorState, MetricCard } from '../platform/PlatformUi.js';

interface CommercialDashboardTabProps {
  role: string;
}

export function CommercialDashboardTab({ role }: CommercialDashboardTabProps) {
  const dashboard = useQuery({
    queryKey: ['commercial', 'dashboard'],
    queryFn: () =>
      httpClient.request('/commercial/dashboard', {
        schema: z.object({
          totalClients: z.number(),
          activeClients: z.number(),
          inactiveClients: z.number(),
          trialClients: z.number(),
          teamMembers: z.number(),
        }),
      }),
    retry: false,
  });

  if (dashboard.isPending) {
    return (
      <div className="loading">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    );
  }

  if (dashboard.error instanceof Error) {
    return <ErrorState message="Erro ao carregar dashboard" />;
  }

  if (!dashboard.data) {
    return <ErrorState message="Sem dados disponíveis" />;
  }

  const data = dashboard.data;

  return (
    <div className="dashboard-content">
      <h3>Métricas Gerais</h3>

      <div className="metrics-grid">
        <MetricCard
          label="Total de Clientes"
          value={String(data.totalClients)}
          loading={dashboard.isPending}
        />
        <MetricCard
          label="Clientes Ativos"
          value={String(data.activeClients)}
          hint={`${Math.round((data.activeClients / data.totalClients) * 100)}%`}
          loading={dashboard.isPending}
        />
        <MetricCard
          label="Em Período de Teste"
          value={String(data.trialClients)}
          loading={dashboard.isPending}
        />
        <MetricCard
          label="Clientes Inativos"
          value={String(data.inactiveClients)}
          loading={dashboard.isPending}
        />
      </div>

      {role !== 'SELLER' && (
        <>
          <h3>Estrutura da Equipe</h3>
          <div className="team-info">
            <div className="team-card">
              <span className="label">Membros da Equipe</span>
              <span className="value">{data.teamMembers}</span>
            </div>
          </div>
        </>
      )}

      <style>{`
        .dashboard-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .dashboard-content h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .team-info {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .team-card {
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
          border: 1px solid var(--border-color);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .team-card .label {
          font-size: 12px;
          color: var(--text-secondary);
          font-weight: 500;
          text-transform: uppercase;
        }

        .team-card .value {
          font-size: 24px;
          font-weight: 600;
          color: var(--primary);
        }

        .loading {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
        }

        .skeleton-card {
          height: 100px;
          background: var(--bg-secondary);
          border-radius: 8px;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
