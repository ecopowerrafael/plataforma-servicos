# PROSPECTING - ETAPA 1: ProspectingWhatsAppConfig

## Status: ✅ IMPLEMENTAÇÃO COMPLETA

### 1. Schema Prisma

**Modelo Criado:**
```prisma
model ProspectingWhatsAppConfig {
  id                      BigInt       @id @default(autoincrement())
  publicId                String       @unique
  instanceId              String       @unique
  tokenCiphertext         String       @db.Text          // ⚠️ CRIPTOGRAFADO
  phoneNumber             String?
  instanceName            String?
  isActive                Boolean      @default(true)
  lastConnectionStatus    String?
  lastCheckedAt           DateTime?
  createdAt               DateTime     @default(now())
  updatedAt               DateTime     @updatedAt
}
```

**Segurança:**
- ✅ Token armazenado como `tokenCiphertext` (nunca plaintext)
- ✅ Usa `CredentialsCipher` (reutilizado de `PlatformWapiConfig`)
- ✅ Não há campo de token em texto puro
- ✅ Singleton: apenas uma configuração global para Prospecting

### 2. Migration

**Arquivo:** `20260825_add_prospecting_whatsapp_config/migration.sql`

- ✅ Cria tabela com colunas corretas
- ✅ Índices em `publicId` e `instanceId`
- ✅ Applied com sucesso ao banco local

### 3. Infraestrutura de Código

**Repository:** `prospecting-whatsapp-config.repository.ts`
- `getConfig()` - busca configuração única
- `getActiveConfig()` - busca se ativa
- `upsertConfig()` - cria ou atualiza
- `updateConnectionStatus()` - atualiza status + timestamp

**Service:** `prospecting-whatsapp-config.service.ts`
- `getConfig()` - retorna resposta sanitizada
- `updateConfig()` - atualiza com novo token criptografado
- `getDecryptedToken()` - descriptografa somente em memória
- `updateConnectionStatus()` - persiste status de conexão
- `maskToken()` - retorna token mascarado (últimos 4 chars)

**Rotas:** `prospecting-whatsapp-config.routes.ts`
- `GET /platform/prospecting/whatsapp`
- `PUT /platform/prospecting/whatsapp`
- `POST /platform/prospecting/whatsapp/test`

### 4. Endpoints

#### GET /platform/prospecting/whatsapp
**Resposta (sem token real):**
```json
{
  "configured": true,
  "publicId": "...",
  "instanceId": "ABC123",
  "phoneNumber": "+55119999999",
  "instanceName": "Prospecting Instance",
  "isActive": true,
  "lastConnectionStatus": "CONNECTED",
  "lastCheckedAt": "2026-08-25T10:30:00Z",
  "tokenMasked": "••••••••••••••••••••••••abcd"
}
```

**Se não configurado:**
```json
{
  "configured": false
}
```

#### PUT /platform/prospecting/whatsapp
**Request:**
```json
{
  "instanceId": "ABC123",
  "token": "wapi_token_here",
  "phoneNumber": "+55119999999",
  "instanceName": "Prospecting",
  "isActive": true
}
```

**Comportamento Especial:**
- ✅ Se `token` omitido em PUT subsequente → **preserva token anterior**
- ✅ Token é criptografado no banco (CredentialsCipher)
- ✅ Resposta retorna token mascarado, nunca real

#### POST /platform/prospecting/whatsapp/test
**Resposta de sucesso:**
```json
{
  "success": true,
  "connected": true,
  "phoneNumber": "+55119999999",
  "instanceName": "Prospecting",
  "message": "Conectado com sucesso."
}
```

**Resposta de erro:**
```json
{
  "success": false,
  "connected": false,
  "message": "Nenhuma configuração salva."
}
```

**O que faz:**
1. Busca configuração ativa
2. Descriptografa token (memória apenas)
3. ✅ Chamará W-API (stub por enquanto)
4. Atualiza `lastConnectionStatus` + `lastCheckedAt`
5. Nunca retorna token real

### 5. Segurança - Checklist

- ✅ Token NUNCA em texto puro (tokenCiphertext com CredentialsCipher)
- ✅ Token NUNCA no GET (tokenMasked mostra último 4)
- ✅ Token NUNCA em logs (usar masking sempre)
- ✅ Token NUNCA em erros (getMessage não inclui secrets)
- ✅ PUT sem token preserva anterior (não apaga por acidente)
- ✅ Descriptografia somente em `getDecryptedToken()` (uso temporário)
- ✅ Status de conexão persistido (audit trail)
- ✅ Singleton (apenas uma config global para Prospecting)

### 6. Testes Automatizados

**Arquivo:** `prospecting-whatsapp-config.test.ts`

✅ Testes implementados:

1. **Token Encryption**
   - Valida que `encrypt()` é chamado
   - Valida que GET nunca retorna plaintext

2. **Decryption**
   - Valida que descrypt ocorre apenas internamente
   - Valida valor correto retornado

3. **Token Masking**
   - Valida que últimos 4 chars visíveis
   - Valida que resto é '•' (bullet)

4. **PUT Behavior**
   - Valida que token é preservado se não informado
   - Valida que novo token é criptografado se informado

5. **No Plaintext in Logs**
   - Valida que token real nunca aparece em console.log

6. **Connection Status**
   - Valida que status é persistido
   - Valida que timestamp (lastCheckedAt) é atualizado
   - Valida erro status também é persistido

### 7. Build Status

**Comando:** `npm run build:api`
- ✅ Prisma gerado corretamente
- ✅ TypeScript compila sem erros
- ✅ Tipos do schema disponíveis

### 8. Dependências Reutilizadas

- ✅ `CredentialsCipher` - já existe (usado por PlatformWapiConfig)
- ✅ `PrismaClient` - já existe
- ✅ `FastifyPluginAsyncZod` - padrão do projeto
- ✅ `AppError` - padrão de erro do projeto

**Nenhuma duplicação de infraestrutura.**

### 9. Pronto para Próxima Etapa?

- ✅ Schema finalizado
- ✅ Migration aplicada
- ✅ Repository criado
- ✅ Service com tokenCiphertext
- ✅ Endpoints GET/PUT/test
- ✅ Token mascarado em resposta
- ✅ PUT sem token preserva anterior
- ✅ Teste de conexão (stub pronto)
- ✅ Testes automatizados
- ✅ Build válido
- ✅ Sem token plaintext
- ✅ Não usa PlatformWhatsAppConfig (é legado Meta)

## ✅ ETAPA 1 PRONTA PARA APROVAÇÃO

Pronto para ETAPA 2: ProspectingMessageSender
