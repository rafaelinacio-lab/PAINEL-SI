# 🔐 Documentação - Sistema de Autenticação e Controle de Acesso

## Visão Geral

Sistema completo de autenticação com:
- ✅ Perfis de acesso (Admin, Supervisor, Atendente)
- ✅ Autenticação por email/senha
- ✅ MFA (Autenticação Multi-Fator com TOTP)
- ✅ Backup codes para recuperação
- ✅ Gerenciamento de sessões
- ✅ Logs de acesso
- ✅ Primeiro acesso com geração automática de senha

---

## 📋 Estrutura do Banco de Dados

### Tabelas Principais

#### `users`
```
id                    INTEGER PRIMARY KEY
email                 TEXT UNIQUE NOT NULL
name                  TEXT NOT NULL
password_hash         TEXT (PBKDF2-SHA512)
role_id               INTEGER FOREIGN KEY
is_active             BOOLEAN DEFAULT 1
first_access          BOOLEAN DEFAULT 1
failed_login_attempts INTEGER DEFAULT 0
locked_until          DATETIME
last_login            DATETIME
created_at            DATETIME
updated_at            DATETIME
```

#### `roles`
```
id          INTEGER PRIMARY KEY
name        TEXT UNIQUE (admin, supervisor, atendente)
description TEXT
permissions TEXT (JSON)
createdAt   DATETIME
```

#### `mfa_settings`
```
id              INTEGER PRIMARY KEY
user_id         INTEGER UNIQUE FOREIGN KEY
mfa_type        TEXT DEFAULT 'totp'
totp_secret     TEXT (Base32 secret)
backup_codes    TEXT (JSON array)
is_enabled      BOOLEAN DEFAULT 0
verified_at     DATETIME
created_at      DATETIME
updated_at      DATETIME
```

#### `sessions`
```
id          INTEGER PRIMARY KEY
user_id     INTEGER FOREIGN KEY
token       TEXT UNIQUE
ip_address  TEXT
user_agent  TEXT
expires_at  DATETIME
created_at  DATETIME
```

#### `password_resets`
```
id          INTEGER PRIMARY KEY
user_id     INTEGER FOREIGN KEY
token       TEXT UNIQUE
expires_at  DATETIME
used        BOOLEAN DEFAULT 0
created_at  DATETIME
```

#### `access_logs`
```
id          INTEGER PRIMARY KEY
user_id     INTEGER FOREIGN KEY
action      TEXT (login, logout, user_created, etc)
resource    TEXT
ip_address  TEXT
success     BOOLEAN
details     TEXT
created_at  DATETIME
```

---

## 🔑 Perfis de Acesso

### Admin
- **Descrição**: Acesso total ao sistema
- **Permissões**: `read`, `write`, `delete`, `manage_users`
- **Pode**: Criar/editar/deletar usuários, gerenciar roles, acessar logs

### Supervisor
- **Descrição**: Gerenciar atendentes e relatórios
- **Permissões**: `read`, `write`, `manage_attendants`
- **Pode**: Ver usuários, gerenciar atendentes, acessar logs

### Atendente
- **Descrição**: Acesso básico ao sistema
- **Permissões**: `read`, `write`
- **Pode**: Visualizar e atualizar chamados

---

## 🔌 Endpoints da API

### Autenticação

#### `POST /api/auth/login`
Login com email e senha

**Request:**
```json
{
  "email": "usuario@example.com",
  "password": "SuaSenha123!"
}
```

**Response (sem MFA):**
```json
{
  "token": "abc123def456...",
  "user": {
    "id": 1,
    "email": "usuario@example.com",
    "name": "João Silva",
    "role": "admin",
    "firstAccess": false
  }
}
```

**Response (com MFA):**
```json
{
  "requiresMFA": true,
  "tempToken": "temp_abc123...",
  "message": "Forneça o código MFA para completar o login"
}
```

---

#### `POST /api/auth/verify-mfa`
Verifica código MFA para completar login

**Request:**
```json
{
  "tempToken": "temp_abc123...",
  "code": "123456"  // Código TOTP de 6 dígitos
}
```

