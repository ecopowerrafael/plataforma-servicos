import { MarketingShell } from '../marketing/MarketingShell.js';
import { usePageMetadata } from '../marketing/use-page-metadata.js';

const organization = 'Agendei';
const privacyEmail = 'suporte@agendei.site';
const effectiveDate = new Date().toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });

export function PrivacyPage() {
  usePageMetadata({
    title: 'Política de Privacidade | Agendei',
    description: 'Política de privacidade e tratamento de dados pessoais da plataforma Agendei.',
    path: '/privacidade',
  });

  return (
    <MarketingShell>
      <section className="marketing-section legal-page">
        <article className="marketing-container legal-page__content">
          <p className="marketing-eyebrow">PRIVACIDADE E DADOS</p>
          <h1>Política de Privacidade</h1>
          <p>Última atualização: {effectiveDate}.</p>

          <h2>1. Quem somos</h2>
          <p>
            O {organization} é uma plataforma de gestão de agendamentos, clientes, equipe e operações para
            negócios de serviços com hora marcada.
          </p>
          <p>
            Para assuntos de privacidade e proteção de dados pessoais, você pode entrar em contato através de{' '}
            <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.
          </p>

          <h2>2. Dados que coletamos</h2>
          <h3>2.1. Dados de cadastro e autenticação</h3>
          <p>
            Quando você cria uma conta, coletamos seu nome, e-mail e número de telefone/WhatsApp. Se você usar
            "Continuar com Google", coletamos dados fornecidos pela Google.
          </p>

          <h3>2.2. Dados de autenticação via Google</h3>
          <p>
            Quando você usa "Continuar com Google", a Google fornece ao {organization}:
          </p>
          <ul>
            <li><strong>Identificador da conta Google (sub):</strong> Um identificador único e permanente para sua conta Google.</li>
            <li><strong>Nome:</strong> Seu nome de exibição na conta Google.</li>
            <li><strong>E-mail:</strong> Seu endereço de e-mail verificado na Google.</li>
            <li><strong>Confirmação de verificação:</strong> Um indicador de que o e-mail foi verificado pela Google.</li>
          </ul>
          <p>
            <strong>Importante:</strong> O {organization}:
          </p>
          <ul>
            <li>Não recebe nem armazena sua senha da Google.</li>
            <li>Não utiliza o token de autenticação Google como sessão permanente.</li>
            <li>Armazena apenas o identificador da conta Google (sub) para permitir futuras autenticações e vinculação da conta.</li>
            <li>Não usa dados do Google para publicidade ou marketing.</li>
            <li>Não vende dados do Google para terceiros.</li>
            <li>Utiliza dados do Google exclusivamente para autenticação e gestão da sua conta.</li>
          </ul>

          <h3>2.3. Dados de agendamentos e operação</h3>
          <p>
            Quando você usa a plataforma para agendar serviços, trabalhar como profissional ou gerir um estabelecimento,
            coletamos dados relacionados a agendamentos, serviços, profissionais, clientes, equipe, pagamentos e preferências
            de comunicação.
          </p>

          <h3>2.4. Dados técnicos e de segurança</h3>
          <p>
            Coletamos automaticamente endereço de IP, tipo de navegador, sistema operacional, páginas visitadas, duração
            da sessão e logs de segurança para operação, diagnóstico e prevenção de fraude.
          </p>

          <h3>2.5. Cookies e rastreamento</h3>
          <p>
            Usamos cookies de sessão (HttpOnly) para manter você autenticado. Estes cookies são essenciais para o funcionamento
            da plataforma. Outros cookies analíticos podem ser usados para entender como o serviço é utilizado.
          </p>

          <h2>3. Para que usamos seus dados</h2>
          <ul>
            <li>Autenticar sua conta e validar sua identidade.</li>
            <li>Fornecer os serviços contratados e funcionalidades da plataforma.</li>
            <li>Organizar agendamentos, comunicações e operações.</li>
            <li>Enviar notificações transacionais essenciais (confirmações, lembretes, alertas).</li>
            <li>Atender suas solicitações de suporte.</li>
            <li>Prevenir fraude, abuso e comportamentos prejudiciais.</li>
            <li>Cumprir obrigações legais e regulatórias.</li>
            <li>Melhorar a segurança, confiabilidade e desempenho do serviço.</li>
            <li>Comunicações de marketing (apenas com sua autorização).</li>
          </ul>

          <h2>4. Compartilhamento de dados</h2>
          <p>
            Seus dados podem ser acessados por:
          </p>
          <ul>
            <li><strong>Você mesmo e sua equipe:</strong> Dentro de seus estabelecimentos e permissões.</li>
            <li><strong>Clientes e profissionais:</strong> Informações públicas necessárias para agendamentos.</li>
            <li><strong>Fornecedores essenciais:</strong> Hospedagem, bancos de dados, e-mail, SMS, WhatsApp, notificações, processamento de pagamentos — todos sob contratos de confidencialidade.</li>
            <li><strong>Autoridades legais:</strong> Quando obrigado por lei ou ordem judicial.</li>
          </ul>
          <p>
            <strong>O {organization} não vende dados pessoais.</strong>
          </p>

          <h2>5. Retenção de dados</h2>
          <p>
            Mantemos seus dados enquanto sua conta estiver ativa e pelo período necessário para:
          </p>
          <ul>
            <li>Fornecer os serviços contratados.</li>
            <li>Cumprir obrigações legais.</li>
            <li>Resolver disputas ou questões de segurança.</li>
            <li>Preservar registros de auditoria.</li>
          </ul>
          <p>
            Após cancelamento ou exclusão de conta, alguns dados podem ser mantidos anonimizados para análise e conformidade legal.
          </p>

          <h2>6. Segurança</h2>
          <p>
            Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo:
          </p>
          <ul>
            <li>Criptografia em trânsito (HTTPS) e em repouso.</li>
            <li>Controle de acesso baseado em função e permissões.</li>
            <li>Isolamento de dados entre estabelecimentos.</li>
            <li>Registro de eventos e auditoria.</li>
            <li>Proteção de credenciais e sessões.</li>
            <li>Verificação regular de segurança.</li>
          </ul>
          <p>
            Embora nos esforcemos ao máximo, nenhum sistema é 100% seguro. Se você detectar uma vulnerabilidade,
            entre em contato conosco em {privacyEmail}.
          </p>

          <h2>7. Seus direitos</h2>
          <p>
            Conforme a Lei Geral de Proteção de Dados (LGPD) e legislação aplicável, você tem direito a:
          </p>
          <ul>
            <li><strong>Confirmação:</strong> Se seus dados estão sendo tratados.</li>
            <li><strong>Acesso:</strong> Cópia dos dados que mantemos sobre você.</li>
            <li><strong>Correção:</strong> Atualizar dados inexatos ou incompletos.</li>
            <li><strong>Exclusão:</strong> Remover dados nas situações legais permitidas.</li>
            <li><strong>Portabilidade:</strong> Receber seus dados em formato estruturado.</li>
            <li><strong>Revogação de consentimento:</strong> Interromper certos usos de dados.</li>
            <li><strong>Informações sobre compartilhamento:</strong> Saber com quem seus dados são compartilhados.</li>
          </ul>
          <p>
            Para exercer qualquer destes direitos, escreva para <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a> com:
          </p>
          <ul>
            <li>Seu nome e e-mail cadastrado.</li>
            <li>Descrição clara do direito que deseja exercer.</li>
            <li>Se aplicável, o estabelecimento ou agendamento relacionado.</li>
          </ul>
          <p>
            Se sua solicitação não for atendida no prazo legal, você pode registrar uma reclamação junto à
            Autoridade Nacional de Proteção de Dados (ANPD).
          </p>

          <h2>8. Menores de idade</h2>
          <p>
            O serviço é destinado a maiores de 18 anos ou emancipados. Se você for menor, use o serviço apenas sob
            autorização e supervisão de responsável legal. Se descobrirmos que coletamos dados de menores sem consentimento,
            removeremos esses dados imediatamente.
          </p>

          <h2>9. Transferência internacional</h2>
          <p>
            Seus dados podem ser processados em servidores localizados em diferentes países. Adotamos garantias apropriadas
            para proteger seus dados em todas as transferências conforme a legislação aplicável.
          </p>

          <h2>10. Alterações desta política</h2>
          <p>
            Esta política pode ser atualizada para refletir mudanças legais, operacionais ou de segurança.
            Publicaremos qualquer mudança significativa nesta página e, quando necessário, enviaremos notificação.
            O uso contínuo da plataforma após as alterações representa sua aceitação.
          </p>

          <h2>11. Contato</h2>
          <p>
            Dúvidas sobre esta Política de Privacidade? Entre em contato através de{' '}
            <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.
          </p>
        </article>
      </section>
    </MarketingShell>
  );
}

