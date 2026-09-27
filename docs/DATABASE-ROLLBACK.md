# Rollback de banco do Agendei

Rollback não é `db reset` e não deve apagar dados de produção. Cada migration
precisa de rollback operacional testado em cópia descartável.

1. Interromper a promoção e manter a versão anterior disponível.
2. Preservar logs, checksum e estado de `_prisma_migrations`.
3. Determinar se houve DDL, backfill ou alteração destrutiva.
4. Restaurar backup/checkpoint quando necessário; não improvisar SQL inverso.
5. Validar integridade, constraints e contagens críticas antes de reabrir
   tráfego.

Para as migrations WhatsApp, remover uma unique sem auditar duplicidades não
é rollback seguro; quando houver dados dependentes, usar o checkpoint.
