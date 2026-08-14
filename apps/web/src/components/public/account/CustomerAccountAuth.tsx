import { CUSTOMER_PASSWORD_RULES } from '@plataforma/shared';
import { useState } from 'react';

import { message, type useCustomerAccount } from './customer-account.js';

export function PasswordRules() {
  return (
    <ul className="public-password-rules">
      {CUSTOMER_PASSWORD_RULES.map((rule) => (
        <li key={rule}>{rule}</li>
      ))}
    </ul>
  );
}

/**
 * Entrar / criar conta / recuperar senha na própria área `/conta`, sem modal.
 * Usa exatamente os mesmos endpoints de antes.
 */
export function CustomerAccountAuth({
  account,
}: {
  account: ReturnType<typeof useCustomerAccount>;
}) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [forgotSent, setForgotSent] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const busy = account.register.isPending || account.login.isPending || account.forgot.isPending;
  const authError = message(account.register.error ?? account.login.error);

  return (
    <section className="customer-auth-card" aria-label="Acessar minha conta">
      <div className="public-auth-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          onClick={() => {
            setForgotSent(false);
            setMode('login');
          }}
        >
          Entrar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          onClick={() => {
            setForgotSent(false);
            setMode('register');
          }}
        >
          Criar conta
        </button>
      </div>
      <form
        className="public-auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === 'login') {
            account.login.mutate({ email, password });
            return;
          }
          if (mode === 'register') {
            account.register.mutate({ name, email, password });
            return;
          }
          account.forgot.mutate(email, {
            onSuccess: () => {
              setForgotSent(true);
            },
          });
        }}
      >
        {mode === 'forgot' ? (
          <p className="public-sheet-hint">
            Informe o e-mail da sua conta. Se existir uma conta associada a este e-mail, enviaremos
            as instruções para redefinir sua senha.
          </p>
        ) : null}
        {forgotSent ? (
          <p className="public-sheet-hint" role="status">
            Se existir uma conta associada a este e-mail, enviaremos as instruções para redefinir
            sua senha.
          </p>
        ) : null}
        {mode === 'register' ? (
          <label>
            <span>
              Nome <em>opcional</em>
            </span>
            <input
              autoComplete="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
        ) : null}
        <label>
          <span>E-mail</span>
          <input
            autoComplete="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </label>
        {mode === 'forgot' ? null : (
          <label>
            <span>Senha</span>
            <input
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
            />
          </label>
        )}
        {mode === 'register' ? <PasswordRules /> : null}
        {mode === 'login' ? (
          <button
            className="public-link-button"
            type="button"
            onClick={() => {
              setForgotSent(false);
              setMode('forgot');
            }}
          >
            Esqueci minha senha?
          </button>
        ) : null}
        {authError !== null ? (
          <p className="public-form-error" role="alert">
            {authError}
          </p>
        ) : null}
        <button
          className="public-primary-button"
          type="submit"
          disabled={busy || email.trim() === '' || (mode !== 'forgot' && password === '')}
        >
          {busy
            ? 'Enviando…'
            : mode === 'login'
              ? 'Entrar'
              : mode === 'register'
                ? 'Criar conta'
                : 'Enviar instruções'}
        </button>
        {mode === 'register' ? (
          <p className="public-sheet-hint">
            Com uma conta você acompanha seus horários e pagamentos sem preencher seus dados
            novamente.
          </p>
        ) : null}
      </form>
    </section>
  );
}
