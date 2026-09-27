# Bot Cobra — Status do Projeto

Atualizado em: 20/08/2026

Status geral: **PLANEJAMENTO / ARQUITETURA ESTUDADA — IMPLEMENTAÇÃO NÃO INICIADA**

---

## 1. Objetivo aprovado

Criar um módulo chamado **Bot Cobra** para cobrança e negociação automática de dívidas.

Casos de uso aprovados:

- atendimento/serviço feito fiado;
- saldo não recebido de atendimento existente;
- cadastro manual de novo devedor;
- cobrança semanal, quinzenal ou mensal;
- comportamento interno da régua configurável;
- múltiplas tentativas por dia;
- dias consecutivos de contato;
- pausa e repetição após N dias;
- cobrança por WhatsApp;
- gerar PIX integral;
- agendar promessa de pagamento;
- retomar contato na data prometida;
- follow-up quando não há resposta;
- pagamento parcial/entrada;
- oferecer percentuais do saldo quando cliente pede mais prazo;
- arredondamento das ofertas parciais;
- reduzir saldo progressivamente;
- pedir nova promessa após entrada parcial;
- timeline e dashboard;
- pausar/assumir atendimento;
- contestação da dívida.

---

# 2. Descobertas da arquitetura atual

## 2.1 Já existe módulo de Pendências financeiras

**Status:** REUTILIZÁVEL.

Backend:

- `apps/api/src/modules/payments/delinquency.service.ts`
- `apps/api/src/modules/payments/delinquency.routes.ts`

Frontend:

- `apps/web/src/components/tenants/DelinquencyModule.tsx`

O módulo atual:

- lista saldo aberto de Appointment;
- usa Payment canônico;
- calcula saldo líquido;
- já possui filtros e UI responsiva;
- não possui vencimento;
- não representa “atraso” propriamente dito.

### Decisão

Não substituir o módulo.

Bot Cobra será um domínio adicional e deverá ter ação de entrada a partir de Pendências financeiras.

---

## 2.2 Pagamentos parciais já existem

**Status:** REUTILIZÁVEL COM GENERALIZAÇÃO.

Arquivo principal:

- `apps/api/src/modules/payments/payment.service.ts`

O sistema já permite:

- vários pagamentos por Appointment;
- valores parciais;
- cálculo de saldo;
- validação contra pagamento acima do saldo;
- PaymentMethod;
- cancelamento;
- caixa;
- comissão;
- fidelidade;
- audit log.

### Limitação

`PaymentOriginType` atualmente possui:

- APPOINTMENT;
- MEMBERSHIP_CHARGE.

### Recomendação arquitetural

Adicionar origem `DEBT` e `debtId` nullable ao Payment, em vez de construir um segundo livro-caixa.

**Decisão final ainda pendente antes da migration.**

---

## 2.3 Gateway/PIX já existe

**Status:** REUTILIZÁVEL COM GENERALIZAÇÃO.

Arquivos relevantes:

- `apps/api/src/modules/payments/gateway/payment-gateway.service.ts`
- `apps/api/src/modules/payments/gateway/tenant-payment-options.service.ts`
- providers PIX local / Mercado Pago.

Já existe:

- criação de charge;
- idempotency key;
- PIX copia-e-cola;
- QR Code;
- status de cobrança;
- webhook/eventos;
- integração com Payment.

### Limitação crítica

`PaymentGatewayCharge` hoje exige `appointmentId`.

`TenantPaymentOptionsService.createPixCharge()` também exige Appointment.

### Recomendação

Generalizar charge para `originType` + `appointmentId?` + `debtId?`.

Não criar provider PIX paralelo só para Bot Cobra.

---

## 2.4 NotificationLog/worker já formam uma fila MySQL

**Status:** ALTAMENTE REUTILIZÁVEL.

Arquivos:

- `apps/api/src/modules/notifications/notification-worker.ts`
- `apps/api/src/modules/notifications/notification.service.ts`
- model `NotificationLog`.

