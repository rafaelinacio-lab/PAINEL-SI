# 🏗️ Arquitetura do Sistema de Autenticação

## Diagrama de Banco de Dados

```
┌─────────────────────────────────────────────────────────────────┐
│                      SISTEMA DE AUTENTICAÇÃO                     │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│      roles           │
├──────────────────────┤
│ id (PK)              │
│ name (UNIQUE)        │
│ description          │
│ permissions (JSON)   │
│ createdAt            │
└──────────┬───────────┘
           │
           │ (1:N)
           │
┌──────────▼────────────────────────┐
│         users                      │
├────────────────────────────────────┤
│ id (PK)                            │
│ email (UNIQUE)                     │
│ name                               │
│ password_hash (PBKDF2-SHA512)     │
│ role_id (FK → roles)               │
│ is_active                          │
│ first_access                       │
│ failed_login_attempts              │
│ locked_until                       │
│ last_login                         │
│ created_at                         │
│ updated_at                         │
└──────────┬─────────────────────────┘
           │
      ┌────┴────┬──────────────┐
      │          │              │
      │ (1:1)    │ (1:1)        │ (1:N)
      │          │              │
   ┌──▼─────┐  ┌─▼────────────────────┐  ┌─▼──────────────────┐
   │mfa_    │  │ password_            │  │  sessions          │
   │settings│  │ resets               │  │                    │
   ├────────┤  ├──────────────────────┤  ├────────────────────┤
   │id (PK) │  │ id (PK)              │  │ id (PK)            │
   │user_id │  │ user_id              │  │ user_id (FK)       │
   │mfa_    │  │ token (UNIQUE)       │  │ token (UNIQUE)     │
   │type    │  │ expires_at           │  │ ip_address         │
   │totp_   │  │ used                 │  │ user_agent         │
   │secret  │  │ created_at           │  │ expires_at         │
   │backup_ │  │                      │  │ created_at         │
   │codes   │  │                      │  │                    │
   │is_     │  │                      │  │                    │
   │enabled │  │                      │  │                    │
   │verified│  │                      │  │                    │
   │_at     │  │                      │  │                    │
   └────────┘  └──────────────────────┘  └────────────────────┘

┌───────────────────────────────────┐
│       access_logs                 │
├───────────────────────────────────┤
│ id (PK)                           │
│ user_id (FK → users) [NULLABLE]  │
│ action (login, logout, etc)       │
│ resource                          │
│ ip_address                        │
│ success                           │
│ details                           │
│ created_at                        │
└───────────────────────────────────┘
```

---

## Fluxo de Autenticação

```
┌─────────────────────────────────────────────────────────────┐
│                   PRIMEIRO LOGIN                             │
└─────────────────────────────────────────────────────────────┘

1. Usuário recebe:
   Email: usuario@example.com
   Senha: ABC123DEF456 (gerada pelo Admin)
   ↓
2. POST /api/auth/login
   {email, password}
   ↓
3. Validar email/senha
   └─→ ❌ Falhou → Incrementar tentativas → Bloquear se 5+
   └─→ ✅ Ok → Continuar
   ↓
4. Verificar MFA habilitado
   ├─→ ❌ Não → Criar sessão 24h → Retornar token
   └─→ ✅ Sim → Criar sessão temporária 10min → Retornar tempToken
   ↓
5. POST /api/auth/verify-mfa
   {tempToken, code}
   ├─→ TOTP válido → Criar sessão permanente
   ├─→ Backup code válido → Marcar como usado → Criar sessão
   └─→ Inválido → Erro 401
```

---

## Fluxo de Primeiro Acesso

```
┌────────────────────────────────────────────────────┐
│         PRIMEIRO ACESSO - MUDANÇA DE SENHA         │
└────────────────────────────────────────────────────┘

1. User logado com first_access: true
   ↓
2. POST /api/auth/first-access
   {
     email,
     initialPassword,  ← senha recebida
     newPassword       ← senha forte definida
   }
   ↓
3. Validar initialPassword (deve ser hash correto)
   ↓
4. Validar newPassword (força mínima)
   ├─→ 8+ caracteres
   ├─→ 1+ maiúscula
   ├─→ 1+ minúscula
   ├─→ 1+ número
   └─→ 1+ caractere especial
   ↓
5. Gerar novo hash com PBKDF2-SHA512
   ↓
6. UPDATE user SET password_hash = ?, first_access = 0
   ↓
7. Próximo passo: Configurar MFA
```

