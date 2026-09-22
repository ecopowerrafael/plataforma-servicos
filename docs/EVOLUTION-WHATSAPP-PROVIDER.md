# Evolution GO — primeira etapa

Implementação na branch `feat/evolution-whatsapp-provider`.

## Commit

- `51fb201` — foundation do provider Evolution GO.

## Arquitetura

- `WhatsAppProviderResolver` continua sendo a fonte central de resolução.
- `TenantWhatsAppSettings.selectedProvider` continua definindo o provider ativo.
- A configuração global usa `platform_whatsapp_provider_settings`.
- A API key Evolution é cifrada em `encrypted_api_key` e nunca é persistida em configuração tenant.
- W-API permanece no código e na tabela existente; a migration inicial a deixa indisponível para nova seleção.

## Disponibilidade

O backend retorna apenas providers habilitados para nova seleção. Se o provider já selecionado for desabilitado, ele continua retornado para gerenciamento. Nenhuma troca automática ou desconexão é executada.

Defaults da migration:

- EVOLUTION: habilitado
- META: habilitado
- WAPI: desabilitado

Rotas administrativas:

- `GET /platform/settings/whatsapp/providers`
- `PUT /platform/settings/whatsapp/providers/:provider`
- `POST /platform/settings/whatsapp/providers/:provider/test`

## Evolution usada

O client usa somente a API server-side e o header `apikey`. Foram implementados os endpoints internos necessários ao fluxo desta etapa:

- `POST /instance/create`
- `GET /instance/all` (health check administrativo)
- `GET /instance/qr`
- `GET /instance/status`
- `POST /instance/disconnect`
- `POST /instance/reconnect`
- `POST /send/text`

`POST /instance/create` usa a GLOBAL_API_KEY e envia um token aleatório único no body. O token é cifrado em `tenant_whatsapp_configs.encrypted_access_token`. QR, status, disconnect, reconnect e envio usam somente esse token no header `apikey`. O health check administrativo usa GLOBAL_API_KEY em `/instance/all`.

As respostas `data`, `Qrcode` e `Code` são normalizadas pelo client.

## Escopo deliberadamente adiado

- inbound/webhooks completos;
- botões/listas Evolution;
- assistant completo;
- fallback entre providers;
- integração com prospecção.

## Verificação

- API typecheck: aprovado.
- Frontend build: aprovado.
- Testes client/provisionamento/resolver/conexão: aprovados.

## Risco pendente

A tag privada `ecopowerrafael/evolution-go-agendei:agendei-evolution-0.7.2-interactive.1` não ficou acessível pelo ambiente para inspeção direta. Os nomes de endpoints e formatos tratados foram conferidos contra a referência pública Evolution GO 0.7.x, mas a confirmação final dessa build específica ainda requer acesso ao repositório/tag ou Swagger correspondente.
