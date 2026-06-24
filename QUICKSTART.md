# 🚀 Guia de Início Rápido

## Instalação em 3 Passos

### 1️⃣ Instalar Dependências
Abra o terminal PowerShell na pasta `c:\Users\Rafael.inacio\SI` e execute:

```powershell
npm install
```

Isso instalará todas as dependências necessárias:
- `express` - Servidor web
- `sqlite3` - Banco de dados
- `node-fetch` - Requisições HTTP
- `cors` - Suporte cross-origin
- `dotenv` - Variáveis de ambiente

### 2️⃣ Iniciar o Servidor
No mesmo terminal, execute:

```powershell
npm start
```

Você verá:
```
🚀 Servidor rodando em http://localhost:3000
📊 Dashboard: http://localhost:3000
⚙️  Admin: http://localhost:3000/admin

💡 Dica: Configure o token Movidesk na página de admin antes de sincronizar
```

### 3️⃣ Configurar e Sincronizar

#### A. Acessar Admin Panel
- Abra no navegador: http://localhost:3000/admin
- Preencha o token da API Movidesk
- Clique em "💾 Salvar Token"

#### B. Sincronizar Chamados
- Clique em "🔄 Sincronizar Agora"
- Aguarde o processo completar
- Sistema fará paginação automática

#### C. Visualizar Dashboard
- Acesse http://localhost:3000
- Veja os cards de chamados sincronizados
- Clique em qualquer card para detalhes

---

## 📋 Obter Token Movidesk

1. Acesse sua conta Movidesk
2. Vá para **Configurações → Integrações → API**
3. Gere um novo token com permissões para:
   - Leitura de tickets
   - Expansão de campos customizados
   - Expansão de clientes e proprietários

---

## 🔐 Arquivo .env

O arquivo `.env` contém:

```env
ENCRYPTION_KEY=sua-chave-secreta-aqui-min-32-caracteres!!!!!!
PORT=3000
```

**⚠️ Importante**: Mude o `ENCRYPTION_KEY` para algo único e seguro

---

## 🛠️ Dados de Teste

Se não tiver token configurado, o dashboard mostrará **dados mockados** para teste:

- 6 chamados de exemplo
- Status: Aberto, Em Progresso, Aguardando
- Prioridades: Alta, Média, Baixa

Descomente a linha em `js/script.js` para desativar mock data:
```javascript
const USE_MOCK_DATA = false; // Desativar mock
```

---

## 📊 Estrutura de Dados

Cada ticket é salvo com:

```json
{
  "id": 816615,
  "subject": "[Chat] Erro na api da IA...",
  "status": "Em atendimento",
  "baseStatus": "InAttendance",
  "serviceFirstLevel": "Sistemas Internos",
  "slaAgreement": "SLA Sistemas Internos",
  "slaAgreementRule": "SLA SISTEMAS INTERNOS - Baixa",
  "slaSolutionTime": 1920,
  "slaResponseTime": 60,
  "slaSolutionDate": "2026-01-20T11:57:20.5690333",
  "ownerName": "Brenda de Paula Leite",
  "clientName": "Bruna Cardoso Dos Santos",
  "clientOrganization": "VIASOFT INFORMATICA LTDA",
  "customFields": [...]
}
```

Tudo armazenado localmente em `data/movidesk.db`

---

## 🔌 Endpoints da API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | /api/config/token | Salvar token (criptografado) |
| GET | /api/config/token | Verificar se token existe |
| GET | /api/tickets | Listar todos os tickets |
| GET | /api/tickets/:id | Detalhes de um ticket |
| POST | /api/tickets/sync | Sincronizar com Movidesk |
| GET | /api/tickets/stats/overview | Estatísticas |

---

## 🎨 Customizar

### Mudar Filtro de Chamados
Edite `server/routes/tickets.js`:

```javascript
const filter = `serviceFirstLevel eq 'Sistemas Internos' and ...`;
```

### Mudar Estilo dos Cards
Edite `css/style.css`:

```css
.card {
    background: var(--surface);
    border-radius: 10px;
    /* Customize aqui */
}
```

### Alterar Porta do Servidor
No `.env`:

```env
PORT=8080
```

---

## 🐛 Problemas Comuns

### ❌ "Porta 3000 já em uso"
```powershell
# Mude a porta no .env
PORT=3001
```

### ❌ "Erro ao criar banco de dados"
Verifique se a pasta `data/` existe:
```powershell
mkdir data
```

### ❌ "npm: comando não encontrado"
Instale Node.js em: https://nodejs.org

### ❌ "Sem dados após sincronizar"
1. Verifique se o token é válido
2. Confirme que há chamados que correspondem ao filtro
3. Verifique a console do navegador (F12)

---

## ✅ Checklist de Configuração

- [ ] Node.js instalado (versão 12+)
- [ ] npm install executado
- [ ] Arquivo .env criado
- [ ] ENCRYPTION_KEY alterado
- [ ] Token Movidesk obtido
- [ ] npm start executando sem erros
- [ ] Admin panel acessível
- [ ] Token configurado
- [ ] Sincronização realizada
- [ ] Dashboard exibindo dados

---

## 📚 Próximos Passos

1. **Automação**: Configure sincronização automática com cron
2. **Alertas**: Adicione notificações para SLA vencendo
3. **Gráficos**: Implemente visualizações com Chart.js
4. **Filtros**: Adicione filtros por status, data, cliente
5. **Exportação**: Crie relatórios em CSV/PDF

---

## 📞 Suporte

Verifique a documentação completa em `README.md`

Logs do servidor aparecem no terminal durante `npm start`
