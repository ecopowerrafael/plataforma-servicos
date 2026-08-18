import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

import { frequentlyAskedQuestions } from '../marketing/marketing-data.js';
import { MarketingShell } from '../marketing/MarketingShell.js';
import { PricingCards, trialMessage } from '../marketing/PricingCards.js';
import { usePageMetadata } from '../marketing/use-page-metadata.js';
import { usePublicPlans } from '../marketing/use-public-plans.js';

const productImages = {
  chatbot: '/imagens/chat bot ia pelo wpp.png',
  bookingFlow: '/imagens/Fluxo de agendamento.png',
  cancellation: '/imagens/Fluxo de cancelamento msg em massa.png',
  professional: '/imagens/app do profissional.png',
  whiteLabel: '/imagens/white label.png',
};

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="saas-section-heading"><p>{eyebrow}</p><h2>{title}</h2><span>{description}</span></div>;
}

function ProductImage({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return <div className={`saas-product-image ${className}`}><img src={src} alt={alt} loading="lazy" /></div>;
}

export function CommercialHomePage() {
  const plans = usePublicPlans();
  const planData = plans.data;
  const trial = trialMessage(planData?.plans, planData?.defaultTrialDays);

  usePageMetadata({ title: 'Agendei - Agendamento, WhatsApp com IA e gestão', description: 'Agendamento online, atendimento com IA no WhatsApp, CRM, aplicativo do profissional e gestão financeira em um só lugar.', path: '/' });

  return <MarketingShell>
    <section className="saas-hero">
      <div className="marketing-container saas-hero__grid">
        <div className="saas-hero__copy"><p className="saas-kicker"><i /> A plataforma para negócios com hora marcada</p><h1>Seu negócio trabalhando mesmo quando você está ocupado.</h1><p>Agendamento online, atendimento com IA no WhatsApp, CRM, app do profissional e gestão em um só lugar.</p><div className="marketing-actions"><Link className="marketing-button" to="/planos">Teste grátis por 7 dias</Link><a className="marketing-button marketing-button--secondary" href="#ia-whatsapp">Ver demonstração</a></div><ul className="saas-hero__proof"><li>Sem taxa de implantação</li><li>White label</li><li>A partir de R$ 59,90/mês</li></ul></div>
        <div className="saas-hero__visual" aria-label="Atendimento automatizado pelo WhatsApp"><div className="saas-hero__glow" /><div className="saas-phone"><div className="saas-phone__bar"><span /><b>Agendei IA</b><em>online</em></div><div className="saas-phone__chat"><span className="saas-chat saas-chat--incoming">Olá! Gostaria de agendar um corte.</span><span className="saas-chat saas-chat--outgoing">Claro! Encontrei horários para você.</span><span className="saas-chat saas-chat--incoming">Pode ser amanhã às 15h?</span><span className="saas-chat saas-chat--outgoing">Perfeito. Seu horário está confirmado ✓</span></div></div><article className="saas-floating-card saas-floating-card--top"><b>+ Novo agendamento</b><span>Hoje, 15:00</span></article><article className="saas-floating-card saas-floating-card--right"><i>✓</i><div><b>Cliente confirmou</b><span>Lembrete enviado</span></div></article><article className="saas-floating-card saas-floating-card--bottom"><b>Horário preenchido</b><span>Agenda atualizada</span></article></div>
      </div>
    </section>

    <section className="saas-pain"><div className="marketing-container saas-pain__grid"><div><p className="saas-kicker"><i /> A rotina não espera</p><h2>Enquanto você atende um cliente, outros estão tentando falar com você.</h2></div><div className="saas-pain__messages">{['Tem horário hoje?', 'Quanto custa?', 'Consigo remarcar?', 'Oi, alguém me responde?'].map((message, index) => <span key={message} style={{ '--delay': `${index * 0.6}s` } as CSSProperties}>{message}</span>)}</div><ul><li>Pedidos de horário fora do expediente</li><li>Perguntas repetitivas e clientes sem retorno</li><li>Reagendamentos e cancelamentos perdidos na conversa</li></ul></div></section>

    <section className="saas-section" id="ia-whatsapp"><div className="marketing-container saas-media-layout"><ProductImage src={productImages.chatbot} alt="Chatbot com IA do Agendei no WhatsApp" className="saas-product-image--portrait" /><div className="saas-copy-block"><p className="saas-kicker"><i /> IA no WhatsApp</p><h2>Sua recepção trabalhando 24 horas por dia.</h2><p>A IA responde clientes, consulta disponibilidade real, agenda e confirma sem interromper o seu atendimento.</p><ul className="saas-check-list"><li>Responde automaticamente</li><li>Consulta horários reais</li><li>Agenda e confirma</li><li>Ajuda a reagendar</li><li>Reduz o atendimento manual</li></ul></div></div></section>

    <section className="saas-section saas-section--soft" id="como-funciona"><div className="marketing-container"><SectionHeading eyebrow="Uma jornada conectada" title="Do primeiro “oi” à agenda atualizada." description="O atendimento segue um fluxo simples para o cliente e completo para sua operação." /><ol className="saas-flow">{['Cliente chama', 'IA atende', 'Consulta disponibilidade', 'Cliente agenda', 'Sistema confirma', 'Agenda atualiza'].map((step, index) => <li key={step}><span>{index + 1}</span><strong>{step}</strong></li>)}</ol><ProductImage src={productImages.bookingFlow} alt="Fluxo real de agendamento do Agendei" /></div></section>

    <section className="saas-section"><div className="marketing-container saas-operation"><div className="saas-copy-block"><p className="saas-kicker"><i /> Operação de verdade</p><h2>Toda a sua operação em uma agenda visual.</h2><p>Mais do que conversas: acompanhe atendimentos, confirmações, reagendamentos, faltas e pagamentos da rotina real.</p></div><div className="saas-metrics"><article><span>Atendimentos do dia</span><b>18</b><em>+ 4 confirmados</em></article><article><span>Horários livres</span><b>06</b><em>Agenda atualizada</em></article><article><span>Faturamento previsto</span><b>R$ 1.480</b><em>Hoje</em></article><article><span>Confirmações</span><b>94%</b><em>Automáticas</em></article></div></div></section>

    <section className="saas-section saas-section--dark"><div className="marketing-container saas-media-layout saas-media-layout--reverse"><div className="saas-copy-block"><p className="saas-kicker"><i /> Mais oportunidades</p><h2>Transforme cancelamentos em novas oportunidades.</h2><p>Quando uma vaga abre, o sistema ajuda você a agir rápido para que sua agenda não fique vazia.</p><ol className="saas-mini-steps"><li>Cliente cancela</li><li>Sistema identifica a vaga</li><li>Clientes recebem um aviso</li><li>O horário pode ser preenchido novamente</li></ol></div><ProductImage src={productImages.cancellation} alt="Fluxo de recuperação após cancelamento" /></div></section>

    <section className="saas-section" id="plataforma"><div className="marketing-container"><SectionHeading eyebrow="Um ecossistema só seu" title="Muito mais que uma agenda." description="O Agendei reúne as ferramentas que fazem sua operação acontecer — sem espalhar informação em vários sistemas." /><div className="saas-feature-grid">{['Agenda', 'CRM', 'Financeiro', 'Fluxo de caixa', 'Comissões', 'Fidelidade / Clube VIP', 'Notificações', 'WhatsApp com IA'].map((feature, index) => <article key={feature}><i>{String(index + 1).padStart(2, '0')}</i><strong>{feature}</strong><span>{['Rotina organizada em tempo real', 'Histórico para atender melhor', 'Recebimentos ligados ao atendimento', 'Visão clara do que entra e sai', 'Cálculo conectado à operação', 'Clientes voltando com frequência', 'Lembretes que não se perdem', 'Atendimento que continua ativo'][index]}</span></article>)}</div></div></section>

    <section className="saas-section saas-section--soft"><div className="marketing-container saas-media-layout"><ProductImage src={productImages.professional} alt="Aplicativo do profissional Agendei" /><div className="saas-copy-block"><p className="saas-kicker"><i /> App do profissional</p><h2>Sua equipe também tem o próprio app.</h2><p>Cada profissional acompanha o que importa para o seu dia, com autonomia e o mesmo padrão da sua operação.</p><ul className="saas-check-list"><li>Agenda pessoal</li><li>Comissões</li><li>Perfil e ações rápidas</li><li>Registro de pagamento</li><li>Controle do próprio atendimento</li></ul></div></div></section>

    <section className="saas-section"><div className="marketing-container saas-media-layout saas-media-layout--reverse"><div className="saas-copy-block"><p className="saas-kicker"><i /> White label</p><h2>Seu negócio. Sua marca. Seu aplicativo.</h2><p>Ofereça uma experiência própria com sua identidade, logo, cores e PWA com cara de app.</p><div className="saas-brand-points"><span>Logo</span><span>Cores</span><span>Identidade</span><span>Experiência própria</span></div></div><ProductImage src={productImages.whiteLabel} alt="Exemplo de personalização white label" /></div></section>

    <section className="saas-section saas-niches" id="para-quem"><div className="marketing-container"><SectionHeading eyebrow="Feito para serviços" title="Se existe horário marcado, existe Agendei." description="Uma plataforma versátil para operações que dependem de uma agenda bem cuidada." /><div>{['Barbearia', 'Salão', 'Estética', 'Dentista', 'Massoterapia', 'Tatuagem', 'Manicure', 'Personal'].map((niche) => <span key={niche}>{niche}</span>)}</div></div></section>

    <section className="saas-pricing" id="planos"><div className="marketing-container"><div className="saas-pricing__lead"><p className="saas-kicker"><i /> Comece agora</p><h2>Tudo o que sua operação precisa para crescer.</h2><p>Aplicativo de agendamento, CRM, chatbot WhatsApp, app do profissional, gestão financeira, fluxo de caixa e lembretes automáticos.</p><strong>A partir de R$ 59,90 por mês</strong></div>{plans.isError ? <div className="pricing-empty"><h3>Não foi possível carregar os planos agora.</h3><p>Tente novamente em instantes ou acesse a página completa de planos.</p></div> : plans.isPending ? <div className="pricing-loading" aria-label="Carregando planos"><span /><span /><span /></div> : <PricingCards plans={plans.data.plans} compact />}<div className="saas-pricing__actions"><Link className="marketing-button marketing-button--light" to="/planos">Começar agora</Link><Link className="marketing-button marketing-button--secondary" to="/planos">Testar grátis</Link><a className="saas-text-cta" href="#faq">Falar com atendimento →</a></div><ul><li>Sem complicação</li><li>Setup rápido</li><li>White label</li><li>Suporte</li></ul></div></section>

    <section className="saas-section saas-faq" id="faq"><div className="marketing-container saas-faq__grid"><div><p className="saas-kicker"><i /> Perguntas frequentes</p><h2>O essencial para decidir com clareza.</h2><p>Respostas diretas sobre como a plataforma funciona hoje.</p></div><div>{frequentlyAskedQuestions.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div></div></section>
    <section className="saas-final-cta"><div className="marketing-container"><p className="saas-kicker"><i /> Próximo passo</p><h2>Seu negócio já tem clientes. Dê a ele uma operação à altura.</h2><p>{trial}</p><Link className="marketing-button marketing-button--light" to="/planos">Começar teste grátis</Link></div></section>
  </MarketingShell>;
}
