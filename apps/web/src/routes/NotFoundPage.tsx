import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <main className="page-shell">
      <section className="status-panel">
        <p className="eyebrow">Erro 404</p>
        <h1>Página não encontrada.</h1>
        <Link className="text-link" to="/">
          Voltar ao início
        </Link>
      </section>
    </main>
  );
}
