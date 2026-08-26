# Dashboard Movidesk com Sincronização de SLA

Sistema completo para visualizar e gerenciar chamados do Movidesk com análise de SLA, integração de API, sincronização com paginação e criptografia de tokens.

> ℹ️ O restante deste README documenta a versão inicial do projeto (SQLite,
> só chamados Movidesk). A aplicação evoluiu bastante desde então (Postgres,
> Curadoria, Pessoas, GCC, Ouvidoria, aba Jira) — veja `docs/ARCHITECTURE.md`
> para a visão atual e a seção abaixo para SSO Google e a aba Jira.

## 🔑 Login único (SSO Google) + aba Jira

O login do painel é feito com a conta Google corporativa (domínio
`ALLOWED_DOMAIN`, padrão `viasoft.com.br`) — não existe mais senha. Isso
vale tanto para o painel Movidesk quanto para a aba **Jira**, que é uma
página embutida (igual GCC/Ouvidoria) alimentada pelos JSONs que o
`Jira/jira_extractor.py` já gera (indicadores, TDC, backlog, fluxo, sprint).

**Para habilitar o login:**
1. Crie um OAuth Client ID (tipo "Web application") no Google Cloud Console
   da conta Google Workspace da Viasoft, com origem autorizada
   `http://localhost:5000` (ou o domínio real em produção).
2. Copie `.env.example` para `.env` e preencha `GOOGLE_CLIENT_ID`.
3. Um usuário só consegue entrar se já existir em **Pessoas** com o mesmo
   e-mail e estiver ativo — cadastre as pessoas antes de elas tentarem logar.

**Aba Jira:**
- `Jira/jira_extractor.py` continua rodando como está hoje (agendado por
  hora via Task Scheduler + `Jira/run_extractor.bat`), gravando os
  `*_data.json` na pasta `Jira/`.
- Este servidor só lê esses arquivos (rota `GET /api/jira/:file`, veja
  `server/routes/jira.js`) e serve `pages/jira.html` dentro da aba "Jira" da
  sidebar — sem duplicar a lógica de indicadores/TDC, que já está em Python.
- `JIRA_DATA_DIR` no `.env` aponta pra onde esses JSONs ficam (padrão
  `../Jira`, relativo à raiz do repo).
- `Jira/server.py` (Flask, com seu próprio login Google e telas de admin)
  não é mais necessário — pode ser desligado/removido quando confirmar que
  a aba Jira aqui está funcionando.

## ✨ Funcionalidades

### 🎯 Frontend
- **Barra de Navegação Fixa**: Logo e card de usuário no canto superior direito
- **Cards de Chamados**: Exibição moderna com cores por status
- **Design Responsivo**: Totalmente adaptável para desktop, tablet e mobile
- **Interface Limpa**: Baseada no design do painel SLA profissional

### 🔧 Backend
- **Criptografia AES-256-CBC**: Token seguro com IV aleatório
- **Sincronização com Paginação**: Busca automática de todos os chamados
- **Banco de Dados SQLite**: Armazenamento local eficiente
- **API RESTful**: Endpoints para gerenciamento completo

### 🔐 Admin Panel
- **Gerenciamento de Token**: Salvar e validar token com segurança
- **Sincronização Manual**: Disparar sincronização sob demanda
- **Estatísticas em Tempo Real**: Total, Novo, Em Atendimento, Parado
- **Monitor de Status**: Verificação de configuração

## 🚀 Instalação Rápida

### 1. Instalar Dependências

```bash
cd c:\Users\Rafael.inacio\SI
npm install
```

### 2. Configurar Variáveis de Ambiente

```bash
cp .env.example .env
```

Edite `.env`:
```env
ENCRYPTION_KEY=sua-chave-secreta-minimo-32-caracteres-aqui!!!
PORT=3000
```

### 3. Iniciar Servidor

```bash
npm start
```

Acesse:
- 📊 Dashboard: http://localhost:3000
- ⚙️ Admin: http://localhost:3000/admin

## 📖 Modo de Uso

### Step 1: Configurar Token
1. Acesse http://localhost:3000/admin
2. Cole seu token da API Movidesk
3. Clique "💾 Salvar Token"
4. Token será criptografado automaticamente

