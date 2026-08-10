import { Link } from 'react-router-dom';

import {
  audienceSegments,
  featureGroups,
  frequentlyAskedQuestions,
} from '../marketing/marketing-data.js';
import { MarketingShell } from '../marketing/MarketingShell.js';
import { PricingCards, trialMessage } from '../marketing/PricingCards.js';
import { ProductPreview } from '../marketing/ProductPreview.js';
import { usePageMetadata } from '../marketing/use-page-metadata.js';
import { usePublicPlans } from '../marketing/use-public-plans.js';

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="marketing-section-heading">
      <p className="marketing-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

export function CommercialHomePage() {
  const plans = usePublicPlans();
  const planData = plans.data;
  const trial = trialMessage(planData?.plans, planData?.defaultTrialDays);

  usePageMetadata({
    title: 'Agendei - Aplicativo de agendamento',
    description:
      'Sistema de agendamento e gestão para negócios de serviços: agenda online, clientes, equipe, financeiro, estoque, automações e multiunidade.',
    path: '/',
  });

  return (
    <MarketingShell>
      <section className="marketing-hero">
        <div className="marketing-container marketing-hero-grid">
          <div className="marketing-hero-copy">
            <p className="marketing-kicker">
              <span aria-hidden="true" /> Gestão para negócios com hora marcada
            </p>
            <h1>Agendamentos, clientes, equipe e financeiro. Tudo no mesmo lugar.</h1>
            <p className="marketing-hero-lead">
              Uma plataforma completa para negócios de serviços organizarem a operação, receberem
              agendamentos online e crescerem sem depender de planilhas e controles espalhados.
            </p>
            <div className="marketing-actions">
              <Link className="marketing-button" to="/planos">
                Começar grátis
              </Link>
              <a className="marketing-button marketing-button--secondary" href="#plataforma">
                Conhecer a plataforma
              </a>
            </div>
            <div className="marketing-trial-note">
              <strong>{trial}</strong>
              <span>Condições e limites exibidos conforme o plano configurado.</span>
            </div>
          </div>
          <div className="marketing-hero-aside" aria-label="Resumo da operação conectada">
            <p className="marketing-eyebrow">Sua operação, conectada</p>
            <div className="hero-orbit">
              <span className="hero-orbit-center">Seu negócio</span>
              <span>Agenda</span>
              <span>Clientes</span>
              <span>Equipe</span>
              <span>Financeiro</span>
              <span>Estoque</span>
            </div>
            <p>Da reserva ao fechamento, cada etapa usa os mesmos dados.</p>
          </div>
        </div>
      </section>

      <section className="marketing-product-showcase" id="plataforma">
        <div className="marketing-container">
          <SectionHeading
            eyebrow="Produto real, operação real"
            title="Uma visão clara para quem administra e para quem agenda"
            description="A equipe acompanha a rotina em um único ambiente. O cliente encontra um fluxo direto para escolher serviço, profissional e horário."
          />
          <ProductPreview />
          <div className="product-proof-strip" aria-label="Áreas integradas da plataforma">
            <span>Agenda em tempo real</span>
            <span>Atendimento e check-in</span>
            <span>Pagamentos e caixa</span>
            <span>Estoque por unidade</span>
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-value-section">
        <div className="marketing-container">
          <SectionHeading
            eyebrow="Menos tarefas soltas"
            title="Menos tempo administrando. Mais tempo atendendo."
            description="Troque controles fragmentados por processos que seguem o atendimento do começo ao fim."
          />
          <div className="value-comparison">
            {[
              ['Agenda espalhada em conversas', 'Agenda organizada em um só lugar'],
              ['Cliente esperando resposta', 'Agendamento online disponível'],
              ['Comissão calculada à mão', 'Comissões ligadas aos pagamentos'],
              ['Estoque em planilha', 'Movimentações e saldo controlados'],
              ['Financeiro fragmentado', 'Caixa, pagamentos e relatórios reunidos'],
            ].map(([before, after]) => (
              <article key={before}>
                <span>{before}</span>
                <i aria-hidden="true">→</i>
                <strong>{after}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-ecosystem">
        <div className="marketing-container">
          <SectionHeading
            eyebrow="Muito além da agenda"
            title="Uma plataforma para a operação inteira"
            description="As áreas trabalham juntas para que a informação não precise ser digitada, conferida ou reconciliada em vários lugares."
          />
          <div className="feature-groups">
            {featureGroups.map((group, index) => (
              <article className="feature-group" id={group.id} key={group.id}>
                <span className="feature-group-number">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <p className="marketing-eyebrow">{group.eyebrow}</p>
                  <h3>{group.title}</h3>
                  <p>{group.description}</p>
                </div>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="marketing-center-action">
            <Link className="marketing-text-link" to="/funcionalidades">
              Explorar todas as funcionalidades <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="marketing-section marketing-audience" id="para-quem">
        <div className="marketing-container marketing-split">
          <div>
            <p className="marketing-eyebrow">Feita para multisserviços</p>
            <h2>
              Se seu negócio trabalha com hora marcada, a plataforma se adapta à sua operação.
            </h2>
            <p>
              Organize agendas simples ou rotinas com várias pessoas, serviços e unidades sem
              limitar o produto a um único segmento.
            </p>
          </div>
          <div className="audience-list">
            {audienceSegments.map((segment, index) => (
              <span key={segment}>
                <i>{String(index + 1).padStart(2, '0')}</i>
                {segment}
              </span>
            ))}
            <span className="audience-more">
              <i>+</i> Outros negócios de serviços
            </span>
          </div>
        </div>
      </section>

      <section className="marketing-section client-experience-section">
        <div className="marketing-container">
          <SectionHeading
            eyebrow="Experiência do cliente"
            title="Agendar fica simples do primeiro clique à confirmação"
            description="O cliente vê as opções disponíveis, conclui o agendamento e acompanha seus próximos horários em uma área própria."
          />
          <ol className="client-journey">
            {[
              'Acessa a página do estabelecimento',
              'Escolhe o serviço',
              'Seleciona o profissional, quando aplicável',
              'Encontra um horário disponível',
              'Confirma o agendamento',
              'Recebe a confirmação e acompanha seus horários',
            ].map((step, index) => (
              <li key={step}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{step}</strong>
              </li>
            ))}
          </ol>
          <p className="client-journey-note">
            Quando configurado pelo estabelecimento, o fluxo também pode oferecer sinal ou pagamento
            online.
          </p>
        </div>
      </section>

      <section className="marketing-section multiunit-section">
        <div className="marketing-container marketing-split marketing-split--balanced">
          <div>
            <p className="marketing-eyebrow">Gestão multiunidade</p>
            <h2>Uma unidade ou uma rede inteira.</h2>
            <p>
              Separe a rotina de cada local sem perder a visão do todo. Profissionais, permissões,
              agenda e estoque respeitam o escopo de cada unidade.
            </p>
            <ul className="marketing-check-list">
              <li>Equipes e acessos por unidade</li>
              <li>Estoque e operação separados</li>
              <li>Comparativo e visão consolidada</li>
            </ul>
          </div>
          <div className="unit-visual" aria-label="Visão de três unidades conectadas">
            <div className="unit-hub">Gestão central</div>
            <div className="unit-branches">
              <span>Unidade A</span>
              <span>Unidade B</span>
              <span>Unidade C</span>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-section automation-section">
        <div className="marketing-container marketing-split marketing-split--balanced">
          <div className="automation-flow" aria-hidden="true">
            <span>Agendamento confirmado</span>
            <i />
            <span>Lembrete programado</span>
            <i />
            <span>Pós-atendimento</span>
            <i />
            <span>Recuperação de cliente</span>
          </div>
          <div>
            <p className="marketing-eyebrow">Automações</p>
            <h2>Seu sistema continua trabalhando enquanto você atende.</h2>
            <p>
              Lembretes, notificações e recuperação de clientes seguem gatilhos reais da operação,
              com templates e histórico de entrega.
            </p>
            <Link className="marketing-text-link" to="/funcionalidades#relacionamento">
              Ver automações e comunicação <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="marketing-section finance-section">
        <div className="marketing-container">
          <SectionHeading
            eyebrow="Financeiro ligado à operação"
            title="Saiba o que entrou, o que falta receber e como fechar o período."
            description="Pagamentos, sinal, caixa, recibos, comissões, inadimplência e relatórios usam os dados registrados nos atendimentos."
          />
          <div className="finance-flow">
            <article>
              <span>01</span>
              <strong>Atendimento</strong>
              <p>Serviço, cliente e profissional vinculados.</p>
            </article>
            <article>
              <span>02</span>
              <strong>Pagamento</strong>
              <p>Forma, sinal e recebimento registrados.</p>
            </article>
            <article>
              <span>03</span>
              <strong>Caixa e comissão</strong>
              <p>Movimentações ligadas ao que realmente aconteceu.</p>
            </article>
            <article>
              <span>04</span>
              <strong>Fechamento e relatório</strong>
              <p>Visão por período, profissional e unidade.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="marketing-section security-section">
        <div className="marketing-container security-inner">
          <div>
            <p className="marketing-eyebrow">Segurança com responsabilidade</p>
            <h2>Dados e acessos separados por estabelecimento.</h2>
          </div>
          <p>
            A plataforma aplica isolamento entre empresas, permissões por função, auditoria de
            alterações e proteção de credenciais. A infraestrutura também possui rotinas de backup e
            restauração para a base de dados.
          </p>
        </div>
      </section>

      <section className="marketing-section pricing-preview" id="planos">
        <div className="marketing-container">
          <SectionHeading
            eyebrow="Planos que acompanham sua operação"
            title="Escolha pelos limites e recursos que seu negócio precisa"
            description="Os valores abaixo vêm diretamente da configuração comercial da plataforma. Nenhuma regra é duplicada nesta página."
          />
          {plans.isError ? (
            <div className="pricing-empty">
              <h3>Não foi possível carregar os planos agora.</h3>
              <p>Tente novamente em instantes ou acesse a página completa de planos.</p>
            </div>
          ) : plans.isPending ? (
            <div className="pricing-loading" aria-label="Carregando planos">
              <span />
              <span />
              <span />
            </div>
          ) : (
            <PricingCards plans={plans.data.plans} compact />
          )}
          <div className="marketing-center-action">
            <Link className="marketing-button marketing-button--secondary" to="/planos">
              Comparar planos
            </Link>
          </div>
        </div>
      </section>

      <section className="marketing-section faq-section" id="faq">
        <div className="marketing-container marketing-split">
          <div>
            <p className="marketing-eyebrow">Perguntas frequentes</p>
            <h2>O essencial para decidir com clareza.</h2>
            <p>Respostas diretas sobre como a plataforma funciona hoje.</p>
          </div>
          <div className="faq-list">
            {frequentlyAskedQuestions.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="marketing-final-cta">
        <div className="marketing-container marketing-final-cta-inner">
          <div>
            <p className="marketing-eyebrow">Próximo passo</p>
            <h2>Seu negócio já tem clientes. Dê a ele uma operação à altura.</h2>
            <p>
              Centralize agenda, equipe, clientes e financeiro em uma plataforma criada para
              negócios de serviços.
            </p>
          </div>
          <div>
            <Link className="marketing-button marketing-button--light" to="/planos">
              Começar grátis
            </Link>
            <span>{trial}</span>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
