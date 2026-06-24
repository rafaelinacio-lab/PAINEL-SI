# Code Review — Projeto SI (Flux / Dashboard Movidesk)

Análise completa dos arquivos: `server/`, `js/script.js`, `index.html`, `css/style.css`.

---

## 🔴 Crítico (corrigir antes de ir para produção)

### 1. Credenciais expostas no `.env` versionado
O arquivo `.env` está no ZIP com credenciais reais:
- Senha do banco (`%MawmflUn394`), host interno, usuário
- Senha do admin inicial (`Admin@123456`)
- Chave de criptografia com valor padrão inseguro (`sua-chave-secreta-aqui...`)

**Ação:** adicionar `.env` ao `.gitignore` imediatamente (já existe o arquivo, mas verifique se está ativo). Rotacionar todas as credenciais expostas. Nunca commitar `.env` com valores reais.

---

### 2. `CORS` aberto sem restrição de origem
```js
// server.js — linha 20
app.use(cors()); // aceita qualquer origem
```
**Ação:** restringir às origens reais:
```js
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || 'http://localhost:3000' }));
```

---

### 3. Comparação de senha sem timing-safe
Em `auth.js → verifyPassword`, a comparação final é:
```js
return testHash === storedHash; // operador === vaza timing
```
Isso é vulnerável a timing attacks. **Ação:**
```js
return crypto.timingSafeEqual(Buffer.from(testHash), Buffer.from(storedHash));
```

---

### 4. `INSERT OR IGNORE / INSERT OR REPLACE` silenciosamente ignorado no PostgreSQL
O `translateSql` em `db/remote.js` converte `INSERT OR IGNORE INTO` para `INSERT INTO` sem a cláusula `ON CONFLICT DO NOTHING`. Isso faz queries que deveriam ser idempotentes lançarem erros de unique constraint silenciados errado.

**Ação:**
```js
text = text.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
// ↓ mudar para:
text = text.replace(/INSERT OR IGNORE INTO\s+(\w+)/gi, 'INSERT INTO $1');
// e no final de cada query afetada adicionar ON CONFLICT DO NOTHING
```
Ou melhor: migrar os upserts para usar `ON CONFLICT` explicitamente nas rotas.

---

### 5. Ausência de helmet / cabeçalhos de segurança HTTP
Nenhum middleware de segurança básica está configurado (sem `X-Frame-Options`, `Content-Security-Policy`, `X-Content-Type-Options`).

**Ação:**
```bash
npm install helmet
```
```js
// server.js — antes das rotas
const helmet = require('helmet');
app.use(helmet());
```

---

## 🟠 Importante (alta prioridade)

### 6. Rotas auth.js misturam callbacks e async/await
O arquivo `auth.js` usa `db.get(..., callback)` e `db.run(..., callback)` aninhados profundamente dentro de `async` handlers. Isso cria callback hell difícil de manter e propaga erros silenciosamente (nenhum `try/catch` global por rota).

**Ação:** converter para `db.query()` (que retorna Promise) diretamente, usando `async/await` consistente:
```js
router.post('/login', async (req, res) => {
  try {
    const result = await db.query(`SELECT u.*, r.name as role FROM users u ...`, [email]);
    const user = result.rows[0];
    // ...
  } catch (err) {
    return res.status(500).json({ error: 'Erro na autenticação' });
  }
});
```

---

### 7. Sessões temporárias de MFA sem limpeza periódica
Sessões com expiração curta (10 min, para MFA) são criadas mas nunca deletadas automaticamente se o usuário abandonar o fluxo. Com o tempo, a tabela `sessions` acumula registros expirados.

**Ação:** adicionar job periódico ou trigger no banco:
```js
// server.js — junto ao autoSyncLoop
setInterval(() => {
  db.query(`DELETE FROM sessions WHERE expires_at < NOW()`).catch(() => {});
}, 60 * 60 * 1000); // a cada hora
```

---

### 8. `script.js` com 3.894 linhas — monolito sem separação de responsabilidades
O arquivo mistura: auth, dashboard, curadoria, pessoas, configurações, filtros, sparklines, donuts, formatação de datas — tudo junto. Qualquer bug num módulo exige vasculhar quase 4000 linhas.

**Ação:** separar por responsabilidade em módulos ou pelo menos em arquivos dedicados às views, como já acontece nas `pages/`:
- `js/auth.js` — login, logout, token, headers
- `js/dashboard.js` — cards, sparklines, SLA donuts
- `js/curadoria.js` — curadoria view
- `js/config.js` — painel de configurações
- `js/pessoas.js` — gestão de usuários

---

### 9. MFA não implementado no frontend
No `loginSubmit` de `script.js`:
```js
if (data.requiresMFA) {
  throw new Error('MFA habilitado neste usuário. O fluxo de confirmação ainda não está implementado nesta tela.');
}
```
O backend tem todo o fluxo MFA construído, mas o frontend bloqueia usuários com MFA ativo. Se alguém habilitar MFA pelo backend, não consegue mais logar pela interface.

