/**
 * sla-standalone.js
 * ─────────────────────────────────────────────────────────────────
 * Cálculo de SLA de primeiro contato — sem dependências externas.
 * Funciona em Node.js 14+ e navegadores modernos.
 *
 * Uso (CommonJS):
 *   const { calcularSLAPrimeiroContato } = require('./sla-standalone');
 *
 * Uso (ESM / Browser):
 *   import { calcularSLAPrimeiroContato } from './sla-standalone.js';
 *
 * Ver docs/sla-calculo.md para documentação completa.
 * ─────────────────────────────────────────────────────────────────
 */

// ─── Configuração ────────────────────────────────────────────────

/**
 * Prazo de primeiro contato em minutos úteis por urgência.
 * Ajuste conforme seu contrato de SLA.
 */
const SLA_PRIMEIRO_CONTATO_MINUTOS = {
  critica: 30,
  alta:    60,
  media:   120,
  baixa:   240,
};

/**
 * Janelas de horário útil (segunda a sexta).
 * Cada entrada: { inicio: hora, inicioMin: minuto, fim: hora, fimMin: minuto }
 */
const HORARIOS_ATENDIMENTO = [
  { inicio: 7,  inicioMin: 45, fim: 12, fimMin: 0 },   // 07:45–12:00
  { inicio: 13, inicioMin: 30, fim: 18, fimMin: 0 },   // 13:30–18:00
];

/**
 * Status que pausam o contador de SLA (comparação sem acentos, minúsculo).
 * Adicione ou remova conforme seu fluxo de trabalho.
 */
const STATUS_PAUSA_SLA = new Set([
  "aguardando retorno do cliente",
  "aguardando terceiro/fornecedor",
  "aguardando validacao do cliente",
  "aguardando validação do cliente",
  "em atendimento - desenvolvimento",
  "em atendimento desenvolvimento",
]);

// ─── Utilitários ─────────────────────────────────────────────────

