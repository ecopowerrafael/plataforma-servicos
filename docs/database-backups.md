# Backup, restauração e retenção do banco MySQL

## Pré-requisitos

- Node.js 20.20+
- npm 10.8+
- MySQL 8.x com cliente `mysqldump` e `mysql` disponíveis no `PATH`
- acesso às variáveis de ambiente do projeto e ao banco de destino
- diretório de backup com permissões de escrita para o processo

## Variáveis e configuração

Copie `.env.example` para `.env` e ajuste os valores. Os nomes relevantes são:

```env
DATABASE_URL=mysql://USER:PASSWORD@127.0.0.1:3306/plataforma_servicos?connection_limit=10
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=USER
MYSQL_PASSWORD=PASSWORD
MYSQL_DATABASE=plataforma_servicos
MYSQL_BACKUP_DIR=backups/mysql
MYSQL_BACKUP_RETENTION_DAYS=30
```

A aplicação usa `DATABASE_URL` sempre que possível. O módulo de backup não grava a senha em logs e usa `MYSQL_PWD` apenas como variável de ambiente do processo filho, evitando concatenação de strings em comandos.

## Criação de backup

```bash
npm run db:backup --workspace=@plataforma/api
```

O script:

- cria o diretório configurado quando não existe;
- usa `mysqldump` com argumentos separados;
- gera um nome no formato `backup-YYYY-MM-DD-HHMMSS.sql`;
- falha com código diferente de zero se `mysqldump` não estiver disponível ou se houver erro no processo.

Exemplo de arquivo gerado:

```text
backups/mysql/backup-2026-08-08-153000.sql
```

## Escolha do diretório de backup

A variável `MYSQL_BACKUP_DIR` controla o destino. O valor pode ser relativo ao diretório do projeto ou absoluto. O diretório é criado automaticamente.

```env
MYSQL_BACKUP_DIR=backups/mysql
```

## Restauração manual

```bash
npm run db:restore --workspace=@plataforma/api -- --file backups/mysql/backup-2026-08-08-153000.sql --confirm
```

Regras:

- o caminho do arquivo deve ser informado explicitamente;
- o arquivo precisa existir;
- a operação exige confirmação explícita antes de restaurar;
- a senha do banco não é impressa em log;
- qualquer erro no cliente `mysql` aborta a operação imediatamente.

> O comando não escolhe um backup automaticamente e não roda silenciosamente.

## Retenção de backups

### Dry-run

```bash
npm run db:backup:retain --workspace=@plataforma/api -- --dry-run --days=30
```

Esse modo só informa quais arquivos seriam removidos. Nada é excluído.

### Aplicação real

```bash
npm run db:backup:retain --workspace=@plataforma/api -- --days=30
```

A retenção:

- usa apenas arquivos reconhecidos pelo padrão do sistema;
- ignora arquivos fora do diretório configurado;
- remove somente arquivos de backup antigos;
- trata erros de filesystem e informa os problemas.

## Procedimentos de segurança

- não expor a senha em logs ou mensagens de erro;
- nunca concatenar valores externos em strings de shell;
- usar argumentos separados em `spawnSync`;
- validar caminho do arquivo para impedir `path traversal`;
- não aceitar restauração automática sem confirmação;
- usar `MYSQL_PWD` como variável do processo filho;
- não capturar `DATABASE_URL` em logs ou mensagens de erro.

## Recuperação em caso de desastre

1. confirme o diretório de backup e a última cópia válida;
2. verifique a integridade do arquivo `.sql`;
3. restaure a base em uma instância descartável ou em um banco de staging;
4. valide a importação, a aplicação e a consistência dos dados;
5. só então substitua a produção.

## Limitações conhecidas

- depende da presença dos clientes `mysqldump` e `mysql` no ambiente;
- a restauração é bloqueada em ambiente de produção se a confirmação não for fornecida;
- arquivos fora do diretório de backup não são considerados para limpeza;
- backups antigos são identificados somente por nome seguindo o padrão da ferramenta.

## Observações de operação

- os nomes são timestampados para evitar sobrescrita;
- a limpeza não é aplicada ao diretório global do sistema;
- a implementação foi desenhada para funcionar em Windows e Linux sempre que os clientes do MySQL estiverem instalados e acessíveis no `PATH`.
