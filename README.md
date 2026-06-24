# Dashboard Movidesk com Sincronização de SLA

Sistema completo para visualizar e gerenciar chamados do Movidesk com análise de SLA, integração de API, sincronização com paginação e criptografia de tokens.

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
1. Clique "🔄 Sincronizar Agora"
2. Sistema fará paginação automática
3. Todos os chamados serão salvos no banco
4. Estatísticas atualizarão em tempo real

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
POST   /api/tickets/sync               # Sincronizar
GET    /api/tickets/stats/overview     # Estatísticas
```

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