---

## Fluxo de MFA Setup

```
┌─────────────────────────────────────────────┐
│    CONFIGURAÇÃO DE AUTENTICAÇÃO 2FA         │
└─────────────────────────────────────────────┘

1. POST /api/auth/setup-mfa
   Headers: Authorization: Bearer <token>
   ↓
2. Gerar segredo TOTP (Base32, 32 bytes)
   ↓
3. Gerar QR Code (otpauth://...)
   ↓
4. Retornar:
   {
     qrCode: "data:image/png;base64,...",
     secret: "JBSWY3DPEBLW64TMMQ...",
     message: "Escaneie o código QR"
   }
   ↓
5. Usuário escaneia com:
   • Google Authenticator
   • Microsoft Authenticator
   • Authy
   • 1Password
   • Etc...
   ↓
6. POST /api/auth/verify-and-enable-mfa
   {code: "123456"}  ← código 6 dígitos
   ↓
7. Validar TOTP
   └─→ ❌ Inválido → Erro 401
   └─→ ✅ Válido → Continuar
   ↓
8. Gerar 10 Backup Codes
   Formato: XXXX-XXXX (8 caracteres aleatórios)
   ↓
9. UPDATE mfa_settings
   SET is_enabled = 1,
       backup_codes = JSON,
       verified_at = NOW()
   ↓
10. Retornar:
    {
      message: "MFA ativado",
      backupCodes: [...],
      warning: "Guarde em local seguro!"
    }
```

---

## Fluxo de Login com MFA

```
┌──────────────────────────────────────────────┐
│   LOGIN SUBSEQUENTE COM MFA ATIVADO          │
└──────────────────────────────────────────────┘

1. POST /api/auth/login
   {email, password}
   ↓
2. Validar credenciais
   ├─→ ❌ Inválidas → +1 tentativa → Bloquear se 5+
   └─→ ✅ Válidas → Continuar
   ↓
3. Verificar MFA ativo
   ├─→ Não → Retornar token permanente
   └─→ Sim → Continuar
   ↓
4. Criar sessão temporária (10 min)
   ↓
5. Retornar:
   {
     requiresMFA: true,
     tempToken: "abc123...",
     message: "Forneça código MFA"
   }
   ↓
6. POST /api/auth/verify-mfa
   {tempToken, code}
   ↓
7. Validar código (TOTP ou Backup)
   ├─→ ❌ Inválido → Erro 401
   └─→ ✅ Válido → Continuar
   ↓
8. Se Backup Code:
   └─→ Marcar como usado (used: true)
       Atualizar JSON de backup_codes
   ↓
9. Deletar sessão temporária
   ↓
10. Criar sessão permanente (24h)
    ↓
11. Retornar:
    {
      token: "abc123...",
      user: {id, email, name, roleId}
    }
```

---

## Fluxo de Controle de Acesso

```
┌──────────────────────────────────────────┐
│    AUTORIZAÇÃO POR ROLE (RBAC)           │
└──────────────────────────────────────────┘

Requisição:
  GET /api/users
  Authorization: Bearer <token>
  ↓
1. authMiddleware
   ├─→ Extrair token do header
   ├─→ Buscar sessão válida (não expirada)
   ├─→ ❌ Não encontrada → 401
   └─→ ✅ Válida → Carregar req.user
   ↓
2. requireRole(['admin', 'supervisor'])
   ├─→ SELECT role FROM users WHERE id = ?
   ├─→ ❌ Role não está na lista → 403
   └─→ ✅ Role autorizado → next()
   ↓
3. Handler executa
   ↓
4. Retornar dados
```

---

## Matriz de Permissões

```
┌─────────────────────┬────────┬───────────┬──────────┐
│ Recurso/Ação        │ Admin  │ Supervisor│ Atendente│
├─────────────────────┼────────┼───────────┼──────────┤
│ Gerenciar Usuários  │   ✅   │     ❌    │    ❌    │
│ Ler Usuários        │   ✅   │     ✅    │    ❌    │
│ Gerenciar Roles     │   ✅   │     ❌    │    ❌    │
│ Ler Logs            │   ✅   │     ✅    │    ❌    │
│ Atualizar Tickets   │   ✅   │     ✅    │    ✅    │
│ Deletar Tickets     │   ✅   │     ❌    │    ❌    │
│ Acessar Config      │   ✅   │     ❌    │    ❌    │
│ Resetar Senha Outro │   ✅   │     ❌    │    ❌    │
└─────────────────────┴────────┴───────────┴──────────┘
```

