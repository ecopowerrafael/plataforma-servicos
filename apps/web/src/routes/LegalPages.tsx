import { MarketingShell } from '../marketing/MarketingShell.js';
import { usePageMetadata } from '../marketing/use-page-metadata.js';

const controller = 'Rafael Augusto Ferreira da Silva';
const privacyEmail = 'suporte@agendei.site';
const effectiveDate = '19 de agosto de 2026';

export function PrivacyPage() {
  usePageMetadata({
    title: 'Política de Privacidade | Agendei',
    description: 'Como o Agendei trata dados pessoais e como exercer seus direitos.',
    path: '/privacidade',
  });

  return (
    <MarketingShell>
      <section className="marketing-section legal-page">
        <article className="marketing-container legal-page__content">
          <p className="marketing-eyebrow">PRIVACIDADE</p>
          <h1>Política de Privacidade</h1>
          <p>Última atualização: {effectiveDate}.</p>

          <h2>Quem trata seus dados</h2>
          <p>
            Para os dados relacionados ao site comercial e à conta da plataforma Agendei, o
            controlador é {controller}. O canal de privacidade é{' '}
            <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.
          </p>
          <p>
            Quando você agenda, atende ou trabalha por meio de um estabelecimento que usa o
            Agendei, esse estabelecimento pode decidir as finalidades do atendimento e dos seus
            dados. Nessa situação, ele é o principal ponto de contato para informações sobre o
            serviço contratado; o Agendei opera a tecnologia conforme o contexto aplicável.
          </p>

          <h2>Dados que podemos tratar</h2>
          <p>
            Dependendo do uso, podemos tratar dados de cadastro e contato, dados de sessão,
            preferências de comunicação, dados de agendamentos, serviços, profissionais,
            pagamentos registrados e registros técnicos necessários para segurança e operação.
          </p>

          <h2>Para que usamos os dados</h2>
          <p>
            Usamos dados para disponibilizar a plataforma, identificar contas, organizar
            agendamentos, enviar comunicações transacionais, atender solicitações, prevenir
            fraude e abuso, cumprir obrigações legais e melhorar a confiabilidade do serviço.
            Comunicações de marketing dependem da preferência de comunicação aplicável.
          </p>

          <h2>Compartilhamento</h2>
          <p>
            Os dados podem ser acessados pelo estabelecimento responsável pelo atendimento e
            por fornecedores necessários à operação, como hospedagem, e-mail, notificações,
            pagamentos e mensageria, sempre conforme a finalidade e as salvaguardas aplicáveis.
            Não vendemos dados pessoais.
          </p>

          <h2>Segurança e retenção</h2>
          <p>
            Adotamos medidas técnicas e organizacionais compatíveis com a operação, incluindo
            controle de acesso, isolamento entre estabelecimentos, registro de eventos e proteção
            de credenciais. Mantemos os dados pelo tempo necessário para as finalidades descritas,
            para cumprir obrigações legais, resolver disputas e preservar registros de segurança.
          </p>

          <h2>Seus direitos</h2>
          <p>
            Você pode solicitar confirmação de tratamento, acesso, correção, informação sobre
            compartilhamento, portabilidade quando aplicável, anonimização, bloqueio, eliminação
            nas hipóteses legais e revogação de consentimento. Alguns pedidos podem ser limitados
            por obrigações legais de retenção ou pela necessidade de proteger terceiros.
          </p>
          <p>
            Para exercer direitos relativos ao Agendei, escreva para{' '}
            <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>. Para dados de um atendimento,
            informe também o estabelecimento e o contato usado no agendamento. Se a solicitação
            não for atendida, você pode buscar os canais da Autoridade Nacional de Proteção de
            Dados (ANPD).
          </p>

          <h2>Atualizações</h2>
          <p>
            Esta política pode ser atualizada para refletir mudanças legais, operacionais ou de
            segurança. A data de atualização indicará a versão vigente.
          </p>
        </article>
      </section>
    </MarketingShell>
  );
}

export function TermsPage() {
  usePageMetadata({
    title: 'Termos de Uso | Agendei',
    description: 'Condições gerais de uso da plataforma Agendei.',
    path: '/termos',
  });

  return (
    <MarketingShell>
      <section className="marketing-section legal-page">
        <article className="marketing-container legal-page__content">
          <p className="marketing-eyebrow">TERMOS</p>
          <h1>Termos de Uso</h1>
          <p>Última atualização: {effectiveDate}.</p>

          <h2>Uso da plataforma</h2>
          <p>
            O Agendei oferece recursos para organização de serviços, agenda, clientes,
            profissionais, comunicações e rotinas administrativas. O uso deve observar estes
            termos, a legislação aplicável e as permissões concedidas a cada conta.
          </p>

          <h2>Contas e responsabilidades</h2>
          <p>
            Cada pessoa é responsável pelas informações fornecidas, pela proteção de suas
            credenciais e pelas ações realizadas em sua conta. O estabelecimento é responsável
            por suas informações comerciais, regras de atendimento, equipe, serviços, preços e
            comunicação com seus clientes.
          </p>

          <h2>Atendimentos e pagamentos</h2>
          <p>
            O Agendei fornece a tecnologia para os fluxos disponibilizados pelo estabelecimento.
            A contratação e a execução do serviço são responsabilidade do estabelecimento e do
            cliente. A disponibilidade de meios de pagamento, confirmações e regras de
            cancelamento depende da configuração e das políticas aplicáveis ao atendimento.
          </p>

          <h2>Condutas proibidas</h2>
          <p>
            Não é permitido violar segurança, tentar acessar dados de terceiros, enviar conteúdo
            ilícito ou abusivo, usar a plataforma para spam, contornar limites técnicos ou
            infringir direitos de terceiros. Podemos restringir acessos que representem risco à
            plataforma, aos usuários ou ao cumprimento legal.
          </p>

          <h2>Disponibilidade e mudanças</h2>
          <p>
            Buscamos manter o serviço disponível e seguro, mas manutenções, integrações externas
            e eventos fora do nosso controle podem afetar temporariamente algumas funções.
            Recursos podem evoluir para melhoria, segurança ou adequação legal, preservados os
            compromissos aplicáveis.
          </p>

          <h2>Contato</h2>
          <p>
            Dúvidas sobre estes termos podem ser enviadas para{' '}
            <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>. O tratamento de dados pessoais
            é detalhado na Política de Privacidade.
          </p>
        </article>
      </section>
    </MarketingShell>
  );
}
