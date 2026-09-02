// Cliente HTTP fino para a apidatalake (bronze/silver/gold do Movidesk via API
// própria em https://apidatalake.viasoftcloud.com.br), usado por
// server/routes/tickets.js a partir da Fase 1 da migração (ver plano em
// .claude/plans — migração PAINEL-SI → apidatalake).
//
// Autenticação: Authorization: Bearer <DATALAKE_API_TOKEN>. NUNCA reaproveitar
// aqui o token do Movidesk (movidesk_token, salvo via config.js) nem o token
// do Gateway Proxy / "Ponte API" (X-Gateway-Token, apimovidesk.viasoftcloud.com.br)
// — são três credenciais de sistemas diferentes.
//
// DATALAKE_API_URL/DATALAKE_API_TOKEN vêm por padrão do .env do painel, mas
// podem ser sobrescritos em Configurações → Sistema → "Credenciais da API
// (Datalake)" (tabela `config`, token criptografado com a mesma chave que já
// protege o token Movidesk) — o admin troca ali sem precisar editar o .env
// nem reiniciar o servidor. Valor salvo no painel tem prioridade; se não
// houver nada salvo, cai no .env. Ver invalidateCredentialsCache() abaixo,
// chamada por server/routes/config.js logo após um POST /config/datalake.

const fetch = require('node-fetch');
const db = require('../db/remote');
const { decryptToken } = require('./crypto');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Erro de configuração (nem painel nem .env têm URL/token) — sempre deve
// aparecer explicitamente, nunca deve ser mascarado por um fallback silencioso.
class DatalakeConfigError extends Error {}

// Rede/DNS/5xx da apidatalake — condição em que faz sentido cair no fallback
// pro banco local (tabela `tickets`) durante a transição.
class DatalakeUnavailableError extends Error {}

// 4xx de negócio (401/403/404/422) — token inválido, escopo insuficiente,
// ticket não encontrado, parâmetro inválido. Não deve ser mascarado por
// fallback: é um erro de configuração/uso que precisa aparecer no log.
class DatalakeApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'DatalakeApiError';
    this.status = status;
    this.body = body;
  }
}

// Cache em memória das credenciais efetivas — evita bater no banco a cada
// chamada (tickets.js chama datalakeGet dezenas de vezes por request). TTL
// curto como rede de segurança; a troca pelo painel invalida na hora via
// invalidateCredentialsCache(), então o TTL raramente é o que dispara o reload.
let credentialsCache = null;
let credentialsLoadedAt = 0;
const CREDENTIALS_TTL_MS = 60 * 1000;

function invalidateCredentialsCache() {
  credentialsCache = null;
  credentialsLoadedAt = 0;
}

async function resolveCredentials() {
  const fresh = credentialsCache && (Date.now() - credentialsLoadedAt) < CREDENTIALS_TTL_MS;
  if (fresh) return credentialsCache;

  let dbUrl = '';
  let dbTokenEncrypted = '';
  try {
    const result = await db.query(
      `SELECT key, value FROM config WHERE key IN ('datalake_api_url', 'datalake_api_token')`
    );
    for (const row of result.rows || []) {
      if (row.key === 'datalake_api_url') dbUrl = row.value || '';
      if (row.key === 'datalake_api_token') dbTokenEncrypted = row.value || '';
    }
  } catch (err) {
    // Banco indisponível na hora de resolver credenciais: não derruba a
    // chamada, só cai no .env (mesmo comportamento de antes desta mudança).
    console.warn('[datalakeClient] Falha ao consultar credenciais no banco, usando .env:', err.message);
  }

  let token = process.env.DATALAKE_API_TOKEN || '';
  if (dbTokenEncrypted) {
    try {
      token = decryptToken(dbTokenEncrypted);
    } catch (err) {
      console.warn('[datalakeClient] Falha ao descriptografar token salvo no painel, usando .env:', err.message);
    }
  }

  credentialsCache = {
    baseUrl: (dbUrl || process.env.DATALAKE_API_URL || '').replace(/\/+$/, ''),
    token,
  };
  credentialsLoadedAt = Date.now();
  return credentialsCache;
}

async function ensureConfigured() {
  const creds = await resolveCredentials();
  if (!creds.baseUrl || !creds.token) {
    throw new DatalakeConfigError(
      'URL/token da apidatalake não configurados (nem em Configurações → Sistema, nem no .env do painel)'
    );
  }
  return creds;
}

