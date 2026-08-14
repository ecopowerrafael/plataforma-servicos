import {
  CustomerAuthResponseSchema,
  CustomerLoginRequestSchema,
  CustomerProfileResponseSchema,
  CustomerRegisterRequestSchema,
  SuccessResponseSchema,
  type UpdateCustomerProfileRequestSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type z } from 'zod';

import { httpClient, HttpError } from '../../../lib/http.js';

export type AccountSection =
  | 'home'
  | 'profile'
  | 'appointments'
  | 'loyalty'
  | 'favorites'
  | 'reviews'
  | 'notifications'
  | 'security';

/** Uma seção por URL: `/public/:slug/conta[/segmento]`. */
export const ACCOUNT_SECTIONS: { id: AccountSection; label: string; path: string }[] = [
  { id: 'home', label: 'Início', path: '' },
  { id: 'profile', label: 'Dados pessoais', path: 'dados' },
  { id: 'appointments', label: 'Meus agendamentos', path: 'agendamentos' },
  { id: 'loyalty', label: 'Fidelidade', path: 'fidelidade' },
  { id: 'favorites', label: 'Favoritos', path: 'favoritos' },
  { id: 'reviews', label: 'Avaliações', path: 'avaliacoes' },
  { id: 'notifications', label: 'Notificações', path: 'notificacoes' },
  { id: 'security', label: 'Segurança', path: 'seguranca' },
];

export const accountPath = (slug: string, section: AccountSection): string => {
  const found = ACCOUNT_SECTIONS.find((item) => item.id === section);
  return `/public/${slug}/conta${found === undefined || found.path === '' ? '' : `/${found.path}`}`;
};

export const sectionFromPath = (segment: string | undefined): AccountSection =>
  ACCOUNT_SECTIONS.find((item) => item.path === (segment ?? ''))?.id ?? 'home';

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

export function message(error: unknown): string | null {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error) return error.message;
  return null;
}

/**
 * Sessão e dados da conta do cliente. Mesmas queries e mutations que existiam
 * no antigo modal — nenhum endpoint novo, apenas reaproveitados pela área
 * full-page.
 */
export function useCustomerAccount(slug: string) {
  const queryClient = useQueryClient();
  const meKey = ['public', slug, 'customer', 'me'];
  const invalidateMe = () => queryClient.invalidateQueries({ queryKey: meKey });

  const me = useQuery({
    queryKey: meKey,
    queryFn: () =>
      httpClient.request(`/public/sites/${slug}/customer/me`, {
        schema: CustomerAuthResponseSchema,
      }),
    retry: false,
  });

  const register = useMutation({
    mutationFn: (input: { name: string; email: string; password: string }) =>
      httpClient.request(`/public/sites/${slug}/customer/register`, {
        method: 'POST',
        body: CustomerRegisterRequestSchema.parse({
          name: fallbackName(input.name, input.email),
          email: input.email,
          password: input.password,
        }),
        schema: CustomerAuthResponseSchema,
      }),
    onSuccess: invalidateMe,
  });

  const login = useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      httpClient.request(`/public/sites/${slug}/customer/login`, {
        method: 'POST',
        body: CustomerLoginRequestSchema.parse(input),
        schema: CustomerAuthResponseSchema,
      }),
    onSuccess: invalidateMe,
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

  const forgot = useMutation({
    mutationFn: (email: string) =>
      httpClient.request(`/public/sites/${slug}/customer/forgot-password`, {
        method: 'POST',
        body: { email: email.trim() },
        schema: SuccessResponseSchema,
      }),
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

  // Foto: cache bust por `photoUpdatedAt`, sem refresh da página.
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
      queryClient.setQueryData(meKey, data);
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
      queryClient.setQueryData(meKey, data);
      await invalidateMe();
    },
  });

  return {
    me,
    customer: me.data?.customer ?? null,
    profile,
    register,
    login,
    logout,
    forgot,
    updateProfile,
    uploadPhoto,
    removePhoto,
  };
}
