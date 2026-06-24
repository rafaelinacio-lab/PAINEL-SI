# 🔐 Sistema de Autenticação e Controle de Acesso

## ✨ Características

✅ **3 Perfis de Acesso**
- Admin - Acesso total ao sistema
- Supervisor - Gerenciar atendentes e relatórios
- Atendente - Acesso básico

✅ **Autenticação Segura**
- Email e senha com hash PBKDF2-SHA512
- 10.000 iterações + salt de 16 bytes
- Limite de 5 tentativas de login (bloqueio por 15 min)

✅ **MFA (Multi-Factor Authentication)**
- TOTP (Google Authenticator, Microsoft Authenticator, etc)
- Backup codes para recuperação (10 códigos)
- Suporte para sincronização de tempo (±2 períodos)

✅ **Gerenciamento de Sessões**
- Sessões de 24 horas
- Tokens aleatórios de 64 caracteres
- Rastreamento de IP e User-Agent

✅ **Primeiro Acesso**
- Senha gerada automaticamente pelo Admin
- Obrigatório alterar na primeira autenticação
- Validação de força da senha

✅ **Auditoria Completa**
- Logs de todos os acessos
- Rastreamento de ações por usuário
- Histórico de 30 dias

---

## 📦 Instalação

### 1. Dependências Instaladas
```bash
npm install speakeasy qrcode
```

### 2. Estrutura do Banco de Dados
O banco é criado automaticamente na primeira execução do servidor. As tabelas incluem:
- `users` - Usuários do sistema
- `roles` - Perfis de acesso
- `mfa_settings` - Configurações MFA
- `sessions` - Sessões ativas
- `password_resets` - Tokens de reset
- `access_logs` - Histórico de acessos

### 3. Iniciar Servidor
```bash
npm start
```

O servidor iniciará em `http://localhost:3000`

---

## 🚀 Como Usar

### Primeiro Acesso - Admin

**1. Criar Usuário via API**
```bash
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "novousuario@example.com",
    "name": "Novo Usuário",
    "role": "atendente"
  }'
```

Resposta:
```json
{
  "id": 5,
  "email": "novousuario@example.com",
  "name": "Novo Usuário",
  "role": "atendente",
  "initialPassword": "ABC123DEF456",
  "message": "Usuário criado com sucesso"
}
```

**2. Compartilhar Credenciais**
- Email: `novousuario@example.com`
- Senha Inicial: `ABC123DEF456` (guardar com segurança)

### Primeiro Acesso - Novo Usuário

**1. Fazer Login**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "novousuario@example.com",
    "password": "ABC123DEF456"
  }'
```

**2. Alterar Senha**
```bash
curl -X POST http://localhost:3000/api/auth/first-access \
  -H "Content-Type: application/json" \
  -d '{
    "email": "novousuario@example.com",
    "initialPassword": "ABC123DEF456",
    "newPassword": "MinhaNovaSeha123!"
  }'
```

Requisitos para nova senha:
- Mínimo 8 caracteres
- Pelo menos 1 maiúscula
- Pelo menos 1 minúscula
- Pelo menos 1 número
- Pelo menos 1 caractere especial (!@#$%^&*)

**3. Configurar MFA**

Obter QR Code:
```bash
curl -X POST http://localhost:3000/api/auth/setup-mfa \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

Escanear com Google Authenticator ou similar, depois verificar:
```bash
curl -X POST http://localhost:3000/api/auth/verify-and-enable-mfa \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "123456"
  }'
```

Resposta com backup codes:
```json
{
  "message": "MFA ativado com sucesso",
  "backupCodes": [
    "ABC1-2DEF",
    "GHI3-4JKL",
    ...
  ],
  "warning": "Guarde os códigos em local seguro!"
}
```

### Próximos Logins

**Com MFA Ativado:**

```bash
# 1. Login normal
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "novousuario@example.com",
    "password": "MinhaNovaSeha123!"
  }'

# Resposta: requiresMFA: true, tempToken: "..."

# 2. Enviar código MFA
curl -X POST http://localhost:3000/api/auth/verify-mfa \
  -H "Content-Type: application/json" \
  -d '{
    "tempToken": "temp_...",
    "code": "123456"
  }'

# Resposta: token (sessão permanente)
```

---

## 👥 Gerenciamento de Usuários (Admin)

