import { zodResolver } from '@hookform/resolvers/zod';
import { PasswordSchema, SuccessResponseSchema } from '@plataforma/shared';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { AuthLayout } from '../components/AuthLayout.js';
import { HttpError, httpClient } from '../lib/http.js';

const FormSchema = z.object({ newPassword: PasswordSchema });
type FormValues = z.infer<typeof FormSchema>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const form = useForm<FormValues>({ resolver: zodResolver(FormSchema) });
  const submit = form.handleSubmit(async (values) => {
    if (token === null) {
      form.setError('root', { message: 'O link de redefinição é inválido.' });
      return;
    }
    try {
      await httpClient.request('/auth/password/reset', {
        method: 'POST',
        body: { token, newPassword: values.newPassword },
        schema: SuccessResponseSchema,
      });
      form.reset();
      form.setError('root', { message: 'Senha atualizada. Volte ao login para entrar.' });
    } catch (error) {
      form.setError('root', {
        message: error instanceof HttpError ? error.message : 'Não foi possível atualizar a senha.',
      });
    }
  });
  return (
    <AuthLayout title="Definir nova senha" footer={<Link to="/login">Voltar ao login</Link>}>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          Nova senha
          <input type="password" autoComplete="new-password" {...form.register('newPassword')} />
        </label>
        <span className="field-error">{form.formState.errors.newPassword?.message}</span>
        {form.formState.errors.root?.message === undefined ? null : (
          <p className="form-notice">{form.formState.errors.root.message}</p>
        )}
        <button className="primary-button" disabled={form.formState.isSubmitting}>
          Atualizar senha
        </button>
      </form>
    </AuthLayout>
  );
}
