import { Link } from 'react-router-dom';

import { MarketingShell } from '../marketing/MarketingShell.js';
import { usePageMetadata } from '../marketing/use-page-metadata.js';

export function ProfessionalPage() {
  usePageMetadata({
    title: 'Para profissionais | Plataforma de Serviços',
    description:
      'Veja como a Plataforma de Serviços facilita a rotina da equipe com agenda própria, disponibilidade, atendimentos, histórico e comissões.',
    path: '/profissionais',
  });

  return (
    <MarketingShell>
      <section className="marketing-page-hero professional-page-hero">
        <div className="marketing-container marketing-split marketing-split--balanced">
          <div className="marketing-page-hero-inner">
            <p className="marketing-kicker">Uma rotina melhor para toda a equipe</p>
            <h1>O profissional vê o que precisa para atender bem.</h1>
            <p>
              Agenda própria, disponibilidade, próximos atendimentos e comissões em um acesso
              pensado para quem está na linha de frente.
            </p>
            <Link className="marketing-button" to="/planos">
              Experimentar com minha equipe
            </Link>
          </div>
          <div
            className="professional-agenda-preview"
            aria-label="Exemplo da agenda do profissional"
          >
            <div>
              <span className="preview-logo">P</span>
              <strong>Minha agenda</strong>
              <small>Próximos atendimentos</small>
            </div>
            <article>
              <span>Próximo</span>
              <strong>Atendimento confirmado</strong>
              <small>Informações essenciais disponíveis</small>
            </article>
            <article>
              <span>Depois</span>
              <strong>Horário organizado</strong>
              <small>Serviço e duração registrados</small>
            </article>
            <div className="professional-preview-footer">
              <span>Agenda</span>
              <span>Disponibilidade</span>
              <span>Comissões</span>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section professional-benefits">
        <div className="marketing-container">
          <div className="marketing-section-heading">
            <p className="marketing-eyebrow">Clareza durante o dia</p>
            <h2>Menos perguntas operacionais. Mais foco no atendimento.</h2>
            <p>
              O acesso do profissional respeita as permissões definidas pelo estabelecimento e
              concentra a rotina que pertence a ele.
            </p>
          </div>
          <div className="professional-benefit-grid">
            {[
              ['Agenda própria', 'Acompanhe a visão diária e os próximos atendimentos.'],
              [
                'Informação do atendimento',
                'Consulte serviço, horário e dados permitidos do cliente.',
              ],
              ['Disponibilidade', 'Gerencie jornada, bloqueios, folgas e indisponibilidades.'],
              ['Status da agenda', 'Atualize o andamento do atendimento conforme a permissão.'],
              ['Histórico', 'Mantenha contexto sobre os atendimentos ligados à rotina.'],
              ['Comissões', 'Acompanhe as comissões registradas para os pagamentos realizados.'],
            ].map(([title, description], index) => (
              <article key={title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="professional-rhythm-section">
        <div className="marketing-container marketing-split marketing-split--balanced">
          <div>
            <p className="marketing-eyebrow">Uma jornada sem ruído</p>
            <h2>Antes, durante e depois do atendimento.</h2>
          </div>
          <ol>
            <li>
              <span>Antes</span>
              <p>O profissional consulta agenda, disponibilidade e as informações necessárias.</p>
            </li>
            <li>
              <span>Durante</span>
              <p>A equipe acompanha check-in, status e andamento da operação.</p>
            </li>
            <li>
              <span>Depois</span>
              <p>Pagamento e comissão ficam registrados no mesmo fluxo do atendimento.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="marketing-final-cta">
        <div className="marketing-container marketing-final-cta-inner">
          <div>
            <p className="marketing-eyebrow">Para o dono e para a equipe</p>
            <h2>Uma plataforma que organiza a gestão sem atrapalhar quem atende.</h2>
          </div>
          <Link className="marketing-button marketing-button--light" to="/planos">
            Conhecer os planos
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
