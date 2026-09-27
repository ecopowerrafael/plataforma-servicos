# Baseline `production-v1`

Esta baseline é um snapshot estrutural, sem dados pessoais, tokens, senhas,
sessões, grants ou credenciais. Foi gerada em 2026-09-17 a partir do banco
autorizado `agendei_integration_test`, depois da aplicação das quatro
migrations WhatsApp e da validação de duplicidades.

## Conteúdo

- MySQL 8.0.46;
- 160 tabelas, incluindo `_prisma_migrations`;
- 1.173 entradas de índices segundo `information_schema.STATISTICS`;
- 332 foreign keys;
- charset/collation `utf8mb4`/`utf8mb4_unicode_ci`;
- nenhuma view, trigger, routine ou event;
- zero `INSERT`, `DEFINER` ou valor de credencial.

As quatro migrations WhatsApp incorporadas são:

- `20260915000001_add_wapi_remote_identity_mapping`;
- `20260915000002_add_prospecting_inbound_idempotency`;
- `20260917000001_add_whatsapp_inbound_provider_idempotency`;
- `20260917000002_add_whatsapp_external_id_uniqueness`.

## Uso controlado

Aplicar somente em banco vazio, após confirmar host, banco e usuário. Em
seguida, registrar a baseline no `_prisma_migrations` com os checksums
definidos pelo manifest e executar apenas migrations posteriores. Bancos
anteriores a esta baseline devem usar o processo de atualização incremental.

O snapshot fonte já continha migrations posteriores no histórico temporal do
repositório; por isso o manifest registra `null` como primeira migration
incremental posterior. Uma nova migration criada depois deste marco deverá
ser o próximo incremento versionado.
