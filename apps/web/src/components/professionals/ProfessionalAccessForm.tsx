import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ProfessionalPublicSchema, SuccessResponseSchema } from '@plataforma/shared';
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
  const [accessEmail, setAccessEmail] = useState(email ?? '');
  const [displayEmail, setDisplayEmail] = useState(email);
  const [showPassword, setShowPassword] = useState(false);
  const [createError, setCreateError] = useState('');

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

  const [hasUser, setHasUser] = useState(userPublicId !== null);
  const canChange = password === confirmation && password.length >= 8;
  const createAccess = useMutation({
    mutationFn: async () => httpClient.request(`/tenant/professionals/${professionalPublicId}/access`, { method: 'POST', body: { email: accessEmail, password, passwordConfirmation: confirmation }, schema: ProfessionalPublicSchema, tenantPublicId }),
    onSuccess: () => { setHasUser(true); setDisplayEmail(accessEmail); setMessage('Acesso criado com sucesso.'); setPassword(''); setConfirmation(''); },
    onError: (error: any) => setCreateError(error?.message ?? 'Não foi possível criar o acesso.'),
  });

  return (
    <section className="ds-stack">
      <header>
        <h3>Conta de acesso</h3>
      </header>
      {!hasUser ? (
        <form className="ds-stack" onSubmit={(e) => { e.preventDefault(); setCreateError(''); createAccess.mutate(); }}>
          <p style={{ color: 'var(--color-orange)' }}><strong>Acesso pendente</strong></p>
          <p>Crie uma conta para que este profissional possa acessar sua própria agenda e os recursos permitidos no Agendei.</p>
          <label>E-mail de acesso<input type="email" value={accessEmail} onChange={(e) => setAccessEmail(e.target.value)} required /></label>
          <label>Senha inicial<input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /><button type="button" onClick={() => setShowPassword((v) => !v)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></label>
          <label>Confirmar senha<input type={showPassword ? 'text' : 'password'} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} minLength={8} required /></label>
          {password !== confirmation && confirmation.length > 0 && <p style={{ color: 'var(--color-red)' }}>Senhas não conferem.</p>}
          {createError && <p style={{ color: 'var(--color-red)' }}>{createError}</p>}
          <button className="primary-button" type="submit" disabled={!canChange || createAccess.isPending}>{createAccess.isPending ? 'Criando...' : 'Criar acesso do profissional'}</button>
        </form>
      ) : (
        <>
          <div>
            <p><strong>Email:</strong> {displayEmail ?? accessEmail}</p>
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
