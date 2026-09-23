# Bot Cobra — Roadmap de Produto e Implementação

> Documento de planejamento técnico/funcional para implementação do **Bot Cobra** dentro do Agendei.
>
> Objetivo: transformar pendências financeiras em um fluxo de cobrança e negociação automática pelo WhatsApp, com geração de PIX, promessa de pagamento, pagamento parcial, régua configurável, histórico e controle humano.

---

## 1. Visão do produto

O **Bot Cobra** será um módulo de cobrança automática e negociação assistida por regras.

Ele deve atender dois cenários principais:

1. **Serviço feito fiado / saldo de atendimento não recebido**
   - nasce de um agendamento/atendimento já existente;
   - aproveita cliente, serviço, profissional, valor e pagamentos já registrados;
   - pode ser ativado quando o tenant encerra o atendimento e deixa saldo em aberto;
   - também pode ser ativado depois a partir de “Pendências financeiras”.

2. **Novo devedor cadastrado manualmente**
   - dívida sem necessidade de agendamento;
   - tenant informa nome, WhatsApp, descrição, valor, vencimento e regra de cobrança;
   - pode ou não estar vinculado a um Customer existente.

O Bot Cobra não deve ser apenas um disparador de lembretes. Ele deve manter estado e conduzir a negociação:

- cobrar;
- oferecer pagamento integral;
- gerar PIX;
- oferecer entrada parcial;
- registrar promessa de pagamento;
- esperar a data prometida;
- retomar contato se a promessa vencer;
- pausar quando humano assumir;
- encerrar automaticamente quando o saldo chegar a zero.

---

# 2. Princípios de arquitetura

## 2.1 Dívida é um domínio próprio

Não reutilizar `Appointment` como se ele fosse a dívida.

Motivos:

- dívida manual pode não ter agendamento;
- cobrança possui status próprios;
- precisa de vencimento;
- precisa de promessa de pagamento;
- precisa de régua;
- precisa de timeline;
- precisa de tentativas/ciclos;
- precisa de negociação parcial;
- precisa ser pausável/contestável sem alterar o agendamento.

Criar um domínio próprio, conceitualmente chamado:

- `Debt` — dívida/pendência administrada pelo Bot Cobra;
- `CollectionRule` — régua de cobrança;
- `CollectionAttempt` — tentativa programada/enviada;
- `PaymentPromise` — promessa de pagamento;
- `DebtPaymentAllocation` — pagamento/abatimento aplicado à dívida;
- opcionalmente `DebtEvent` — timeline/auditoria funcional.

## 2.2 Financeiro continua sendo fonte de verdade do dinheiro recebido

O Bot Cobra não deve criar uma segunda contabilidade.

Quando existir pagamento real:

- pagamento de dívida originada em Appointment deve, sempre que possível, usar o `Payment` canônico;
- caixa/recebido continuam usando a estrutura financeira existente;
- Bot Cobra registra apenas a **alocação/efeito daquele pagamento na dívida**.

Para dívida manual, o ideal é evoluir `PaymentOriginType` para suportar `DEBT`, em vez de criar um sistema financeiro isolado.

## 2.3 WhatsApp é canal; Bot Cobra é domínio

O Bot Cobra não deve ficar acoplado exclusivamente ao WhatsApp.

Arquitetura desejada:

`Debt` → `CollectionEngine` → ação vencida → canal configurado → WhatsApp agora / email ou push no futuro.

O MVP usa WhatsApp como canal principal.

## 2.4 Scheduler e delivery são separados

Seguir o padrão já consolidado nos reminders:

- motor da cobrança decide **quando** uma tentativa deve acontecer;
- cria uma tentativa persistida;
- entrega ocorre somente quando estiver vencida;
- retries do worker não devem gerar mensagem duplicada;
- atraso do worker não pode reativar tentativa expirada indefinidamente.

## 2.5 Toda ação é idempotente

- retry do worker não duplica cobrança;
- retry do webhook não duplica promessa;
- clique duplo em “Gerar PIX” não cria dois PIX;
- clique duplo em “Daqui 7 dias” não cria duas promessas;
- confirmação de pagamento não abate saldo duas vezes.

---

# 3. Estudo da arquitetura atual — o que já podemos aproveitar

## 3.1 `DelinquencyService` / Pendências financeiras — REAPROVEITAR MUITO

Já existe um módulo de **Pendências financeiras** que:

- lista atendimentos com saldo em aberto;
- usa `Appointment` + `Payment` canônicos;
- calcula preço líquido, pago e saldo;
- diferencia estados como online pendente/falha/pagamento local;
- possui filtros por cliente, profissional, unidade e busca;
- já possui UI desktop/mobile e drawer de detalhes.

Ponto importante do código atual: o próprio serviço documenta que **não existe vencimento no domínio** e que essa tela representa exposição financeira atual, não atraso real.

### Como aproveitar

Adicionar futuramente ações:

- `Iniciar Bot Cobra`;
- `Criar dívida a partir desta pendência`;
- `Ver cobrança ativa`.

Ao ativar:

- origem = `APPOINTMENT`;
- guardar `originAppointmentId`;
- principal inicial = saldo aberto no momento de ativação;
- cliente/telefone/serviço podem ser copiados como snapshot para a dívida;
- preservar vínculo ao Appointment para sincronização financeira.

### O que NÃO fazer

Não transformar automaticamente todo saldo em aberto em dívida ativa. Uma pendência pode ser apenas “pagamento no local” ou atendimento ainda não concluído.

---

## 3.2 `Payment` / `PaymentService` — REAPROVEITAR, MAS GENERALIZAR

Já existe:

- pagamentos parciais;
- múltiplos pagamentos para o mesmo atendimento;
- validação para não ultrapassar saldo;
- `PaymentMethod`;
- cancelamento de pagamento;
- integração com caixa;
- comissões;
- fidelidade;
- auditoria.

Isso é excelente para o Bot Cobra porque o conceito de **pagamento parcial já existe no financeiro**.

### Limitação atual

`PaymentOriginType` hoje cobre:

- `APPOINTMENT`;
- `MEMBERSHIP_CHARGE`.

Para dívida manual, recomendamos evoluir para:

- `DEBT`.

E adicionar `debtId` nullable ao `Payment`.

### Estratégia recomendada

Criar métodos específicos no futuro:

- `PaymentService.createForDebt(...)` ou `DebtPaymentService` que usa o mesmo modelo `Payment`;
- nenhuma comissão automática para dívida manual;
- se a dívida tiver Appointment de origem e política exigir, manter regras de comissão/caixa coerentes;
- `DebtPaymentAllocation` liga o `Payment` ao abatimento específico da dívida.

---

## 3.3 `PaymentGatewayCharge` / PIX — REAPROVEITAR PROVEDORES, GENERALIZAR ORIGEM

O projeto já tem infraestrutura de gateway com:

- PIX local;
- Mercado Pago;
- idempotency key;
- QR Code;
- payload copia-e-cola;
- status PENDING/PROCESSING/PAID/FAILED/CANCELED/EXPIRED/REFUNDED;
- eventos/webhooks;
- criação de Payment quando cobrança é paga.

### Limitação atual

`PaymentGatewayCharge` exige `appointmentId`.

`TenantPaymentOptionsService.createPixCharge()` também é centrado em Appointment e calcula o saldo via `PaymentService.listForAppointment()`.

### Evolução recomendada

Generalizar `PaymentGatewayCharge` para origem:

- APPOINTMENT;
- DEBT;

Com:

- `appointmentId` nullable;
- `debtId` nullable;
- `originType` explícito.

Depois criar:

`createDebtPixCharge(tenantId, debtPublicId, amountCents, ...)`

O valor pode ser:

- saldo integral;
- entrada parcial escolhida pelo cliente;
- outro valor permitido pela régua.

Não duplicar providers PIX/Mercado Pago.

---

## 3.4 `NotificationLog` + worker — REAPROVEITAR COMO DELIVERY QUEUE

Já existe uma fila MySQL persistida via `NotificationLog` com:

- `scheduledAt`;
- PENDING/PROCESSING/SENT/FAILED/SKIPPED;
- tentativas;
- processamento por worker;
- suporte a WhatsApp;
- botões WhatsApp persistidos no job;
- claim atômico e proteção contra duplicidade entre instâncias.

O worker atual já roda vários motores em cada tick e depois processa a fila.

### Reuso recomendado

Adicionar um `DebtCollectionScheduler`/`CollectionEngine` como mais um produtor do worker:

`collectionEngine.run()` → cria `CollectionAttempt` devido → materializa `NotificationLog` WhatsApp → `NotificationService.processPending()` entrega.

### Identidade do job

Não reutilizar uma única chave `debt + kind`, pois uma dívida pode ter muitas tentativas.

