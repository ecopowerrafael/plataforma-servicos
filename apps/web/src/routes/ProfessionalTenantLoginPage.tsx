import { LoginRequestSchema, LoginResponseSchema, PublicTenantSiteResponseSchema, ProfessionalPublicSchema } from '@plataforma/shared';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { AuthLayout } from '../components/AuthLayout.js';
import { HttpError, httpClient } from '../lib/http.js';
import { selectTenant } from '../lib/tenant-selection.js';

/** Login contextual: a URL define o tenant; nunca oferece seleção. */
export function ProfessionalTenantLoginPage() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const site = useQuery({ queryKey: ['public-site', slug], queryFn: () => httpClient.request(`/public/sites/${slug}`, { schema: PublicTenantSiteResponseSchema }), retry: false });
  if (site.isPending) return <main className="app-shell"><p>Carregando estabelecimento…</p></main>;
  if (site.data === undefined) return <Navigate replace to="/" />;
  const submit = async (form: HTMLFormElement) => {
    const parsed = LoginRequestSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) { setError('Informe e-mail e senha válidos.'); return; }
    try {
      const result = await httpClient.request('/auth/login', { method: 'POST', body: parsed.data, schema: LoginResponseSchema });
      const membership = result.tenants.find((item) => item.tenant.publicId === site.data?.publicId);
      if (membership === undefined) {
        await httpClient.request('/auth/logout', { method: 'POST' });
        setError('Esta conta não pertence a este estabelecimento.');
        return;
      }
      selectTenant(membership.tenant.publicId);
      try {
        await httpClient.request('/tenant/professionals/me', { schema: ProfessionalPublicSchema, tenantPublicId: membership.tenant.publicId });
        await navigate(`/public/${slug}/profissional`, { replace: true });
      } catch (profError) {
        await httpClient.request('/auth/logout', { method: 'POST' });
        const msg = profError instanceof HttpError ? profError.message : 'Esta conta não possui acesso profissional a este estabelecimento.';
        setError(msg);
      }
    } catch (cause) { setError(cause instanceof HttpError ? cause.message : 'Não foi possível entrar.'); }
  };
  return <AuthLayout title="Área do profissional" description={site.data.displayName} footer={<Link to={`/forgot-password?returnTo=${encodeURIComponent(`/public/${slug}/profissional`)}`}>Esqueci minha senha</Link>}><form className="auth-form" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}><label>E-mail<input required name="email" type="email" autoComplete="email" /></label><label>Senha<input required name="password" type="password" autoComplete="current-password" /></label>{error === null ? null : <p className="form-error" role="alert">{error}</p>}<button className="primary-button" type="submit">Entrar</button></form></AuthLayout>;
}
