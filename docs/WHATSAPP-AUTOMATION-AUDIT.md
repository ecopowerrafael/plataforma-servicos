# Auditoria do atendimento automático WhatsApp

## Estado da auditoria

- Branch: `feat/evolution-whatsapp-provider`
- Commit base: `ce7feea115d11e2e57352aff3c56c46c6ab694af`
- O diretório não rastreado `evolution-integration-candidate/` já existia e foi preservado.
- A atualização de referências remotas foi tentada, mas o ambiente não permitiu gravar `.git/FETCH_HEAD`; nenhum arquivo do repositório foi sobrescrito.
- Evolution GO, Meta, W-API e os contratos externos dos providers ficam fora do escopo da alteração.

## Fluxo atual

1. **Entrada inbound**: as rotas públicas em `apps/api/src/modules/integrations/whatsapp-webhook.routes.ts` recebem W-API, Meta e Evolution. O provider normaliza o payload e `IntegrationService` faz o roteamento por instância/tenant.
2. **Persistência e deduplicação**: `IntegrationService.processTenantWhatsappInbound` verifica `WhatsAppInboundEvent` por fingerprint/chave do evento e persiste o inbound antes de executar automação. Mensagens, payload original, telefone, tipo e `actionId` resolvido são preservados.
3. **`actionId`**: para ações interativas, `resolveActionId` mantém IDs diretos do menu/fluxo e consulta a mensagem outbound referenciada para resolver ações contextuais. O contrato de ButtonClick/list response não é alterado.
4. **Decisão do bot**: `WhatsAppAssistantService.handleInbound` ignora status, mensagens próprias, grupos, clientes sem telefone, tenants sem entitlement e atendimento humano. Para conversa nova, cria a conversa e envia saudação/menu; para conversa existente, atualiza estado e roteia a ação/texto no fluxo atual.
5. **Saudação/menu e fallback**: `sendGreetingWithMenu`, `dispatchButtons`, `dispatchCustomButtons` e `dispatchText` estão em `whatsapp-assistant.service.ts`; `FALLBACK_PROMPT` e os IDs do menu estão em `whatsapp-assistant.ts`.
6. **Envio automático**: `dispatch*` usa a abstração `WhatsAppDelivery`; `trackOutbound` persiste `WhatsAppOutboundMessage` e atualiza `WhatsAppConversation.lastOutboundAt`.
7. **Conversa e última resposta**: `IntegrationRepository` busca a conversa por tenant + telefone e atualiza `lastInboundAt`, `lastOutboundAt`, status, fluxo, etapa e contexto JSON. Diagnóstico administrativo expõe última conversa, último inbound e último outbound.

## Dados e domínio já reutilizáveis

- Serviços, combos, profissionais e preços: usados pelo fluxo de criação de agendamento no `WhatsAppAssistantService`, apoiado pelos serviços de appointments/professionals.
- Disponibilidade: `AvailabilityService` já é injetado no assistant.
- Pagamentos e formas aceitas: `TenantPaymentOptionsService` e `PaymentService` já são injetados e usados no fluxo de pagamento.
- Agendamentos, cancelamento e reagendamento: já possuem etapas e confirmações por `actionId` no assistant, sem necessidade de duplicar regras.
- Conversas: `WhatsAppConversation` guarda estado e contexto, mas as mensagens inbound/outbound são as tabelas de eventos/mensagens; não existe hoje um buffer de texto livre dedicado.

## Concorrência e agendamento existentes

- A deduplicação de eventos inbound é persistente e protegida por chave única, evitando processamento duplicado do mesmo evento.
- Não foi localizado worker/debounce reutilizável para respostas do assistant tenant. O fluxo atual chama o assistant durante o processamento do inbound e envia na mesma execução.
- A implementação do intervalo deverá introduzir um estado persistente por conversa e um job/reprocessamento idempotente por conversa, sem `sleep`, `setTimeout` solto ou request HTTP mantido aberto.

## Estratégia aprovada para a próxima etapa

- Reutilizar `WhatsAppConversation` para `lastAutomatedReplyAt`/estado pendente somente se isso puder ser feito sem ambiguidade; caso contrário, criar uma tabela específica de jobs pendentes por conversa.
- Manter inbound sempre persistido e fazer o gate apenas antes do envio automático.
- Usar lock/idempotência persistente por conversa para que várias mensagens durante a janela resultem em no máximo uma resposta.
- Adicionar `responseIntervalSeconds` nas configurações existentes de WhatsApp do tenant, com valor padrão `0`, sem executar migrations em produção.
- Criar `TextInterpreter` puro, local e provider-agnostic, recebendo texto/mensagens e contexto, para ser chamado somente quando não houver `actionId` válido; o resultado será adaptado aos fluxos atuais.

## Implementação desta etapa

- `responseIntervalSeconds` fica no `assistantConfig` existente, com default `0` e validação entre 0 e 3600 segundos.
- O inbound grava `pendingReplyAt` e `pendingReplyEventId` quando a última resposta automática ainda está dentro da janela.
- O worker de notificações e o comando `worker:once` chamam `processPendingWhatsappReplies`.
- O claim usa `replyProcessingAt`/`replyProcessingToken` e `UPDATE` condicional, evitando duas respostas para a mesma conversa em workers concorrentes.
- O worker agrupa textos inbound desde a última resposta e entrega o texto combinado ao assistant; os eventos originais continuam intactos.
- A migration `20260929000000_add_whatsapp_reply_debounce` foi criada nos diretórios de migration usados pelos comandos legados e v2, mas não foi aplicada.
- O interpretador já é usado quando não existe `actionId`: BOOKING, AVAILABILITY, CANCEL, RESCHEDULE, BOOKING_QUERY, PRICE_QUERY e PAYMENT_METHODS aproveitam métodos/serviços existentes. Disponibilidade abre a etapa existente de seleção de serviço antes dos slots; pagamento nunca é confirmado por texto.
