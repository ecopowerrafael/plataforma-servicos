import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { message, type useCustomerAccount } from './customer-account.js';

/**
 * Segurança da conta: foto, link de troca de senha e saída. Mesmas rotas de
 * antes (`customer/photo`, `customer/forgot-password`, `customer/logout`).
 */
export function CustomerAccountSecurity({
  slug,
  account,
}: {
  slug: string;
  account: ReturnType<typeof useCustomerAccount>;
}) {
  const navigate = useNavigate();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);
  const customer = account.customer;

  if (customer === null) return null;

  return (
    <div className="customer-account-security">
      <section className="customer-card" aria-label="Foto do perfil">
        <header>
          <strong>Foto do perfil</strong>
        </header>
        <div className="customer-photo-actions">
          <label className="public-account-photo-button">
            {account.uploadPhoto.isPending ? 'Enviando…' : 'Alterar foto'}
            <input
              accept="image/jpeg,image/png,image/webp"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file === undefined) return;
                if (file.size > 5 * 1024 * 1024) {
                  setPhotoError('Escolha uma imagem de até 5 MB.');
                  return;
                }
                setPhotoError(null);
                account.uploadPhoto.mutate(file);
              }}
            />
          </label>
          {customer.photoUrl === null ? null : (
            <button
              className="public-link-button"
              type="button"
              disabled={account.removePhoto.isPending}
              onClick={() => {
                account.removePhoto.mutate();
              }}
            >
              Remover foto
            </button>
          )}
        </div>
        {photoError === null ? null : (
          <p className="public-form-error" role="alert">
            {photoError}
          </p>
        )}
        {message(account.uploadPhoto.error ?? account.removePhoto.error) === null ? null : (
          <p className="public-form-error" role="alert">
            {message(account.uploadPhoto.error ?? account.removePhoto.error)}
          </p>
        )}
      </section>

      <section className="customer-card" aria-label="Dados de acesso">
        <header>
          <strong>Dados de acesso</strong>
        </header>
        <dl className="public-account-facts">
          <div>
            <dt>E-mail da conta</dt>
            <dd>{customer.email ?? 'Não informado'}</dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{customer.phone ?? 'Não informado'}</dd>
          </div>
        </dl>
        <p className="public-sheet-hint">
          Para trocar a senha, peça o link seguro: enviamos as instruções para o e-mail da conta.
        </p>
        <button
          className="public-primary-button"
          type="button"
          disabled={account.forgot.isPending || customer.email === null}
          onClick={() => {
            if (customer.email === null) return;
            account.forgot.mutate(customer.email, {
              onSuccess: () => {
                setForgotSent(true);
              },
            });
          }}
        >
          {account.forgot.isPending ? 'Enviando…' : 'Receber link para alterar a senha'}
        </button>
        {forgotSent ? (
          <p className="public-sheet-hint" role="status">
            Se existir uma conta associada a este e-mail, enviaremos as instruções para redefinir
            sua senha.
          </p>
        ) : null}
      </section>

      <section className="customer-card" aria-label="Sessão">
        <header>
          <strong>Sessão</strong>
        </header>
        <button
          className="public-link-button is-danger"
          type="button"
          disabled={account.logout.isPending}
          onClick={() => {
            account.logout.mutate(undefined, {
              onSuccess: () => {
                void navigate(`/public/${slug}`);
              },
            });
          }}
        >
          {account.logout.isPending ? 'Saindo…' : 'Sair da conta'}
        </button>
      </section>
    </div>
  );
}
