// ── gatewayClient.js — Cliente do Movidesk Gateway (movidesk--ponte-api) ──
//
// Fala com o API Gateway de governança em vez de bater direto na API do
// Movidesk. O gateway injeta o token master do Movidesk, aplica RBAC,
// rate limit e auditoria — este cliente só precisa do token de consumidor
// (perfil "readonly", ex: consumidor "Dashboard BI") emitido pelo painel
// admin do gateway (Tokens → Novo token).
//
// Usado hoje só pela rota de listagem de tickets (GET /api/tickets e
// /api/tickets/past) — o restante do painel continua consultando o
// Postgres local normalmente.
const fetch = require('node-fetch');

const GATEWAY_URL = (process.env.GATEWAY_URL || '').replace(/\/+$/, '');
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';

// Cache curto em memória: absorve o refresh automático do dashboard (a cada
// 60s, por aba/usuário) num único request ao gateway, evitando estourar o
// rate limit do perfil "readonly" (15 req/min) quando várias pessoas estão
// com o painel aberto ao mesmo tempo. Chave = assinatura da query.
const CACHE_TTL_MS = 20 * 1000;
const cache = new Map();

function isConfigured() {
  return Boolean(GATEWAY_URL && GATEWAY_TOKEN);
}

function buildQuery({ select, expand, filter, orderby, top, skip }) {
  const params = new URLSearchParams();
  if (select) params.set('$select', select);
  if (expand) params.set('$expand', expand);
  if (filter) params.set('$filter', filter);
  if (orderby) params.set('$orderby', orderby);
  if (top != null) params.set('$top', String(top));
  if (skip) params.set('$skip', String(skip));
  return params.toString();
}

// GET /proxy/tickets via gateway — devolve o array de tickets "crus" do
// Movidesk (mesmo formato que a API real retorna em `value`/array).
async function fetchTicketsFromGateway(options = {}) {
  if (!isConfigured()) {
    throw new Error('GATEWAY_URL/GATEWAY_TOKEN nao configurados no .env do painel');
  }

  const query = buildQuery(options);
  const cacheKey = query;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `${GATEWAY_URL}/proxy/tickets?${query}`;

  const response = await fetch(url, {
    headers: { 'X-Gateway-Token': GATEWAY_TOKEN }
  });

  const raw = await response.text();
  let parsed = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      parsed = raw;
    }
  }

  if (!response.ok) {
    const detail = typeof parsed === 'string' ? parsed.slice(0, 500) : JSON.stringify(parsed || {}).slice(0, 500);
    const code = parsed && typeof parsed === 'object' ? parsed.code : null;
    const err = new Error(`Gateway retornou ${response.status}${code ? ` (${code})` : ''}${detail ? ` - ${detail}` : ''}`);
    err.statusCode = response.status;
    throw err;
  }

  const data = Array.isArray(parsed) ? parsed
    : (parsed && Array.isArray(parsed.value)) ? parsed.value
    : (parsed && Array.isArray(parsed.data)) ? parsed.data
    : [];

  cache.set(cacheKey, { at: Date.now(), data });
  return data;
}

module.exports = { fetchTicketsFromGateway, isConfigured };
