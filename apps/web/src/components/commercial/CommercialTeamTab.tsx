import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from '../platform/PlatformUi.js';

interface CommercialTeamTabProps {
  role: string;
}

export function CommercialTeamTab({ role }: CommercialTeamTabProps) {
  const team = useQuery({
    queryKey: ['commercial', 'team'],
    queryFn: () =>
      httpClient.request('/commercial/team', {
        schema: z.object({
          team: z.array(
            z.object({
              publicId: z.string(),
              email: z.string(),
              role: z.string(),
              active: z.boolean(),
              defaultCommissionBps: z.number(),
              clientCount: z.number(),
            }),
          ),
        }),
      }),
    retry: false,
  });

  if (team.isPending) {
    return (
      <div className="loading">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    );
  }

  if (team.error instanceof Error) {
    return <ErrorState message="Erro ao carregar equipe" />;
  }

  if (!team.data || team.data.team.length === 0) {
    return (
      <div className="empty-state">
        <p>Você não tem subordinados</p>
      </div>
    );
  }

  const teamMembers = team.data.team;

  return (
    <div className="team-content">
      <h3>Estrutura da Equipe</h3>

      <div className="team-grid">
        {teamMembers.map((member) => (
          <div key={member.publicId} className="team-member-card">
            <div className="card-header">
              <div className="role-badge">{member.role}</div>
              <div
                className={`status-indicator ${member.active ? 'active' : 'inactive'}`}
                title={member.active ? 'Ativo' : 'Inativo'}
              />
            </div>

            <div className="card-content">
              <h4>{member.email}</h4>
              <div className="info-row">
                <span className="label">Comissão:</span>
                <span className="value">{(member.defaultCommissionBps / 100).toFixed(2)}%</span>
              </div>
              <div className="info-row">
                <span className="label">Clientes:</span>
                <span className="value">{member.clientCount}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {role !== 'SELLER' && (
        <div className="action-section">
          <p className="info-text">
            {role === 'MANAGER'
              ? 'Como gerente, você pode criar representantes e vendedores diretos.'
              : 'Como representante, você pode criar vendedores sob sua supervisão.'}
          </p>
        </div>
      )}

      <style>{`
        .team-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .team-content h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .team-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .team-member-card {
          padding: 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          transition: all 0.2s;
        }

        .team-member-card:hover {
          border-color: var(--primary);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .role-badge {
          display: inline-block;
          padding: 4px 8px;
          background: var(--primary);
          color: white;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }

        .status-indicator {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #999;
        }

        .status-indicator.active {
          background: rgb(34, 197, 94);
        }

        .status-indicator.inactive {
          background: rgb(239, 68, 68);
        }

        .card-content h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 600;
          word-break: break-word;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          font-size: 13px;
        }

        .info-row .label {
          color: var(--text-secondary);
          font-weight: 500;
        }

        .info-row .value {
          font-weight: 600;
          color: var(--text-primary);
        }

        .action-section {
          margin-top: 20px;
          padding: 16px;
          background: var(--bg-secondary);
          border-radius: 8px;
          border-left: 4px solid var(--primary);
        }

        .info-text {
          margin: 0;
          font-size: 14px;
          color: var(--text-secondary);
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-secondary);
        }

        .loading {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .skeleton-card {
          height: 150px;
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