### Step 2: Sincronizar Chamados
O servidor web não fala mais com a API do Movidesk (só lê o banco). A sincronização
roda via script separado, agendado fora do servidor (Windows Task Scheduler):
```
node scripts/sync-movidesk.js incremental   # busca só o que mudou (uso normal, a cada N minutos)
node scripts/sync-movidesk.js full           # varre tudo do zero (primeira carga / reprocessar)
```
Ele faz a paginação automática e salva tudo no banco; o dashboard e as estatísticas
refletem o que esse script gravou na última execução.

### Step 3: Visualizar Dashboard
1. Acesse http://localhost:3000
2. Veja cards de chamados com SLA
3. Cores indicam status (Novo, Em Atendimento, Parado)

## 🔐 Segurança

✅ **Criptografia Forte**: AES-256-CBC com IV aleatório  
✅ **Armazenamento Local**: Banco de dados SQLite local  
✅ **Sem Exposição**: Tokens nunca saem do servidor  
✅ **Chave Segura**: Gerenciada via .env  

## 📊 Estrutura do Banco

### Tabela: tickets

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INTEGER | ID do ticket (PK) |
| subject | TEXT | Assunto do chamado |
| status | TEXT | Status legível |
| baseStatus | TEXT | Status da API (New, InAttendance, Stopped) |
| createdDate | TEXT | Data de criação |
| serviceFirstLevel | TEXT | Setor (ex: Sistemas Internos) |
| slaAgreement | TEXT | Nome do SLA |
| slaAgreementRule | TEXT | Regra de SLA aplicada |
| slaSolutionTime | INTEGER | Tempo máximo solução (minutos) |
| slaResponseTime | INTEGER | Tempo máximo resposta (minutos) |
| slaSolutionDate | TEXT | Prazo de solução |
| slaSolutionDateIsPaused | BOOLEAN | SLA pausado? |
| ownerEmail | TEXT | Email do responsável |
| clientName | TEXT | Nome do cliente |
| customFields | TEXT | Campos customizados (JSON) |
| syncedAt | DATETIME | Última sincronização |

## 🔌 API Endpoints

### Config
```
GET  /api/config/token          # Status do token
POST /api/config/token          # Salvar token (criptografado)
```

### Tickets
```
GET    /api/tickets                    # Listar todos
GET    /api/tickets/:id                # Detalhes
GET    /api/tickets/stats/overview     # Estatísticas
```
A sincronização com a API do Movidesk não é mais um endpoint HTTP — é o script
`scripts/sync-movidesk.js`, executado fora do servidor (veja "Step 2" acima).

## 📁 Estrutura

```
SI/
├── index.html                   # Dashboard
├── admin/
│   └── index.html              # Painel admin
├── css/
│   └── style.css               # Estilos
├── js/
│   └── script.js               # Frontend logic
├── server/
│   ├── server.js               # Express
│   ├── db/
│   │   └── database.js         # SQLite init
│   ├── routes/
│   │   ├── config.js           # Config routes
│   │   └── tickets.js          # Tickets routes
│   └── utils/
│       └── crypto.js           # Encryption
├── data/
│   └── movidesk.db             # Banco SQLite
├── package.json
├── .env
└── README.md
```

## 🎯 Filtro de Chamados

Sincroniza automaticamente:
```
serviceFirstLevel: "Sistemas Internos"
baseStatus: "New" OR "InAttendance" OR "Stopped"
```

Editar em: `server/routes/tickets.js` função `fetchTicketsFromApi()`

## 🐛 Troubleshooting

| Erro | Solução |
|------|---------|
| "Token não configurado" | Acesse admin e configure token |
| "Erro ao criptografar" | ENCRYPTION_KEY deve ter 32+ caracteres |
| "Banco bloqueado" | Aguarde e tente novamente |
| "Sem dados" | Verifique token e permissões da API |

## 💡 Customizações Recomendadas

- [ ] Implementar paginação no frontend
- [ ] Adicionar filtros por status/data
- [ ] Criar gráficos de SLA
- [ ] Adicionar exportação para CSV
- [ ] Implementar webhooks do Movidesk
- [ ] Adicionar notificações de vencimento SLA
- [ ] Criar alertas customizados

## 📦 Dependências

```json
{
  "express": "^4.18.2",
  "sqlite3": "^5.1.6",
  "crypto": "^1.0.1",
  "node-fetch": "^2.6.11",
  "cors": "^2.8.5",
  "dotenv": "^16.0.3"
}
```

## 📄 Licença

MIT - Livre para uso e modificação
