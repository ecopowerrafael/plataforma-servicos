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

import { environment } from '../../config/environment.js';
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

type Panel =
  | 'menu'
  | 'appointments'
  | 'profile'
  | 'loyalty'
  | 'favorites'
  | 'reviews'
  | 'notifications'
  | 'security';

const SECTIONS: { id: Panel; label: string }[] = [
  { id: 'profile', label: 'Dados pessoais' },
  { id: 'appointments', label: 'Meus agendamentos' },
  { id: 'loyalty', label: 'Fidelidade' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'reviews', label: 'Avaliações' },
  { id: 'notifications', label: 'Notificações' },
  { id: 'security', label: 'Segurança' },
];

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
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [forgotSent, setForgotSent] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
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
    enabled: me.data !== undefined,
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

  const forgot = useMutation({
    mutationFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/forgot-password`, {
        method: 'POST',
        body: { email: email.trim() },
        schema: SuccessResponseSchema,
      }),
    onSuccess: () => {
      setForgotSent(true);
    },
  });
  // Foto: preview imediato + cache bust por `photoUpdatedAt`, sem refresh.
  const uploadPhoto = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.set('file', file, file.name);
      return httpClient.request(`/public/sites/${slug}/customer/photo`, {
        method: 'PUT',
        body,
        schema: CustomerAuthResponseSchema,
      });
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(['public', slug, 'customer', 'me'], data);
      await invalidateMe();
    },
  });
  const removePhoto = useMutation({
    mutationFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/photo`, {
        method: 'DELETE',
        schema: CustomerAuthResponseSchema,
      }),
    onSuccess: async (data) => {
      queryClient.setQueryData(['public', slug, 'customer', 'me'], data);
      await invalidateMe();
    },
  });

  const busy = register.isPending || login.isPending || forgot.isPending;
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
                void (mode === 'login'
                  ? login.mutateAsync()
                  : mode === 'register'
                    ? register.mutateAsync()
                    : forgot.mutateAsync());
              }}
            >
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
              {mode === 'forgot' ? (
                <p className="public-sheet-hint">
                  Informe o e-mail da sua conta. Se existir uma conta associada a este e-mail,
                  enviaremos as instruções para redefinir sua senha.
                </p>
              ) : null}
              {forgotSent ? (
                <p className="public-sheet-hint" role="status">
                  Se existir uma conta associada a este e-mail, enviaremos as instruções para
                  redefinir sua senha.
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
          ) : null}
          {customer !== null ? (
            <>
              <header className="public-account-identity">
                <span className="public-account-avatar">
                  {customer.name.slice(0, 1)}
                  {customer.photoUrl === null ? null : (
                    <img
                      alt=""
                      src={`${environment.apiUrl}/public/sites/${slug}/customer/photo?v=${encodeURIComponent(
                        customer.photoUpdatedAt ?? '',
                      )}`}
                    />
                  )}
                </span>
                <div>
                  <strong>{customer.name}</strong>
                  {customer.email === null ? null : <small>{customer.email}</small>}
                  {customer.phone === null ? null : <small>{customer.phone}</small>}
                </div>
              </header>
              <div className="public-account-actions">
                <label className="public-account-photo-button">
                  {uploadPhoto.isPending ? 'Enviando…' : 'Alterar foto'}
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file === undefined) return;
                      if (file.size > 5 * 1024 * 1024) {
                        setPhotoError('Escolha uma imagem de até 5 MB.');
                        return;
                      }
                      setPhotoError(null);
                      uploadPhoto.mutate(file);
                    }}
                  />
                </label>
                {customer.photoUrl === null ? null : (
                  <button
                    className="public-link-button"
                    type="button"
                    disabled={removePhoto.isPending}
                    onClick={() => {
                      removePhoto.mutate();
                    }}
                  >
                    Remover foto
                  </button>
                )}
                <button
                  className="public-link-button"
                  type="button"
                  onClick={() => {
                    setPanel('profile');
                  }}
                >
                  Editar perfil
                </button>
              </div>
              {photoError === null ? null : (
                <p className="public-form-error" role="alert">
                  {photoError}
                </p>
              )}
              <div className="public-account-layout">
                <nav className="public-account-menu">
                  {SECTIONS.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      aria-current={panel === section.id ? 'page' : undefined}
                      onClick={() => {
                        setPanel(section.id);
                      }}
                    >
                      {section.label}
                      <i aria-hidden="true">›</i>
                    </button>
                  ))}
                  <button
                    className="is-danger"
                    type="button"
                    disabled={logout.isPending}
                    onClick={() => void logout.mutateAsync()}
                  >
                    {logout.isPending ? 'Saindo…' : 'Sair'}
                  </button>
                </nav>
                {panel === 'menu' ? null : (
                  <div className="public-account-panel">
                    <button
                      className="public-sheet-back"
                      type="button"
                      onClick={() => {
                        setPanel('menu');
                      }}
                    >
                      ← Voltar
                    </button>
                    {panel === 'profile' ? (
                      profile.data === undefined ? (
                        <p>Carregando perfil…</p>
                      ) : (
                        <CustomerProfileForm
                          profile={profile.data}
                          busy={updateProfile.isPending}
                          error={message(updateProfile.error)}
                          onSave={async (value) => {
                            await updateProfile.mutateAsync(value);
                          }}
                        />
                      )
                    ) : null}
                    {panel === 'appointments' ? <CustomerAppointments slug={slug} /> : null}
                    {panel === 'loyalty' ? <CustomerLoyalty slug={slug} /> : null}
                    {panel === 'favorites' ? (
                      <CustomerFavorites
                        slug={slug}
                        services={services}
                        professionals={professionals}
                      />
                    ) : null}
                    {panel === 'reviews' ? <CustomerReviews slug={slug} /> : null}
                    {panel === 'notifications' ? <CustomerPushNotifications slug={slug} /> : null}
                    {panel === 'security' ? (
                      <div className="public-account-security">
                        <p>
                          Para trocar a senha, peça o link seguro abaixo: enviamos as instruções
                          para o e-mail da conta.
                        </p>
                        <dl className="public-account-facts">
                          <div>
                            <dt>E-mail da conta</dt>
                            <dd>{customer.email ?? 'Não informado'}</dd>
                          </div>
                          <div>
                            <dt>Telefone</dt>
                            <dd>{customer.phone ?? 'Não informado'}</dd>
                          </div>
                        </dl>
                        <button
                          className="public-primary-button"
                          type="button"
                          disabled={forgot.isPending || customer.email === null}
                          onClick={() => {
                            if (customer.email === null) return;
                            setEmail(customer.email);
                            forgot.mutate();
                          }}
                        >
                          {forgot.isPending ? 'Enviando…' : 'Receber link para alterar a senha'}
                        </button>
                        {forgotSent ? (
                          <p className="public-sheet-hint" role="status">
                            Se existir uma conta associada a este e-mail, enviaremos as instruções
                            para redefinir sua senha.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
