import { zodResolver } from '@hookform/resolvers/zod';
import { PasswordSchema, SuccessResponseSchema } from '@plataforma/shared';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { AuthLayout } from '../components/AuthLayout.js';
import { HttpError, httpClient } from '../lib/http.js';

const FormSchema = z
  .object({
    password: PasswordSchema.optional(),
    currentPassword: z.string().min(1).max(128).optional(),
  })
  .refine((value) => value.password !== undefined || value.currentPassword !== undefined, {
    message: 'Informe a senha nova ou a senha da conta existente.',
  });
type FormValues = z.infer<typeof FormSchema>;

export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const form = useForm<FormValues>({ resolver: zodResolver(FormSchema) });
  const submit = form.handleSubmit(async (values) => {
    if (token === null) {
      form.setError('root', { message: 'O link de convite é inválido.' });
      return;
    }
    try {
      await httpClient.request('/auth/invitations/accept', {
        method: 'POST',
        body: {
          token,
          ...(values.password ? { password: values.password } : {}),
          ...(values.currentPassword ? { currentPassword: values.currentPassword } : {}),
        },
        schema: SuccessResponseSchema,
      });
      form.setError('root', { message: 'Convite aceito. Você já pode entrar.' });
    } catch (error) {
      form.setError('root', {
        message: error instanceof HttpError ? error.message : 'Não foi possível aceitar o convite.',
      });
    }
  });
  return (
    <AuthLayout title="Aceitar convite" footer={<Link to="/login">Ir para o login</Link>}>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          Crie sua senha
          <input type="password" autoComplete="new-password" {...form.register('password')} />
        </label>
        <span className="field-error">{form.formState.errors.password?.message}</span>
        <span className="field-error">{form.formState.errors.root?.message}</span>
        <label>
          Senha atual, se já possuir conta
          <input
            type="password"
            autoComplete="current-password"
            {...form.register('currentPassword')}
          />
        </label>
        {form.formState.errors.root?.message === undefined ? null : (
          <p className="form-notice">{form.formState.errors.root.message}</p>
        )}
        <button className="primary-button" disabled={form.formState.isSubmitting}>
          Aceitar convite
        </button>
      </form>
    </AuthLayout>
  );
}
