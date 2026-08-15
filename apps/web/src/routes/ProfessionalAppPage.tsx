import { AuthMeResponseSchema, ProfessionalPublicSchema, SuccessResponseSchema, UpdateMyProfessionalProfileRequestSchema, type UpdateMyProfessionalProfileRequest } from '@plataforma/shared';
import { IconCalendar, IconCoin, IconLogout, IconUser } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

import { MyAgendaModule } from '../components/professionals/MyAgendaModule.js';
import { MyCommissionsModule } from '../components/professionals/MyCommissionsModule.js';
import { PwaInstall } from '../components/public/PwaInstall.js';
import { httpClient } from '../lib/http.js';
import { clearSelectedTenant, readSelectedTenant } from '../lib/tenant-selection.js';

type Section = 'agenda' | 'commissions' | 'profile';

function Profile({ tenantPublicId }: { tenantPublicId: string }) {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['tenant', tenantPublicId, 'professionals', 'me'], queryFn: () => httpClient.request('/tenant/professionals/me', { schema: ProfessionalPublicSchema, tenantPublicId }), retry: false });
  const save = useMutation({ mutationFn: (body: UpdateMyProfessionalProfileRequest) => httpClient.request('/tenant/professionals/me/profile', { method: 'PATCH', body, schema: ProfessionalPublicSchema, tenantPublicId }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tenant', tenantPublicId, 'professionals', 'me'] }) });
  if (profile.isPending) return <p>Carregando perfil…</p>;
  if (profile.data === undefined) return <p className="form-error">Não foi possível carregar seu perfil profissional.</p>;
  const person = profile.data;
  return <section className="ds-stack"><header><p className="ds-eyebrow">Profissional</p><h2>Meu perfil</h2><p>Edite somente seus dados de apresentação e contato.</p></header><form className="ds-stack" onSubmit={(event) => { event.preventDefault(); const values = new FormData(event.currentTarget); const parsed = UpdateMyProfessionalProfileRequestSchema.safeParse({ name: values.get('name'), publicName: values.get('publicName'), bio: values.get('bio') || null, phone: values.get('phone') || null }); if (parsed.success) save.mutate(parsed.data); }}><label>Nome<input name="name" defaultValue={person.name} required /></label><label>Nome público<input name="publicName" defaultValue={person.publicName} required /></label><label>Telefone<input name="phone" defaultValue={person.phone ?? ''} /></label><label>Bio<textarea name="bio" rows={4} defaultValue={person.bio ?? ''} /></label>{save.error instanceof Error ? <p className="form-error">Não foi possível salvar seu perfil.</p> : null}<button className="primary-button" type="submit" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar perfil'}</button></form></section>;
}

export function ProfessionalAppPage({ section = 'agenda' }: { section?: Section }) {
  const navigate = useNavigate();
  const tenantPublicId = readSelectedTenant();
  const auth = useQuery({
    queryKey: ['auth', 'me', tenantPublicId],
    queryFn: () => httpClient.request('/auth/me', { schema: AuthMeResponseSchema, ...(tenantPublicId === undefined ? {} : { tenantPublicId }) }),
    retry: false,
  });
  const professional = useQuery({
    queryKey: ['tenant', tenantPublicId, 'professionals', 'me', 'manifest'],
    queryFn: () => httpClient.request('/tenant/professionals/me', { schema: ProfessionalPublicSchema, tenantPublicId: tenantPublicId ?? '' }),
    enabled: tenantPublicId !== undefined,
    retry: false,
  });
  const logout = useMutation({
    mutationFn: () => httpClient.request('/auth/logout', { method: 'POST', body: {}, schema: SuccessResponseSchema }),
    onSuccess: () => { clearSelectedTenant(); void navigate('/login'); },
  });
  useEffect(() => {
    let manifest = document.head.querySelector<HTMLLinkElement>('link[data-professional-manifest]');
    if (manifest === null) {
      manifest = document.createElement('link');
      manifest.rel = 'manifest';
      manifest.dataset.professionalManifest = 'true';
      document.head.append(manifest);
    }
    const professionalId = professional.data?.publicId;
    if (professionalId === undefined || tenantPublicId === undefined) {
      manifest.remove();
      return undefined;
    }
    manifest.href = `/public/professionals/${tenantPublicId}/${professionalId}/manifest.webmanifest`;
    return () => { manifest?.remove(); };
  }, [professional.data?.publicId, tenantPublicId]);
  if (tenantPublicId === undefined) return <Navigate replace to="/select-tenant" />;
  if (auth.isPending) return <main className="app-shell"><p>Carregando aplicativo…</p></main>;
  if (auth.data?.currentTenant?.membership.permissions.includes('professional.self.read') !== true)
    return <Navigate replace to="/app" />;
  const tenant = auth.data.currentTenant.tenant;
  return <main className="app-shell professional-app">
    <aside className="app-sidebar"><strong>{tenant.displayName}</strong><p>Aplicativo profissional</p><nav><NavLink to="/profissional"><IconCalendar />Agenda</NavLink><NavLink to="/profissional/comissoes"><IconCoin />Comissões</NavLink><NavLink to="/profissional/perfil"><IconUser />Perfil</NavLink></nav><button className="secondary-button" type="button" onClick={() => logout.mutate()}><IconLogout />Sair</button></aside>
    <header className="app-header"><div><p className="eyebrow">{tenant.displayName}</p><h1>{section === 'agenda' ? 'Minha agenda' : section === 'commissions' ? 'Minhas comissões' : 'Meu perfil'}</h1></div></header>
    <div className="professional-app-content">{section === 'agenda' ? <MyAgendaModule tenantPublicId={tenantPublicId} selfOnly /> : section === 'commissions' ? <MyCommissionsModule tenantPublicId={tenantPublicId} /> : <><Profile tenantPublicId={tenantPublicId} /><PwaInstall published appName={`${tenant.displayName} — Profissional`} /></>}</div>
    <nav className="professional-bottom-nav"><NavLink to="/profissional"><IconCalendar />Agenda</NavLink><NavLink to="/profissional/comissoes"><IconCoin />Comissões</NavLink><NavLink to="/profissional/perfil"><IconUser />Perfil</NavLink></nav>
  </main>;
}
