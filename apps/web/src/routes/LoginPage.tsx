import { zodResolver } from '@hookform/resolvers/zod';
import {
  GoogleAuthRequestSchema,
  GoogleAuthResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  type LoginRequest,
} from '@plataforma/shared';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { AuthLayout } from '../components/AuthLayout.js';
import { loadGoogleIdentityServices } from '../lib/google-identity.js';
import { HttpError, httpClient } from '../lib/http.js';
import { clearSelectedTenant, selectTenant } from '../lib/tenant-selection.js';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: { client_id: string; callback: (response: unknown) => void }): void;
          renderButton(element: HTMLElement | null, options: Record<string, unknown>): void;
        };
      };
    };
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const form = useForm<LoginRequest>({ resolver: zodResolver(LoginRequestSchema) });
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleInitializedRef = useRef(false);

  const handleLoginSuccess = async (result: unknown) => {
    clearSelectedTenant();
    const continuation = params.get('plan') === null || params.get('billing') === null
      ? ''
      : `?plan=${encodeURIComponent(params.get('plan') ?? '')}&billing=${encodeURIComponent(params.get('billing') ?? '')}`;
    if (result && typeof result === 'object' && 'tenants' in result) {
      const response = result as { tenants: Array<{ tenant: { publicId: string; slug: string }; membership: { roleCode: string } }> };
      if (response.tenants.length === 1) {
        const availableTenant = response.tenants[0];
        if (availableTenant === undefined)
          throw new Error('O tenant disponível não foi encontrado.');
        selectTenant(availableTenant.tenant.publicId);
        await navigate(
          availableTenant.membership.roleCode === 'PROFESSIONAL'
            ? `/public/${availableTenant.tenant.slug}/profissional`
            : `/app${continuation}`,
        );
      } else {
        await navigate(`/select-tenant${continuation}`);
      }
    }
  };

  const submit = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    try {
      const result = await httpClient.request('/auth/login', {
        method: 'POST',
        body: values,
        schema: LoginResponseSchema,
      });
      await handleLoginSuccess(result);
    } catch (error) {
      form.setError('root', {
        message: error instanceof HttpError ? error.message : 'Não foi possível entrar.',
      });
    }
  });

  useEffect(() => {
    if (googleInitializedRef.current) return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
    if (!clientId) {
      if (import.meta.env.DEV) {
        console.warn('[Google Auth] VITE_GOOGLE_CLIENT_ID not configured');
      }
      return;
    }

    googleInitializedRef.current = true;

    loadGoogleIdentityServices()
      .then(() => {
        if (!window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: { credential?: string } | unknown) => {
            form.clearErrors('root');
            if (response && typeof response === 'object' && 'credential' in response && response.credential) {
              try {
                const validated = GoogleAuthRequestSchema.parse({ credential: response.credential });
                const result = await httpClient.request('/auth/google', {
                  method: 'POST',
                  body: validated,
                  schema: GoogleAuthResponseSchema,
                });
                await handleLoginSuccess(result);
              } catch (error) {
                form.setError('root', {
                  message: error instanceof HttpError ? error.message : 'Erro ao autenticar com Google.',
                });
              }
            }
          },
        });

        if (googleButtonRef.current) {
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: 'outline',
            size: 'large',
            width: '100%',
            text: 'continue_with',
          });
        }
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.error('[Google Auth] Failed to load Google Identity Services:', error);
        }
      });
  }, [form]);

  return (
    <AuthLayout
      title="Acesse sua conta"
      description="Use o e-mail e a senha vinculados ao seu estabelecimento."
      footer={<><Link to="/forgot-password">Esqueci minha senha</Link><Link to={`/cadastro${params.toString() === '' ? '' : `?${params.toString()}`}`}>Ainda não tem uma conta? Criar conta</Link><div style={{ marginTop: '16px', fontSize: '12px', opacity: 0.7 }}><Link to="/privacidade" style={{ marginRight: '16px' }}>Privacidade</Link><Link to="/termos">Termos</Link></div></>}
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
        <div ref={googleButtonRef} style={{ marginTop: '16px' }} />
      </form>
    </AuthLayout>
  );
}
