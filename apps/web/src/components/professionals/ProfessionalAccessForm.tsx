import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { SuccessResponseSchema } from '@plataforma/shared';
import { httpClient } from '../../lib/http.js';

export function ProfessionalAccessForm({
  professionalPublicId,
  email,
  userPublicId,
  tenantPublicId,
}: {
  professionalPublicId: string;
  email: string | null;
  userPublicId: string | null;
  tenantPublicId: string;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');

  const changePwd = useMutation({
    mutationFn: async (pwd: string, confirm: string) =>
      httpClient.request(`/tenant/professionals/${professionalPublicId}/password`, {
        method: 'PUT',
        body: { password: pwd, passwordConfirmation: confirm },
        schema: SuccessResponseSchema,
        tenantPublicId,
      }),
    onSuccess: () => {
      setPassword('');
      setConfirmation('');
      setMessage('Senha alterada com sucesso.');
      setTimeout(() => setMessage(''), 3000);
    },
    onError: () => {
      setMessage('Erro ao alterar senha.');
      setTimeout(() => setMessage(''), 3000);
    },
  });

  const hasUser = userPublicId !== null;
  const canChange = password === confirmation && password.length >= 8;

  return (
    <section className="ds-stack">
      <header>
        <h3>Conta de acesso</h3>
      </header>
      {!hasUser ? (
        <p style={{ color: 'var(--color-orange)' }}>
          Status: Acesso pendente — Profissional não possui conta de login
        </p>
      ) : (
        <>
          <div>
            <p><strong>Email:</strong> {email}</p>
            <p><strong>Status:</strong> Ativa</p>
          </div>
          <form
            className="ds-stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (canChange) changePwd.mutate(password, confirmation);
            }}
          >
            <label>
              Nova senha
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label>
              Confirmar nova senha
              <input
                type="password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                minLength={8}
                required
              />
            </label>
            {password !== confirmation && password.length > 0 && (
              <p style={{ color: 'var(--color-red)' }}>Senhas não conferem.</p>
            )}
            <button
              className="primary-button"
              type="submit"
              disabled={!canChange || changePwd.isPending}
            >
              {changePwd.isPending ? 'Alterando...' : 'Alterar senha'}
            </button>
          </form>
          {message && (
            <p style={{ color: message.includes('sucesso') ? 'var(--color-green)' : 'var(--color-red)' }}>
              {message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
