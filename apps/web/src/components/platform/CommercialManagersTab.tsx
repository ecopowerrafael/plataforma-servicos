import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { httpClient } from '../../lib/http.js';
import { ErrorState } from './PlatformUi.js';
import { z } from 'zod';

type FormStep = 'email' | 'user-info' | 'commission' | 'confirm';

interface UserLookup {
  exists: boolean;
  user: {
    publicId: string;
    name: string | null;
    email: string;
    phone: string | null;
    hasCommercialAccount: boolean;
    commercialRole: string | null;
  } | null;
}

interface FormData {
  email: string;
  name: string;
  phone: string;
  password: string;
  passwordConfirm: string;
  defaultCommissionBps: number;
}

export function CommercialManagersTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState<FormStep>('email');
  const [userLookup, setUserLookup] = useState<UserLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    email: '',
    name: '',
    phone: '',
    password: '',
    passwordConfirm: '',
    defaultCommissionBps: 5000,
  });

  const managers = useQuery({
    queryKey: ['platform', 'commercial', 'accounts'],
    queryFn: () =>
      httpClient
        .request('/platform/commercial/accounts', {
          schema: z.object({
            data: z.array(
              z.object({
                publicId: z.string(),
                email: z.string(),
                role: z.string(),
                active: z.boolean(),
                defaultCommissionBps: z.number(),
              }),
            ),
          }),
        })
        .then((r) => r.data.filter((m) => m.role === 'MANAGER')),
  });

  const createManager = useMutation({
    mutationFn: (data: any) =>
      httpClient.request('/platform/commercial/managers', {
        method: 'POST',
        body: data,
        schema: z.object({
          publicId: z.string(),
          email: z.string(),
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform', 'commercial', 'accounts'] });
      resetForm();
    },
  });

  const handleEmailLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email) return;

    setLookupLoading(true);
    setLookupError(null);

    try {
      const result = await httpClient.request(`/platform/commercial/user-lookup?email=${encodeURIComponent(formData.email)}`, {
        schema: z.object({
          exists: z.boolean(),
          user: z.object({
            publicId: z.string(),
            name: z.string().nullable(),
            email: z.string(),
            phone: z.string().nullable(),
            hasCommercialAccount: z.boolean(),
            commercialRole: z.string().nullable(),
          }).nullable(),
        }),
      });

      setUserLookup(result);
      if (result.exists) {
        if (result.user?.hasCommercialAccount) {
          setLookupError(`Este usuário já é ${result.user.commercialRole} comercial`);
        } else {
          setStep('commission');
        }
      } else {
        setStep('user-info');
      }
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : 'Erro ao buscar usuário');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleUserInfoSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.passwordConfirm) {
      setLookupError('Senhas não conferem');
      return;
    }

    if (formData.password.length < 8) {
      setLookupError('Senha deve ter pelo menos 8 caracteres');
      return;
    }

    setLookupError(null);
    setStep('commission');
  };

  const handleCommissionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep('confirm');
  };

  const handleConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload: any = {
      email: formData.email,
      defaultCommissionBps: formData.defaultCommissionBps,
    };

    if (!userLookup?.exists) {
      payload.name = formData.name;
      payload.password = formData.password;
      payload.phone = formData.phone || undefined;
    }

    createManager.mutate(payload);
  };

  const resetForm = () => {
    setShowForm(false);
    setStep('email');
    setUserLookup(null);
    setLookupError(null);
    setFormData({
      email: '',
      name: '',
      phone: '',
      password: '',
      passwordConfirm: '',
      defaultCommissionBps: 5000,
    });
  };

  if (managers.isLoading) {
    return (
      <div className="loading">
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </div>
    );
  }

  if (managers.error instanceof Error) {
    return <ErrorState message="Erro ao carregar gerentes" />;
  }

  return (
    <div className="tab-content">
      <div className="section-header">
        <h3>Gerentes Comerciais</h3>
        <button className="action-button" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Novo Gerente'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          {step === 'email' && (
            <form onSubmit={handleEmailLookup}>
              <h4>Passo 1: Localizar Usuário</h4>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  placeholder="usuario@example.com"
                  disabled={lookupLoading}
                />
              </div>
              {lookupError && <div className="error-message">{lookupError}</div>}
              <button type="submit" className="action-button" disabled={lookupLoading || createManager.isPending}>
                {lookupLoading ? 'Buscando...' : 'Continuar'}
              </button>
            </form>
          )}

          {step === 'user-info' && !userLookup?.exists && (
            <form onSubmit={handleUserInfoSubmit}>
              <h4>Passo 2: Dados do Novo Usuário</h4>
              <div className="form-group">
                <label htmlFor="name">Nome</label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nome completo"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="phone">Telefone</label>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(11) 9 9999-9999"
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">Senha Inicial</label>
                <input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Mínimo 8 caracteres"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="passwordConfirm">Confirmar Senha</label>
                <input
                  id="passwordConfirm"
                  type="password"
                  value={formData.passwordConfirm}
                  onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
                  placeholder="Confirme a senha"
                  required
                />
              </div>
              {lookupError && <div className="error-message">{lookupError}</div>}
              {createManager.error && <div className="error-message">{String(createManager.error)}</div>}
              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={() => setStep('email')}>
                  Voltar
                </button>
                <button type="submit" className="action-button" disabled={createManager.isPending}>
                  Continuar
                </button>
              </div>
            </form>
          )}

          {step === 'commission' && (
            <form onSubmit={handleCommissionSubmit}>
              <h4>Passo 3: Comissão</h4>
              {userLookup?.exists && (
                <div className="user-info-box">
                  <p><strong>Usuário encontrado:</strong> {userLookup.user?.email}</p>
                  <p><strong>Status:</strong> Será vinculado como gerente comercial</p>
                </div>
              )}
              <div className="form-group">
                <label htmlFor="commission">Comissão Padrão (%)</label>
                <input
                  id="commission"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.defaultCommissionBps / 100}
                  onChange={(e) =>
                    setFormData({ ...formData, defaultCommissionBps: Math.round(parseFloat(e.target.value) * 100) })
                  }
                  required
                />
                <small>Percentual de comissão do gerente.</small>
              </div>
              {createManager.error && <div className="error-message">{String(createManager.error)}</div>}
              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={() => setStep(userLookup?.exists ? 'email' : 'user-info')}>
                  Voltar
                </button>
                <button type="submit" className="action-button">
                  Revisar
                </button>
              </div>
            </form>
          )}

          {step === 'confirm' && (
            <form onSubmit={handleConfirmSubmit}>
              <h4>Passo 4: Confirmação</h4>
              <div className="summary-box">
                <div className="summary-item">
                  <span className="label">Email:</span>
                  <span className="value">{formData.email}</span>
                </div>
                {!userLookup?.exists && (
                  <>
                    <div className="summary-item">
                      <span className="label">Nome:</span>
                      <span className="value">{formData.name}</span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Telefone:</span>
                      <span className="value">{formData.phone || '-'}</span>
                    </div>
                    <div className="summary-item">
                      <span className="label">Status:</span>
                      <span className="value">Novo usuário será criado</span>
                    </div>
                  </>
                )}
                <div className="summary-item">
                  <span className="label">Comissão:</span>
                  <span className="value">{(formData.defaultCommissionBps / 100).toFixed(2)}%</span>
                </div>
              </div>
              {createManager.error && <div className="error-message">{String(createManager.error)}</div>}
              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={() => setStep('commission')}>
                  Voltar
                </button>
                <button type="submit" className="action-button" disabled={createManager.isPending}>
                  {createManager.isPending ? 'Criando...' : 'Criar Gerente'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {!managers.data || managers.data.length === 0 ? (
        <div className="empty-state">
          <p>Nenhum gerente cadastrado</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Comissão</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {managers.data.map((manager) => (
                <tr key={manager.publicId}>
                  <td>{manager.email}</td>
                  <td>{(manager.defaultCommissionBps / 100).toFixed(2)}%</td>
                  <td>
                    <span className={`status-badge ${manager.active ? 'active' : 'inactive'}`}>
                      {manager.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .tab-content {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .section-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .form-card {
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 20px;
          background: var(--bg-secondary);
          margin-bottom: 20px;
        }

        .form-card h4 {
          margin: 0 0 20px 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 6px;
          font-weight: 500;
          font-size: 14px;
        }

        .form-group input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 14px;
          box-sizing: border-box;
        }

        .form-group input:disabled {
          background: var(--bg-tertiary);
          cursor: not-allowed;
        }

        .form-group small {
          display: block;
          margin-top: 4px;
          color: var(--text-secondary);
          font-size: 12px;
        }

        .error-message {
          padding: 12px;
          margin: 12px 0;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgb(239, 68, 68);
          border-radius: 4px;
          color: rgb(239, 68, 68);
          font-size: 14px;
        }

        .user-info-box {
          padding: 12px;
          margin: 12px 0;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgb(34, 197, 94);
          border-radius: 4px;
          color: var(--text-primary);
          font-size: 14px;
        }

        .user-info-box p {
          margin: 4px 0;
        }

        .summary-box {
          padding: 16px;
          margin: 16px 0;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 4px;
        }

        .summary-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          font-size: 14px;
        }

        .summary-item .label {
          font-weight: 500;
          color: var(--text-secondary);
        }

        .summary-item .value {
          font-weight: 600;
          color: var(--text-primary);
        }

        .form-actions {
          display: flex;
          gap: 12px;
          margin-top: 20px;
        }

        .action-button,
        .secondary-button {
          flex: 1;
          padding: 10px 16px;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .action-button {
          background: var(--primary);
          color: white;
        }

        .action-button:hover:not(:disabled) {
          opacity: 0.9;
        }

        .action-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .secondary-button {
          background: transparent;
          border: 1px solid var(--border-color);
          color: var(--text-primary);
        }

        .secondary-button:hover {
          background: var(--bg-tertiary);
        }

        .table-container {
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .data-table thead {
          background: var(--bg-secondary);
        }

        .data-table th {
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-color);
        }

        .data-table td {
          padding: 12px;
          border-bottom: 1px solid var(--border-color);
        }

        .status-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-badge.active {
          background: rgba(34, 197, 94, 0.1);
          color: rgb(34, 197, 94);
        }

        .status-badge.inactive {
          background: rgba(239, 68, 68, 0.1);
          color: rgb(239, 68, 68);
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-secondary);
        }

        .loading {
          padding: 20px;
        }

        .skeleton-line {
          height: 20px;
          background: var(--bg-secondary);
          border-radius: 4px;
          margin-bottom: 10px;
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