---

## Segurança - Hash de Senha

```
┌────────────────────────────────────────┐
│   PBKDF2-SHA512 COM SALT                │
└────────────────────────────────────────┘

1. Entrada: "MinhaSeha123!"
   ↓
2. Gerar Salt:
   salt = crypto.randomBytes(16).toString('hex')
   salt = "8e9c8d6f5a4b3c2d1e0f..."
   ↓
3. Derivar Chave:
   hash = PBKDF2(password, salt, 10000, 64, 'sha512')
   hash = "a1b2c3d4e5f6a7b8c9d0..."
   ↓
4. Armazenar:
   password_hash = "salt:hash"
   = "8e9c8d6f5a4b3c2d1e0f:a1b2c3d4e5f6a7b8c9d0..."
   ↓
5. Verificação de Login:
   password_hash = "8e9c8d6f5a4b3c2d1e0f:a1b2c3d4e5f6a7b8c9d0..."
   
   [salt, storedHash] = password_hash.split(':')
   
   testHash = PBKDF2(inputPassword, salt, 10000, 64, 'sha512')
   
   if (testHash === storedHash) → ✅ Válido
   else → ❌ Inválido
```

---

## Segurança - TOTP MFA

```
┌────────────────────────────────────────┐
│   TIME-BASED ONE-TIME PASSWORD (TOTP)  │
└────────────────────────────────────────┘

Servidor:
  secret = "JBSWY3DPEBLW64TMMQ6HVPV4I"
  ↓
Dispositivo do Usuário (Google Authenticator):
  ├─ Recebe: otpauth://totp/Dashboard%20Movidesk?secret=JBSWY3...
  ├─ Deriva: Base32 decode do secret
  ├─ Calcula: HMAC-SHA1(secret, contador de tempo)
  ├─ Extrai: 6 dígitos do HMAC
  └─ Exibe: 123456 (válido por 30 segundos)
  ↓
Usuário entra: "123456"
  ↓
Servidor:
  ├─ Calcula TOTP para: TIME-1 (período anterior)
  ├─ Calcula TOTP para: TIME   (período atual)
  ├─ Calcula TOTP para: TIME+1 (próximo período)
  ├─ Compara com código fornecido
  └─ Se match → ✅ Válido

Janela = 2 períodos (60 segundos total)
Permite sincronização de relógio com 30s de tolerância
```

---

## Limites e Proteções

```
┌──────────────────────────────────────────────┐
│      PROTEÇÃO CONTRA ATAQUES                 │
└──────────────────────────────────────────────┘

Brute Force:
  ├─ Máximo: 5 tentativas falhas
  ├─ Bloqueio: 15 minutos
  ├─ Reseta: Ao primeiro acesso bem-sucedido
  └─ Rastreamento: Por usuário

Rate Limiting:
  ├─ Pode ser implementado em nginx/cloudflare
  └─ Recomendado: 10 requisições por min por IP

Sessão:
  ├─ Duração: 24 horas
  ├─ Expiração automática
  ├─ Rastreamento: IP + User-Agent
  └─ Deletar ao logout

TOTP:
  ├─ Período: 30 segundos
  ├─ Dígitos: 6
  ├─ Algoritmo: HMAC-SHA1
  ├─ Janela: ±2 períodos
  └─ Backup codes: 10 de uso único
```

---

## Estrutura de Arquivos

```
server/
├── db/
│   └── database.js          ← Inicialização e schemas
├── routes/
│   ├── auth.js              ← Login, MFA, primeiro acesso
│   ├── users.js             ← Gerencamento de usuários
│   ├── tickets.js           ← Tickets (existente)
│   └── config.js            ← Config (existente)
├── utils/
│   ├── auth.js              ← Hash, TOTP, validações
│   └── crypto.js            ← Encrypt/decrypt (existente)
└── server.js                ← Servidor principal

docs/
├── auth-api.md              ← Documentação API
└── init-users.sql           ← Script de inicialização

AUTH-SETUP.md                 ← Setup e instruções
```

---

**Diagrama Atualizado em**: Janeiro 2024  
**Status**: ✅ Implementado e Testado
