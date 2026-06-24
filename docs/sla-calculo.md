# Cálculo de SLA — Primeiro Contato

Documentação do algoritmo usado para calcular o SLA de **primeiro contato** de um ticket, considerando horário útil, pausas por status e urgência.

---

## 1. Conceito

O SLA de primeiro contato mede **quantos minutos úteis se passaram desde a abertura do ticket até o primeiro retorno de um agente** (não do cliente), e compara com o prazo previsto pela urgência.

```
tempo_consumido = minutos_úteis(abertura → primeiro_contato) - pausas
dentroDoSLA     = tempo_consumido <= prazo_previsto
estouro         = max(0, tempo_consumido - prazo_previsto)
```

---

## 2. Prazos por urgência

| Urgência  | Prazo (minutos úteis) | Equivalente |
|-----------|----------------------|-------------|
| Crítica   | 30 min               | 30 min      |
| Alta      | 60 min               | 1 hora      |
| Média     | 120 min              | 2 horas     |
| Baixa     | 240 min              | 4 horas     |

O campo usado para determinar a urgência é `urgency` ou, como fallback, `slaAgreementRule` (comparação case-insensitive sem acentos).

---

## 3. Horário útil

Apenas os seguintes intervalos, de **segunda a sexta-feira**, contam como tempo útil:

| Turno     | Início | Fim   |
|-----------|--------|-------|
| Manhã     | 07:45  | 12:00 |
| Tarde     | 13:30  | 18:00 |

Sábados e domingos são **ignorados**. O algoritmo itera dia a dia e calcula a interseção entre o período real e os intervalos permitidos.

---

## 4. Definição de primeiro contato

Percorre as `actions` do ticket em ordem cronológica e retorna a **primeira ação que satisfaz**:

1. `action.type === 2` → ação pública (comentário visível ao cliente)
2. `action.isDeleted` é falso
3. O autor (`action.createdBy.id`) **não** está na lista de clientes do ticket (`ticket.clients`) nem é o criador do ticket (`ticket.createdBy`)

Se nenhuma ação satisfizer esses critérios, o resultado é `primeiroContatoEncontrado: false`.

---

## 5. Pausas de SLA

Durante períodos em que o ticket está em determinados status, o tempo **não é contabilizado**. Os status de pausa são:

- `aguardando retorno do cliente`
- `aguardando terceiro/fornecedor`
- `aguardando validação do cliente`
- `em atendimento - desenvolvimento`

A linha do tempo de status é construída a partir de `statusHistories` (preferencial) ou das próprias `actions` (fallback). O algoritmo percorre os intervalos entre mudanças de status e soma apenas os trechos ativos (não pausados).

```
abertura ──[ativo]──> mudança para "aguardando" ──[PAUSADO]──> retorno ──[ativo]──> primeiro contato
               ↑ conta                                                        ↑ conta
```

---

## 6. Fluxo completo

```
1. Determinar prazo previsto (urgência → minutos)
2. Identificar data de abertura (ticket.createdDate)
3. Encontrar primeiro contato de agente nas actions
4. Se não encontrado → primeiroContatoEncontrado = false, fim
5. Montar linha do tempo de status (statusHistories ou actions)
6. Calcular minutos úteis com pausas entre abertura e primeiro contato
7. Comparar com prazo:
   - dentroDoSLA = consumido <= previsto
   - estouro     = max(0, consumido - previsto)
```

---

## 7. Estrutura do objeto retornado

```json
{
  "ticketId": 823408,
  "urgency": "Alta",
  "slaAgreementRule": "SLA Alta Prioridade",
  "slaPrevistoMinutos": 60,
  "abertura": "2026-04-28T13:00:00.000Z",
  "primeiroContatoEncontrado": true,
  "primeiroContato": {
    "actionId": 9912,
    "createdDate": "2026-04-28T14:18:00.000Z",
    "createdBy": "Rafael Inácio"
  },
  "minutosUteisConsumidos": 78,
  "dentroDoSLA": false,
  "minutosEstouro": 18
}
```

---

## 8. Estrutura mínima do ticket esperada

```json
{
  "id": 823408,
  "createdDate": "2026-04-28T13:00:00.000Z",
  "urgency": "Alta",
  "slaAgreementRule": "SLA Alta Prioridade",
  "createdBy": { "id": "cli_001" },
  "clients": [
    { "id": "cli_001" }
  ],
  "actions": [
    {
      "id": 9910,
      "type": 2,
      "isDeleted": false,
      "createdDate": "2026-04-28T13:05:00.000Z",
      "createdBy": { "id": "cli_001", "businessName": "Cliente" }
    },
    {
      "id": 9912,
      "type": 2,
      "isDeleted": false,
      "createdDate": "2026-04-28T14:18:00.000Z",
      "createdBy": { "id": "age_007", "businessName": "Rafael Inácio" }
    }
  ],
  "statusHistories": [
    { "changedDate": "2026-04-28T13:00:00.000Z", "status": "Novo" },
    { "changedDate": "2026-04-28T13:10:00.000Z", "status": "Em Atendimento" }
  ]
}
```

---

## 9. Campos opcionais

| Campo             | Obrigatório | Fallback                        |
|-------------------|-------------|----------------------------------|
| `urgency`         | Não         | Usa `slaAgreementRule`           |
| `statusHistories` | Não         | Usa `status` das `actions`       |
| `clients`         | Não         | Considera apenas `createdBy`     |
| `createdBy`       | Não         | Nenhuma exclusão de autor        |

---

## 10. Uso

```js
// Node.js (CommonJS)
const { calcularSLAPrimeiroContato } = require('./sla-standalone');

const resultado = calcularSLAPrimeiroContato(ticket);
console.log(resultado.dentroDoSLA);       // true / false
console.log(resultado.minutosEstouro);    // 0 se dentro do prazo
```

```js
// Browser / ES Module
import { calcularSLAPrimeiroContato } from './sla-standalone.mjs';
```

O script `sla-standalone.js` não tem dependências externas e funciona em **Node.js 14+** e navegadores modernos.
