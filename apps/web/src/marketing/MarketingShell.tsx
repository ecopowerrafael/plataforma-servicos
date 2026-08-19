import { type PropsWithChildren, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { z } from 'zod';

import { FindServiceModal } from './FindServiceModal.js';

import { httpClient } from '../lib/http.js';

const CommercialContactSchema = z.object({ whatsapp: z.string().nullable() });

function CommercialWhatsAppButton() {
  const contact = useQuery({
    queryKey: ['public', 'commercial-contact'],
    queryFn: () => httpClient.request('/public/commercial-contact', { schema: CommercialContactSchema }),
    staleTime: 5 * 60 * 1000,
  });
  const phone = contact.data?.whatsapp?.replace(/\D/gu, '') ?? '';
  if (phone === '') return null;
  return <a className="commercial-whatsapp-button" href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" aria-label="Falar com o Agendei pelo WhatsApp"><span aria-hidden="true">◔</span><b>Fale conosco</b></a>;
}

function Brand() {
  return (
    <Link className="marketing-brand" to="/" aria-label="Agendei — início">
      <img
        className="marketing-brand-logo"
        src="/brand/logo-agendei.png"
        alt="Agendei"
        width={1536}
        height={1024}
      />
    </Link>
  );
}

function MarketingHeader() {
  const [open, setOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const location = useLocation();
  const currentPath = `${location.pathname}${location.hash}`;
  const [lastPath, setLastPath] = useState(currentPath);

  // Fecha o menu mobile ao navegar, ajustando o estado durante a renderização
  // (evita o cascading render de um setState dentro de useEffect).
  if (currentPath !== lastPath) {
    setLastPath(currentPath);
    setOpen(false);
  }

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
          <button className="marketing-nav-find" type="button" onClick={() => setFindOpen(true)}>Encontre</button>
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
      {findOpen ? <FindServiceModal onClose={() => setFindOpen(false)} /> : null}
    </header>
  );
}

function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-container marketing-footer-grid">
        <div className="marketing-footer-brand">
          <Link className="marketing-footer-logo" to="/" aria-label="Agendei — início">
            <img src="/imagens/logo rodape.png" alt="Agendei" />
          </Link>
          <p>
            Agenda, clientes, equipe e financeiro organizados para negócios que trabalham com
            serviços e hora marcada.
          </p>
          <a
            className="marketing-instagram-link"
            href="https://www.instagram.com/app.agendei"
            target="_blank"
            rel="noreferrer"
            aria-label="Siga o Agendei no Instagram"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.4" cy="6.7" r="1" /></svg>
            <span>Instagram</span>
          </a>
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
          <Link to="/termos">Termos</Link>
          <Link to="/privacidade">Privacidade</Link>
          <span>Contato</span>
        </div>
        <div>
          <strong>Acesso</strong>
          <Link to="/login">Entrar</Link>
        </div>
      </div>
      <div className="marketing-container marketing-footer-bottom">
        <span>© {new Date().getFullYear()} Agendei</span>
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
      <CommercialWhatsAppButton />
      <MarketingFooter />
    </div>
  );
}