/** Remove acentos e normaliza para minúsculo. */
function normalizar(texto) {
  if (!texto) return "";
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Converte string ISO ou Date para Date. Retorna null se inválido. */
function parseData(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return isNaN(d.getTime()) ? null : d;
}

/** Retorna true se a data cair em dia útil (seg–sex). */
function ehDiaUtil(data) {
  const dia = data.getUTCDay();
  return dia !== 0 && dia !== 6;
}

/** Retorna true se o status pausar o SLA. */
function ehStatusPausado(status) {
  return STATUS_PAUSA_SLA.has(normalizar(status));
}

// ─── Tempo útil ──────────────────────────────────────────────────

/**
 * Calcula minutos úteis entre dois instantes (Date).
 * Considera apenas dias úteis e as janelas em HORARIOS_ATENDIMENTO.
 *
 * @param {Date} inicio
 * @param {Date} fim
 * @returns {number} minutos úteis
 */
function minutosUteisEntre(inicio, fim) {
  if (!inicio || !fim || fim <= inicio) return 0;

  let total = 0;
  const diaAtual = new Date(inicio);
  diaAtual.setUTCHours(0, 0, 0, 0);

  const diaFinal = new Date(fim);
  diaFinal.setUTCHours(0, 0, 0, 0);

  while (diaAtual <= diaFinal) {
    if (ehDiaUtil(diaAtual)) {
      for (const janela of HORARIOS_ATENDIMENTO) {
        const jInicio = new Date(diaAtual);
        jInicio.setUTCHours(janela.inicio, janela.inicioMin, 0, 0);

        const jFim = new Date(diaAtual);
        jFim.setUTCHours(janela.fim, janela.fimMin, 0, 0);

        const de = new Date(Math.max(inicio.getTime(), jInicio.getTime()));
        const ate = new Date(Math.min(fim.getTime(), jFim.getTime()));

        if (ate > de) {
          total += Math.floor((ate - de) / 60000);
        }
      }
    }
    diaAtual.setUTCDate(diaAtual.getUTCDate() + 1);
  }

  return total;
}

// ─── Primeiro contato ─────────────────────────────────────────────

/**
 * Encontra a primeira ação pública feita por um agente (não pelo cliente).
 *
 * Critérios:
 *  - action.type === 2  (ação pública)
 *  - action.isDeleted é falso
 *  - action.createdBy.id NÃO está em ticket.clients nem é ticket.createdBy
 *
 * @param {object} ticket
 * @returns {{ actionId, createdDate: Date, createdBy: string } | null}
 */
function encontrarPrimeiroContato(ticket) {
  const actions = ticket.actions || [];

  // Monta conjunto de IDs de clientes/solicitantes
  const clientesIds = new Set();
  (ticket.clients || []).forEach(c => {
    if (c.id != null) clientesIds.add(String(c.id));
  });
  if (ticket.createdBy && ticket.createdBy.id != null) {
    clientesIds.add(String(ticket.createdBy.id));
  }

  // Ordena ações cronologicamente
  const ordenadas = [...actions].sort((a, b) => {
    const da = parseData(a.createdDate) || new Date(0);
    const db = parseData(b.createdDate) || new Date(0);
    return da - db;
  });

  for (const action of ordenadas) {
    if (action.isDeleted) continue;
    if (action.type !== 2) continue;

    const autorId = String((action.createdBy || {}).id ?? "");
    if (clientesIds.has(autorId)) continue;

    return {
      actionId:    action.id,
      createdDate: parseData(action.createdDate),
      createdBy:   (action.createdBy || {}).businessName || null,
    };
  }

  return null;
}

// ─── Linha do tempo de status ─────────────────────────────────────

/**
 * Constrói a linha do tempo de mudanças de status.
 * Prefere ticket.statusHistories; usa action.status como fallback.
 *
 * @param {object} ticket
 * @returns {{ data: Date, status: string }[]} ordenado por data
 */
function montarLinhaDoTempoStatus(ticket) {
  const eventos = [];

  const fonte =
    ticket.statusHistories && ticket.statusHistories.length > 0
      ? ticket.statusHistories.map(h => ({ data: parseData(h.changedDate), status: h.status }))
      : (ticket.actions || []).map(a => ({ data: parseData(a.createdDate), status: a.status }));

  for (const e of fonte) {
    if (e.data && e.status) eventos.push(e);
  }

  return eventos.sort((a, b) => a.data - b.data);
}

// ─── Minutos úteis com pausas ─────────────────────────────────────

/**
 * Como minutosUteisEntre, mas desconta períodos em status de pausa.
 *
 * @param {object} ticket
 * @param {Date} inicio
 * @param {Date} fim
 * @returns {number} minutos úteis ativos
 */
function calcularMinutosUteisComPausas(ticket, inicio, fim) {
  const eventos = montarLinhaDoTempoStatus(ticket);

  if (eventos.length === 0) {
    return minutosUteisEntre(inicio, fim);
  }

  let total = 0;
  let statusAtual = eventos[0].status;
  let cursor = inicio;

  for (const evento of eventos) {
    if (evento.data <= inicio) {
      statusAtual = evento.status;
      continue;
    }
    if (evento.data >= fim) break;

    if (!ehStatusPausado(statusAtual)) {
      total += minutosUteisEntre(cursor, evento.data);
    }

    cursor = evento.data;
    statusAtual = evento.status;
  }

  if (cursor < fim && !ehStatusPausado(statusAtual)) {
    total += minutosUteisEntre(cursor, fim);
  }

  return total;
}

// ─── Urgência → prazo ─────────────────────────────────────────────

/**
 * Determina o prazo em minutos a partir da urgência do ticket.
 * Tenta ticket.urgency primeiro, depois ticket.slaAgreementRule.
 *
 * @param {object} ticket
 * @returns {number} prazo em minutos
 */
function obterMinutosSLAPorUrgencia(ticket) {
  const texto = normalizar(ticket.urgency || ticket.slaAgreementRule || "");

  if (texto in SLA_PRIMEIRO_CONTATO_MINUTOS) return SLA_PRIMEIRO_CONTATO_MINUTOS[texto];
  if (texto.includes("critica")) return SLA_PRIMEIRO_CONTATO_MINUTOS.critica;
  if (texto.includes("alta"))    return SLA_PRIMEIRO_CONTATO_MINUTOS.alta;
  if (texto.includes("media"))   return SLA_PRIMEIRO_CONTATO_MINUTOS.media;
  if (texto.includes("baixa"))   return SLA_PRIMEIRO_CONTATO_MINUTOS.baixa;

  return SLA_PRIMEIRO_CONTATO_MINUTOS.media; // padrão: Média
}

// ─── Ponto de entrada principal ───────────────────────────────────

/**
 * Calcula o SLA de primeiro contato de um ticket.
 *
 * @param {object} ticket - Objeto do ticket (ver estrutura em sla-calculo.md)
 * @returns {{
 *   ticketId: any,
 *   urgency: string,
 *   slaAgreementRule: string,
 *   slaPrevistoMinutos: number,
 *   abertura: string|null,
 *   primeiroContatoEncontrado: boolean,
 *   primeiroContato: { actionId, createdDate: string, createdBy: string } | null,
 *   minutosUteisConsumidos: number|null,
 *   dentroDoSLA: boolean|null,
 *   minutosEstouro: number|null
 * }}
 */
function calcularSLAPrimeiroContato(ticket) {
  const abertura = parseData(ticket.createdDate);
  const slaPrevistoMinutos = obterMinutosSLAPorUrgencia(ticket);

  const resultado = {
    ticketId:                 ticket.id,
    urgency:                  ticket.urgency     || null,
    slaAgreementRule:         ticket.slaAgreementRule || null,
    slaPrevistoMinutos,
    abertura:                 abertura ? abertura.toISOString() : null,
    primeiroContatoEncontrado: false,
    primeiroContato:          null,
    minutosUteisConsumidos:   null,
    dentroDoSLA:              null,
    minutosEstouro:           null,
  };

  if (!abertura) return resultado;

  const primeiroContato = encontrarPrimeiroContato(ticket);
  if (!primeiroContato) return resultado;

  const minutosConsumidos = calcularMinutosUteisComPausas(
    ticket,
    abertura,
    primeiroContato.createdDate
  );

  resultado.primeiroContatoEncontrado = true;
  resultado.primeiroContato = {
    actionId:    primeiroContato.actionId,
    createdDate: primeiroContato.createdDate.toISOString(),
    createdBy:   primeiroContato.createdBy,
  };
  resultado.minutosUteisConsumidos = minutosConsumidos;
  resultado.dentroDoSLA            = minutosConsumidos <= slaPrevistoMinutos;
  resultado.minutosEstouro         = Math.max(0, minutosConsumidos - slaPrevistoMinutos);

  return resultado;
}

// ─── Exportações ──────────────────────────────────────────────────

// Suporte a CommonJS (Node.js) e carregamento direto no browser
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    calcularSLAPrimeiroContato,
    minutosUteisEntre,
    calcularMinutosUteisComPausas,
    encontrarPrimeiroContato,
    normalizar,
    parseData,
  };
}

