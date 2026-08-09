import {
  CustomerAuthResponseSchema,
  CustomerLoginRequestSchema,
  CustomerProfileResponseSchema,
  CustomerRegisterRequestSchema,
  SuccessResponseSchema,
  type UpdateCustomerProfileRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type z } from 'zod';

import { CustomerAppointments } from './CustomerAppointments.js';
import { CustomerFavorites } from './CustomerFavorites.js';
import { CustomerLoyalty } from './CustomerLoyalty.js';
import { CustomerProfileForm } from './CustomerProfileForm.js';
import { CustomerPushNotifications } from './CustomerPushNotifications.js';
import { CustomerReviews } from './CustomerReviews.js';
import { httpClient, HttpError } from '../lib/http.js';

interface FavoriteTarget {
  publicId: string;
  name: string;
}

interface CustomerAuthProps {
  slug: string;
  services: FavoriteTarget[];
  professionals: FavoriteTarget[];
}

export function CustomerAuth({ slug, services, professionals }: CustomerAuthProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [acceptsCommunications, setAcceptsCommunications] = useState(false);

  const me = useQuery({
    queryKey: ['public', slug, 'customer', 'me'],
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/me`, {
        schema: CustomerAuthResponseSchema,
      }),
    retry: false,
  });

  const reset = () => {
    setName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setAcceptsCommunications(false);
  };

  const invalidateMe = () =>
    queryClient.invalidateQueries({ queryKey: ['public', slug, 'customer', 'me'] });

  const register = useMutation({
    mutationFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/register`, {
        method: 'POST',
        body: CustomerRegisterRequestSchema.parse({
          name,
          email,
          phone: phone === '' ? null : phone,
          password,
          acceptsCommunications,
        }),
        schema: CustomerAuthResponseSchema,
      }),
    onSuccess: async () => {
      reset();
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
      reset();
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
    onSuccess: invalidateMe,
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

  const busy = register.isPending || login.isPending || logout.isPending;
  const error = register.error ?? login.error;
  const errorMessage =
    error instanceof HttpError ? error.message : error instanceof Error ? error.message : null;

  if (me.isPending) return null;

  if (me.data !== undefined) {
    return (
      <section className="platform-form" aria-label="Minha conta">
        <h4>Minha conta</h4>
        <p>{`Olá, ${me.data.customer.name}`}</p>
        <button disabled={logout.isPending} type="button" onClick={() => void logout.mutateAsync()}>
          {logout.isPending ? 'Saindo…' : 'Sair'}
        </button>
        {profile.isPending ? <p>Carregando perfil…</p> : null}
        {profile.error instanceof Error ? (
          <p className="form-error">Não foi possível carregar o perfil.</p>
        ) : null}
        {profile.data !== undefined && (
          <CustomerProfileForm
            profile={profile.data}
            busy={updateProfile.isPending}
            error={
              updateProfile.error instanceof HttpError
                ? updateProfile.error.message
                : updateProfile.error instanceof Error
                  ? updateProfile.error.message
                  : null
            }
            onSave={async (value) => {
              await updateProfile.mutateAsync(value);
            }}
          />
        )}
        <CustomerAppointments slug={slug} />
        <CustomerFavorites slug={slug} services={services} professionals={professionals} />
        <CustomerReviews slug={slug} />
        <CustomerLoyalty slug={slug} />
        <CustomerPushNotifications slug={slug} />
      </section>
    );
  }

  return (
    <section className="platform-form" aria-label="Entrar ou cadastrar">
      <h4>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h4>
      <div className="form-actions">
        <button
          disabled={mode === 'login'}
          type="button"
          onClick={() => {
            setMode('login');
          }}
        >
          Entrar
        </button>
        <button
          disabled={mode === 'register'}
          type="button"
          onClick={() => {
            setMode('register');
          }}
        >
          Criar conta
        </button>
      </div>
      {mode === 'register' && (
        <label>
          Nome
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
      )}
      <label>
        E-mail
        <input
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
        />
      </label>
      {mode === 'register' && (
        <label>
          Telefone (opcional)
          <input
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
            }}
          />
        </label>
      )}
      <label>
        Senha
        <input
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
        />
      </label>
      {mode === 'register' && (
        <label>
          <input
            checked={acceptsCommunications}
            type="checkbox"
            onChange={(event) => {
              setAcceptsCommunications(event.target.checked);
            }}
          />
          {' Aceito receber comunicações'}
        </label>
      )}
      <button
        disabled={busy || email === '' || password === '' || (mode === 'register' && name === '')}
        type="button"
        onClick={() => void (mode === 'login' ? login.mutateAsync() : register.mutateAsync())}
      >
        {busy ? 'Enviando…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
      </button>
      {errorMessage !== null && (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
