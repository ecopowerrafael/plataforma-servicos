export const featureGroups = [
  {
    id: 'agenda',
    eyebrow: 'Agenda e atendimento',
    title: 'Cada horário no lugar certo',
    description:
      'Organize disponibilidade, serviços, profissionais e toda a jornada do agendamento sem depender de conversas espalhadas.',
    items: [
      'Agenda diária, semanal e mensal',
      'Agendamento público em tempo real',
      'Reagendamento e cancelamento',
      'Check-in, encaixes e lista de espera',
      'Lembretes e confirmações',
    ],
  },
  {
    id: 'clientes',
    eyebrow: 'Clientes',
    title: 'Histórico que ajuda a atender melhor',
    description:
      'Mantenha cadastro, preferências e relacionamento reunidos para que a equipe tenha contexto antes de cada atendimento.',
    items: [
      'Cadastro e histórico de agendamentos',
      'Preferências de comunicação',
      'Favoritos e avaliações',
      'Cupons, pontos e cashback',
      'Recuperação automática de clientes',
    ],
  },
  {
    id: 'gestao',
    eyebrow: 'Gestão',
    title: 'Uma operação clara para cada pessoa da equipe',
    description:
      'Defina acessos, organize profissionais e acompanhe unidades sem misturar responsabilidades ou informações.',
    items: [
      'Profissionais, equipes e permissões',
      'Unidades e horários de funcionamento',
      'Escopo de acesso por unidade',
      'Visão comparativa multiunidade',
      'Configurações por estabelecimento',
    ],
  },
  {
    id: 'financeiro',
    eyebrow: 'Financeiro',
    title: 'Do pagamento ao fechamento, sem controles paralelos',
    description:
      'Registre recebimentos, acompanhe pendências e mantenha caixa, comissões e relatórios ligados à operação real.',
    items: [
      'Pagamentos, sinal e formas de pagamento',
      'PIX, Mercado Pago e pagamento no local',
      'Caixa, recibos e fechamento',
      'Comissões e inadimplência',
      'Relatórios financeiros por período',
    ],
  },
  {
    id: 'estoque',
    eyebrow: 'Produtos e estoque',
    title: 'Saldo confiável em cada unidade',
    description:
      'Acompanhe o caminho dos produtos da entrada à venda, com movimentações registradas e alerta de estoque mínimo.',
    items: [
      'Produtos e categorias',
      'Entradas, saídas e ajustes',
      'Transferências entre unidades',
      'Vendas com baixa de estoque',
      'Histórico e alertas por unidade',
    ],
  },
  {
    id: 'relacionamento',
    eyebrow: 'Crescimento e relacionamento',
    title: 'Comunicação que acompanha a rotina',
    description:
      'Use lembretes, notificações e automações para manter o cliente informado e recuperar oportunidades de retorno.',
    items: [
      'E-mails transacionais e push',
      'Templates e histórico de entrega',
      'Automações e recuperação de clientes',
      'WhatsApp oficial quando configurado',
      'Integrações externas e webhooks',
    ],
  },
] as const;

export const audienceSegments = [
  'Barbearias e salões',
  'Estética',
  'Saúde e bem-estar',
  'Pet services',
  'Serviços automotivos',
  'Profissionais autônomos',
  'Aulas e treinamentos',
  'Consultorias',
] as const;

export const frequentlyAskedQuestions = [
  {
    question: 'Preciso instalar alguma coisa?',
    answer:
      'Não. A plataforma é acessada pelo navegador, tanto pela equipe quanto pelos clientes que usam a página pública do estabelecimento.',
  },
  {
    question: 'Funciona no celular?',
    answer:
      'Sim. As áreas públicas e operacionais são web e podem ser acessadas em celulares, tablets e computadores.',
  },
  {
    question: 'Posso ter mais de uma unidade?',
    answer:
      'Sim, quando o plano escolhido habilita a quantidade necessária. Cada unidade pode ter agenda, equipe e estoque próprios, além de uma visão consolidada.',
  },
  {
    question: 'Meus profissionais possuem acesso próprio?',
    answer:
      'Sim. O profissional pode acessar a própria agenda, disponibilidade, atendimentos e comissões conforme as permissões definidas pelo estabelecimento.',
  },
  {
    question: 'O cliente consegue agendar sozinho?',
    answer:
      'Sim. Na página pública, ele escolhe serviço, profissional quando aplicável e um horário realmente disponível.',
  },
  {
    question: 'Posso controlar pagamentos e estoque?',
    answer:
      'Sim. A plataforma registra pagamentos, caixa, recibos, comissões e pendências, além de produtos, movimentações e vendas com baixa de estoque.',
  },
  {
    question: 'Posso usar meu próprio domínio?',
    answer:
      'Sim, quando esse recurso estiver habilitado no plano. A plataforma também oferece subdomínios gerenciados e identidade visual do estabelecimento.',
  },
  {
    question: 'O que acontece depois do período gratuito?',
    answer:
      'O acesso passa a seguir as condições da assinatura e a política comercial configurada. O período aplicável é sempre mostrado no plano escolhido.',
  },
] as const;

export const planLimitLabels = {
  'units.max': 'Unidades',
  'members.max': 'Membros da equipe',
  'professionals.max': 'Profissionais',
  'services.max': 'Serviços',
  'monthly_appointments.max': 'Agendamentos por mês',
  'custom_domain.enabled': 'Domínio próprio',
  'branding.customization.enabled': 'Personalização da marca',
  'advanced_reports.enabled': 'Relatórios avançados',
  'products.enabled': 'Produtos',
  'stock.enabled': 'Estoque',
  'commissions.enabled': 'Comissões',
  'waitlist.enabled': 'Lista de espera',
  'automations.enabled': 'Automações',
  'whatsapp.enabled': 'WhatsApp',
  'integrations.enabled': 'Integrações externas',
  'loyalty.enabled': 'Fidelidade',
  'coupons.enabled': 'Cupons',
} as const;

export const billingCycleLabels = {
  MONTHLY: '/mês',
  QUARTERLY: '/trimestre',
  SEMIANNUAL: '/semestre',
  ANNUAL: '/ano',
  CUSTOM: '',
} as const;
