import { type PropsWithChildren, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface AuthLayoutProps extends PropsWithChildren {
  title: string;
  description?: string;
  footer?: ReactNode;
}

export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="brand" to="/">
          Agendei
        </Link>
        <h1>{title}</h1>
        {description === undefined ? null : <p className="lead">{description}</p>}
        {children}
        {footer === undefined ? null : <div className="auth-footer">{footer}</div>}
      </section>
    </main>
  );
}