export function TermsPage() {
  usePageMetadata({
    title: 'Termos de Uso | Agendei',
    description: 'Termos e condições gerais de uso da plataforma Agendei.',
    path: '/termos',
  });

  return (
    <MarketingShell>
      <section className="marketing-section legal-page">
        <article className="marketing-container legal-page__content">
          <p className="marketing-eyebrow">CONDIÇÕES DE USO</p>
          <h1>Termos de Uso</h1>
          <p>Última atualização: {effectiveDate}.</p>

          <h2>1. Aceitação dos termos</h2>
          <p>
            Ao acessar ou usar o {organization}, você concorda em cumprir estes termos. Se não concordar,
            não use o serviço. Reservamos o direito de modificar estes termos a qualquer momento.
            O uso continuado implica em aceitação das alterações.
          </p>

          <h2>2. Descrição do serviço</h2>
          <p>
            O {organization} é uma plataforma SaaS que oferece:
          </p>
          <ul>
            <li>Gestão de agendamentos e calendários.</li>
            <li>Cadastro e CRM de clientes.</li>
            <li>Gestão de serviços, profissionais e equipe.</li>
            <li>Integração com WhatsApp para comunicações.</li>
            <li>Relatórios, financeiro e comissões.</li>
            <li>Automações e notificações.</li>
            <li>Aplicativo para clientes e profissionais.</li>
          </ul>

          <h2>3. Conta e autenticação</h2>
          <h3>3.1. Criar uma conta</h3>
          <p>
            Você pode criar uma conta de duas formas:
          </p>
          <ul>
            <li><strong>Email e senha:</strong> Forneça informações válidas e escolha uma senha segura.</li>
            <li><strong>Continuar com Google:</strong> Use sua conta Google para autenticação rápida e segura.</li>
          </ul>

          <h3>3.2. Responsabilidades</h3>
          <p>
            Você é responsável por:
          </p>
          <ul>
            <li>Manter a confidencialidade de suas credenciais de login.</li>
            <li>Usar apenas uma conta por pessoa.</li>
            <li>Informar imediatamente sobre acesso não autorizado.</li>
            <li>Garantir que as informações fornecidas sejam precisas e atualizadas.</li>
            <li>Cumprir a legislação aplicável ao usar o serviço.</li>
          </ul>

          <h3>3.3. Autenticação via Google</h3>
          <p>
            Quando você usa "Continuar com Google", o {organization}:
          </p>
          <ul>
            <li>Valida sua identidade através da Google.</li>
            <li>Cria ou vincula sua conta usando seu e-mail verificado.</li>
            <li>Não recebe ou armazena sua senha da Google.</li>
            <li>Não usa o token Google como sessão permanente.</li>
            <li>Armazena apenas dados necessários para autenticação futura.</li>
          </ul>

          <h2>4. Uso permitido</h2>
          <p>
            O {organization} pode ser usado para:
          </p>
          <ul>
            <li>Gerenciar agendamentos e operações legais.</li>
            <li>Comunicação transacional com clientes e equipe.</li>
            <li>Análise de dados e relatórios do seu negócio.</li>
            <li>Integração com ferramentas de terceiros conforme permitido.</li>
          </ul>

          <h2>5. Uso proibido</h2>
          <p>
            É estritamente proibido:
          </p>
          <ul>
            <li>Violar segurança ou tentar acessar dados não autorizados.</li>
            <li>Usar técnicas de hacking, scraping ou força bruta.</li>
            <li>Compartilhar credenciais ou vender acesso à conta.</li>
            <li>Enviar conteúdo ilegal, obsceno, abusivo ou discriminatório.</li>
            <li>Spamming, phishing ou fraude.</li>
            <li>Contornar limites técnicos ou proteções.</li>
            <li>Violar direitos de propriedade intelectual de terceiros.</li>
            <li>Usar a plataforma para atividades ilícitas.</li>
            <li>Criar bots ou automações não autorizadas.</li>
          </ul>

          <h2>6. Conteúdo e dados do usuário</h2>
          <h3>6.1. Propriedade</h3>
          <p>
            Você mantém todos os direitos sobre o conteúdo que insere (textos, imagens, dados de clientes, etc.).
            O {organization} não assume propriedade sobre seus dados.
          </p>

          <h3>6.2. Licença ao {organization}</h3>
          <p>
            Ao usar a plataforma, você concede ao {organization} licença para armazenar, processar, exibir e usar seus
            dados exclusivamente para fornecer o serviço conforme contratado.
          </p>

          <h3>6.3. Responsabilidade sobre dados</h3>
          <p>
            Você é responsável por:
          </p>
          <ul>
            <li>Garantir que tem direito ao conteúdo que insere.</li>
            <li>Backups de dados críticos (recomendamos cópias regulares).</li>
            <li>Conformidade com legislação ao coletar dados de terceiros.</li>
            <li>Aviso e consentimento de clientes sobre seu uso de dados.</li>
          </ul>

          <h2>7. Estabelecimentos e equipes</h2>
          <p>
            O proprietário ou gerente de um estabelecimento é responsável por:
          </p>
          <ul>
            <li>Precisão e legalidade dos dados cadastrados.</li>
            <li>Cumprimento de leis aplicáveis ao seu setor.</li>
            <li>Informações completas sobre serviços, profissionais e preços.</li>
            <li>Políticas honestas de cancelamento e reembolso.</li>
            <li>Conformidade com regras de privacidade ao usar dados de clientes.</li>
            <li>Gerenciamento adequado de acesso da equipe.</li>
          </ul>

          <h2>8. Agendamentos e transações</h2>
          <p>
            O {organization} fornece a tecnologia para agendamentos, mas:
          </p>
          <ul>
            <li>O estabelecimento é responsável pela disponibilidade real e qualidade do serviço.</li>
            <li>Confirmações, cancelamentos e reembolsos seguem as políticas do estabelecimento.</li>
            <li>Disputas sobre serviços devem ser resolvidas entre cliente e estabelecimento.</li>
            <li>O {organization} não é responsável pelo cumprimento ou qualidade do atendimento.</li>
          </ul>

          <h2>9. Pagamentos e assinaturas</h2>
          <p>
            Quando aplicável:
          </p>
          <ul>
            <li>Você autoriza débito da forma de pagamento cadastrada.</li>
            <li>Assinaturas renovam automaticamente no final de cada ciclo de cobrança.</li>
            <li>Você pode cancelar a qualquer momento através das configurações da conta.</li>
            <li>Reembolsos de assinatura canceladas seguem a política específica do plano.</li>
            <li>Impostos adicionais podem aplicar-se conforme a legislação local.</li>
          </ul>

          <h2>10. Disponibilidade e manutenção</h2>
          <p>
            O {organization} busca manter alta disponibilidade, mas:
          </p>
          <ul>
            <li>Manutenções programadas podem causar interrupções breves (notificadas com antecedência).</li>
            <li>Integrações externas (WhatsApp, pagamentos, etc) podem estar temporariamente indisponíveis.</li>
            <li>Eventos fora do controle (falhas de internet, energia, ataques) podem afetar o serviço.</li>
            <li>Não garantimos 100% de tempo de atividade (uptime).</li>
          </ul>

          <h2>11. Limitação de responsabilidade</h2>
          <p>
            Na máxima medida permitida por lei:
          </p>
          <ul>
            <li>O {organization} não é responsável por perda de dados, lucros cessantes ou danos indiretos.</li>
            <li>Nossa responsabilidade total é limitada ao valor pago por você nos últimos 12 meses.</li>
            <li>O serviço é fornecido "como está", sem garantias expressas ou implícitas.</li>
          </ul>

          <h2>12. Propriedade intelectual</h2>
          <p>
            Todo conteúdo, funcionalidade e design do {organization} são propriedade exclusiva do {organization} ou de
            seus fornecedores, protegidos por lei. Você não pode reproduzir, distribuir ou modificar sem permissão.
          </p>

          <h2>13. Encerramento e suspensão</h2>
          <p>
            O {organization} pode suspender ou encerrar sua conta se:
          </p>
          <ul>
            <li>Violar estes termos.</li>
            <li>Não pagar as taxas de assinatura.</li>
            <li>Comportamento prejudicial ou ilegal.</li>
            <li>Risco de segurança ou fraude.</li>
            <li>Solicitação legal ou regulatória.</li>
          </ul>
          <p>
            Você pode cancelar sua conta a qualquer momento através das configurações. Dados podem ser
            retidos conforme a política de privacidade.
          </p>

          <h2>14. Indenização</h2>
          <p>
            Você concorda em indenizar e isentar o {organization} de qualquer reivindicação, perda ou despesa
            (incluindo honorários legais) resultantes de:
          </p>
          <ul>
            <li>Violação destes termos.</li>
            <li>Seu uso da plataforma.</li>
            <li>Seu conteúdo ou dados.</li>
            <li>Violação de direitos de terceiros.</li>
          </ul>

          <h2>15. Legislação aplicável</h2>
          <p>
            Estes termos são regidos pela legislação brasileira. Qualquer ação legal deve ser ajuizada nos tribunais
            brasileiros competentes. Você concorda em tentar resolver disputas amigavelmente antes de processos judiciais.
          </p>

          <h2>16. Disposições gerais</h2>
          <ul>
            <li>Se qualquer parte destes termos for inválida, as demais permanecem válidas.</li>
            <li>Estes termos constituem o acordo integral entre você e o {organization}.</li>
            <li>Tolerância com uma violação não constitui renúncia de direitos.</li>
            <li>Você não pode transferir direitos sem consentimento.</li>
          </ul>

          <h2>17. Contato</h2>
          <p>
            Dúvidas sobre estes Termos de Uso? Entre em contato através de{' '}
            <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.
          </p>
        </article>
      </section>
    </MarketingShell>
  );
}
