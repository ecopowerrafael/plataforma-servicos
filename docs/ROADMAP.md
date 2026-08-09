# ATUALIZAÇÃO DO ROADMAP OFICIAL

O prompt inicial continua válido, mas o roadmap deve ser interpretado conforme o escopo completo abaixo.

Este roadmap substitui qualquer numeração, reorganização ou sugestão anterior encontrada no relatório, README ou histórico.

Não crie novas etapas e não mova funcionalidades entre elas.

## Etapa 1 — Fundação técnica

* arquitetura do projeto;
* frontend;
* backend;
* TypeScript;
* MySQL;
* Prisma;
* migrations;
* variáveis de ambiente;
* lint;
* formatação;
* build;
* tratamento de erros;
* health check;
* readiness;
* logs básicos.

## Etapa 2 — Multiempresa

* tenants;
* unidades;
* relações entre dados;
* isolamento por tenant;
* contexto da requisição;
* middleware de tenant;
* status do estabelecimento;
* configurações operacionais;
* CRUD de unidades pelo estabelecimento;
* unidade matriz;
* seletores reais de unidade.

## Etapa 3 — Autenticação e permissões

* login;
* logout;
* recuperação de senha;
* gerenciamento de sessões;
* usuários;
* papéis;
* permissões;
* convites;
* gestão de membros;
* auditoria de acesso.

## Etapa 4 — Painel Super Admin

* estabelecimentos;
* provisionamento;
* planos;
* limites;
* assinaturas;
* bloqueios;
* período de teste;
* alteração de plano;
* métricas gerais;
* auditoria;
* gestão global da plataforma.

## Etapa 5 — Personalização white-label

* logo;
* favicon;
* cores;
* fontes permitidas;
* banners desktop e mobile;
* ícone;
* splash;
* textos;
* terminologia;
* biblioteca de mídia;
* três temas: Classic, Modern e Premium;
* preview;
* configurações do PWA;
* manifest;
* SEO básico;
* página pública institucional do estabelecimento.

Domínio próprio e subdomínio customizado não pertencem a esta etapa; ficam na Etapa 17.

## Etapa 6 — Unidades e profissionais

* unidades;
* profissionais;
* especialidades;
* foto;
* campos específicos por nicho;
* vínculos entre profissional, unidade e serviço;
* permissões do profissional;
* disponibilidade;
* jornada;
* comissões dos profissionais.

## Etapa 7 — Serviços

* categorias;
* serviços;
* imagens;
* variações;
* duração;
* preço;
* pausa após o serviço;
* profissionais habilitados;
* preço e duração por profissional;
* combos;
* intervalos;
* ativação e desativação.

## Etapa 8 — Agenda

* horário de funcionamento;
* jornada por profissional;
* agenda diária;
* agenda semanal;
* agenda mensal;
* pausas;
* folgas;
* férias;
* bloqueios;
* exceções por data;
* feriados;
* indisponibilidades;
* cálculo central de disponibilidade;
* antecedência mínima e máxima;
* timezone.

## Etapa 9 — Agendamentos

* fluxo público;
* agendamento interno;
* seleção de unidade;
* seleção de serviço;
* seleção de profissional;
* disponibilidade em tempo real;
* conflitos;
* proteção contra concorrência;
* cancelamento;
* reagendamento;
* status;
* histórico;
* protocolo;
* encaixes;
* snapshot de preço, duração e pausa.

## Etapa 10 — Painel do cliente

* cadastro;
* login;
* perfil;
* dados pessoais;
* próximos horários;
* histórico;
* cancelamento;
* reagendamento;
* favoritos;
* avaliações;
* preferências de comunicação.

## Etapa 11 — Painel do profissional

* login e acesso próprio;
* agenda;
* visão diária;
* atendimentos;
* dados do cliente permitidos;
* observações;
* status do atendimento;
* comissões;
* bloqueios;
* folgas;
* disponibilidade.

## Etapa 12 — Operação administrativa

* agenda geral;
* recepção;
* clientes;
* atendimento;
* encaixes;
* check-in;
* dashboard operacional;
* filtros;
* gestão de membros;
* configurações do estabelecimento;
* visualização do plano e assinatura;
* relatórios iniciais.

## Etapa 13 — Notificações

* configuração SMTP;
* e-mails transacionais;
* push;
* templates;
* filas;
* tentativas e reprocessamento;
* logs de entrega;
* lembretes;
* confirmações;
* preferências de comunicação.

## Etapa 14 — Financeiro

* pagamentos;
* sinal;
* caixa;
* formas de pagamento;
* recibos;
* comissões;
* fechamento;
* inadimplência;
* relatórios financeiros;
* integração com gateway quando definida.

## Etapa 15 — Fidelização

* cupons;
* pontos;
* cashback;
* pacotes;
* assinaturas dos clientes;
* indicações;
* campanhas de retenção.

## Etapa 16 — Estoque e produtos

* produtos;
* categorias de produtos;
* estoque;
* entradas e saídas;
* movimentações;
* vendas;
* alertas;
* comissão por produto;
* histórico.

## Etapa 17 — Recursos avançados

* lista de espera;
* automações;
* recuperação de clientes;
* relatórios avançados;
* recursos avançados de multiunidade;
* domínio próprio;
* subdomínios;
* WhatsApp oficial;
* integrações externas.

## Etapa 18 — Preparação para produção

* testes completos;
* testes integrados;
* testes E2E;
* revisão de segurança;
* revisão de isolamento multiempresa;
* acessibilidade;
* otimização;
* divisão de bundle;
* backup;
* restauração;
* deploy;
* observabilidade;
* logs e alertas;
* política de privacidade;
* LGPD;
* documentação;
* instalação;
* operação;
* manutenção.

## Regra de continuidade

Ao concluir cada bloco:

1. atualize internamente o status da etapa correspondente;
2. identifique a menor pendência real da etapa mais antiga incompleta;
3. continue por essa pendência;
4. não avance para uma etapa posterior apenas porque parte dela já existe;
5. não refaça funcionalidades já implementadas;
6. não use o relatório antigo como autoridade quando o código atual comprovar que uma pendência já foi resolvida.

As prioridades imediatas permanecem:

1. concluir a Etapa 5 — White-label;
2. revisar e fechar as pendências reais das Etapas 6, 7 e 8;
3. concluir a Etapa 9 — Agendamentos, incluindo o fluxo público;
4. seguir então para as Etapas 10 a 18, na ordem acima.
