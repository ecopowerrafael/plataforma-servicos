import { zodResolver } from '@hookform/resolvers/zod';
import { PublicRegistrationResponseSchema } from '@plataforma/shared';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { AuthLayout } from '../components/AuthLayout.js';
import { httpClient } from '../lib/http.js';
import { selectTenant } from '../lib/tenant-selection.js';

const Schema = z.object({ name: z.string().trim().min(2), email: z.email(), password: z.string().min(10), confirmation: z.string() }).refine((value) => value.password === value.confirmation, { path: ['confirmation'], message: 'As senhas não coincidem.' });
type Values = z.infer<typeof Schema>;

export function RegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const plan = params.get('plan');
  const billing = params.get('billing');
  const form = useForm<Values>({ resolver: zodResolver(Schema) });
  const destination = `/login${plan === null || billing === null ? '' : `?plan=${encodeURIComponent(plan)}&billing=${encodeURIComponent(billing)}`}`;
  const submit = form.handleSubmit(async (value) => {
    if (plan === null || billing === null) { form.setError('root', { message: 'Escolha um plano antes de criar a conta.' }); return; }
    try {
      const result = await httpClient.request('/auth/register', { method: 'POST', body: { name: value.name, email: value.email, password: value.password, planPublicId: plan, billingCycle: billing }, schema: PublicRegistrationResponseSchema });
      selectTenant(result.tenantPublicId);
      await navigate('/app');
    } catch (error) { form.setError('root', { message: error instanceof Error ? error.message : 'Não foi possível criar sua conta.' }); }
  });
  return <AuthLayout title="Crie sua conta" description={plan === null ? 'Comece a organizar seu estabelecimento.' : `Você escolheu um plano — ${billing ?? ''}`} footer={<Link to={destination}>Já tem uma conta? Entrar</Link>}>
    <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
      <label>Nome do estabelecimento<input autoComplete="organization" {...form.register('name')} /><span className="field-error">{form.formState.errors.name?.message}</span></label>
      <label>E-mail<input type="email" autoComplete="email" {...form.register('email')} /><span className="field-error">{form.formState.errors.email?.message}</span></label>
      <label>Senha<input type="password" autoComplete="new-password" {...form.register('password')} /><span className="field-error">{form.formState.errors.password?.message}</span></label>
      <label>Confirmar senha<input type="password" autoComplete="new-password" {...form.register('confirmation')} /><span className="field-error">{form.formState.errors.confirmation?.message}</span></label>
      {form.formState.errors.root?.message !== undefined && <p className="form-error">{form.formState.errors.root.message}</p>}
      <button className="primary-button" type="submit">Criar conta e continuar</button>
      <Link to="/planos">Alterar plano</Link>
    </form>
  </AuthLayout>;
}