**Response:**
```json
{
  "token": "abc123def456...",
  "user": {
    "id": 1,
    "email": "usuario@example.com",
    "name": "João Silva",
    "roleId": 1
  }
}
```

---

#### `POST /api/auth/first-access`
Primeiro acesso - usuário define sua senha

**Request:**
```json
{
  "email": "usuario@example.com",
  "initialPassword": "ABC123DEF456",  // Senha gerada no primeiro acesso
  "newPassword": "MinhaNovaSeha123!"  // Nova senha forte
}
```

**Response:**
```json
{
  "message": "Senha alterada com sucesso",
  "nextStep": "mfa-setup"
}
```

---

#### `POST /api/auth/setup-mfa`
Gera QR code para configurar TOTP

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "qrCode": "data:image/png;base64,...",
  "secret": "JBSWY3DPEBLW64TMMQQ6HVPV4I",
  "message": "Escaneie o código QR com seu autenticador"
}
```

---

#### `POST /api/auth/verify-and-enable-mfa`
Verifica código TOTP e ativa MFA

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "code": "123456"
}
```

**Response:**
```json
{
  "message": "MFA ativado com sucesso",
  "backupCodes": [
    "ABC1-2DEF",
    "GHI3-4JKL",
    "MNO5-6PQR",
    "STU7-8VWX",
    "YZA9-0BCD",
    "EFG1-2HIJ",
    "KLM3-4NOP",
    "QRS5-6TUV",
    "WXY7-8ZAB",
    "CDE9-0FGH"
  ],
  "warning": "Guarde os códigos de backup em um local seguro!"
}
```

---

#### `GET /api/auth/me`
Retorna dados do usuário autenticado

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": 1,
  "email": "usuario@example.com",
  "name": "João Silva",
  "role": "admin",
  "first_access": false,
  "mfa_enabled": true
}
```

---

#### `POST /api/auth/logout`
Encerra a sessão do usuário

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Desconectado com sucesso"
}
```

---

### Gerenciamento de Usuários (Admin)

#### `GET /api/users`
Lista todos os usuários

**Headers:**
```
Authorization: Bearer <token>
Role: admin ou supervisor
```