Cada tentativa deve ter `publicId` único e virar:

- `targetType = DEBT_COLLECTION_ATTEMPT`;
- `targetPublicId = attempt.publicId`.

Assim cada ciclo/tentativa pode possuir um NotificationLog próprio e auditável.

---

## 3.5 WhatsApp inbound/outbound e dedupe — REAPROVEITAR

Já existem:

- `WhatsAppInboundEvent`;
- dedupe por fingerprint;
- `WhatsAppOutboundMessage`;
- vínculo do outbound a `NotificationLog`;
- `WhatsAppConversation`;
- resolução tenant + telefone;
- bloqueio de mensagens próprias/grupo;
- modo HUMAN_SUPPORT;
- action buttons reais;
- associação do customer pelo telefone;
- sessão conversacional com timeout atual de 30 minutos.

### Reuso para Bot Cobra

Criar ações técnicas fixas, por exemplo:

- `COLLECTION_PAY_FULL`;
- `COLLECTION_NEED_MORE_TIME`;
- `COLLECTION_PARTIAL:<offer-id ou percentual>`;
- `COLLECTION_PROMISE:+1`;
- `COLLECTION_PROMISE:+3`;
- `COLLECTION_PROMISE:+7`;
- `COLLECTION_PROMISE:+10`;
- `COLLECTION_PROMISE_CUSTOM_DATE`;
- `COLLECTION_PAYMENT_STATUS`;
- `COLLECTION_DISPUTE`;
- `COLLECTION_HUMAN_SUPPORT`.

O tenant edita somente labels/configuração comercial; nunca `actionId` arbitrário.

### Padrão importante a aproveitar

O assistente já sabe receber uma ação de um outbound anterior e usar contexto/target para retomar fluxo. O Bot Cobra deve seguir o mesmo padrão, sem webhook paralelo.

---

## 3.6 `WhatsAppConversation` — REAPROVEITAR COM CUIDADO

O Bot Cobra pode usar o mesmo histórico de conversa, mas precisa de `currentFlow = COLLECTION` (ou equivalente) quando o cliente entra numa negociação de dívida.

Não criar uma tabela de chat paralela.

Entretanto, a **fonte de verdade da negociação** deve estar no domínio da dívida/promessa, não somente no JSON de `WhatsAppConversation.context`.

O contexto da conversa serve para UX/roteamento; a dívida serve para persistência de negócio.

---

## 3.7 `Customer` — REAPROVEITAR QUANDO EXISTIR, NÃO OBRIGAR

Customer já contém:

- nome;
- telefone;
- WhatsApp;
- email;
- vínculo tenant;
- histórico de atendimentos.

### Para dívida de atendimento

`customerId` deve ser vinculado.

### Para novo devedor manual

Recomendação:

`Debt.customerId` nullable + snapshot:

- debtorName;
- debtorWhatsapp;
- debtorEmail;
- debtorDocument opcional.

Ao cadastrar manualmente, oferecer opcionalmente:

`Vincular/criar cliente no CRM`.

Não obrigar criação de Customer só para poder cobrar uma dívida externa.

---

# 4. Modelo de dados proposto

## 4.1 Enums principais

### DebtOriginType

- `APPOINTMENT`
- `MANUAL`

### DebtStatus

- `OPEN`
- `COLLECTING`
- `WAITING_RESPONSE`
- `PROMISE_SCHEDULED`
- `PIX_PENDING`
- `PARTIALLY_PAID`
- `PROMISE_OVERDUE`
- `NEGOTIATING`
- `DISPUTED`
- `HUMAN_SUPPORT`
- `PAUSED`
- `PAID`
- `CANCELED`

### CollectionCadenceType

- `WEEKLY`
- `BIWEEKLY`
- `MONTHLY`
- `CUSTOM_DAYS`

### CollectionAttemptStatus

- `SCHEDULED`
- `PROCESSING`
- `SENT`
- `SKIPPED`
- `FAILED`
- `RESPONDED`
- `CANCELED`

### PaymentPromiseStatus

- `ACTIVE`
- `FULFILLED`
- `OVERDUE`
- `REPLACED`
- `CANCELED`

---

## 4.2 Debt

Campos sugeridos:

