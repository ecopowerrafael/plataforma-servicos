import { IconArrowLeft } from '@tabler/icons-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { accountPath, ACCOUNT_SECTIONS, type AccountSection } from './customer-account.js';
import { environment } from '../../../config/environment.js';

/**
 * Shell full-page da conta do cliente. Herda os tokens do tenant aplicados
 * pela página pública (`--tenant-*`), então a área continua white-label.
 */
export function CustomerAccountLayout({
  slug,
  displayName,
  logoUrl,
  section,
  customer,
  children,
}: {
  slug: string;
  displayName: string;
  logoUrl: string | null;
  section: AccountSection;
  customer: { name: string; email: string | null; photoUrl: string | null; photoUpdatedAt: string | null } | null;
  children: ReactNode;
}) {
  const title = ACCOUNT_SECTIONS.find((item) => item.id === section)?.label ?? 'Minha conta';

  return (
    <div className="customer-account">
      <header className="customer-account-header">
        <Link className="customer-account-back" to={`/public/${slug}`}>
          <IconArrowLeft size={18} aria-hidden="true" />
          Voltar ao estabelecimento
        </Link>
        <div className="customer-account-brand">
          {logoUrl === null ? (
            <strong>{displayName}</strong>
          ) : (
            <img src={`${environment.apiUrl}${logoUrl}`} alt={displayName} />
          )}
        </div>
        {customer === null ? null : (
          <div className="customer-account-identity">
            <span className="customer-account-avatar" aria-hidden="true">
              {customer.photoUrl === null ? (
                customer.name.slice(0, 1)
              ) : (
                <img
                  alt=""
                  src={`${environment.apiUrl}/public/sites/${slug}/customer/photo?v=${encodeURIComponent(
                    customer.photoUpdatedAt ?? '',
                  )}`}
                />
              )}
            </span>
            <span>
              <strong>{customer.name}</strong>
              {customer.email === null ? null : <small>{customer.email}</small>}
            </span>
          </div>
        )}
      </header>

      {customer === null ? (
        <main className="customer-account-body customer-account-body--auth">{children}</main>
      ) : (
        <div className="customer-account-body">
          <nav className="customer-account-nav" aria-label="Seções da conta">
            {ACCOUNT_SECTIONS.map((item) => (
              <Link
                key={item.id}
                to={accountPath(slug, item.id)}
                aria-current={item.id === section ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <main className="customer-account-panel">
            <h1>{title}</h1>
            {children}
          </main>
        </div>
      )}
    </div>
  );
}
