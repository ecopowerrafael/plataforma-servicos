import { zodResolver } from '@hookform/resolvers/zod';
import { ForgotPasswordRequestSchema, ForgotPasswordResponseSchema } from '@plataforma/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { type z } from 'zod';

import { AuthLayout } from '../components/AuthLayout.js';
import { HttpError, httpClient } from '../lib/http.js';

type FormValues = z.infer<typeof ForgotPasswordRequestSchema>;

export function ForgotPasswordPage() {
  const [message, setMessage] = useState<string>();
  const form = useForm<FormValues>({ resolver: zodResolver(ForgotPasswordRequestSchema) });
  const submit = form.handleSubmit(async (values) => {
    try {
      const result = await httpClient.request('/auth/password/forgot', {
        method: 'POST',
        body: values,
        schema: ForgotPasswordResponseSchema,
      });
      setMessage(result.message);
    } catch (error) {
      form.setError('root', {
        message:
          error instanceof HttpError ? error.message : 'Não foi possível concluir a solicitação.',
      });
    }
  });
  return (
    <AuthLayout title="Recuperar senha" footer={<Link to="/login">Voltar ao login</Link>}>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label>
          E-mail
          <input type="email" {...form.register('email')} />
        </label>
        {message === undefined ? null : <p className="success-message">{message}</p>}
        {form.formState.errors.root?.message === undefined ? null : (
          <p className="form-error">{form.formState.errors.root.message}</p>
        )}
        <button className="primary-button" disabled={form.formState.isSubmitting}>
          Enviar instruções
        </button>
      </form>
    </AuthLayout>
  );
}
