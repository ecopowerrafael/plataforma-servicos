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
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
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
type TeamMember = z.infer<typeof personSchema>;

export function CommercialTeamTab({ role }: CommercialTeamTabProps) {
  const queryClient = useQueryClient();
  const [showCreateRep, setShowCreateRep] = useState(false);
  const [showCreateSeller, setShowCreateSeller] = useState(false);
  const [editingAccount, setEditingAccount] = useState<TeamMember | null>(null);
  const [resetPwdAccount, setResetPwdAccount] = useState<TeamMember | null>(null);
  const [movingAccount, setMovingAccount] = useState<TeamMember | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<TeamMember | null>(null);
  const [createError, setCreateError] = useState('');
  const [actionError, setActionError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
    name?: string;
    phone?: string;
    commission: number;
  }) => {
    setIsLoading(true);
    setCreateError('');
    try {
      await httpClient.request('/commercial/team/representatives', {
        method: 'POST',
        body: {
          email: formData.email,
          name: formData.name,
          phone: formData.phone,
          password: formData.password,
          defaultCommissionBps: Math.round(formData.commission * 100),
        },
      });
      setShowCreateRep(false);
      await team.refetch();
    } catch (err) {
      setCreateError(err instanceof HttpError ? err.message : 'Erro ao criar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSeller = async (formData: {
    email: string;
    password: string;
    name?: string;
    phone?: string;
    commission: number;
    parentType: 'direct' | 'representative';
    representativePublicId?: string;
  }) => {
    setIsLoading(true);
    setCreateError('');
    try {
      const body: any = {
        email: formData.email,
        name: formData.name,
        phone: formData.phone,
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
      setCreateError(err instanceof HttpError ? err.message : 'Erro ao criar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditAccount = async (formData: {
    displayName?: string;
    phone?: string;
    commission?: number;
  }) => {
    if (!editingAccount) return;
    setIsLoading(true);
    setActionError('');
    try {
      const body: any = {};
      if (formData.displayName !== undefined) body.displayName = formData.displayName;
      if (formData.phone !== undefined) body.phone = formData.phone;
      if (formData.commission !== undefined) body.defaultCommissionBps = Math.round(formData.commission * 100);
      await httpClient.request(`/commercial/team/${editingAccount.publicId}`, {
        method: 'PATCH',
        body,
      });
      setEditingAccount(null);
      await team.refetch();
    } catch (err) {
      setActionError(err instanceof HttpError ? err.message : 'Erro ao editar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (account: TeamMember) => {
    setIsLoading(true);
    setActionError('');
    try {
      await httpClient.request(`/commercial/team/${account.publicId}`, {
        method: 'PATCH',
        body: { active: !account.active },
      });
      await team.refetch();
      setConfirmDeactivate(null);
    } catch (err) {
      setActionError(err instanceof HttpError ? err.message : 'Erro ao atualizar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (password: string) => {
    if (!resetPwdAccount) return;
    setIsLoading(true);
    setActionError('');
    try {
      await httpClient.request(`/commercial/team/${resetPwdAccount.publicId}/reset-password`, {
        method: 'POST',
        body: { newPassword: password },
      });
      setResetPwdAccount(null);
      alert('Senha redefinida com sucesso');
    } catch (err) {
      setActionError(err instanceof HttpError ? err.message : 'Erro ao redefinir');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMoveSeller = async (targetRepId: string | null) => {
    if (!movingAccount) return;
    setIsLoading(true);
    setActionError('');
    try {
      await httpClient.request(`/commercial/team/${movingAccount.publicId}/move`, {
        method: 'POST',
        body: { representativePublicId: targetRepId },
      });
      setMovingAccount(null);
      await team.refetch();
    } catch (err) {
      setActionError(err instanceof HttpError ? err.message : 'Erro ao mover');
    } finally {
      setIsLoading(false);
    }
  };

  if (team.isPending) return <div className="loading">Carregando...</div>;
  if (team.error instanceof Error) return <ErrorState message="Erro ao carregar equipe" />;
  if (!team.data) return <ErrorState message="Dados indisponíveis" />;

  const data = team.data as TeamData;
  const isEmpty = data.representatives.length === 0 && data.directSellers.length === 0;
  const managerCommission = data.manager.defaultCommissionBps / 100;
  const maximumForAccount = (account: TeamMember) => {
    const parentRep = data.representatives.find((rep) => rep.sellers.some((seller) => seller.publicId === account.publicId));
    if (account.role === 'REPRESENTATIVE') {
      return managerCommission - Math.max(0, ...data.representatives.find((rep) => rep.publicId === account.publicId)?.sellers.map((seller) => seller.defaultCommissionBps / 100) ?? [0]);
    }
    return parentRep ? managerCommission - (parentRep.defaultCommissionBps / 100) : managerCommission;
  };

  const getName = (m: TeamMember) => m.displayName || m.email;

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
            <div className="node-content">
              <div className="node-info">
                <span className="role-badge">GERENTE</span>
                <span className="name">{getName(data.manager)}</span>
                <span className="email">{data.manager.email}</span>
                {data.manager.phone && <span className="phone">{data.manager.phone}</span>}
                <span className="commission">{(data.manager.defaultCommissionBps / 100).toFixed(2)}%</span>
              </div>
            </div>
          </div>

          {data.representatives.map((rep) => (
            <div key={rep.publicId} className="tree-node rep-node">
              <div className="node-content">
                <div className="node-info">
                  <span className="role-badge">REP</span>
                  <span className="name">{getName(rep)}</span>
                  <span className="email">{rep.email}</span>
                  {rep.phone && <span className="phone">{rep.phone}</span>}
                  <span className="commission">{(rep.defaultCommissionBps / 100).toFixed(2)}%</span>
                  <span className={`status-badge ${rep.active ? 'active' : 'inactive'}`}>
                    {rep.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="node-actions">
                  <button className="action-btn" onClick={() => setEditingAccount(rep)}>
                    ✎
                  </button>
                  <button
                    className="action-btn"
                    onClick={() => (rep.active ? setConfirmDeactivate(rep) : handleToggleStatus(rep))}
                  >
                    {rep.active ? '○' : '●'}
                  </button>
                  <button className="action-btn" onClick={() => setResetPwdAccount(rep)}>
                    🔑
                  </button>
                </div>
              </div>
              {rep.sellers.length > 0 && (
                <div className="node-children">
                  {rep.sellers.map((seller) => (
                    <div key={seller.publicId} className="tree-node seller-node">
                      <div className="node-content">
                        <div className="node-info">
                          <span className="role-badge">VEND</span>
                          <span className="name">{getName(seller)}</span>
                          <span className="email">{seller.email}</span>
                          {seller.phone && <span className="phone">{seller.phone}</span>}
                          <span className="commission">{(seller.defaultCommissionBps / 100).toFixed(2)}%</span>
                          <span className={`status-badge ${seller.active ? 'active' : 'inactive'}`}>
                            {seller.active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        <div className="node-actions">
                          <button className="action-btn" onClick={() => setEditingAccount(seller)}>
                            ✎
                          </button>
                          <button
                            className="action-btn"
                            onClick={() =>
                              seller.active ? setConfirmDeactivate(seller) : handleToggleStatus(seller)
                            }
                          >
                            {seller.active ? '○' : '●'}
                          </button>
                          <button className="action-btn" onClick={() => setResetPwdAccount(seller)}>
                            🔑
                          </button>
                          <button className="action-btn" onClick={() => setMovingAccount(seller)}>
                            ⤻
                          </button>
                        </div>
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
                  <div className="node-content">
                    <div className="node-info">
                      <span className="role-badge">VEND</span>
                      <span className="name">{getName(seller)}</span>
                      <span className="email">{seller.email}</span>
                      {seller.phone && <span className="phone">{seller.phone}</span>}
                      <span className="commission">{(seller.defaultCommissionBps / 100).toFixed(2)}%</span>
                      <span className={`status-badge ${seller.active ? 'active' : 'inactive'}`}>
                        {seller.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <div className="node-actions">
                      <button className="action-btn" onClick={() => setEditingAccount(seller)}>
                        ✎
                      </button>
                      <button
                        className="action-btn"
                        onClick={() => (seller.active ? setConfirmDeactivate(seller) : handleToggleStatus(seller))}
                      >
                        {seller.active ? '○' : '●'}
                      </button>
                      <button className="action-btn" onClick={() => setResetPwdAccount(seller)}>
                        🔑
                      </button>
                      <button className="action-btn" onClick={() => setMovingAccount(seller)}>
                        ⤻
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showCreateRep && (
        <CreateModal
          title="Novo Representante"
          maxCommission={managerCommission}
          isLoading={isLoading}
          error={createError}
          onClose={() => setShowCreateRep(false)}
          onSubmit={handleCreateRepresentative}
          showParentSelector={false}
        />
      )}

      {showCreateSeller && (
        <CreateSellerModal
          representatives={data.representatives}
          managerCommission={managerCommission}
          isLoading={isLoading}
          error={createError}
          onClose={() => setShowCreateSeller(false)}
          onSubmit={handleCreateSeller}
        />
      )}

      {editingAccount && (
        <EditModal
          account={editingAccount}
          maxCommission={maximumForAccount(editingAccount)}
          isLoading={isLoading}
          error={actionError}
          onClose={() => setEditingAccount(null)}
          onSubmit={handleEditAccount}
        />
      )}

      {resetPwdAccount && (
        <ResetPasswordModal
          account={resetPwdAccount}
          isLoading={isLoading}
          error={actionError}
          onClose={() => setResetPwdAccount(null)}
          onSubmit={handleResetPassword}
        />
      )}

      {movingAccount && (
        <MoveSellerModal
          seller={movingAccount}
          representatives={data.representatives}
          isLoading={isLoading}
          error={actionError}
          onClose={() => setMovingAccount(null)}
          onSubmit={handleMoveSeller}
        />
      )}

      {confirmDeactivate && (
        <ConfirmDeactivateModal
          account={confirmDeactivate}
          isLoading={isLoading}
          onClose={() => setConfirmDeactivate(null)}
          onConfirm={() => handleToggleStatus(confirmDeactivate)}
        />
      )}

      <style>{`
        .team-tab { padding: 20px; }
        .team-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 20px; }
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
        .node-content { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .node-info { display: flex; gap: 8px; align-items: center; flex: 1; flex-wrap: wrap; font-size: 13px; }
        .role-badge { padding: 2px 4px; background: var(--primary); color: white; border-radius: 3px; font-size: 10px; font-weight: bold; white-space: nowrap; }
        .name { font-weight: 600; min-width: 100px; }
        .email { color: var(--text-secondary); }
        .phone { color: var(--text-secondary); font-size: 12px; }
        .commission { color: var(--primary); font-weight: bold; }
        .status-badge { padding: 2px 4px; border-radius: 3px; font-size: 10px; font-weight: bold; }
        .status-badge.active { background: #dff0d8; color: #3c763d; }
        .status-badge.inactive { background: #f2dede; color: #a94442; }
        .node-actions { display: flex; gap: 4px; }
        .action-btn { padding: 4px 8px; background: transparent; border: 1px solid var(--border-color); border-radius: 3px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
        .action-btn:hover { background: var(--primary); color: white; border-color: var(--primary); }
        .node-children { margin-top: 8px; }
        .direct-sellers { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color); }
        .subsection-title { font-weight: bold; margin-bottom: 10px; }

        @media (max-width: 768px) {
          .team-header { flex-direction: column; align-items: stretch; }
          .team-stats { flex-direction: column; gap: 10px; }
          .team-actions { flex-direction: column; }
          .node-content { flex-direction: column; align-items: flex-start; }
          .node-info { width: 100%; }
          .node-actions { width: 100%; }
          .action-btn { flex: 1; }
          .rep-node, .seller-node { margin-left: 0; }
        }
      `}</style>
    </div>
  );
}

function CreateModal({
  title,
  isLoading,
  error,
  onClose,
  onSubmit,
  maxCommission,
  showParentSelector = false,
}: {
  title: string;
  isLoading: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (data: any) => void;
  maxCommission: number;
  showParentSelector?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [commission, setCommission] = useState(Math.min(10, maxCommission));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {error && <div className="error-box">{error}</div>}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
        <input type="text" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} disabled={isLoading} />
        <input type="tel" placeholder="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isLoading} />
        <input type="password" placeholder="Senha (mín. 8 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
        <div>
          <label>Comissão: {commission.toFixed(2)}% (máximo: {maxCommission.toFixed(2)}%)</label>
          <input type="range" min="0" max={maxCommission} step="0.01" value={commission} onChange={(e) => setCommission(parseFloat(e.target.value))} disabled={isLoading} />
        </div>
        <div className="modal-actions">
          <button onClick={onClose} disabled={isLoading}>Cancelar</button>
          <button onClick={() => onSubmit({ email, name, phone, password, commission })} disabled={isLoading || !email || !password} className="btn-primary">
            {isLoading ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </div>
      <ModalStyles />
    </div>
  );
}

function CreateSellerModal({
  representatives,
  managerCommission,
  isLoading,
  error,
  onClose,
  onSubmit,
}: {
  representatives: any[];
  managerCommission: number;
  isLoading: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [commission, setCommission] = useState(5);
  const [parentType, setParentType] = useState<'direct' | 'representative'>('direct');
  const [selectedRep, setSelectedRep] = useState('');
  const selectedRepresentative = representatives.find((rep) => rep.publicId === selectedRep);
  const maxCommission = parentType === 'representative' && selectedRepresentative
    ? Math.max(0, managerCommission - selectedRepresentative.defaultCommissionBps / 100)
    : managerCommission;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Novo Vendedor</h2>
        {error && <div className="error-box">{error}</div>}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isLoading} />
        <input type="text" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} disabled={isLoading} />
        <input type="tel" placeholder="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isLoading} />
        <input type="password" placeholder="Senha (mín. 8 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
        <div>
          <label>Comissão: {Math.min(commission, maxCommission).toFixed(2)}% (máximo: {maxCommission.toFixed(2)}%)</label>
          <input type="range" min="0" max={maxCommission} step="0.01" value={Math.min(commission, maxCommission)} onChange={(e) => setCommission(parseFloat(e.target.value))} disabled={isLoading} />
        </div>
        <div>
          <label>Vinculado a:</label>
          <select value={parentType} onChange={(e) => setParentType(e.target.value as any)} disabled={isLoading}>
            <option value="direct">Diretamente a mim</option>
            {representatives.length > 0 && <option value="representative">Representante</option>}
          </select>
        </div>
        {parentType === 'representative' && representatives.length > 0 && (
          <select value={selectedRep} onChange={(e) => setSelectedRep(e.target.value)} disabled={isLoading}>
            <option value="">Selecione um representante</option>
            {representatives.map((rep) => (
              <option key={rep.publicId} value={rep.publicId}>
                {rep.displayName || rep.email}
              </option>
            ))}
          </select>
        )}
        <div className="modal-actions">
          <button onClick={onClose} disabled={isLoading}>Cancelar</button>
          <button
            onClick={() => onSubmit({ email, name, phone, password, commission: Math.min(commission, maxCommission), parentType, representativePublicId: selectedRep || undefined })}
            disabled={isLoading || !email || !password || (parentType === 'representative' && !selectedRep)}
            className="btn-primary"
          >
            {isLoading ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </div>
      <ModalStyles />
    </div>
  );
}

function EditModal({
  account,
  isLoading,
  error,
  onClose,
  onSubmit,
  maxCommission,
}: {
  account: any;
  isLoading: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (data: any) => void;
  maxCommission: number;
}) {
  const [displayName, setDisplayName] = useState(account.displayName || '');
  const [phone, setPhone] = useState(account.phone || '');
  const [commission, setCommission] = useState(Math.min(account.defaultCommissionBps / 100, maxCommission));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Editar {account.role}</h2>
        {error && <div className="error-box">{error}</div>}
        <input type="text" placeholder="Nome" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={isLoading} />
        <input type="tel" placeholder="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isLoading} />
        <div>
          <label>Comissão: {commission.toFixed(2)}% (máximo: {maxCommission.toFixed(2)}%)</label>
          <input type="range" min="0" max={maxCommission} step="0.01" value={commission} onChange={(e) => setCommission(parseFloat(e.target.value))} disabled={isLoading} />
        </div>
        <div className="modal-actions">
          <button onClick={onClose} disabled={isLoading}>Cancelar</button>
          <button onClick={() => onSubmit({ displayName, phone, commission })} disabled={isLoading} className="btn-primary">
            {isLoading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
      <ModalStyles />
    </div>
  );
}

function ResetPasswordModal({
  account,
  isLoading,
  error,
  onClose,
  onSubmit,
}: {
  account: any;
  isLoading: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Redefinir Senha</h2>
        {error && <div className="error-box">{error}</div>}
        <p>Nova senha para {account.displayName || account.email}:</p>
        <input type="password" placeholder="Nova senha (mín. 8 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isLoading} />
        <input type="password" placeholder="Confirmar senha" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={isLoading} />
        <div className="modal-actions">
          <button onClick={onClose} disabled={isLoading}>Cancelar</button>
          <button onClick={() => onSubmit(password)} disabled={isLoading || !password || password !== confirm} className="btn-primary">
            {isLoading ? 'Redefinindo...' : 'Redefinir'}
          </button>
        </div>
      </div>
      <ModalStyles />
    </div>
  );
}

function MoveSellerModal({
  seller,
  representatives,
  isLoading,
  error,
  onClose,
  onSubmit,
}: {
  seller: any;
  representatives: any[];
  isLoading: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (repId: string | null) => void;
}) {
  const [selectedRep, setSelectedRep] = useState<string | null>(null);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Mover Vendedor</h2>
        {error && <div className="error-box">{error}</div>}
        <p>Mover {seller.displayName || seller.email} para:</p>
        <div className="move-options">
          <button className={`option ${selectedRep === null ? 'selected' : ''}`} onClick={() => setSelectedRep(null)} disabled={isLoading}>
            Diretamente a mim
          </button>
          {representatives.map((rep) => (
            <button
              key={rep.publicId}
              className={`option ${selectedRep === rep.publicId ? 'selected' : ''}`}
              onClick={() => setSelectedRep(rep.publicId)}
              disabled={isLoading}
            >
              {rep.displayName || rep.email}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose} disabled={isLoading}>Cancelar</button>
          <button onClick={() => onSubmit(selectedRep)} disabled={isLoading} className="btn-primary">
            {isLoading ? 'Movendo...' : 'Mover'}
          </button>
        </div>
      </div>
      <ModalStyles />
    </div>
  );
}

function ConfirmDeactivateModal({
  account,
  isLoading,
  onClose,
  onConfirm,
}: {
  account: any;
  isLoading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Desativar Membro</h2>
        <p>Tem certeza que deseja desativar {account.displayName || account.email}?</p>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>O histórico e dados financeiros serão preservados.</p>
        <div className="modal-actions">
          <button onClick={onClose} disabled={isLoading}>Cancelar</button>
          <button onClick={onConfirm} disabled={isLoading} className="btn-primary">
            {isLoading ? 'Desativando...' : 'Desativar'}
          </button>
        </div>
      </div>
      <ModalStyles />
    </div>
  );
}

function ModalStyles() {
  return (
    <style>{`
      .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
      .modal-content { background: white; border-radius: 8px; padding: 20px; max-width: 400px; width: 90%; max-height: 90vh; overflow-y: auto; }
      .modal-content h2 { margin: 0 0 16px 0; }
      .modal-content p { margin: 0 0 12px 0; }
      .modal-content input, .modal-content select { width: 100%; padding: 8px; margin-bottom: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
      .modal-content label { display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500; }
      .error-box { padding: 8px; background: #fee; border: 1px solid #fcc; color: #c00; border-radius: 4px; margin-bottom: 12px; font-size: 13px; }
      .modal-actions { display: flex; gap: 8px; margin-top: 16px; }
      .modal-actions button { flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; }
      .modal-actions .btn-primary { background: var(--primary); color: white; border: none; }
      .move-options { display: flex; flex-direction: column; gap: 8px; margin: 16px 0; }
      .move-options .option { padding: 10px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; text-align: left; background: white; transition: all 0.2s; }
      .move-options .option.selected { background: var(--primary); color: white; border-color: var(--primary); }
      .move-options .option:hover { border-color: var(--primary); }

      @media (max-width: 768px) {
        .modal-content { width: 95%; max-height: 95vh; }
      }
    `}</style>
  );
}