Já existe:

- scheduledAt;
- PENDING/PROCESSING/SENT/FAILED/SKIPPED;
- tentativas;
- claim atômico;
- processamento em lote;
- WhatsApp;
- botões persistidos no job;
- worker periódico.

### Recomendação

Adicionar `CollectionEngine.run()` ao worker como produtor de tentativas.

Cada tentativa do Bot Cobra terá `CollectionAttempt.publicId` próprio e poderá materializar um NotificationLog único.

---

## 2.5 Infraestrutura WhatsApp já existe e é madura

**Status:** REUTILIZÁVEL.

Arquivos principais:

- `apps/api/src/modules/integrations/whatsapp-assistant.service.ts`
- `apps/api/src/modules/integrations/whatsapp-assistant.ts`
- `apps/api/src/modules/integrations/whatsapp-action-router.ts`
- `apps/api/src/modules/integrations/integration.repository.ts`

Já existe:

- inbound normalizado;
- dedupe por fingerprint;
- outbound persistido;
- botões com action IDs;
- conversa por tenant + telefone;
- customer lookup pelo telefone;
- HUMAN_SUPPORT;
- session timeout;
- roteamento de ações;
- fluxo completo de agendamento;
- geração PIX no fluxo de agendamento;
- associação de outbound com NotificationLog.

### Recomendação

Adicionar um fluxo `COLLECTION` no assistente e action IDs fixos `COLLECTION_*`.

Não criar webhook W-API paralelo.

---

## 2.6 Customer pode ser reaproveitado, mas não deve ser obrigatório

**Status:** REUTILIZÁVEL.

Customer já possui nome, phone, whatsapp, email e tenant.

### Decisão recomendada

- dívida de atendimento: vincular Customer;
- dívida manual: `customerId` nullable + snapshot do devedor;
- opcionalmente oferecer “Cadastrar/vincular cliente”.

Motivo: não poluir CRM com qualquer devedor externo criado apenas para cobrança.

---

# 3. Arquitetura proposta do Bot Cobra

Models novos planejados:

- `Debt`;
- `CollectionRule`;
- `CollectionAttempt`;
- `PaymentPromise`;
- `DebtPaymentAllocation`;
- `DebtEvent` (recomendado).

Evoluções de models existentes provavelmente necessárias:

- `PaymentOriginType.DE BT` (DEBT);
- `Payment.debtId?`;
- `PaymentGatewayCharge.originType`;
- `PaymentGatewayCharge.appointmentId?`;
- `PaymentGatewayCharge.debtId?`;
- relações em Tenant/Customer/Appointment/Payment conforme necessário.

Nenhuma migration do Bot Cobra foi criada ainda.

---

# 4. Fluxo funcional aprovado

## Cobrança inicial

Bot pergunta se pode gerar PIX ou se cliente precisa de prazo.

## Pagar agora

- PIX do saldo integral;
- confirmação automática;
- abatimento;
- saldo zero encerra Bot Cobra.

## Preciso de mais prazo

Se tenant autoriza negociação parcial:

- Bot oferece percentuais do saldo atual;
- ex.: 20% e 50%;
- valores arredondados;
- mínimo configurável.

Exemplo:

Saldo R$ 500:

- R$ 100 hoje;
- R$ 250 hoje;
- Não consigo pagar nada hoje.

## Entrada parcial

- PIX apenas da entrada;
- após pagamento, saldo é reduzido;
- Bot pergunta próxima data;
- cria promessa;
- suspende régua até a data.

## Sem entrada

- Bot pergunta diretamente uma data.

## Promessa

Opções sugeridas:

- Amanhã;
- +3 dias;
- +7 dias;
- +10 dias;
- Outra data.

## Data prometida

Bot volta a cobrar apenas na data combinada.

## Promessa vencida

