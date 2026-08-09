import { zodResolver } from '@hookform/resolvers/zod';
import { LoginRequestSchema, LoginResponseSchema, type LoginRequest } from '@plataforma/shared';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { AuthLayout } from '../components/AuthLayout.js';
import { HttpError, httpClient } from '../lib/http.js';
import { clearSelectedTenant, selectTenant } from '../lib/tenant-selection.js';

export function LoginPage() {
  const navigate = useNavigate();
  const form = useForm<LoginRequest>({ resolver: zodResolver(LoginRequestSchema) });

  const submit = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    try {
      const result = await httpClient.request('/auth/login', {
        method: 'POST',
        body: values,
        schema: LoginResponseSchema,
      });
      clearSelectedTenant();
      if (result.tenants.length === 1) {
        const availableTenant = result.tenants[0];
        if (availableTenant === undefined)
          throw new Error('O tenant disponível não foi encontrado.');
        selectTenant(availableTenant.tenant.publicId);
        await navigate('/app');
      } else {
        await navigate('/select-tenant');
      }
    } catch (error) {
      form.setError('root', {
        message: error instanceof HttpError ? error.message : 'Não foi possível entrar.',
      });
    }
  });

  return (
    <AuthLayout
      title="Acesse sua conta"
      description="Use o e-mail e a senha vinculados ao seu estabelecimento."
      footer={<Link to="/forgot-password">Esqueci minha senha</Link>}
    >
      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <label>
          E-mail
          <input type="email" autoComplete="email" {...form.register('email')} />
          <span className="field-error">{form.formState.errors.email?.message}</span>
        </label>
        <label>
          Senha
          <input type="password" autoComplete="current-password" {...form.register('password')} />
          <span className="field-error">{form.formState.errors.password?.message}</span>
        </label>
        {form.formState.errors.root?.message === undefined ? null : (
          <p className="form-error" role="alert">
            {form.formState.errors.root.message}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </AuthLayout>
  );
}
