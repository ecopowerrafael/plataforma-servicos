import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from '../platform/PlatformUi.js';

const commissionSchema = z.object({
  publicId: z.string(),
  commercialAccountId: z.bigint(),
  baseAmountCents: z.bigint(),
  percentageBpsSnapshot: z.number(),
  commissionAmountCents: z.bigint(),
  roleSnapshot: z.string(),
  status: z.string(),
  createdAt: z.string(),
});

const commissionsSchema = z.object({
  commissions: z.array(commissionSchema),
});

export function CommissionsTab() {
  const commissions = useQuery({
    queryKey: ['commercial', 'commissions'],
    queryFn: () =>
      httpClient.request('/commercial/commissions', { schema: commissionsSchema }),
  });

  if (commissions.isPending) {
    return <div className="loading">Carregando comissões...</div>;
  }

  if (commissions.error) {
    return <ErrorState message="Erro ao carregar comissões" />;
  }

  return (
    <div className="commissions-tab">
      <h3>Minhas Comissões</h3>
      <table className="commissions-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Papel</th>
            <th>Base</th>
            <th>Percentual</th>
            <th>Comissão</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {commissions.data?.commissions.map((commission) => (
            <tr key={commission.publicId}>
              <td>{new Date(commission.createdAt).toLocaleDateString('pt-BR')}</td>
              <td>{commission.roleSnapshot}</td>
              <td>R$ {(Number(commission.baseAmountCents) / 100).toFixed(2)}</td>
              <td>{(commission.percentageBpsSnapshot / 100).toFixed(2)}%</td>
              <td>R$ {(Number(commission.commissionAmountCents) / 100).toFixed(2)}</td>
              <td className={`status-${commission.status.toLowerCase()}`}>{commission.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