async function datalakeGet(path, { query = {}, attempt = 0 } = {}) {
  const { baseUrl: BASE_URL, token: API_TOKEN } = await ensureConfigured();

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, value);
  }

  let response;
  try {
    response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
  } catch (error) {
    throw new DatalakeUnavailableError(`Falha de rede ao chamar apidatalake: ${error.message}`);
  }

  // 429 (rate limit por perfil) — respeita Retry-After se vier, senão backoff linear.
  if (response.status === 429 && attempt < 3) {
    const retryAfterHeader = Number(response.headers.get('retry-after'));
    const waitMs = retryAfterHeader > 0 ? retryAfterHeader * 1000 : 1000 * (attempt + 1);
    console.warn(`[datalakeClient] 429 em ${path}. Aguardando ${waitMs}ms (tentativa ${attempt + 1}/3)...`);
    await sleep(waitMs);
    return datalakeGet(path, { query, attempt: attempt + 1 });
  }

  // 5xx — trata como indisponibilidade transitória, com retry curto antes de desistir.
  if (response.status >= 500 && attempt < 2) {
    const waitMs = 800 * (attempt + 1);
    console.warn(`[datalakeClient] ${response.status} em ${path}. Retentando em ${waitMs}ms...`);
    await sleep(waitMs);
    return datalakeGet(path, { query, attempt: attempt + 1 });
  }

  const raw = await response.text();
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }

  if (!response.ok) {
    if (response.status >= 500) {
      throw new DatalakeUnavailableError(
        `apidatalake retornou ${response.status}${raw ? `: ${String(raw).slice(0, 300)}` : ''}`
      );
    }
    const message = (parsed && parsed.message) || `apidatalake retornou ${response.status}`;
    throw new DatalakeApiError(message, response.status, parsed);
  }

  return parsed;
}

// Percorre GET /legacy/tickets por cursor até esgotar ou atingir maxPages
// (teto de segurança — a paginação é sempre "pra frente", nunca reversa).
async function fetchAllLegacyTickets({ status, limit = 100, campos, maxPages = 100 } = {}) {
  const all = [];
  let cursor;
  let page = 0;

  while (page < maxPages) {
    const result = await datalakeGet('/legacy/tickets', {
      query: { status, limit, campos, cursor },
    });
    const rows = Array.isArray(result?.data) ? result.data : [];
    all.push(...rows);
    page += 1;

    if (!result?.pageInfo?.hasMore || !result?.pageInfo?.nextCursor) break;
    cursor = result.pageInfo.nextCursor;
  }

  return all;
}

// campos='*' e incluir='actionsjson,statushistoriesjson,clientsjson' por padrão:
// cobre tudo que inferTicketContext/calcularSLAPrimeiroContato precisam numa
// única chamada. Ver adaptadores em tickets.js para o mapeamento de shape.
async function fetchLegacyTicketDetail(
  id,
  { campos = '*', incluir = 'actionsjson,statushistoriesjson,clientsjson' } = {}
) {
  const result = await datalakeGet(`/legacy/tickets/${encodeURIComponent(id)}`, {
    query: { campos, incluir },
  });
  return result?.data || null;
}

async function fetchLegacyCustomFieldsCatalog() {
  const result = await datalakeGet('/legacy/custom-fields');
  return Array.isArray(result?.data) ? result.data : [];
}

// Detalhe "nativo" de um ticket (silver.ticket + gold.mv_ticket_campos_principais,
// via GET /tickets/:id, mais os sub-recursos /acoes, /clientes e
// /status-historico), usado por tickets.js a partir da Fase 2 da migração no
// lugar de fetchLegacyTicketDetail (/legacy/tickets/:id exige o escopo
// legacy:read, não concedido ao perfil painel-sla — ver README da apidatalake).
// Os sub-recursos nativos, ao contrário do /legacy, vêm com nomes de coluna
// limpos e, no caso de /acoes, com os códigos numéricos reais de tipo/origem
// do Movidesk — não precisa de heurística nenhuma pra adaptar (ver
// nativeRowToTicketShape em tickets.js).
async function fetchNativeTicketDetail(id) {
  const ticketResult = await datalakeGet(`/tickets/${encodeURIComponent(id)}`);
  const ticket = ticketResult?.data;
  if (!ticket || Object.keys(ticket).length === 0) return null;

  const [acoesResult, clientesResult, statusResult] = await Promise.all([
    datalakeGet(`/tickets/${encodeURIComponent(id)}/acoes`),
    datalakeGet(`/tickets/${encodeURIComponent(id)}/clientes`),
    datalakeGet(`/tickets/${encodeURIComponent(id)}/status-historico`),
  ]);

  return {
    ...ticket,
    acoes: Array.isArray(acoesResult?.data) ? acoesResult.data : [],
    clientes: Array.isArray(clientesResult?.data) ? clientesResult.data : [],
    statusHistorico: Array.isArray(statusResult?.data) ? statusResult.data : [],
  };
}

// Custom fields (formato longo, com máscara de PII se aplicável) de um
// ticket — GET /tickets/:id/campos, escopo tickets:read. Reaproveitado por
// filterByCustomFieldCondition (tickets.js) e pelo sync de Módulo x Rotina
// (curadoria.js), no lugar da chamada direta a api.movidesk.com.
async function fetchTicketCamposDatalake(id) {
  const result = await datalakeGet(`/tickets/${encodeURIComponent(id)}/campos`);
  return Array.isArray(result?.data) ? result.data : [];
}

module.exports = {
  DatalakeConfigError,
  DatalakeUnavailableError,
  DatalakeApiError,
  datalakeGet,
  fetchAllLegacyTickets,
  fetchLegacyTicketDetail,
  fetchLegacyCustomFieldsCatalog,
  fetchNativeTicketDetail,
  fetchTicketCamposDatalake,
  invalidateCredentialsCache,
};
