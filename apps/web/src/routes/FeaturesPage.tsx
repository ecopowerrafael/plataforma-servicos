import { Link } from 'react-router-dom';

import { featureGroups } from '../marketing/marketing-data.js';
import { MarketingShell } from '../marketing/MarketingShell.js';
import { usePageMetadata } from '../marketing/use-page-metadata.js';

const outcomes = {
  agenda: {
    problem:
      'Horários chegam por vários canais e a equipe perde tempo confirmando disponibilidade.',
    benefit: 'Menos conflito, resposta mais rápida e uma rotina que todos conseguem acompanhar.',
  },
  clientes: {
    problem:
      'Informações importantes ficam dispersas entre conversas, anotações e memória da equipe.',
    benefit: 'Atendimento com contexto e relacionamento consistente a cada retorno.',
  },
  gestao: {
    problem: 'Quanto mais pessoas e unidades, mais difícil fica definir quem vê e faz o quê.',
    benefit:
      'Responsabilidades claras, acessos controlados e visão do todo sem misturar operações.',
  },
  financeiro: {
    problem:
      'Recebimentos, caixa e comissões são conferidos em controles que não conversam entre si.',
    benefit:
      'Menos retrabalho no fechamento e uma leitura financeira ligada aos atendimentos reais.',
  },
  estoque: {
    problem:
      'Entradas, vendas e transferências mudam o saldo, mas nem sempre deixam um histórico confiável.',
    benefit: 'Cada unidade sabe o que tem, o que saiu e quando precisa repor.',
  },
  relacionamento: {
    problem:
      'A rotina ocupa a equipe e clientes deixam de receber lembretes ou convites para voltar.',
    benefit:
      'Comunicação consistente e mais oportunidades de retorno sem depender de tarefas manuais.',
  },
} as const;

export function FeaturesPage() {
  usePageMetadata({
    title: 'Funcionalidades | Plataforma de Serviços',
    description:
      'Conheça as funcionalidades de agenda, clientes, equipe, financeiro, estoque, automações e multiunidade da Plataforma de Serviços.',
    path: '/funcionalidades',
  });

  return (
    <MarketingShell>
      <section className="marketing-page-hero">
        <div className="marketing-container marketing-page-hero-inner">
          <p className="marketing-kicker">A operação completa em um só sistema</p>
          <h1>Cada área resolve um problema. Juntas, elas organizam o negócio.</h1>
          <p>
            Veja como a plataforma conecta atendimento, gestão e relacionamento sem transformar sua
            rotina em uma coleção de módulos isolados.
          </p>
          <Link className="marketing-button" to="/planos">
            Começar grátis
          </Link>
        </div>
      </section>

      <nav className="feature-jump-nav" aria-label="Áreas da plataforma">
        <div className="marketing-container">
          {featureGroups.map((group) => (
            <a href={`#${group.id}`} key={group.id}>
              {group.eyebrow}
            </a>
          ))}
        </div>
      </nav>

      <section className="marketing-section features-detail-section">
        <div className="marketing-container features-detail-list">
          {featureGroups.map((group, index) => (
            <article className="feature-detail" id={group.id} key={group.id}>
              <div className="feature-detail-title">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <p className="marketing-eyebrow">{group.eyebrow}</p>
                  <h2>{group.title}</h2>
                </div>
              </div>
              <div className="feature-detail-story">
                <div>
                  <small>O problema</small>
                  <p>{outcomes[group.id].problem}</p>
                </div>
                <i aria-hidden="true">→</i>
                <div>
                  <small>Como a plataforma resolve</small>
                  <p>{group.description}</p>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <i aria-hidden="true">→</i>
                <div>
                  <small>O benefício</small>
                  <p>{outcomes[group.id].benefit}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="marketing-final-cta">
        <div className="marketing-container marketing-final-cta-inner">
          <div>
            <p className="marketing-eyebrow">Tudo conectado</p>
            <h2>Comece pela agenda. Organize o restante no mesmo lugar.</h2>
          </div>
          <Link className="marketing-button marketing-button--light" to="/planos">
            Ver planos
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