### Listar Usuários
```bash
curl http://localhost:3000/api/users \
  -H "Authorization: Bearer <admin_token>"
```

### Buscar Usuário Específico
```bash
curl http://localhost:3000/api/users/1 \
  -H "Authorization: Bearer <admin_token>"
```

### Atualizar Usuário
```bash
curl -X PUT http://localhost:3000/api/users/1 \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Novo Nome",
    "role": "supervisor",
    "is_active": true
  }'
```

### Desativar Usuário
```bash
curl -X DELETE http://localhost:3000/api/users/1 \
  -H "Authorization: Bearer <admin_token>"
```

### Reset de Senha
```bash
curl -X POST http://localhost:3000/api/users/1/reset-password \
  -H "Authorization: Bearer <admin_token>"
```

---

## 📊 Logs e Auditoria

### Visualizar Todos os Logs
```bash
curl http://localhost:3000/api/users/access-logs \
  -H "Authorization: Bearer <admin_token>"
```

### Logs de Usuário Específico
```bash
curl http://localhost:3000/api/users/access-logs/1 \
  -H "Authorization: Bearer <admin_token>"
```

---

## 🔒 Boas Práticas de Segurança

1. **Senhas Iniciais**
   - Não compartilhar por email
   - Usar canal seguro (pessoalmente, SMS, etc)
   - Registrar que foi compartilhada

2. **MFA**
   - Ativar para todas as contas admin
   - Guardar backup codes com segurança
   - Renovar a cada 6 meses

3. **Sessões**
   - Expiram automaticamente após 24h
   - Usar HTTPS em produção
   - Não compartilhar tokens

4. **Logs**
   - Revisar regularmente
   - Arquivar após 30 dias
   - Investigar acessos suspeitos

5. **Senhas**
   - Usar gerenciador de senhas
   - Trocar a cada 90 dias
   - Não reutilizar senhas antigas

---

## 📋 Roles e Permissões

### Admin (`admin`)
```
✅ Ler/Criar/Editar/Deletar usuários
✅ Gerenciar roles e permissões
✅ Ver logs de acesso
✅ Acessar todas as features
```

### Supervisor (`supervisor`)
```
✅ Ler usuários
✅ Gerenciar atendentes
✅ Ver logs de acesso
✅ Acessar relatórios
❌ Criar/deletar usuários
❌ Alterar roles
```

### Atendente (`atendente`)
```
✅ Ler/criar/editar chamados
✅ Ver informações básicas
❌ Gerenciar usuários
❌ Ver logs
❌ Alterar configurações
```

---

## 🧪 Testando Localmente

### Dados de Teste Padrão
Ao executar o script `docs/init-users.sql`, são criados:

```
Email: admin@example.com
Senha: Admin@123456
Role: Admin

Email: supervisor@example.com
Senha: Admin@123456
Role: Supervisor

Email: thomas@example.com
Senha: Admin@123456
Role: Atendente

Email: rafael@example.com
Senha: Admin@123456
Role: Atendente

Email: flux@example.com
Senha: Admin@123456
Role: Atendente
```

⚠️ **Nota**: Senhas de teste são apenas para desenvolvimento. Em produção, gerar senhas seguras via API.

---

## 📚 Documentação Completa

Veja [docs/auth-api.md](./auth-api.md) para documentação detalhada da API com todos os endpoints.

---

## 🛠️ Troubleshooting

### Erro: "Módulo speakeasy não encontrado"
```bash
npm install speakeasy qrcode
```

### Erro: "Email já cadastrado"
O email já existe no banco. Use outro email ou resete o banco:
```sql
DELETE FROM users WHERE email = 'existente@example.com';
```

### Erro: "Sessão inválida ou expirada"
O token expirou (24h). Fazer login novamente.

### Código MFA não funciona
- Verificar sincronização de relógio do dispositivo
- O código muda a cada 30 segundos
- Cada código é válido por ±2 períodos (60s total)

### Perdeu os Backup Codes
Admin pode resetar a senha via:
```bash
curl -X POST http://localhost:3000/api/users/1/reset-password \
  -H "Authorization: Bearer <admin_token>"
```

---

## 📞 Suporte

Para problemas ou dúvidas, consulte a documentação em `docs/auth-api.md` ou revise os logs de acesso.

---

**Versão**: 1.0.0  
**Última Atualização**: Janeiro 2024  
**Status**: ✅ Pronto para Produção