- id / publicId;
- tenantId;
- originType;
- originAppointmentId nullable;
- customerId nullable;
- debtorName;
- debtorWhatsapp;
- debtorEmail nullable;
- debtorDocument nullable;
- description;
- originalAmountCents;
- currentBalanceCents (cache controlado ou calculado; definir na implementação);
- dueDate;
- status;
- collectionRuleId;
- collectionPausedAt;
- collectionPausedReason;
- humanSupportAt;
- disputedAt;
- paidAt;
- canceledAt;
- canceledReason;
- unitId nullable;
- notes;
- createdByUserId/sessionId;
- createdAt/updatedAt.

### Índices

- tenantId + status + dueDate;
- tenantId + debtorWhatsapp;
- tenantId + customerId;
- tenantId + originAppointmentId;
- tenantId + collectionRuleId + status.

---

## 4.3 CollectionRule — Régua de cobrança

Campos:

- id/publicId;
- tenantId;
- name;
- active;
- cadenceType;
- cadenceDays nullable;
- preferredWeekday nullable;
- monthlyDay nullable;
- allowedStartHour;
- allowedEndHour;
- maxAttemptsPerDay;
- consecutiveDays;
- pauseDaysAfterCycle;
- maxCycles nullable;
- skipSundays;
- skipHolidays (futuro);
- partialPaymentEnabled;
- partialOfferPercentages JSON (ex. `[20,50]`);
- partialMinimumCents;
- partialRoundingStepCents (500/1000/5000 etc.);
- askPromiseAfterPartialPayment;
- promiseQuickOptionsDays JSON (ex. `[1,3,7,10]`);
- noResponseFollowupNextDay;
- createdAt/updatedAt.

### Defaults oficiais

Criar três réguas padrão em código/seed lógico, não duplicar para todos os tenants até haver customização:

- Semanal;
- Quinzenal;
- Mensal.

Permitir `Criar cópia e personalizar`.

---

## 4.4 CollectionAttempt

Cada mensagem automática agendada deve ser uma entidade persistida.

Campos:

- id/publicId;
- tenantId;
- debtId;
- cycleNumber;
- attemptNumber;
- attemptType;
- scheduledAt;
- status;
- messageKind/templateKey;
- notificationLogId nullable;
- sentAt;
- respondedAt;
- skippedAt;
- skipReason;
- createdAt/updatedAt.

Tipos possíveis:

- INITIAL_COLLECTION;
- SAME_DAY_FOLLOWUP;
- NEXT_DAY_FOLLOWUP;
- CYCLE_RESTART;
- PROMISE_DUE;
- PROMISE_OVERDUE;
- PIX_PENDING_REMINDER;
- PARTIAL_PAYMENT_FOLLOWUP.

---

## 4.5 PaymentPromise

Campos:

- id/publicId;
- tenantId;
- debtId;
- promisedDate;
- promisedAmountCents nullable;
- status;
- source `WHATSAPP | MANUAL`;
- previousPromiseId nullable;
- fulfilledAt;
- overdueAt;
- canceledAt;
- createdAt/updatedAt.

Regra:

Enquanto existe promessa ACTIVE futura:

- suspender régua normal;
- próxima cobrança = data prometida.

---

## 4.6 DebtPaymentAllocation

Objetivo: permitir pagamento parcial sem criar segunda contabilidade.

Campos:

- id/publicId;
- tenantId;
- debtId;
- paymentId;
- amountCents;
- source `BOT_PIX | MANUAL | APPOINTMENT_PAYMENT | OTHER`;
- createdAt.

Regra:

- um Payment pode ser alocado à dívida;
- soma das alocações nunca supera o pagamento;
- soma dos abatimentos nunca gera saldo negativo;
- quando saldo = 0 → Debt = PAID → todas as tentativas pendentes SKIPPED/CANCELED.

---

## 4.7 DebtEvent / Timeline

Recomendado para UX e auditoria.

Eventos:

- CREATED;
- COLLECTION_STARTED;
- MESSAGE_SENT;
- NO_RESPONSE;
- PIX_REQUESTED;
- PIX_CREATED;
- PARTIAL_OFFER_ACCEPTED;
- PAYMENT_RECEIVED;
- PROMISE_CREATED;
- PROMISE_CHANGED;
- PROMISE_OVERDUE;
- DISPUTED;
- HUMAN_SUPPORT;
- PAUSED;
- RESUMED;
- PAID;
- CANCELED.

Guardar metadata JSON pequena e controlada.

---

# 5. Régua de cobrança

## 5.1 Frequências padrão

### Semanal

