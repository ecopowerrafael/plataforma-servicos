import {
  CUSTOMER_PASSWORD_RULES,
  CustomerAuthResponseSchema,
  CustomerLoginRequestSchema,
  CustomerProfileResponseSchema,
  CustomerRegisterRequestSchema,
  SuccessResponseSchema,
  type UpdateCustomerProfileRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { type z } from 'zod';

import { httpClient, HttpError } from '../../lib/http.js';
import { CustomerAppointments } from '../CustomerAppointments.js';
import { CustomerFavorites } from '../CustomerFavorites.js';
import { CustomerLoyalty } from '../CustomerLoyalty.js';
import { CustomerProfileForm } from '../CustomerProfileForm.js';
import { CustomerPushNotifications } from '../CustomerPushNotifications.js';
import { CustomerReviews } from '../CustomerReviews.js';

interface FavoriteTarget {
  publicId: string;
  name: string;
}

type Panel = 'menu' | 'appointments' | 'profile';

/** O cadastro pede só e-mail e senha; o nome é derivado quando não informado. */
export function fallbackName(name: string, email: string): string {
  const informed = name.trim();
  if (informed.length >= 2) return informed;
  const local =
    email
      .split('@')[0]
      ?.replace(/[._-]+/gu, ' ')
      .trim() ?? '';
  return local.length >= 2 ? local : 'Cliente';
}

function message(error: unknown): string | null {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error) return error.message;
  return null;
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
 * Área do cliente em modal/bottom sheet. Reutiliza integralmente a autenticação
 * de cliente já existente (`/public/sites/:slug/customer/*`).
 */
export function CustomerAccountSheet({
  slug,
  services,
  professionals,
  onClose,
}: {
  slug: string;
  services: FavoriteTarget[];
  professionals: FavoriteTarget[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [panel, setPanel] = useState<Panel>('menu');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  const me = useQuery({
    queryKey: ['public', slug, 'customer', 'me'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/me`, {
        schema: CustomerAuthResponseSchema,
      }),
    retry: false,
  });
  const invalidateMe = () =>
    queryClient.invalidateQueries({ queryKey: ['public', slug, 'customer', 'me'] });

  const register = useMutation({
    mutationFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/register`, {
        method: 'POST',
        body: CustomerRegisterRequestSchema.parse({
          // A conta de cliente pede o mínimo: e-mail e senha. O nome é opcional.
          name: fallbackName(name, email),
          email,
          password,
        }),
        schema: CustomerAuthResponseSchema,
      }),
    onSuccess: async () => {
      setPassword('');
      await invalidateMe();
    },
  });
  const login = useMutation({
    mutationFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/login`, {
        method: 'POST',
        body: CustomerLoginRequestSchema.parse({ email, password }),
        schema: CustomerAuthResponseSchema,
      }),
    onSuccess: async () => {
      setPassword('');
      await invalidateMe();
    },
  });
  const logout = useMutation({
    mutationFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/logout`, {
        method: 'POST',
        body: {},
        schema: SuccessResponseSchema,
      }),
    onSuccess: async () => {
      await invalidateMe();
      onClose();
    },
  });
  const profile = useQuery({
    queryKey: ['public', slug, 'customer', 'profile'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/profile`, {
        schema: CustomerProfileResponseSchema,
      }),
    enabled: me.data !== undefined && panel === 'profile',
    retry: false,
  });
  const updateProfile = useMutation({
    mutationFn: (value: z.output<typeof UpdateCustomerProfileRequestSchema>) =>
      httpClient.request(`/public/sites/${slug}/customer/profile`, {
        method: 'PATCH',
        body: value,
        schema: CustomerProfileResponseSchema,
      }),
    onSuccess: async (data) => {
      queryClient.setQueryData(['public', slug, 'customer', 'profile'], data);
      await invalidateMe();
    },
  });

  const busy = register.isPending || login.isPending;
  const authError = message(register.error ?? login.error);
  const customer = me.data?.customer ?? null;

  return (
    <div className="public-sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="public-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Área do cliente"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="public-sheet-header">
          <strong>
            {customer === null
              ? mode === 'login'
                ? 'Entrar'
                : 'Criar conta'
              : panel === 'menu'
                ? customer.name
                : panel === 'appointments'
                  ? 'Meus agendamentos'
                  : 'Minha conta'}
          </strong>
          <button type="button" aria-label="Fechar" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="public-sheet-body">
          {me.isPending ? <p className="public-sheet-loading">Carregando…</p> : null}
          {!me.isPending && customer === null ? (
            <form
              className="public-auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                void (mode === 'login' ? login.mutateAsync() : register.mutateAsync());
              }}
            >
              <div className="public-auth-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'login'}
                  onClick={() => {
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
                    setMode('register');
                  }}
                >
                  Criar conta
                </button>
              </div>
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
              {mode === 'register' ? <PasswordRules /> : null}
              {authError !== null ? (
                <p className="public-form-error" role="alert">
                  {authError}
                </p>
              ) : null}
              <button
                className="public-primary-button"
                type="submit"
                disabled={busy || email.trim() === '' || password === ''}
              >
                {busy ? 'Enviando…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
              </button>
              {mode === 'register' ? (
                <p className="public-sheet-hint">
                  Com uma conta você acompanha seus horários e pagamentos sem preencher seus dados
                  novamente.
                </p>
              ) : null}
            </form>
          ) : null}
          {customer !== null && panel === 'menu' ? (
            <nav className="public-account-menu">
              <button
                type="button"
                onClick={() => {
                  setPanel('appointments');
                }}
              >
                Meus agendamentos
              </button>
              <button
                type="button"
                onClick={() => {
                  setPanel('profile');
                }}
              >
                Minha conta
              </button>
              <button
                className="is-danger"
                type="button"
                disabled={logout.isPending}
                onClick={() => void logout.mutateAsync()}
              >
                {logout.isPending ? 'Saindo…' : 'Sair'}
              </button>
            </nav>
          ) : null}
          {customer !== null && panel !== 'menu' ? (
            <>
              <button
                className="public-sheet-back"
                type="button"
                onClick={() => {
                  setPanel('menu');
                }}
              >
                ← Voltar
              </button>
              {panel === 'appointments' ? (
                <div className="public-account-panel">
                  <CustomerAppointments slug={slug} />
                  <CustomerFavorites
                    slug={slug}
                    services={services}
                    professionals={professionals}
                  />
                  <CustomerReviews slug={slug} />
                </div>
              ) : (
                <div className="public-account-panel">
                  {profile.isPending ? <p>Carregando perfil…</p> : null}
                  {profile.data !== undefined ? (
                    <CustomerProfileForm
                      profile={profile.data}
                      busy={updateProfile.isPending}
                      error={message(updateProfile.error)}
                      onSave={async (value) => {
                        await updateProfile.mutateAsync(value);
                      }}
                    />
                  ) : null}
                  <CustomerLoyalty slug={slug} />
                  <CustomerPushNotifications slug={slug} />
                </div>
              )}
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
