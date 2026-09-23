# WhatsApp — propriedade de instâncias

## Regra

Uma chave externa é identificada sempre por `provider + externalInstanceId`.
Ela pertence a um único contexto: tenant ou prospecção. Lead, contato,
conversa e campanha não participam da decisão.

## Auditoria antes de migration

Executar somente leitura no banco alvo:

```sql
SELECT provider, phone_number_id, COUNT(*) AS total
FROM tenant_whatsapp_configs
GROUP BY provider, phone_number_id
HAVING total > 1;

SELECT instance_id, COUNT(*) AS total
FROM prospecting_whatsapp_configs
GROUP BY instance_id
HAVING total > 1;

SELECT t.public_id AS tenant_public_id, c.public_id AS integration_public_id,
       c.provider, c.phone_number_id
FROM tenant_whatsapp_configs c
JOIN tenants t ON t.id = c.tenant_id
WHERE c.provider = 'WAPI';
```

Listar apenas `tenant_public_id`, `integration_public_id`, provider e o
identificador externo necessário para diagnóstico. Nunca exportar tokens,
telefones conectados, payloads ou credenciais.

## Conflito legado tenant/prospecção

Se o mesmo W-API `instance_id` aparecer nos dois contextos, manter a instância
na prospecção e desativar somente o vínculo/configuração W-API do tenant de
teste, após autorização. O inverso é válido quando a evidência operacional
confirmar que o proprietário correto é o tenant.

A limpeza não remove mensagens, leads, conversas, campanhas ou auditoria.
Rollback: reativar/recriar o vínculo com as mesmas credenciais cifradas,
mantendo o histórico intacto.

## Baseline e migrations

O banco local oficial `agendei_integration_test` possui schema legado e não possui
`_prisma_migrations`; `prisma migrate deploy` retorna P3005. Não inserir um
baseline sintético sem confirmar que cada migration histórica está refletida
no schema. Procedimento seguro:

1. obter dump/versão do schema legado;
2. comparar com as migrations históricas;
3. registrar baseline somente após aprovação dessa equivalência;
4. executar as migrations WhatsApp;
5. validar constraints e rollback em cópia do banco.

As validações de escrita existentes retornam HTTP 409 para vínculo duplicado.
Elas devem permanecer acompanhadas por constraint/lock transacional quando o
baseline permitir a alteração do schema.