Novo ciclo a cada 7 dias ou dia fixo da semana configurável.

### Quinzenal

Novo ciclo a cada 14/15 dias; na UI pode oferecer “a cada 15 dias”.

### Mensal

Dia do mês configurável ou “mesmo dia relativo à dívida”.

## 5.2 Comportamento interno do ciclo

Configurar independentemente da frequência principal:

- quantas tentativas por dia;
- quantos dias consecutivos;
- horários permitidos;
- pausa após ciclo;
- quantos dias até repetir;
- número máximo de ciclos opcional.

Exemplo:

- ciclo semanal;
- 2 contatos/dia;
- 3 dias consecutivos;
- pausa de 4 dias;
- repete.

## 5.3 Horário de silêncio

Obrigatório:

- início permitido;
- fim permitido;
- não enviar fora da janela;
- timezone do tenant;
- padrão conservador recomendado: 09:00–18:00.

Não disparar 3 mensagens no mesmo minuto se worker ficou parado.

---

# 6. Fluxo conversacional principal

## 6.1 Primeira cobrança

Mensagem default conceitual:

> Olá, {{debtorName}}. Preciso falar sobre o pagamento referente a {{debtDescription}}, no valor pendente de {{balance}}. Posso gerar o PIX para você pagar agora?

Botões:

- `Gerar PIX`;
- `Preciso de mais prazo`;
- opcional `Falar com atendimento`.

## 6.2 Gerar PIX integral

- gerar cobrança no valor do saldo atual;
- persistir charge vinculada à dívida;
- enviar PIX copia-e-cola;
- aguardar webhook/status;
- ao PAID, criar Payment/alocação;
- recalcular saldo;
- se saldo zero, encerrar cobrança.

## 6.3 Preciso de mais prazo — Negociação inteligente

Se `partialPaymentEnabled=true`:

> Tudo bem. Antes de combinarmos uma nova data, você conseguiria fazer uma entrada hoje para diminuir sua pendência?

Ofertas calculadas sobre o **saldo atual**.

Exemplo saldo R$ 500:

- 20% → R$ 100;
- 50% → R$ 250;
- `Não consigo pagar nada hoje`.

### Regra de cálculo

1. `raw = saldo * percentual`;
2. aplicar arredondamento configurado;
3. aplicar mínimo configurado;
4. nunca exceder saldo;
5. eliminar ofertas duplicadas após arredondamento;
6. não oferecer valor igual/maior ao saldo como “parcial”; nesse caso usar ação de pagar saldo.

## 6.4 Pagamento parcial

Ao aceitar uma oferta:

- criar PIX apenas da entrada;
- após confirmação:
  - registrar Payment;
  - criar DebtPaymentAllocation;
  - reduzir saldo;
  - timeline;
  - perguntar data do próximo pagamento.

Mensagem:

> Pagamento de R$ 100,00 recebido ✅. Sua pendência agora é de R$ 400,00. Quando você acredita que consegue fazer o próximo pagamento?

## 6.5 Agendar próxima data

Botões rápidos padrão configuráveis:

- Amanhã;
- +3 dias;
- +7 dias;
- +10 dias;
- Outra data.

Ao escolher:

- criar `PaymentPromise` ACTIVE;
- suspender régua normal;
- cancelar/skip tentativas futuras incompatíveis;
- agendar tentativa `PROMISE_DUE` na data.

## 6.6 Não consegue pagar nada hoje

Ir direto para promessa:

> Sem problema. Quando você acredita que consegue realizar o pagamento?

## 6.7 Não escolheu uma data

Se nenhuma resposta:

- próxima tentativa no dia seguinte, se configurado;
- respeitar dias consecutivos;
- depois pausar até o próximo ciclo.

## 6.8 Chegou a data prometida

Mensagem específica:

> Olá, {{debtorName}}. Conforme combinamos, hoje ficou previsto o pagamento da sua pendência. O saldo atual é {{balance}}. Posso gerar o PIX?

Botões:

- Pagar saldo;
- Fazer uma entrada;
- Preciso de mais prazo.

## 6.9 Promessa vencida

Se data passou e saldo continua aberto:

- promessa → OVERDUE;
- Debt → PROMISE_OVERDUE;
- enviar template específico;
- permitir nova negociação;
- contar quantidade de promessas quebradas para dashboard.

---

# 7. Templates do Bot Cobra

Criar fonte específica de templates do domínio de cobrança, não reutilizar templates de appointment.