**Ação:** implementar o modal de confirmação de código TOTP no `login.html` (ver arquivo entregue).

---

### 10. `getAuthToken()` busca em 3 chaves diferentes no localStorage
```js
return localStorage.getItem('token')
    || localStorage.getItem('authToken')
    || localStorage.getItem('sessionToken');
```
Isso é resquício de refatorações. A key correta é `'token'` (única que o `loginSubmit` escreve). As outras duas são dead code.

**Ação:** padronizar para uma única chave (`'flux_token'` ou similar), remover as alternativas, limpar no logout.

---

## 🟡 Melhorias (qualidade e manutenção)

### 11. `db/remote.js` — `translateSql` é uma gambiarra de compatibilidade
O arquivo tem uma camada de tradução SQLite→PostgreSQL (`datetime('now')` → `NOW()`, `?` → `$1`). Isso existe porque o código foi originalmente escrito para SQLite e migrado para PostgreSQL. A tradução já acontece, mas deixa vestígios de SQL dialect mixing no código das rotas.

**Ação a médio prazo:** remover o `translateSql` e escrever todas as queries diretamente em SQL PostgreSQL com `$1, $2` e `NOW()`. Isso elimina uma camada de indireção e potenciais bugs de tradução.

---

### 12. `verifyPassword` não é timing-safe (já listado acima como crítico) — também: `pbkdf2Sync` é bloqueante
`pbkdf2Sync` bloqueia o event loop durante o hash. Com múltiplos logins simultâneos, isso degrada o servidor Node.

**Ação:** usar `crypto.pbkdf2` (assíncrono) ou migrar para `bcrypt`/`argon2`:
```js
const bcrypt = require('bcrypt');
// hash: await bcrypt.hash(password, 12)
// verify: await bcrypt.compare(password, hash)
```

---

### 13. `server.js` — comentário contradiz o código
```js
// Auto-sync incremental a cada 1 minuto
const SYNC_INTERVAL_MS = 2 * 60 * 1000; // mas são 2 minutos
```
Comentário desatualizado. Corrigir para `a cada 2 minutos`.

---

### 14. `index.html` com 46KB — login embutido junto com todo o app
O bloco `#loginScreen` fica no mesmo HTML que o app inteiro. Isso significa que o browser baixa todo o markup do dashboard antes de mostrar o login. Separar o login em `login.html` (já entregue) resolve isso.

---

### 15. Ausência de validação de entrada no backend para campos de texto livre
Rotas como `/api/config` e `/api/tickets` recebem strings sem sanitização. Mesmo que o PostgreSQL com parâmetros previna SQL injection, XSS armazenado pode ocorrer se strings são renderizadas no frontend sem escape.

O `script.js` tem `escapeHtml()` mas nem sempre é chamado de forma consistente.

**Ação:** revisar todos os pontos onde dados da API são inseridos no DOM via `innerHTML` sem `escapeHtml`.

---

### 16. `pages/curadoria.html` tem 54KB e um `.backup` de 115KB no repositório
O arquivo `.backup` não deveria estar versionado. Adicionar ao `.gitignore`:
```
*.backup
*.bak
old_*.txt
pattern_*.txt
```

---

## ✅ O que está bem feito

- **Graceful shutdown** no `server.js` (aguarda sync em voo antes de fechar)
- **Bloqueio por tentativas falhas** no login (5 tentativas → 15 min de lockout)
- **Pool de conexões** com retry automático em erros transientes (`db/remote.js`)
- **Schema auto-migração** com `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- **`authMiddleware` e `requireRole`** bem estruturados e reutilizáveis
- **Separação backend/frontend** com rotas REST claras
- **Logs de acesso** (`access_logs`) para auditoria

---

## Resumo das prioridades

| # | Item | Prioridade |
|---|------|-----------|
| 1 | Credenciais no `.env` versionado | 🔴 Crítico |
| 2 | CORS aberto | 🔴 Crítico |
| 3 | Timing attack na comparação de senha | 🔴 Crítico |
| 4 | `INSERT OR IGNORE` mal traduzido | 🔴 Crítico |
| 5 | Sem helmet / cabeçalhos de segurança | 🔴 Crítico |
| 6 | Callback hell nas rotas auth | 🟠 Importante |
| 7 | Sessões expiradas não são limpas | 🟠 Importante |
| 8 | `script.js` monolítico (3.894 linhas) | 🟠 Importante |
| 9 | MFA não implementado no frontend | 🟠 Importante |
| 10 | 3 chaves de token no localStorage | 🟠 Importante |
| 11 | `translateSql` — dívida técnica SQLite | 🟡 Melhoria |
| 12 | `pbkdf2Sync` bloqueante | 🟡 Melhoria |
| 13 | Comentário errado no server.js | 🟡 Melhoria |
| 14 | Login no mesmo HTML do app | 🟡 Melhoria |
| 15 | Sanitização inconsistente de HTML | 🟡 Melhoria |
| 16 | Arquivos `.backup` no repositório | 🟡 Melhoria |
