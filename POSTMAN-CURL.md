# Comandos CURL para Testar no Postman

## Autenticação
Todos os endpoints requerem um header `Authorization` com seu token JWT:
```
Authorization: Bearer SEU_TOKEN_JWT_AQUI
```

---

## 1️⃣ SINCRONIZAR TICKETS (POST)
**URL:** `http://localhost:3000/api/tickets/sync?async=1`
**Método:** POST

### CURL:
```bash
curl -X POST "http://localhost:3000/api/tickets/sync?async=1" \
  -H "Authorization: Bearer SEU_TOKEN_JWT_AQUI" \
  -H "Content-Type: application/json"
```

### Resposta esperada:
```json
{
  "success": true,
  "running": true,
  "alreadyRunning": false,
  "syncId": "1234567890-abcdef",
  "message": "Sincronização iniciada"
}
```

---

## 2️⃣ VERIFICAR STATUS DA SINCRONIZAÇÃO (GET)
**URL:** `http://localhost:3000/api/tickets/sync/status?syncId=SEU_SYNC_ID`
**Método:** GET

### CURL:
```bash
curl -X GET "http://localhost:3000/api/tickets/sync/status?syncId=1234567890-abcdef" \
  -H "Authorization: Bearer SEU_TOKEN_JWT_AQUI"
```

### Resposta esperada:
```json
{
  "syncId": "1234567890-abcdef",
  "running": true,
  "status": "running",
  "phase": "fetching",
  "message": "Buscando lote 1 (skip=0)",
  "startedAt": "2026-05-19T10:30:45.123Z",
  "totalFetched": 45,
  "totalSaved": 45,
  "processedBatches": 1,
  "lastBatchSize": 45
}
```

---

## 3️⃣ CARREGAR CONDIÇÕES MOVIDESK (GET)
**URL:** `http://localhost:3000/api/config/movidesk-conditions`
**Método:** GET

### CURL:
```bash
curl -X GET "http://localhost:3000/api/config/movidesk-conditions" \
  -H "Authorization: Bearer SEU_TOKEN_JWT_AQUI"
```

### Resposta esperada:
```json
{
  "statuses": ["New", "InAttendance", "Stopped"],
  "serviceFirstLevel": "Suporte Técnico",
  "customFieldId": "23946",
  "customFieldValue": "Suporte Técnico",
  "syncLimit": 100
}
```

---

## 4️⃣ SALVAR CONDIÇÕES MOVIDESK (POST)
**URL:** `http://localhost:3000/api/config/movidesk-conditions`
**Método:** POST

### CURL:
```bash
curl -X POST "http://localhost:3000/api/config/movidesk-conditions" \
  -H "Authorization: Bearer SEU_TOKEN_JWT_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "statuses": ["New", "InAttendance"],
    "serviceFirstLevel": "Suporte Técnico",
    "customFieldId": "23946",
    "customFieldValue": "Suporte Técnico",
    "syncLimit": 100
  }'
```

### Resposta esperada:
```json
{
  "success": true,
  "message": "Condições Movidesk salvas com sucesso"
}
```

---

## 5️⃣ BUSCAR TICKETS ABERTOS DO BANCO (GET)
**URL:** `http://localhost:3000/api/tickets`
**Método:** GET

**Descrição:** Busca tickets sincronizados no banco de dados com status aberto (New, InAttendance, Stopped, InProgress). Retorna até 100 registros.

**Filtros automáticos:**
- Se você for **supervisor**: retorna apenas tickets da sua vertical
- Se for **admin**: retorna tickets de todas as verticais

### CURL:
```bash
curl -X GET "http://localhost:3000/api/tickets" \
  -H "Authorization: Bearer SEU_TOKEN_JWT_AQUI" \
  -H "Content-Type: application/json"
```

### Resposta esperada:
```json
[
  {
    "id": "1234567",
    "subject": "Sistema caiu",
    "status": "In Attendance",
    "baseStatus": "InAttendance",
    "serviceFirstLevel": "Suporte Técnico",
    "ownerName": "Rafael Inácio",
    "ownerEmail": "rafael@email.com",
    "owner_team": "Flux",
    "clientName": "Edson Matana",
    "createdDate": "2026-05-19T10:30:00.000Z",
    "lastActionDate": "2026-05-19T14:45:00.000Z",
    "actionsCount": 5
  },
  ...
]
```

---

## 5️⃣B BUSCAR TICKET POR ID (GET)
**URL:** `http://localhost:3000/api/tickets/:id`
**Método:** GET

**Descrição:** Busca um ticket específico pelo seu ID. Retorna detalhes completos do ticket.

### CURL:
```bash
curl -X GET "http://localhost:3000/api/tickets/1234567" \
  -H "Authorization: Bearer SEU_TOKEN_JWT_AQUI" \
  -H "Content-Type: application/json"
```

### Resposta esperada:
```json
{
  "id": "1234567",
  "subject": "Sistema caiu",
  "status": "In Attendance",
  "baseStatus": "InAttendance",
  "serviceFirstLevel": "Suporte Técnico",
  "ownerName": "Rafael Inácio",
  "ownerEmail": "rafael@email.com",
  "owner_team": "Flux",
  "clientName": "Edson Matana",
  "clientEmail": "edson@email.com",
  "createdDate": "2026-05-19T10:30:00.000Z",
  "lastActionDate": "2026-05-19T14:45:00.000Z",
  "actionsCount": 5,
  "customFields": [...],
  "justification": "Informação adicional"
}
```

---

## 6️⃣ BUSCAR CURADORIA (GET)
**URL:** `http://localhost:3000/api/curadoria`
**Método:** GET

### CURL:
```bash
curl -X GET "http://localhost:3000/api/curadoria" \
  -H "Authorization: Bearer SEU_TOKEN_JWT_AQUI"
```

---

## 7️⃣ BUSCAR PESSOAS (GET)
**URL:** `http://localhost:3000/api/pessoas`
**Método:** GET

### CURL:
```bash
curl -X GET "http://localhost:3000/api/pessoas" \
  -H "Authorization: Bearer SEU_TOKEN_JWT_AQUI"
```

---

## 📋 COMO USAR NO POSTMAN

1. **Abra o Postman** ou similar (Thunder Client, Insomnia, etc)
2. **Cole um dos curls acima** usando a aba "Code" → "cURL"
3. **Substitua `SEU_TOKEN_JWT_AQUI`** pelo seu token real (obtido após login)
4. **Envie e veja a resposta**

### Para obter o token JWT:
```bash
curl -X POST "http://localhost:3000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "seu@email.com",
    "password": "sua_senha"
  }'
```

A resposta incluirá um campo `token` que você usa nos outros requests.

---

## ⚠️ NOTAS IMPORTANTES

- Todos os endpoints de sincronização/config requerem role **admin**
- Use `?async=1` em `/api/tickets/sync` para sincronizar em background
- Sem `?async=1` a requisição espera até terminar (pode demorar)
- O `syncId` é retornado no POST e usado para monitorar progresso no GET `/sync/status`