Templates mínimos:

1. cobrança inicial;
2. follow-up sem resposta;
3. última tentativa do ciclo;
4. oferecer pagamento parcial;
5. PIX gerado;
6. pagamento parcial confirmado;
7. pedir próxima data;
8. promessa confirmada;
9. lembrete na data prometida;
10. promessa vencida;
11. dívida quitada;
12. cobrança contestada;
13. transferência para humano.

Placeholders possíveis:

- `{{debtorName}}`;
- `{{tenantName}}`;
- `{{debtDescription}}`;
- `{{originalAmount}}`;
- `{{balance}}`;
- `{{paidAmount}}`;
- `{{partialAmount}}`;
- `{{promisedDate}}`;
- `{{serviceName}}` quando origem Appointment;
- `{{protocol}}` quando origem Appointment.

---

# 8. Contestação e atendimento humano

Adicionar ação opcional:

`Não reconheço esta cobrança`

Resultado:

- Debt → DISPUTED;
- automações suspensas;
- timeline;
- alerta no painel;
- encaminhar para humano.

Botão tenant:

- Assumir conversa;
- Pausar Bot Cobra;
- Retomar;
- Marcar como pago;
- Registrar pagamento parcial;
- Alterar promessa;
- Cancelar dívida.

Nunca continuar cobrança automática durante `HUMAN_SUPPORT` ou `DISPUTED`.

---

# 9. Dashboard Bot Cobra

## KPIs MVP

- Total em aberto;
- Recuperado no mês;
- Recuperado parcialmente;
- Saldo em negociação;
- Dívidas ativas;
- Promessas para hoje;
- Promessas vencidas;
- PIX aguardando pagamento;
- Taxa de recuperação;
- Valor recuperado pelo bot.

## Lista

Colunas:

- Devedor;
- Origem;
- Descrição;
- Valor original;
- Recebido;
- Saldo;
- Status;
- Régua;
- Próximo contato/promessa;
- Ações.

## Filtros

- status;
- régua;
- origem;
- cliente;
- unidade;
- próxima ação;
- promessa vencida;
- data de vencimento;
- busca por nome/telefone/descrição.

---

# 10. Ficha da dívida

Cabeçalho:

- nome;
- WhatsApp;
- saldo;
- status;
- origem;
- vencimento;
- régua;
- próximo contato.

Se Appointment:

- protocolo;
- serviço;
- profissional;
- data do atendimento;
- abrir agendamento.

Ações:

- Gerar PIX;
- Registrar recebimento;
- Registrar parcial;
- Criar/alterar promessa;
- Pausar/retomar;
- Assumir conversa;
- Marcar contestada;
- Cancelar dívida.

Timeline completa.

---

# 11. Integração com serviço fiado

## No fechamento/conclusão do atendimento

Quando houver saldo > 0, oferecer opção explícita:

`Deixar pendente / cobrar depois`

Campos:

- vencimento;
- régua;
- iniciar Bot Cobra agora ou no vencimento.

Não chamar de “inadimplente” imediatamente.

Status inicial pode ser `OPEN`; o collection engine só começa quando chegar `collectionStartsAt`/dueDate.

## Na página Pendências financeiras

Adicionar ação:

`Iniciar cobrança automática`

Se já existir Debt ativa para aquele Appointment:

`Ver no Bot Cobra`.

---

# 12. Cadastro manual de devedor

Campos MVP:

- nome;
- WhatsApp obrigatório;
- email opcional;
- CPF/documento opcional;
- descrição;
- valor;
- vencimento;
- régua;
- observação;
- unidade opcional;
- vincular Customer existente;
- opcional `Cadastrar também como cliente`.

Não exigir Customer.

---

# 13. Permissões e feature gate

Criar feature comercial:

`collections.bot_cobra.enabled`

ou nomenclatura alinhada ao catálogo atual.

Permissões sugeridas:

- `collection.read`;
- `collection.manage`;
- `collection.payment.manage`;
- `collection.rule.manage`;
- `collection.templates.manage`.

Profissional comum não deve visualizar carteira de devedores por padrão.

---

# 14. Segurança e regras de negócio

