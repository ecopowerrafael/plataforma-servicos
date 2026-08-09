import { type PropsWithChildren, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

function Brand() {
  return (
    <Link className="marketing-brand" to="/" aria-label="Plataforma de Serviços — início">
      <span className="marketing-brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>
        Plataforma
        <small>de Serviços</small>
      </span>
    </Link>
  );
}

function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  return (
    <header className="marketing-header">
      <div className="marketing-container marketing-header-inner">
        <Brand />
        <button
          className="marketing-menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="marketing-navigation"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => {
            setOpen((current) => !current);
          }}
        >
          <span />
          <span />
          <span />
        </button>
        <nav
          id="marketing-navigation"
          className={open ? 'marketing-nav marketing-nav--open' : 'marketing-nav'}
          aria-label="Navegação principal"
        >
          <NavLink to="/">Início</NavLink>
          <NavLink to="/funcionalidades">Funcionalidades</NavLink>
          <Link to="/#para-quem">Para quem é</Link>
          <NavLink to="/planos">Planos</NavLink>
          <NavLink to="/profissionais">Profissionais</NavLink>
          <NavLink className="marketing-login-link" to="/login">
            Entrar
          </NavLink>
          <Link className="marketing-button marketing-button--small" to="/planos">
            Começar grátis
          </Link>
        </nav>
      </div>
    </header>
  );
}

function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-container marketing-footer-grid">
        <div className="marketing-footer-brand">
          <Brand />
          <p>
            Agenda, clientes, equipe e financeiro organizados para negócios que trabalham com
            serviços e hora marcada.
          </p>
        </div>
        <div>
          <strong>Produto</strong>
          <Link to="/funcionalidades">Funcionalidades</Link>
          <Link to="/planos">Planos</Link>
          <Link to="/profissionais">Para profissionais</Link>
        </div>
        <div>
          <strong>Soluções</strong>
          <Link to="/funcionalidades#agenda">Agenda</Link>
          <Link to="/funcionalidades#financeiro">Financeiro</Link>
          <Link to="/funcionalidades#clientes">Clientes</Link>
          <Link to="/funcionalidades#gestao">Multiunidade</Link>
        </div>
        <div>
          <strong>Empresa</strong>
          <span>Termos</span>
          <span>Privacidade</span>
          <span>Contato</span>
        </div>
        <div>
          <strong>Acesso</strong>
          <Link to="/login">Entrar</Link>
        </div>
      </div>
      <div className="marketing-container marketing-footer-bottom">
        <span>© {new Date().getFullYear()} Plataforma de Serviços</span>
        <span>Feito para operações de serviços.</span>
      </div>
    </footer>
  );
}

export function MarketingShell({ children }: PropsWithChildren) {
  const location = useLocation();

  useEffect(() => {
    if (location.hash === '') {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    window.requestAnimationFrame(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    });
  }, [location.hash, location.pathname]);

  return (
    <div className="marketing-site">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <MarketingHeader />
      <main id="main-content">{children}</main>
      <MarketingFooter />
    </div>
  );
}
