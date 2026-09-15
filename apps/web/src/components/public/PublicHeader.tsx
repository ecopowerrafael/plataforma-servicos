import { environment } from '../../config/environment.js';

function initialsOf(name: string): string {
  return name
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('');
}

/**
 * Header do site público: marca à esquerda, entrada da área do cliente à direita.
 * O avatar é o único ponto de acesso à conta — não há formulário fixo na página.
 */
export function PublicHeader({
  displayName,
  logoUrl,
  logoAlt,
  customerName,
  onOpenAccount,
}: {
  displayName: string;
  logoUrl: string | null;
  logoAlt: string | null;
  customerName: string | null;
  onOpenAccount: () => void;
}) {
  const logged = customerName !== null;
  return (
    <header className="public-header">
      <div className="public-brand">
        {logoUrl === null ? (
          <strong className="public-brand-name">{displayName}</strong>
        ) : (
          <img
            className="public-brand-logo"
            src={`${environment.apiUrl}${logoUrl}`}
            alt={logoAlt ?? displayName}
          />
        )}
      </div>
      <button
        className={`public-account-button${logged ? ' is-logged' : ''}`}
        type="button"
        aria-label={logged ? `Conta de ${customerName}` : 'Entrar ou criar conta'}
        onClick={onOpenAccount}
      >
        {logged ? (
          <span aria-hidden="true">{initialsOf(customerName)}</span>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="8.5" r="3.6" />
            <path d="M4.6 20a7.4 7.4 0 0 1 14.8 0" />
          </svg>
        )}
      </button>
    </header>
  );
}
