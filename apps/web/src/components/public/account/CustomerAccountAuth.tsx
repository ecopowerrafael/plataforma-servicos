import { CUSTOMER_PASSWORD_RULES, CustomerGoogleAuthRequestSchema } from '@plataforma/shared';
import { useEffect, useRef, useState } from 'react';

import { loadGoogleIdentityServices } from '../../../lib/google-identity.js';
import { HttpError, httpClient } from '../../../lib/http.js';
import { message, type useCustomerAccount } from './customer-account.js';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: { client_id: string; callback: (response: unknown) => void }): void;
          renderButton(element: HTMLElement | null, options: Record<string, unknown>): void;
        };
      };
    };
  }
}

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
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleInitializedRef = useRef(false);

  const busy = account.register.isPending || account.login.isPending || account.loginWithGoogle.isPending || account.forgot.isPending;
  const authError = message(account.register.error ?? account.login.error ?? account.loginWithGoogle.error);

  useEffect(() => {
    if (googleInitializedRef.current) return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
    if (!clientId) {
      if (import.meta.env.DEV) {
        console.warn('[Google Auth] VITE_GOOGLE_CLIENT_ID not configured');
      }
      return;
    }

    googleInitializedRef.current = true;

    loadGoogleIdentityServices()
      .then(() => {
        if (!window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: { credential?: string } | unknown) => {
            if (response && typeof response === 'object' && 'credential' in response && response.credential) {
              try {
                const validated = CustomerGoogleAuthRequestSchema.parse({ credential: response.credential });
                await account.loginWithGoogle.mutateAsync(validated.credential);
              } catch (error) {
                // Error already handled by mutation
              }
            }
          },
        });

        if (googleButtonRef.current) {
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: 'outline',
            size: 'large',
            width: '100%',
            text: 'continue_with',
          });
        }
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.error('[Google Auth] Failed to load Google Identity Services:', error);
        }
      });
  }, [account.loginWithGoogle]);

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
        {mode === 'login' || mode === 'register' ? (
          <div ref={googleButtonRef} style={{ marginTop: '16px' }} />
        ) : null}
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
