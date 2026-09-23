# WhatsApp Provider Architecture Baseline

Este baseline registra a separacao entre "WhatsApp do Agendei" e provider.
`WAPI` continua sendo o default para tenants sem configuracao; `META` fica registrado por adapter proprio; providers desconhecidos continuam falhando com `WHATSAPP_PROVIDER_NOT_SUPPORTED`, sem fallback silencioso para W-API.

## Fluxos W-API atuais

- Configuracao tenant manual: `GET /tenant/integrations/whatsapp`, `PUT /tenant/integrations/whatsapp`
- Provisionamento tenant por QR: `GET /tenant/integrations/whatsapp/status`, `POST /tenant/integrations/whatsapp/instance`, `POST /tenant/integrations/whatsapp/qr`, `POST /tenant/integrations/whatsapp/reconnect`, `POST /tenant/integrations/whatsapp/disconnect`
- Diagnostico tenant: `POST /tenant/integrations/whatsapp/test`, `POST /tenant/integrations/whatsapp/control-test`, `POST /tenant/integrations/whatsapp/button-test`, `POST /tenant/integrations/whatsapp/webhook-config`, `GET /tenant/integrations/whatsapp/diagnostics`, `GET /tenant/integrations/whatsapp/last-event`
- Assistant config tenant: rotas registradas por `whatsappAssistantConfigRoutes`
- Selecao tenant de provider: `GET /tenant/integrations/whatsapp/providers`, `PUT /tenant/integrations/whatsapp/provider`
- Webhook W-API legado preservado: `POST /public/integrations/whatsapp/webhook`
- Webhook W-API explicito: `POST /webhooks/whatsapp/wapi` e `POST /public/webhooks/whatsapp/wapi`
- Novas configuracoes W-API registram a URL canonica `/webhooks/whatsapp/wapi`; o caminho legado fica apenas como compatibilidade.
- Webhook Meta explicito: `GET|POST /webhooks/whatsapp/meta` e `GET|POST /public/webhooks/whatsapp/meta`
- Platform/support: `GET /platform/tenants/:tenantPublicId/whatsapp`, `PUT /platform/tenants/:tenantPublicId/whatsapp`, `POST /platform/tenants/:tenantPublicId/whatsapp/test`
- Platform W-API master config: `GET /platform/settings/wapi`, `PUT /platform/settings/wapi`, `POST /platform/settings/wapi/test`

## Pontos acoplados ao provider

- `WApiWhatsAppDelivery`: implementa envio simples, envio com botoes, teste de conexao, webhooks da instancia, diagnostico e controle.
- `WApiIntegrationService`: cria instancia, le QR, le status, le device e desconecta.
- `normalizeWApiWebhook`: transforma payload W-API em `NormalizedWhatsAppEvent`.
- `WhatsAppProvisioningService`: provisiona e controla a conexao usando `WApiIntegrationService`.
- `WhatsAppConnectionService`: camada tenant acima do resolver; delega conexao/status/desconexao ao provider e expõe capabilities sem obrigar QR em todos os providers.
- `IntegrationService.ingestWhatsappInbound`: preserva o webhook W-API legado, mas no fluxo tenant normaliza pelo provider configurado.
- `IntegrationService.ingestWhatsappInboundForProvider`: recebe webhooks explicitos, como `META`, sem heuristica por formato de JSON.
- `ProviderResolvedWhatsAppDelivery`: faz notifications, jobs, assistant e diagnosticos enviarem pelo provider do tenant.
- `database/connection.ts`: instancia adapters W-API e Meta, registra ambos no resolver e injeta a fachada provider-aware nos consumidores.
- `WhatsAppProviderResolver`: seleciona adaptadores por `TenantWhatsAppConfig.provider` e aceita providers adicionais registrados, validando a arquitetura para um terceiro provider.
- `MetaWhatsAppClient`: centraliza chamadas HTTP Graph API.
- `MetaWhatsAppDelivery`: envia texto e botoes interativos no formato Meta Cloud API.
- `MetaWhatsAppConnection`: valida credenciais/status e desconecta/desativa localmente.
- `MetaInboundNormalizer`: normaliza texto, botoes e status Meta para `NormalizedWhatsAppEvent`.

## Segurança Meta

- `GET /webhooks/whatsapp/meta`: responde challenge apenas quando `hub.verify_token` bate com `META_WHATSAPP_VERIFY_TOKEN`.
- `POST /webhooks/whatsapp/meta`: valida `x-hub-signature-256` quando `META_WHATSAPP_APP_SECRET` esta configurado.
- A assinatura Meta e calculada sobre o corpo bruto recebido, antes da normalizacao JSON.
- O tenant nunca vem de `tenantId` externo; o roteamento usa identificador conhecido da conta/telefone (`phone_number_id`) para localizar `TenantWhatsAppConfig`.
- Payload sem correspondencia local retorna `INSTANCE_UNKNOWN`; provider diferente do configurado retorna `PROVIDER_MISMATCH`.

## Baseline de regressao

Coberturas protegidas pela suite focada:

- leitura da configuracao: `integration-whatsapp-admin.test.ts`, `whatsapp-provisioning.test.ts`
- envio simples: `whatsapp-baseline.contract.test.ts`, `whatsapp-connection.test.ts`
- envio com botao: `notification.service.idempotency.test.ts`, `whatsapp-provisioning.test.ts`
- webhook inbound: `whatsapp-inbound.test.ts`
- status de mensagem: `whatsapp-inbound.test.ts`
- criacao de conversa: `whatsapp-baseline.contract.test.ts`, `whatsapp-assistant.test.ts`
- reconexao: `whatsapp-provisioning.test.ts`
- QR: `whatsapp-provisioning.test.ts`
- desconexao: `whatsapp-provisioning.test.ts`
- isolamento entre tenants: `whatsapp-baseline.contract.test.ts`, `integration.service.ts`, `whatsapp-provider-resolver.test.ts`
- configuracao do assistente: `whatsapp-assistant-config.test.ts`, `whatsapp-assistant-config.integration.test.ts`
- webhook Meta verification/signature: `whatsapp-webhook.routes.test.ts`
- provider stub/terceiro provider: `whatsapp-provider-resolver.test.ts`
- fachada provider-aware para notifications/jobs/assistant/diagnosticos: `whatsapp-provider-delivery.test.ts`

## Comandos de baseline

```bash
npm run test --workspace=@plataforma/api -- whatsapp-provider-resolver.test.ts whatsapp-provider-delivery.test.ts whatsapp-webhook.routes.test.ts whatsapp-connection.service.test.ts whatsapp-baseline.contract.test.ts integration-collection-routing.test.ts whatsapp-inbound.test.ts notification.service.idempotency.test.ts whatsapp-assistant.test.ts meta-whatsapp-inbound.test.ts meta-whatsapp-delivery.test.ts
npm run db:generate
npm run build:shared
npm run build:api
npm run build:web
npm start
```

Ultima validacao focada local: 11 arquivos, 107 testes verdes.

Observacao: a suite completa `npm test --workspace=@plataforma/api` ainda depende de ambiente MySQL/migrations/testes antigos e falhou fora deste pacote, por exemplo com coluna `users.google_sub` ausente no banco local e testes instanciando `PrismaClient()` sem adapter.