**Response:**
```json
[
  {
    "id": 1,
    "email": "admin@example.com",
    "name": "Admin User",
    "is_active": true,
    "first_access": false,
    "last_login": "2024-01-15T10:30:00Z",
    "role": "admin",
    "mfa_enabled": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

---

#### `POST /api/users`
Cria novo usuário

**Headers:**
```
Authorization: Bearer <token>
Role: admin
```

**Request:**
```json
{
  "email": "novouser@example.com",
  "name": "Novo Usuário",
  "role": "atendente"  // admin, supervisor, ou atendente
}
```

**Response:**
```json
{
  "id": 5,
  "email": "novouser@example.com",
  "name": "Novo Usuário",
  "role": "atendente",
  "initialPassword": "ABC123DEF456",
  "message": "Usuário criado com sucesso. Compartilhe a senha inicial com segurança."
}
```

---

#### `PUT /api/users/:id`
Atualiza usuário

**Headers:**
```
Authorization: Bearer <token>
Role: admin
```

**Request:**
```json
{
  "name": "Novo Nome",
  "role": "supervisor",
  "is_active": true
}
```

**Response:**
```json
{
  "message": "Usuário atualizado com sucesso"
}
```

---

#### `DELETE /api/users/:id`
Desativa usuário

**Headers:**
```
Authorization: Bearer <token>
Role: admin
```

**Response:**
```json
{
  "message": "Usuário desativado com sucesso"
}
```

---

#### `POST /api/users/:id/reset-password`
Admin reseta senha do usuário

**Headers:**
```
Authorization: Bearer <token>
Role: admin
```

**Response:**
```json
{
  "message": "Senha resetada com sucesso",
  "initialPassword": "XYZ789ABC123",
  "warning": "Compartilhe a senha com segurança"
}
```

---

### Logs de Acesso

#### `GET /api/users/access-logs`
Lista todos os logs (últimos 30 dias)

**Headers:**
```
Authorization: Bearer <token>
Role: admin ou supervisor
```

**Response:**
```json
[
  {
    "id": 1,
    "user_id": 1,
    "email": "admin@example.com",
    "name": "Admin User",
    "action": "login",
    "resource": null,
    "ip_address": "192.168.1.100",
    "success": true,
    "created_at": "2024-01-15T10:30:00Z"
  }
]
```

---

#### `GET /api/users/access-logs/:userId`
Lista logs de um usuário específico

**Headers:**
```
Authorization: Bearer <token>
Role: admin ou supervisor
```

---

## 🔒 Segurança

### Hash de Senha
- Algoritmo: PBKDF2-SHA512
- Iterações: 10.000
- Salt: 16 bytes aleatórios

### Autenticação Multi-Fator (MFA)
- Tipo: TOTP (Time-based One-Time Password)
- Comprimento: 32 bytes
- Janela de sincronização: ±2 períodos de 30s
- Backup codes: 10 códigos de 8 caracteres para recuperação

### Sessões
- Duração: 24 horas
- Token: 64 caracteres hexadecimais aleatórios
- Armazenamento: Em sessões (banco SQLite)

### Limite de Tentativas
- Máximo: 5 tentativas de login falhadas
- Bloqueio: 15 minutos

---

## 📱 Fluxo de Primeiro Acesso

1. **Admin cria usuário**
   ```
   POST /api/users
   → Gera senha inicial automaticamente
   → Email: abc123def456@example.com
   → Senha: ABC123DEF456
   ```

2. **Novo usuário faz login**
   ```
   POST /api/auth/login
   Email: abc123def456@example.com
   Senha: ABC123DEF456
   ```

3. **Sistema detecta primeiro acesso**
   - `first_access: true`
   - Redireciona para tela de alteração de senha

4. **Usuário altera senha**
   ```
   POST /api/auth/first-access
   initialPassword: ABC123DEF456
   newPassword: MinhaNovaSeha123!
   ```

5. **Ativa MFA**
   ```
   POST /api/auth/setup-mfa
   → Recebe QR code para escanear
   
   POST /api/auth/verify-and-enable-mfa
   → Verifica código TOTP
   → Recebe backup codes
   ```

6. **Próximo login requer MFA**
   ```
   POST /api/auth/login
   → requiresMFA: true
   → tempToken fornecido
   
   POST /api/auth/verify-mfa
   → Token de sessão permanente
   ```

---

## 🛡️ Controle de Acesso por Role

```
┌─────────┬──────────────┬──────────┬──────────────┐
│ Recurso │ Admin        │ Super.   │ Atendente    │
├─────────┼──────────────┼──────────┼──────────────┤
│ Users   │ ✅ CRUD      │ ✅ Read  │ ❌ Denied    │
│ Roles   │ ✅ Read      │ ❌ No    │ ❌ Denied    │
│ Tickets │ ✅ CRUD      │ ✅ CRUD  │ ✅ Read/Edit │
│ Logs    │ ✅ Read      │ ✅ Read  │ ❌ Denied    │
│ Config  │ ✅ CRUD      │ ❌ No    │ ❌ Denied    │
└─────────┴──────────────┴──────────┴──────────────┘
```

---

## 🧪 Exemplo de Uso com JavaScript

```javascript
// 1. Login
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'usuario@example.com',
    password: 'MinhaSeha123!'
  })
});

const data = await loginResponse.json();

if (data.requiresMFA) {
  // 2. MFA necessário
  const code = prompt('Digite o código MFA:');
  const mfaResponse = await fetch('/api/auth/verify-mfa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tempToken: data.tempToken,
      code: code
    })
  });
  const mfaData = await mfaResponse.json();
  localStorage.setItem('token', mfaData.token);
} else {
  localStorage.setItem('token', data.token);
}

// 3. Usar token em requisições
const response = await fetch('/api/users', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});
```

---

## 📝 Notas Importantes

- ⚠️ **Senhas iniciais**: São aleatórias e devem ser compartilhadas com segurança
- ⚠️ **MFA obrigatório**: Recomendado ativar para todas as contas admin
- ⚠️ **Backup codes**: Guardar em local seguro - são a única forma de recuperação
- ⚠️ **Logs**: Todos os acessos são registrados para auditoria
- ⚠️ **Sessões**: Expiram após 24 horas de inatividade

---
