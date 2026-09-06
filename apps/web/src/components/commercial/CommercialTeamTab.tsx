import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { httpClient, HttpError } from '../../lib/http.js';
import { ErrorState } from '../platform/PlatformUi.js';

interface CommercialTeamTabProps {
  role: string;
}

const personSchema = z.object({
  publicId: z.string(),
  email: z.string(),
  role: z.string(),
  active: z.boolean(),
  defaultCommissionBps: z.number(),
  createdAt: z.string(),
});

const teamSchema = z.object({
  manager: personSchema,
  representatives: z.array(
    personSchema.extend({
      sellers: z.array(personSchema),
    }),
  ),
  directSellers: z.array(personSchema),
});

type TeamData = z.infer<typeof teamSchema>;

export function CommercialTeamTab({ role }: CommercialTeamTabProps) {
  const queryClient = useQueryClient();
  const [showCreateRep, setShowCreateRep] = useState(false);
  const [showCreateSeller, setShowCreateSeller] = useState(false);
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedRep, setSelectedRep] = useState<string | null>(null);

  const team = useQuery({
    queryKey: ['commercial', 'team'],
    queryFn: () =>
      httpClient.request('/commercial/team', {
        schema: teamSchema,
      }),
    retry: false,
  });

  const handleCreateRepresentative = async (formData: {
    email: string;
    password: string;
    commission: number;
  }) => {
    setIsCreating(true);
    setCreateError('');
    try {
      await httpClient.request('/commercial/team/representatives', {
        method: 'POST',
        body: {
          email: formData.email,
          password: formData.password,
          defaultCommissionBps: Math.round(formData.commission * 100),
        },
      });
      setShowCreateRep(false);
      await team.refetch();
    } catch (err) {
      if (err instanceof HttpError) {
        setCreateError(err.message || 'Erro ao criar representante');
      } else {
        setCreateError('Erro ao criar representante');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateSeller = async (formData: {
    email: string;
    password: string;
    commission: number;
    parentType: 'direct' | 'representative';
    representativePublicId?: string;
  }) => {
    setIsCreating(true);
    setCreateError('');
    try {
      const body: any = {
        email: formData.email,
        password: formData.password,
        defaultCommissionBps: Math.round(formData.commission * 100),
      };
      if (formData.parentType === 'representative' && formData.representativePublicId) {
        body.representativePublicId = formData.representativePublicId;
      }
      await httpClient.request('/commercial/team/sellers', {
        method: 'POST',
        body,
      });
      setShowCreateSeller(false);
      await team.refetch();
    } catch (err) {
      if (err instanceof HttpError) {
        setCreateError(err.message || 'Erro ao criar vendedor');
      } else {
        setCreateError('Erro ao criar vendedor');
      }
    } finally {
      setIsCreating(false);
    }
  };

  if (team.isPending) return <div className="loading">Carregando...</div>;
  if (team.error instanceof Error) return <ErrorState message="Erro ao carregar equipe" />;
  if (!team.data) return <ErrorState message="Dados indisponíveis" />;

  const data = team.data as TeamData;
  const isEmpty = data.representatives.length === 0 && data.directSellers.length === 0;

  return (
    <div className="team-tab">
      <div className="team-header">
        <div className="team-stats">
          <div className="stat">
            <span className="stat-value">{data.representatives.length}</span>
            <span className="stat-label">Representantes</span>
          </div>
          <div className="stat">
            <span className="stat-value">
              {data.representatives.reduce((sum, r) => sum + r.sellers.length, 0) + data.directSellers.length}
            </span>
            <span className="stat-label">Vendedores</span>
          </div>
        </div>
        <div className="team-actions">
          <button className="btn-primary" onClick={() => setShowCreateRep(true)}>
            + Novo Representante
          </button>
          <button className="btn-secondary" onClick={() => setShowCreateSeller(true)}>
            + Novo Vendedor
          </button>
        </div>
      </div>

      {isEmpty ? (
        <div className="empty-state">
          <p>Sua equipe ainda está vazia</p>
          <button className="btn-primary" onClick={() => setShowCreateRep(true)}>
            Adicionar Representante
          </button>
        </div>
      ) : (
        <div className="team-tree">
          <div className="tree-node manager-node">
            <div className="node-header">
              <span className="role-badge">GERENTE</span>
              <span className="email">{data.manager.email}</span>
              <span className="commission">{(data.manager.defaultCommissionBps / 100).toFixed(2)}%</span>
            </div>
          </div>

          {data.representatives.map((rep) => (
            <div key={rep.publicId} className="tree-node rep-node">
              <div className="node-header">
                <span className="role-badge">REPRESENTANTE</span>
                <span className="email">{rep.email}</span>
                <span className="commission">{(rep.defaultCommissionBps / 100).toFixed(2)}%</span>
              </div>
              {rep.sellers.length > 0 && (
                <div className="node-children">
                  {rep.sellers.map((seller) => (
                    <div key={seller.publicId} className="tree-node seller-node">
                      <div className="node-header">
                        <span className="role-badge">VENDEDOR</span>
                        <span className="email">{seller.email}</span>
                        <span className="commission">{(seller.defaultCommissionBps / 100).toFixed(2)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {data.directSellers.length > 0 && (
            <div className="direct-sellers">
              <div className="subsection-title">Vendedores Diretos</div>
              {data.directSellers.map((seller) => (
                <div key={seller.publicId} className="tree-node seller-node">
                  <div className="node-header">
                    <span className="role-badge">VENDEDOR</span>
                    <span className="email">{seller.email}</span>
                    <span className="commission">{(seller.defaultCommissionBps / 100).toFixed(2)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showCreateRep && (
        <CreateRepresentativeModal
          isCreating={isCreating}
          error={createError}
          onClose={() => setShowCreateRep(false)}
          onCreate={handleCreateRepresentative}
        />
      )}

      {showCreateSeller && (
        <CreateSellerModal
          representatives={data.representatives}
          isCreating={isCreating}
          error={createError}
          onClose={() => setShowCreateSeller(false)}
          onCreate={handleCreateSeller}
        />
      )}

      <style>{`
        .team-tab { padding: 20px; }
        .team-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .team-stats { display: flex; gap: 30px; }
        .stat { display: flex; flex-direction: column; }
        .stat-value { font-size: 24px; font-weight: bold; }
        .stat-label { font-size: 12px; color: var(--text-secondary); }
        .team-actions { display: flex; gap: 10px; }
        .btn-primary, .btn-secondary { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .btn-primary { background: var(--primary); color: white; }
        .btn-secondary { background: var(--bg-secondary); border: 1px solid var(--border-color); }
        .empty-state { text-align: center; padding: 40px; }
        .team-tree { display: flex; flex-direction: column; gap: 12px; }
        .tree-node { padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 4px; }
        .manager-node { background: var(--primary-light, rgba(197, 160, 89, 0.1)); border-color: var(--primary); }
        .rep-node { margin-left: 20px; }
        .seller-node { margin-left: 40px; }
        .node-header { display: flex; gap: 12px; align-items: center; font-size: 14px; }
        .role-badge { padding: 2px 6px; background: var(--primary); color: white; border-radius: 3px; font-size: 11px; font-weight: bold; }
        .email { flex: 1; font-weight: 500; }
        .commission { color: var(--primary); font-weight: bold; }
        .node-children { margin-top: 8px; }
        .direct-sellers { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color); }
        .subsection-title { font-weight: bold; margin-bottom: 10px; }
        .empty-state { color: var(--text-secondary); }
      `}</style>
    </div>
  );
}

function CreateRepresentativeModal({
  isCreating,
  error,
  onClose,
  onCreate,
}: {
  isCreating: boolean;
  error: string;
  onClose: () => void;
  onCreate: (data: { email: string; password: string; commission: number }) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [commission, setCommission] = useState(10);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Novo Representante</h2>
        {error && <div className="error-box">{error}</div>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isCreating}
        />
        <input
          type="password"
          placeholder="Senha (mín. 8 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isCreating}
        />
        <div>
          <label>Comissão: {commission.toFixed(2)}%</label>
          <input
            type="range"
            min="0"
            max="100"
            step="0.01"
            value={commission}
            onChange={(e) => setCommission(parseFloat(e.target.value))}
            disabled={isCreating}
          />
        </div>
        <div className="modal-actions">
          <button onClick={onClose} disabled={isCreating}>
            Cancelar
          </button>
          <button
            onClick={() => onCreate({ email, password, commission })}
            disabled={isCreating || !email || !password}
            className="btn-primary"
          >
            {isCreating ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </div>
      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: white; border-radius: 8px; padding: 20px; max-width: 400px; width: 90%; }
        .modal-content h2 { margin: 0 0 16px 0; }
        .modal-content input { width: 100%; padding: 8px; margin-bottom: 12px; border: 1px solid #ccc; border-radius: 4px; }
        .modal-content label { display: block; margin-bottom: 4px; font-size: 14px; }
        .error-box { padding: 8px; background: #fee; border: 1px solid #fcc; color: #c00; border-radius: 4px; margin-bottom: 12px; }
        .modal-actions { display: flex; gap: 8px; margin-top: 16px; }
        .modal-actions button { flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; }
        .modal-actions .btn-primary { background: var(--primary); color: white; border: none; }
      `}</style>
    </div>
  );
}

function CreateSellerModal({
  representatives,
  isCreating,
  error,
  onClose,
  onCreate,
}: {
  representatives: any[];
  isCreating: boolean;
  error: string;
  onClose: () => void;
  onCreate: (data: any) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [commission, setCommission] = useState(5);
  const [parentType, setParentType] = useState<'direct' | 'representative'>('direct');
  const [selectedRep, setSelectedRep] = useState('');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Novo Vendedor</h2>
        {error && <div className="error-box">{error}</div>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isCreating}
        />
        <input
          type="password"
          placeholder="Senha (mín. 8 caracteres)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isCreating}
        />
        <div>
          <label>Comissão: {commission.toFixed(2)}%</label>
          <input
            type="range"
            min="0"
            max="100"
            step="0.01"
            value={commission}
            onChange={(e) => setCommission(parseFloat(e.target.value))}
            disabled={isCreating}
          />
        </div>
        <div>
          <label>Vinculado a:</label>
          <select value={parentType} onChange={(e) => setParentType(e.target.value as any)} disabled={isCreating}>
            <option value="direct">Diretamente a mim</option>
            {representatives.length > 0 && <option value="representative">Representante</option>}
          </select>
        </div>
        {parentType === 'representative' && representatives.length > 0 && (
          <select value={selectedRep} onChange={(e) => setSelectedRep(e.target.value)} disabled={isCreating}>
            <option value="">Selecione um representante</option>
            {representatives.map((rep) => (
              <option key={rep.publicId} value={rep.publicId}>
                {rep.email}
              </option>
            ))}
          </select>
        )}
        <div className="modal-actions">
          <button onClick={onClose} disabled={isCreating}>
            Cancelar
          </button>
          <button
            onClick={() =>
              onCreate({
                email,
                password,
                commission,
                parentType,
                representativePublicId: parentType === 'representative' ? selectedRep : undefined,
              })
            }
            disabled={isCreating || !email || !password || (parentType === 'representative' && !selectedRep)}
            className="btn-primary"
          >
            {isCreating ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </div>
      <style>{`
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: white; border-radius: 8px; padding: 20px; max-width: 400px; width: 90%; max-height: 90vh; overflow-y: auto; }
        .modal-content h2 { margin: 0 0 16px 0; }
        .modal-content input, .modal-content select { width: 100%; padding: 8px; margin-bottom: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
        .modal-content label { display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500; }
        .error-box { padding: 8px; background: #fee; border: 1px solid #fcc; color: #c00; border-radius: 4px; margin-bottom: 12px; }
        .modal-actions { display: flex; gap: 8px; margin-top: 16px; }
        .modal-actions button { flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; }
        .modal-actions .btn-primary { background: var(--primary); color: white; border: none; }
      `}</style>
    </div>
  );
}