// ─── Exemplo de uso (execute: node sla-standalone.js) ────────────

if (typeof require !== "undefined" && require.main === module) {
  const ticketExemplo = {
    id: 823408,
    createdDate: "2026-04-28T13:00:00.000Z",
    urgency: "Alta",
    createdBy: { id: "cli_001" },
    clients: [{ id: "cli_001" }],
    actions: [
      {
        id: 9910,
        type: 2,
        isDeleted: false,
        createdDate: "2026-04-28T13:05:00.000Z",
        createdBy: { id: "cli_001", businessName: "Cliente" },
      },
      {
        id: 9912,
        type: 2,
        isDeleted: false,
        createdDate: "2026-04-28T14:18:00.000Z",
        createdBy: { id: "age_007", businessName: "Rafael Inácio" },
      },
    ],
    statusHistories: [
      { changedDate: "2026-04-28T13:00:00.000Z", status: "Novo" },
      { changedDate: "2026-04-28T13:10:00.000Z", status: "Em Atendimento" },
    ],
  };

  const resultado = calcularSLAPrimeiroContato(ticketExemplo);
  console.log("── Resultado SLA ───────────────────────────────");
  console.log(`Ticket:          #${resultado.ticketId}`);
  console.log(`Urgência:        ${resultado.urgency}`);
  console.log(`Prazo previsto:  ${resultado.slaPrevistoMinutos} min`);
  console.log(`Primeiro contato encontrado: ${resultado.primeiroContatoEncontrado}`);
  if (resultado.primeiroContatoEncontrado) {
    console.log(`Primeiro contato por: ${resultado.primeiroContato.createdBy}`);
    console.log(`Tempo consumido: ${resultado.minutosUteisConsumidos} min úteis`);
    console.log(`Dentro do SLA:   ${resultado.dentroDoSLA}`);
    console.log(`Estouro:         ${resultado.minutosEstouro} min`);
  }
  console.log("────────────────────────────────────────────────");
}