- marca promessa vencida;
- inicia mensagem específica;
- permite pagar, nova entrada ou novo prazo.

---

# 5. Régua de cobrança aprovada conceitualmente

Frequências base:

- semanal;
- quinzenal;
- mensal;
- personalizado futuramente.

Parâmetros internos:

- tentativas por dia;
- dias consecutivos;
- horário de início/fim;
- pausa após ciclo;
- repetir após N dias;
- domingos;
- máximo de ciclos opcional.

Configurações de negociação:

- pagamento parcial ativo;
- percentuais oferecidos;
- valor mínimo;
- arredondamento;
- pedir próxima data após entrada;
- quick dates de promessa.

---

# 6. Pontos já decididos

- Bot Cobra terá domínio próprio.
- Não substituir `DelinquencyService`.
- Não duplicar sistema de pagamento.
- Não duplicar providers de gateway.
- Reutilizar NotificationLog/worker para delivery.
- Reutilizar WhatsApp inbound/outbound/action routing.
- Ações técnicas não serão editáveis pelo tenant.
- Tenant pode editar labels e regras permitidas.
- Pagamento parcial entra no MVP.
- Percentuais incidem sobre saldo atual.
- Promessa suspende cobrança normal.
- HUMAN_SUPPORT suspende automação.
- Contestação suspende automação.
- Pagamento total encerra automação.
- Devedor manual não precisa obrigatoriamente virar Customer.

---

# 7. Decisões técnicas pendentes

Antes de começar a Etapa 1, fechar:

1. **Payment generalizado para DEBT**
   - recomendação: aprovar.

2. **PaymentGatewayCharge generalizado**
   - recomendação: aprovar.

3. **Saldo canônico de Debt originada em Appointment**
   - evitar divergência quando o tenant registra pagamento fora do Bot Cobra.

4. **Snapshot x referência de dados do devedor**
   - recomendado: guardar snapshot + link opcional ao Customer.

5. **Feature gate final**
   - sugestão: `collections.bot_cobra.enabled`.

6. **Permissões finais**
   - collection.read/manage/payment/rule/template.

7. **Defaults exatos das réguas**
   - recomendação inicial documentada no roadmap.

---

# 8. Riscos técnicos identificados

## Alto

### Gateway amarrado a Appointment

Exige refactor cuidadoso para não quebrar pagamentos existentes.

### Saldo duplicado

Se Debt mantiver saldo próprio e Appointment continuar recebendo Payment, pode divergir.

Precisamos definir fonte canônica/sincronização antes de implementação.

### Concorrência

Webhook + pagamento manual + worker podem atualizar a mesma dívida simultaneamente.

Precisará de transação/lock/idempotência.

## Médio

### NotificationLog unique key

Uma dívida precisa de muitas mensagens. Cada `CollectionAttempt` deve ser target único.

### Conversa normal x cobrança

Bot Cobra precisa conviver com `MAIN_MENU`, BOOKING e HUMAN_SUPPORT sem sequestrar a conversa errada.

### Promessas repetidas

Uma nova promessa deve substituir/cancelar a anterior de forma auditável.

---

# 9. Próxima etapa recomendada

**Não começar pela UI.**

Próximo passo:

### Fase 0 — desenho final do domínio e contratos

Produzir e aprovar:

- schema Prisma proposto;
- enums;
- relações;
- política de saldo;
- política de Payment/PaymentGatewayCharge;
- schemas Zod/shared;
- actions COLLECTION_*;
- regras puras de cálculo de régua e pagamento parcial.

Depois:

### Fase 1 — Debt Core

CRUD de dívida + régua, ainda sem mensagens automáticas.

---

# 10. Estado do código

Nenhum arquivo do Bot Cobra foi alterado neste estudo.

Nenhum commit/push foi realizado para o Bot Cobra.

Este documento representa somente:

- definição de produto;
- estudo da arquitetura existente;
- decisões propostas;
- riscos;
- roadmap de implementação.