- isolamento tenant em todas queries;
- tenantId sempre derivado da sessão;
- WhatsApp normalizado;
- nunca cobrar dívida cancelada/paga;
- nunca cobrar saldo zero;
- promessa futura suspende régua;
- HUMAN_SUPPORT suspende bot;
- DISPUTED suspende bot;
- PIX pending pode suspender novas tentativas por janela configurada;
- webhook de pagamento deve ser idempotente;
- valores sempre em centavos/BigInt;
- nunca confiar em percentual/amount vindo do button payload sem recalcular no backend;
- labels podem ser tenant-editable, action IDs não;
- registrar audit log em operações administrativas importantes.

---

# 15. Roadmap técnico por fases

## Fase 0 — Fundação e decisões finais

Objetivo: fechar contratos antes de migration grande.

- [ ] validar nomes finais dos models/enums;
- [ ] decidir estratégia de `PaymentOriginType.DE BT` (DEBT) e gateway generalizado;
- [ ] decidir cálculo canônico de saldo de Debt;
- [ ] decidir se devedor manual cria Customer opcionalmente;
- [ ] definir feature gate e permissões;
- [ ] definir defaults das 3 réguas;
- [ ] criar schemas shared do domínio;
- [ ] testes unitários das regras puras.

**Critério de saída:** arquitetura aprovada e migrations definidas.

---

## Fase 1 — Debt core

- [ ] enums;
- [ ] `Debt`;
- [ ] `DebtEvent`;
- [ ] `CollectionRule`;
- [ ] migrations;
- [ ] CRUD tenant-scoped;
- [ ] cadastro manual;
- [ ] listagem/detalhe;
- [ ] vincular Customer opcional;
- [ ] criar Debt a partir de Appointment;
- [ ] impedir duplicidade de dívida ativa por Appointment;
- [ ] auditoria;
- [ ] testes de isolamento tenant.

**Critério de saída:** tenant consegue administrar dívidas sem automação.

---

## Fase 2 — Integração com Pendências/Fiado

- [ ] ação em Pendências financeiras;
- [ ] ação ao concluir atendimento com saldo;
- [ ] dueDate / collectionStartsAt;
- [ ] sincronização do saldo com pagamentos do Appointment;
- [ ] “Ver no Bot Cobra”;
- [ ] registrar pagamentos manuais no contexto correto.

**Critério de saída:** dívida de atendimento não duplica o financeiro existente.

---

## Fase 3 — Régua e scheduler

- [ ] `CollectionAttempt`;
- [ ] engine de semanal/quinzenal/mensal/custom;
- [ ] maxAttemptsPerDay;
- [ ] consecutiveDays;
- [ ] pauseDaysAfterCycle;
- [ ] horário permitido;
- [ ] timezone tenant;
- [ ] integração no notification worker;
- [ ] idempotência de materialização;
- [ ] pause/resume/cancel;
- [ ] dashboard de “próximas ações”.

**Critério de saída:** tentativas são agendadas corretamente sem ainda depender de negociação completa.

---

## Fase 4 — Templates e WhatsApp outbound

- [ ] templates Bot Cobra;
- [ ] placeholders;
- [ ] botões actionId whitelist;
- [ ] enqueue via NotificationLog;
- [ ] WhatsAppOutboundMessage ligado à tentativa;
- [ ] retries/dedupe;
- [ ] UI de templates;
- [ ] preview.

**Critério de saída:** cobrança inicial e follow-ups saem automaticamente.

---

## Fase 5 — Conversa e promessa de pagamento

- [ ] actions COLLECTION_*;
- [ ] roteamento inbound;
- [ ] `PaymentPromise`;
- [ ] +1/+3/+7/+10 dias;
- [ ] outra data;
- [ ] suspender régua durante promessa;
- [ ] PROMISE_DUE;
- [ ] PROMISE_OVERDUE;
- [ ] ausência de resposta → tentativa no dia seguinte;
- [ ] HUMAN_SUPPORT;
- [ ] DISPUTED.

**Critério de saída:** Bot cobra e sabe “esperar” o acordo feito.

---

## Fase 6 — PIX integral

- [ ] generalizar PaymentGatewayCharge para Debt;
- [ ] createDebtPixCharge;
- [ ] PIX copia-e-cola;
- [ ] webhook/status;
- [ ] idempotency key por debt/offer;
- [ ] Payment + allocation;
- [ ] saldo zero encerra automação;
- [ ] mensagem de quitação.

**Critério de saída:** devedor paga saldo pelo WhatsApp e dívida fecha automaticamente.

---

## Fase 7 — Negociação inteligente / pagamento parcial

- [ ] partialPaymentEnabled;
- [ ] percentuais tenant-editable;
- [ ] mínimo;
- [ ] arredondamento;
- [ ] cálculo sobre saldo atual;
- [ ] geração PIX parcial;
- [ ] allocation;
- [ ] mensagem saldo remanescente;
- [ ] promessa obrigatoriamente oferecida depois da entrada;
- [ ] métricas de valor recuperado parcialmente.

**Critério de saída:** Bot consegue recuperar caixa mesmo sem quitação integral.

---

## Fase 8 — Dashboard e operação

- [ ] KPIs;
- [ ] lista responsiva;
- [ ] ficha da dívida;
- [ ] timeline;
- [ ] filtros;
- [ ] promessa hoje/vencida;
- [ ] pausar/retomar;
- [ ] assumir conversa;
- [ ] registrar pagamento manual/parcial;
- [ ] relatório de recuperação.

---

## Fase 9 — Hardening

- [ ] concorrência MySQL;
- [ ] locks/idempotência;
- [ ] retries de webhook;
- [ ] carga com muitos tenants;
- [ ] fairness por tenant;
- [ ] limite de mensagens por janela;
- [ ] testes timezone;
- [ ] testes DST onde aplicável;
- [ ] testes de gateway;
- [ ] testes e2e W-API;
- [ ] observabilidade/logs;
- [ ] política de retenção de timeline.

---

# 16. Defaults de produto sugeridos

## Régua semanal

- 1 tentativa por dia;
- 3 dias consecutivos;
- pausa 4 dias;
- reinicia ciclo;
- janela 09:00–18:00;
- parcial habilitado;
- ofertas 20% e 50%;
- promessa rápida +1/+3/+7/+10.

## Régua quinzenal

- 1 tentativa/dia;
- 3 dias consecutivos;
- pausa até completar 15 dias do início do ciclo;
- parcial habilitado.

## Régua mensal

- 1 tentativa/dia;
- 3 dias consecutivos;
- próximo ciclo no mês seguinte;
- parcial habilitado.

> Não usar 3 tentativas/dia como default. Pode existir como opção avançada do tenant.

---

# 17. Decisões que ainda precisam ser fechadas antes da implementação

1. **Generalizar `Payment` para DEBT?**
   - recomendação: sim.

2. **Generalizar `PaymentGatewayCharge` para DEBT?**
   - recomendação: sim, para não duplicar providers/webhook.

3. **Saldo da Debt originada em Appointment:**
   - recomendação: ter vínculo e sincronização com pagamentos canônicos, evitando divergência.

4. **Devedor manual vira Customer automaticamente?**
   - recomendação: não; tornar opcional.

5. **Régua default persistida ou resolvida em código?**
   - recomendação: defaults globais em código + override/cópia tenant.

6. **Data de outra promessa pelo WhatsApp:**
   - decidir formato de captura livre e validação; para MVP, botões rápidos + input textual `DD/MM` com parser seguro.

7. **Feriados:**
   - deixar para evolução; domingos/horário comercial já no MVP.

---

# 18. Fora do MVP

- negociação automática de desconto;
- juros/multa automáticos;
- protesto/Serasa;
- cobrança por voz;
- régua jurídica;
- boleto;
- parcelamento no cartão;
- recorrência bancária;
- IA livre negociando valores;
- scoring de inadimplência;
- feriados nacionais/municipais sofisticados;
- cobrança multicanal completa.

---

# 19. Visão comercial

Nome funcional: **Bot Cobra**.

Proposta de valor:

> “O sistema cobra por você, negocia uma data e tenta recuperar pelo menos uma parte da dívida hoje.”

Possível feature de plano superior:

`Cobrança automática pelo WhatsApp`.

Métricas de valor para venda:

- recuperado pelo bot;
- recuperado parcialmente;
- quantidade de acordos;
- taxa de promessas cumpridas;
- tempo médio para recuperação.

---

# 20. Regra de ouro

O Bot Cobra pode:

- cobrar;
- lembrar;
- oferecer PIX;
- oferecer entrada dentro de regras pré-autorizadas;
- registrar promessa;
- esperar;
- retomar;
- encaminhar ao humano.

O Bot Cobra **não pode** sem autorização explícita:

- dar desconto;
- alterar principal;
- perdoar saldo;
- negociar valor fora da faixa autorizada;
- continuar cobrando dívida contestada;
- continuar cobrando dívida paga;
- cobrar fora das regras/horários definidos.

