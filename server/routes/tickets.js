const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const db = require('../db/remote');
const { getToken, getPrompt } = require('./config');
const { decryptToken } = require('../utils/crypto');
const { authMiddleware, requireRole } = require('./auth');
const ENABLE_TICKET_SYNC = (() => {
  const raw = process.env.ENABLE_TICKET_SYNC;
  if (raw == null || raw === '') return true;
  return ['1', 'true', 'yes'].includes(String(raw).toLowerCase());
})();

const MOVIDESK_API = 'https://api.movidesk.com/public/v1/tickets';
let activeSyncPromise = null;
let activeSyncState = {
  syncId: null,
  running: false,
  status: 'idle',
  phase: 'idle',
  message: 'Aguardando sincronizacao',
  startedAt: null,
  updatedAt: null,
  completedAt: null,
  totalFetched: 0,
  totalSaved: 0,
  processedBatches: 0,
  lastBatchSize: 0,
  lastError: null,
};

function updateSyncState(patch = {}) {
  activeSyncState = {
    ...activeSyncState,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

function getSyncState() {
  return { ...activeSyncState };
}

function normalizeTicketRow(row = {}) {
  return {
    id: row.id,
    subject: row.subject || '',
    status: row.status || '',
    baseStatus: row.baseStatus ?? row.basestatus ?? '',
    createdDate: row.createdDate ?? row.createddate ?? null,
    lastActionDate: row.lastActionDate ?? row.lastactiondate ?? null,
    lastUpdate: row.lastUpdate ?? row.lastupdate ?? null,
    serviceFirstLevelId: row.serviceFirstLevelId ?? row.servicefirstlevelid ?? null,
    serviceFirstLevel: row.serviceFirstLevel ?? row.servicefirstlevel ?? '',
    serviceSecondLevel: row.serviceSecondLevel ?? row.servicesecondlevel ?? '',
    slaAgreement: row.slaAgreement ?? row.slaagreement ?? '',
    slaAgreementRule: row.slaAgreementRule ?? row.slaagreementrule ?? '',
    slaSolutionTime: row.slaSolutionTime ?? row.slasolutiontime ?? null,
    slaResponseTime: row.slaResponseTime ?? row.slaresponsetime ?? null,
    slaSolutionDate: row.slaSolutionDate ?? row.slasolutiondate ?? null,
    slaSolutionDateIsPaused: row.slaSolutionDateIsPaused ?? row.slasolutiondateispaused ?? false,
    slaResponseDate: row.slaResponseDate ?? row.slaresponsedate ?? null,
    slaRealResponseDate: row.slaRealResponseDate ?? row.slarealresponsedate ?? null,
    ownerEmail: row.ownerEmail ?? row.owneremail ?? '',
    ownerName: row.ownerName ?? row.ownername ?? '',
    ownerTeam: row.ownerTeam ?? row.ownerteam ?? row.owner_team ?? '',
    clientName: row.clientName ?? row.clientname ?? '',
    clientEmail: row.clientEmail ?? row.clientemail ?? '',
    clientOrganization: row.clientOrganization ?? row.clientorganization ?? '',
    justification: row.justification ?? '',
    customFields: row.customFields ?? row.customfields ?? null,
    actionsCount: row.actionsCount ?? row.actionscount ?? 0,
    syncedAt: row.syncedAt ?? row.syncedat ?? null,
    updatedAt: row.updatedAt ?? row.updatedat ?? null,
    lastActionCreatedByBusinessName: row.lastActionCreatedByBusinessName ?? row.lastactioncreatedbybusinessname ?? '',
    lastActionOrigin: row.lastActionOrigin ?? row.lastactionorigin ?? '',
    actionsJson: row.actionsJson ?? row.actionsjson ?? null,
    clientsJson: row.clientsJson ?? row.clientsjson ?? null,
    statusHistoriesJson: row.statusHistoriesJson ?? row.statushistoriesjson ?? null
  };
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  if (value === '[object Object]') return fallback;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

function inferTicketContext(ticket) {
  const customFields = safeJsonParse(ticket.customFields, []);
  const actions = safeJsonParse(ticket.actionsJson, []);
  const clients = safeJsonParse(ticket.clientsJson, []);
  const statusHistories = safeJsonParse(ticket.statusHistoriesJson, []);
  const isInternalSystems = (ticket.serviceFirstLevel || '').trim().toLowerCase() === 'sistemas internos';

  // Heuristica: tenta capturar valor por nome/chave, com fallback seguro.
  function pickFromCustomField(terms) {
    const list = Array.isArray(customFields) ? customFields : [];
    const found = list.find((item) => {
      const blob = JSON.stringify(item || {}).toLowerCase();
      return terms.some((t) => blob.includes(t));
    });
    if (!found) return '';
    if (typeof found.value === 'string' && found.value.trim()) return found.value.trim();
    if (Array.isArray(found.items) && found.items.length) {
      return found.items
        .map((i) => i.businessName || i.value || i.label || '')
        .filter(Boolean)
        .join(', ');
    }
    return '';
  }

  return {
    isInternalSystems,
    ticketJson: {
      ...ticket,
      customFields,
      actions,
      clients,
      statusHistories
    },
    actions,
    solicitante: pickFromCustomField(['solicitante']) || ticket.clientName || '',
    fato: pickFromCustomField(['fato']) || ticket.subject || '',
    causa: pickFromCustomField(['causa']) || '',
    ModuloXRotina: pickFromCustomField(['moduloxrotina', 'modulo x rotina', 'modulo']) || ticket.serviceSecondLevel || ticket.serviceFirstLevel || '',
    subject: ticket.subject || '',
    owner: {
      businessName: ticket.ownerName || '',
      email: ticket.ownerEmail || ''
    }
  };
}

function buildExecutivePrompt(context) {
  const actionsJson = JSON.stringify(context.actions || [], null, 2);
  const ticketJson = JSON.stringify(context.ticketJson || {}, null, 2);
  return `Analise o ticket JSON abaixo e retorne APENAS um objeto JSON valido com todos os campos preenchidos com dados reais do ticket.

JSON DO TICKET:
${ticketJson}

Voce e um analista senior de suporte critico que analisa tickets de suporte em JSON.

REGRAS ABSOLUTAS:
- Analise TODO o JSON do ticket fornecido, incluindo campos principais, customFields, actions, clients e statusHistories
- Se serviceFirstLevel for exatamente "Sistemas Internos", nao use causa, fato nem ModuloXRotina como base da analise, porque esses campos podem nao existir ou nao ser aplicaveis
- Em tickets de Sistemas Internos, baseie diagnostico, urgencia e impacto principalmente em subject, description, justification, actions, clients, statusHistories e demais campos reais do ticket
- Nao limite a analise apenas ao subject, causa, fato ou actions; use o objeto completo como fonte primária
- Ignore acoes com type = 1 (acoes internas de escalonamento/atribuicao)
- Ignore acoes onde createdBy.id = "007" (acoes de sistema)
- Suporte = createdBy com email contendo @viasoft.com.br OU createdBy.businessName === owner.businessName (quando businessName nao for vazio)
- Cliente = usuario solicitante do chamado ${context.solicitante || ''}
- Fato relatado = ${context.fato || ''}
- Causa identificada = ${context.causa || ''}
- Modulo X Rotina = ${context.ModuloXRotina || ''}
- Responda APENAS com um JSON valido, sem markdown, sem texto adicional, sem crases, sem blocos de codigo
- Preencha TODOS os campos com dados reais do JSON do ticket
- Nunca use dados ficticios como user123 ou owner@example.com
- Use SEMPRE os nomes e e-mails reais presentes no JSON fornecido

REGRAS PRIORITARIAS DE URGENCIA:
- Se subject ou description tiver: falha catastrófica/falha catastrofica/indisponível/indisponivel/fora do ar/sistema parado/nao abre/nao funciona em funcao essencial => urgencia critica
- Se houver tag urgencia_suporte => urgencia minima alta
- Se bloquear totalmente pedido venda/compra, emissao fiscal, pagamento/recebimento, fechamento caixa, login => urgencia critica
- Considere fato, causa e ModuloXRotina para reforcar ou elevar urgencia

VALORES VALIDOS DE URGENCIA:
- critica, alta, media, baixa

CLASSIFICACAO DE PERFIL DO CLIENTE:
- Escolha exatamente um entre: neutro, moderado, ansioso, agressivo, detalhista, leigo
- perfil_cliente_descricao deve explicar o principal sinal observado

ANALISE ENCADEADA:
- Diagnostico deve seguir: causa -> modulo/rotina -> fato
- modulo_rotina deve manter o valor EXATO de ModuloXRotina
- modulo_rotina_normalizado apenas para par_agrupamento
- fato_palavras_chave: 2 a 5 termos normalizados
- compilado_causa_modulo_fato em texto natural sem underscores
- Excecao: se o ticket for de Sistemas Internos, o diagnostico nao deve depender de causa, fato ou ModuloXRotina; nesses casos, preencha esses campos apenas com "Nao se aplica a Sistemas Internos" quando nao houver valor real no JSON

RESPONDA EXATAMENTE no formato JSON abaixo, preenchendo todos os campos:
{
  "tabela_acoes": [
    { "id": 1, "origem": "Abertura|Cliente|Suporte|Sistema", "criado_por": "Nome Real da Pessoa", "ator": "Cliente|Suporte" }
  ],
  "total_acoes": 0,
  "total_cliente": 0,
  "total_agente": 0,
  "comportamento_cliente": {
    "nome": "Nome do Cliente",
    "perfil": "descricao do perfil comportamental",
    "pontos": [
      "Proatividade inicial (ID X): descricao do comportamento",
      "Humildade para perguntar (ID Y): descricao",
      "Seguimento de instrucoes (ID Z): descricao",
      "Busca por clareza (ID W): descricao",
      "Agilidade na resposta (ID V): descricao"
    ],
    "padrao_emocional": "descricao do tom, presenca de frustracao, etc."
  },
  "perfil_cliente": "neutro|moderado|ansioso|agressivo|detalhista|leigo",
  "perfil_cliente_descricao": "Frase explicando o sinal principal que levou a essa classificacao",
  "comportamento_suporte": [
    {
      "nome": "Nome do Analista",
      "ids": [1, 2],
      "pontos": ["ponto de analise 1", "ponto de analise 2"]
    }
  ],
  "padrao_suporte": "descricao geral do padrao de atendimento",
  "dinamica_conversa": {
    "cliente_para_suporte": "resumo de como o cliente se comunicou",
    "suporte_para_cliente": "evolucao do atendimento",
    "tempo_resposta": "exemplos de intervalos entre respostas"
  },
  "pontos_criticos": {
    "acertos": ["acerto 1", "acerto 2"],
    "melhorias": ["melhoria 1", "melhoria 2"]
  },
  "conclusao": "Resumo final da analise comportamental em 2-3 frases",
  "urgencia": "critica",
  "evidencias_urgencia": [
    { "comportamento": "descricao do comportamento observado", "indicacao": "o que indica sobre urgencia" }
  ],
  "cliente_nao_fez": ["item relevante para urgencia 1", "item 2"],
  "impacto_real": "descricao do impacto operacional inferido do problema",
  "diagnostico": {
    "causa": "Reproducao fiel do campo causa do ticket",
    "causa_normalizada": "versao normalizada da causa",
    "modulo_rotina": "Valor EXATO e ORIGINAL do campo ModuloXRotina",
    "modulo_rotina_normalizado": "versao tecnica para par_agrupamento",
    "fato": "Reproducao fiel do campo fato do ticket",
    "fato_palavras_chave": ["palavra_chave_1", "palavra_chave_2"],
    "fato_categoria_principal": "uma palavra chave principal",
    "compilado_causa_modulo_fato": "Frase em portugues corrido SEM underscores",
    "relacao_fato_causa": "Analise de como o fato explica a causa no modulo",
    "impacto_inferido": "Implicacao operacional",
    "par_agrupamento": "causa_normalizada::modulo_rotina_normalizado::fato_categoria_principal"
  },
  "nota_urgencia": 4,
  "nota_urgencia_descricao": "Critica",
  "justificativa_urgencia": "Justificativa em no maximo 3 frases",
  "recomendacao_atendente": "Orientacao pratica para o atendente",
  "sentimento": "neutro",
  "satisfacao": 5,
  "alertas": ["alerta identificado 1"]
}

const DEFAULT_EXECUTIVE_PROMPT = buildExecutivePrompt({
  actions: [],
  isInternalSystems: false,
  solicitante: '',
  fato: '',
  causa: '',
  ModuloXRotina: '',
  subject: '',
  owner: { businessName: '', email: '' }
});

VALORES VALIDOS:
- urgencia: critica|alta|media|baixa
- sentimento: positivo|neutro|negativo
- perfil_cliente: neutro|moderado|ansioso|agressivo|detalhista|leigo
- satisfacao: inteiro 1..10 com coerencia por sentimento
- nota_urgencia: 1..4
- origem em tabela_acoes: origin 0=Abertura, 1=Cliente, 2=Suporte, 9=Sistema

Ticket de Sistemas Internos:
${context.isInternalSystems ? 'sim' : 'nao'}

Actions do ticket (JSON):
${actionsJson}`;
}

async function generateExecutiveSummaryFromLLM(context) {
  const apiKey = await new Promise((resolve) => {
    db.get('SELECT value FROM config WHERE key = ?', ['openai_api_key'], (err, row) => {
      if (err || !row || !row.value) return resolve(process.env.OPENAI_API_KEY || null);
      try {
        resolve(decryptToken(row.value));
      } catch (e) {
        resolve(process.env.OPENAI_API_KEY || null);
      }
    });
  });
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY nao configurada no servidor');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const prompt = await new Promise((resolve) => {
    getPrompt((err, storedPrompt) => {
      if (err || !storedPrompt) {
        return resolve(buildExecutivePrompt(context));
      }
      resolve(renderConfiguredPrompt(storedPrompt, context));
    });
  });
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      input: [
        {
          role: 'system',
          content: [{
            type: 'input_text',
            text: 'Use o prompt do usuario como instrucao principal. Use o JSON completo do ticket fornecido nesta conversa como fonte obrigatoria dos dados. Responda apenas com JSON valido.'
          }]
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            {
              type: 'input_text',
              text: `CONTEXTO ADICIONAL DO TICKET (sempre use estes dados reais, mesmo se o prompt nao tiver placeholders corretos):\n\nTicket completo:\n${JSON.stringify(context.ticketJson || {}, null, 2)}\n\nActions:\n${JSON.stringify(context.actions || [], null, 2)}\n\nSolicitante: ${context.solicitante || ''}\nFato: ${context.fato || ''}\nCausa: ${context.causa || ''}\nModuloXRotina: ${context.ModuloXRotina || ''}\nSubject: ${context.subject || ''}\nOwner businessName: ${context.owner?.businessName || ''}\nOwner email: ${context.owner?.email || ''}\nSistemas Internos: ${context.isInternalSystems ? 'sim' : 'nao'}`
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Falha ao gerar resumo executivo: ${response.status} ${errText}`);
  }

  const payload = await response.json();
  const text = extractTextFromResponsesPayload(payload);

  let parsed;
  try {
    parsed = JSON.parse(cleanJsonText(text));
  } catch (e) {
    parsed = JSON.parse(extractFirstJsonObject(text));
  }

  return parsed;
}

function renderConfiguredPrompt(storedPrompt, context) {
  const replacements = [
    [/\{\{\s*ticketJson\s*\}\}/g, JSON.stringify(context.ticketJson || {}, null, 2)],
    [/\{\{\s*ticketjson\s*\}\}/g, JSON.stringify(context.ticketJson || {}, null, 2)],
    [/\{\{\s*actionsJson\s*\}\}/g, JSON.stringify(context.actions || [], null, 2)],
    [/\{\{\s*actionsjson\s*\}\}/g, JSON.stringify(context.actions || [], null, 2)],
    [/\{\{\s*solicitante\s*\}\}/g, context.solicitante || ''],
    [/\{\{\s*fato\s*\}\}/g, context.fato || ''],
    [/\{\{\s*causa\s*\}\}/g, context.causa || ''],
    [/\{\{\s*ModuloXRotina\s*\}\}/g, context.ModuloXRotina || ''],
    [/\{\{\s*subject\s*\}\}/g, context.subject || ''],
    [/\{\{\s*ownerBusinessName\s*\}\}/g, context.owner?.businessName || ''],
    [/\{\{\s*ownerEmail\s*\}\}/g, context.owner?.email || ''],
    [/\{\{\s*\$json\.solicitante\s*\}\}/g, context.solicitante || ''],
    [/\{\{\s*\$json\.fato\s*\}\}/g, context.fato || ''],
    [/\{\{\s*\$json\.causa\s*\}\}/g, context.causa || ''],
    [/\{\{\s*\$json\.ModuloXRotina\s*\}\}/g, context.ModuloXRotina || ''],
    [/\{\{\s*\$json\.subject\s*\}\}/g, context.subject || ''],
    [/\{\{\s*\$json\.ownerBusinessName\s*\}\}/g, context.owner?.businessName || ''],
    [/\{\{\s*\$json\.ownerEmail\s*\}\}/g, context.owner?.email || ''],
    [/\=\{\{\s*\$json\.actions\s*\}\}/g, JSON.stringify(context.actions || [], null, 2)],
    [/\{\{\s*\$json\.actions\s*\}\}/g, JSON.stringify(context.actions || [], null, 2)]
  ];

  let rendered = storedPrompt;
  for (const [pattern, value] of replacements) {
    rendered = rendered.replace(pattern, value);
  }
  return rendered;
}

function extractTextFromResponsesPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';

  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string') chunks.push(part.text);
      if (typeof part?.output_text === 'string') chunks.push(part.output_text);
    }
  }

  return chunks.join('\n').trim();
}

function cleanJsonText(text) {
  return String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function extractFirstJsonObject(text) {
  const cleaned = cleanJsonText(text);
  const start = cleaned.indexOf('{');
  if (start < 0) throw new Error('Modelo nao retornou JSON valido');

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i += 1) {
    const ch = cleaned[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return cleaned.slice(start, i + 1);
      }
    }
  }

  throw new Error('Modelo nao retornou JSON valido');
}

function resolveViewerContext(req) {
  return new Promise((resolve) => {
    const token = req.headers.authorization?.replace('Bearer ', '').trim();
    if (!token) {
      return resolve({
        role: req.query.viewerRole || null,
        vertical: req.query.viewerVertical || null,
      });
    }

    db.get(
      `SELECT r.name as role, u.vertical
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
       WHERE s.token = ? AND s.expires_at > NOW()`,
      [token],
      (err, row) => {
        if (err || !row) {
          return resolve({
            role: req.query.viewerRole || null,
            vertical: req.query.viewerVertical || null,
          });
        }
        resolve({ role: row.role, vertical: row.vertical || null });
      }
    );
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDbUnavailableError(error) {
  const code = error?.code || '';
  return [
    'ENETUNREACH',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENOTFOUND'
  ].includes(code);
}

function isMovideskDnsError(error) {
  const code = error?.code || '';
  return code === 'ENOTFOUND' || code === 'EAI_AGAIN';
}

async function ensureDbAvailable() {
  return new Promise((resolve, reject) => {
    db.get('SELECT 1 AS ok', [], (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

// Validar se um ticket passa pelos filtros de customField (fallback para API)
function ticketMatchesCustomFieldFilter(ticket, customFieldId, customFieldValue) {
  if (!customFieldId || !customFieldValue) return true;
  
  const customFieldValues = ticket.customFieldValues || [];
  const cfvArray = Array.isArray(customFieldValues) ? customFieldValues : [];
  
  // Procurar pelo campo customizado
  const field = cfvArray.find(cfv => {
    const cfId = cfv.customFieldId || cfv.customfieldid;
    return cfId && String(cfId) === String(customFieldId);
  });
  
  if (!field) return false;
  
  // Verificar se algum item do campo corresponde ao valor
  const items = field.items || [];
  const itemsArray = Array.isArray(items) ? items : [];
  
  return itemsArray.some(item => {
    const itemValue = item.customFieldItem || item.customfielditem || '';
    return String(itemValue).trim() === String(customFieldValue).trim();
  });
}

async function fetchTicketsFromApi(token, skip = 0, attempt = 0, conditions = null, options = {}) {
  const endpointPath = options.endpointPath || '';
  const applyStatusFilter = options.applyStatusFilter !== false;
  const customFilter = typeof options.customFilter === 'string' ? options.customFilter.trim() : '';

  // Se conditions não foi passado, usar padrões
  if (!conditions) {
    conditions = {
      statuses: ['New', 'InAttendance', 'Stopped'],
      serviceFirstLevel: '',
      customFieldId: '23946',
      customFieldValue: 'Suporte Técnico',
      syncLimit: 100,
      ownerTeam: 'VIASOFT - Sistemas Internos',
      excludedBaseStatuses: ['Resolved', 'Closed', 'Canceled'],
      selectFields: 'id,subject,status,baseStatus,createdDate,lastActionDate,lastUpdate,serviceFirstLevelId,serviceFirstLevel,serviceSecondLevel,slaAgreement,slaAgreementRule,slaSolutionTime,slaResponseTime,slaSolutionDate,slaSolutionDateIsPaused,slaResponseDate,slaRealResponseDate,justification,ownerTeam',
      expandRelations: 'owner,actions($select=id,type,origin,status,createdDate,description;$expand=createdBy),customFieldValues($expand=items),clients($expand=organization)'
    };
  }

  const top = conditions.syncLimit || 100;

  // Montar filtro OData com push/join para evitar 'and' duplicado
  const filterParts = [];

  // 1. Filtro customizado externo (ex: excludedBaseStatuses já montados pelo chamador)
  if (customFilter) {
    filterParts.push(customFilter);
  }

  // 2. Filtro de status positivos (baseStatus eq '...')
  if (applyStatusFilter && Array.isArray(conditions.statuses) && conditions.statuses.length > 0) {
    const statusParts = conditions.statuses.map(s => `baseStatus eq '${s}'`);
    filterParts.push(`(${statusParts.join(' or ')})`);
  }

  // 3. Filtro de serviceFirstLevel
  if (conditions.serviceFirstLevel && conditions.serviceFirstLevel.trim()) {
    filterParts.push(`serviceFirstLevel eq '${conditions.serviceFirstLevel.trim()}'`);
  }

  // 4. Filtro de customField
  if (conditions.customFieldId && conditions.customFieldValue) {
    filterParts.push(`customFieldValues/any(cfv: cfv/customFieldId eq ${conditions.customFieldId} and cfv/items/any(i: i/customFieldItem eq '${conditions.customFieldValue}'))`);
  }

  const odataFilter = filterParts.filter(Boolean).join(' and ');
  console.log('Filtro Movidesk:', odataFilter);

  const filterExpr = odataFilter ? `&$filter=${odataFilter}` : '';

  // Usar campos e expand dinâmicos das configurações
  const selectFields = conditions.selectFields || 'id,subject,status,baseStatus,createdDate,lastActionDate,lastUpdate,serviceFirstLevelId,serviceFirstLevel,serviceSecondLevel,slaAgreement,slaAgreementRule,slaSolutionTime,slaResponseTime,slaSolutionDate,slaSolutionDateIsPaused,slaResponseDate,slaRealResponseDate,justification,ownerTeam';
  const expandRelations = conditions.expandRelations || 'owner,actions($select=id,type,origin,status,createdDate,description;$expand=createdBy),customFieldValues($expand=items),clients($expand=organization)';

  const query = `?token=${encodeURIComponent(token)}&$select=${encodeURIComponent(selectFields)}${filterExpr}&$expand=${encodeURIComponent(expandRelations)}&$orderby=createdDate asc&$top=${top}&$skip=${skip}`;

  try {
    const requestUrl = `${MOVIDESK_API}${endpointPath}${query}`;
    console.log(`Movidesk URL [${endpointPath || '/'} | skip=${skip}]: ${requestUrl}`);
    const response = await fetch(requestUrl);
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
      const errDetail = typeof parsed === 'string' ? parsed.slice(0, 500) : JSON.stringify(parsed || {}).slice(0, 500);
      const msg = `API Movidesk retornou: ${response.status}${errDetail ? ` - ${errDetail}` : ''}`;

      if (response.status === 429 && attempt < 3) {
        const waitMs = 1500 * (attempt + 1);
        console.warn(`Movidesk rate limit (429). Tentando novamente em ${waitMs}ms...`);
        await sleep(waitMs);
        return fetchTicketsFromApi(token, skip, attempt + 1, conditions, options);
      }

      throw new Error(msg);
    }

    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.value)) return parsed.value;
    if (parsed && Array.isArray(parsed.data)) return parsed.data;
    return [];
  } catch (error) {
    // ECONNRESET / ETIMEDOUT geralmente indica fim de dados ou limite da API
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      if (attempt < 2) {
        const waitMs = 2000 * (attempt + 1);
        console.warn(`Movidesk ECONNRESET no skip=${skip}. Tentando novamente em ${waitMs}ms...`);
        await sleep(waitMs);
        return fetchTicketsFromApi(token, skip, attempt + 1, conditions, options);
      }
      console.warn(`Movidesk encerrou conexão no skip=${skip}. Tratando como fim de dados.`);
      return null; // sinaliza fim de paginação
    }

    // DNS instável da API Movidesk
    if (isMovideskDnsError(error) && attempt < 3) {
      const waitMs = 1500 * (attempt + 1);
      console.warn(`DNS da Movidesk falhou no skip=${skip}. Tentando novamente em ${waitMs}ms...`);
      await sleep(waitMs);
      return fetchTicketsFromApi(token, skip, attempt + 1, conditions, options);
    }

    console.error('Erro ao buscar tickets:', error);
    throw error;
  }
}

function saveTicketToDb(ticket) {
  return new Promise((resolve, reject) => {
    const customFields = JSON.stringify(ticket.customFieldValues || []);
    const actionsJson = JSON.stringify(ticket.actions || []);
    const clientsJson = JSON.stringify(ticket.clients || []);
    const statusHistoriesJson = JSON.stringify(ticket.statusHistories || []);
    const client = ticket.clients?.[0];
    const owner = ticket.owner;
    const ownerTeam = ticket.ownerTeam || ticket.ownerteam || owner?.team || null;
    const justification = ticket.justification ?? ticket.description ?? null;

    // Última ação: maior id, ignorando ações sem createdBy
    const actions = ticket.actions || [];
    const actionsWithAuthor = actions.filter(a => a.createdBy != null);
    actionsWithAuthor.sort((a, b) => b.id - a.id);
    const lastAction = actionsWithAuthor[0];
    const lastActionCreatedByBusinessName = lastAction?.createdBy?.businessName || null;
    
    // Determinar origin: "Customer" ou "Attendant"
    let lastActionOrigin = 'Attendant'; // padrão
    
    if (lastAction && lastAction.createdBy) {
      if (lastAction.createdBy.profileType === 3) {
        // É um agente/support
        if (lastAction.createdBy.id && owner && lastAction.createdBy.id !== owner.id) {
          lastActionOrigin = 'Customer'; // outro agente = cliente
        } else {
          lastActionOrigin = 'Attendant'; // é o owner ou sem comparação possível
        }
      } else if (lastAction.origin === 1 || lastAction.origin === 8) {
        // origin 1 e 8 = cliente
        lastActionOrigin = 'Customer';
      }
    }

    db.run(
      `INSERT INTO tickets (
        id, subject, status, baseStatus, createdDate, lastActionDate, lastUpdate,
        serviceFirstLevelId, serviceFirstLevel, serviceSecondLevel, slaAgreement,
        slaAgreementRule, slaSolutionTime, slaResponseTime, slaSolutionDate,
        slaSolutionDateIsPaused, slaResponseDate, slaRealResponseDate,
        ownerEmail, ownerName, owner_team, clientName, clientEmail, clientOrganization,
        justification,
        customFields, actionsJson, clientsJson, statusHistoriesJson,
        actionsCount, lastActionCreatedByBusinessName, lastActionOrigin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        subject = EXCLUDED.subject,
        status = EXCLUDED.status,
        baseStatus = EXCLUDED.baseStatus,
        createdDate = EXCLUDED.createdDate,
        lastActionDate = EXCLUDED.lastActionDate,
        lastUpdate = EXCLUDED.lastUpdate,
        serviceFirstLevelId = EXCLUDED.serviceFirstLevelId,
        serviceFirstLevel = EXCLUDED.serviceFirstLevel,
        serviceSecondLevel = EXCLUDED.serviceSecondLevel,
        slaAgreement = EXCLUDED.slaAgreement,
        slaAgreementRule = EXCLUDED.slaAgreementRule,
        slaSolutionTime = EXCLUDED.slaSolutionTime,
        slaResponseTime = EXCLUDED.slaResponseTime,
        slaSolutionDate = EXCLUDED.slaSolutionDate,
        slaSolutionDateIsPaused = EXCLUDED.slaSolutionDateIsPaused,
        slaResponseDate = EXCLUDED.slaResponseDate,
        slaRealResponseDate = EXCLUDED.slaRealResponseDate,
        ownerEmail = EXCLUDED.ownerEmail,
        ownerName = EXCLUDED.ownerName,
        owner_team = EXCLUDED.owner_team,
        clientName = EXCLUDED.clientName,
        clientEmail = EXCLUDED.clientEmail,
        clientOrganization = EXCLUDED.clientOrganization,
        justification = EXCLUDED.justification,
        customFields = EXCLUDED.customFields,
        actionsJson = EXCLUDED.actionsJson,
        clientsJson = EXCLUDED.clientsJson,
        statusHistoriesJson = EXCLUDED.statusHistoriesJson,
        actionsCount = EXCLUDED.actionsCount,
        lastActionCreatedByBusinessName = EXCLUDED.lastActionCreatedByBusinessName,
        lastActionOrigin = EXCLUDED.lastActionOrigin`,
      [
        ticket.id,
        ticket.subject,
        ticket.status,
        ticket.baseStatus,
        ticket.createdDate,
        ticket.lastActionDate,
        ticket.lastUpdate,
        ticket.serviceFirstLevelId,
        ticket.serviceFirstLevel,
        ticket.serviceSecondLevel,
        ticket.slaAgreement,
        ticket.slaAgreementRule,
        ticket.slaSolutionTime,
        ticket.slaResponseTime,
        ticket.slaSolutionDate,
        ticket.slaSolutionDateIsPaused ? 1 : 0,
        ticket.slaResponseDate,
        ticket.slaRealResponseDate,
        owner?.email || null,
        owner?.businessName || null,
        ownerTeam,
        client?.businessName || null,
        client?.email || null,
        client?.organization?.businessName || null,
        justification,
        customFields,
        actionsJson,
        clientsJson,
        statusHistoriesJson,
        actions.length,
        lastActionCreatedByBusinessName,
        lastActionOrigin
      ],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function markMissingTicketsAsClosed(collectedIds) {
  return new Promise((resolve, reject) => {
    const openStatuses = ['New', 'InAttendance', 'Stopped', 'InProgress'];
    const openPlaceholders = openStatuses.map(() => '?').join(',');
    const params = [...openStatuses];

    let sql = `
      UPDATE tickets
      SET
        baseStatus = 'Closed',
        status = CASE
          WHEN status IS NULL OR status = '' OR baseStatus IN (${openPlaceholders}) THEN 'Fechado'
          ELSE status
        END,
        updatedAt = NOW(),
        syncedAt = NOW()
      WHERE baseStatus IN (${openPlaceholders})
    `;

    params.push(...openStatuses);

    if (Array.isArray(collectedIds) && collectedIds.length > 0) {
      const idPlaceholders = collectedIds.map(() => '?').join(',');
      sql += ` AND id NOT IN (${idPlaceholders})`;
      params.push(...collectedIds);
    }

    db.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function collectCurrentOpenTicketIds(token, conditions) {
  const excludedStatusParts = (conditions.excludedBaseStatuses || ['Resolved', 'Closed', 'Canceled'])
    .map((status) => `baseStatus ne '${status}'`);
  const baseFilter = excludedStatusParts.join(' and ');
  const pageSize = Number(conditions.syncLimit) || 100;

  let skip = 0;
  const ids = new Set();

  while (true) {
    const tickets = await fetchTicketsFromApi(token, skip, 0, conditions, {
      endpointPath: '',
      applyStatusFilter: true,
      customFilter: baseFilter,
    });

    if (!Array.isArray(tickets) || tickets.length === 0) {
      break;
    }

    for (const ticket of tickets) {
      if (!ticket?.id) continue;
      if (conditions.customFieldId && conditions.customFieldValue) {
        if (!ticketMatchesCustomFieldFilter(ticket, conditions.customFieldId, conditions.customFieldValue)) {
          continue;
        }
      }
      ids.add(ticket.id);
    }

    if (tickets.length < pageSize) {
      break;
    }

    skip += pageSize;
  }

  return Array.from(ids);
}

// GET - Buscar tickets do banco para dashboard (ativos + rota past)
router.get('/', async (req, res) => {
  const viewer = await resolveViewerContext(req);

  let query = `
    SELECT 
      id, subject, status, baseStatus, createdDate, lastActionDate, lastUpdate,
      serviceFirstLevelId, serviceFirstLevel, serviceSecondLevel, slaAgreement,
      slaAgreementRule, slaSolutionTime, slaResponseTime, slaSolutionDate,
      slaSolutionDateIsPaused, slaResponseDate, slaRealResponseDate,
      ownerEmail, ownerName, owner_team, clientName, clientEmail, clientOrganization,
      justification, customFields, actionsCount, syncedAt, updatedAt, lastActionCreatedByBusinessName, lastActionOrigin
    FROM tickets
    WHERE baseStatus IN ('New', 'InAttendance', 'Stopped', 'InProgress')
  `;
  const params = [];

  // Regra solicitada: supervisor visualiza apenas os chamados da vertical dele.
  if (viewer.role === 'supervisor') {
    if (!viewer.vertical) {
      return res.json([]);
    }
    query += ` AND serviceFirstLevel = ?`;
    params.push(viewer.vertical);
  }

  query += ` ORDER BY createdDate DESC LIMIT 100`;

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar tickets' });
    }
    res.json((rows || []).map(normalizeTicketRow));
  });
});

// GET - Buscar tickets históricos (past) - resolvidos, encerrados, etc.
router.get('/past', async (req, res) => {
  const viewer = await resolveViewerContext(req);

  let query = `
    SELECT 
      id, subject, status, baseStatus, createdDate, lastActionDate, lastUpdate,
      serviceFirstLevelId, serviceFirstLevel, serviceSecondLevel, slaAgreement,
      slaAgreementRule, slaSolutionTime, slaResponseTime, slaSolutionDate,
      slaSolutionDateIsPaused, slaResponseDate, slaRealResponseDate,
      ownerEmail, ownerName, owner_team, clientName, clientEmail, clientOrganization,
      justification, customFields, actionsCount, syncedAt, updatedAt, lastActionCreatedByBusinessName, lastActionOrigin
    FROM tickets
    WHERE baseStatus NOT IN ('New', 'InAttendance', 'Stopped', 'InProgress')
  `;
  const params = [];

  // Regra solicitada: supervisor visualiza apenas os chamados da vertical dele.
  if (viewer.role === 'supervisor') {
    if (!viewer.vertical) {
      return res.json([]);
    }
    query += ` AND serviceFirstLevel = ?`;
    params.push(viewer.vertical);
  }

  query += ` ORDER BY createdDate DESC LIMIT 100`;

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar tickets históricos' });
    }
    res.json((rows || []).map(normalizeTicketRow));
  });
});

// GET - Buscar ticket por ID
router.get('/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM tickets WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar ticket' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Ticket não encontrado' });
    }
    // Parse customFields
    if (row.customFields) {
    row.customFields = safeJsonParse(row.customFields, []);
    }
    res.json(normalizeTicketRow(row));
  });
});

// POST - Gerar resumo executivo com base nas actions salvas no banco local
router.post('/:id/executive-summary', async (req, res) => {
  const { id } = req.params;
  try {
    const ticket = await new Promise((resolve, reject) => {
      db.get(
        `SELECT id, subject, status, baseStatus, createdDate, lastActionDate, lastUpdate,
                serviceFirstLevelId, serviceFirstLevel, serviceSecondLevel,
                slaAgreement, slaAgreementRule, slaSolutionTime, slaResponseTime,
                slaSolutionDate, slaSolutionDateIsPaused, slaResponseDate, slaRealResponseDate,
          ownerName, ownerEmail, owner_team, clientName, clientEmail, clientOrganization,
                justification, customFields, actionsCount, syncedAt, updatedAt,
                lastActionCreatedByBusinessName, lastActionOrigin,
                actionsJson, clientsJson, statusHistoriesJson
         FROM tickets WHERE id = ?`,
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket nao encontrado no banco local' });
    }

    const context = inferTicketContext(ticket);
    const summary = await generateExecutiveSummaryFromLLM(context);

    res.json({
      ticketId: Number(id),
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      summary
    });
  } catch (error) {
    console.error('Erro ao gerar resumo executivo:', error);
    res.status(500).json({ error: error.message || 'Erro ao gerar resumo executivo' });
  }
});

// Lógica de sincronização (reutilizável internamente e via rota)
async function runSync() {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  const syncId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  updateSyncState({
    syncId,
    running: true,
    status: 'running',
    phase: 'starting',
    message: 'Iniciando sincronizacao',
    startedAt: new Date().toISOString(),
    completedAt: null,
    totalFetched: 0,
    totalSaved: 0,
    processedBatches: 0,
    lastBatchSize: 0,
    lastError: null,
  });

  activeSyncPromise = (async () => {
  const token = await new Promise((resolve, reject) => {
    require('./config').getToken((err, t) => {
      if (err) reject(err);
      else resolve(t);
    });
  });

  if (!token) throw new Error('Token não configurado');

  // Carregar condições da requisição Movidesk
  const conditions = await new Promise((resolve, reject) => {
    require('./config').getMovideskConditions((err, cond) => {
      if (err) {
        console.warn('Erro ao carregar condições, usando padrões:', err);
        resolve({
          statuses: ['New', 'InAttendance', 'Stopped'],
          serviceFirstLevel: '',
          customFieldId: '23946',
          customFieldValue: 'Suporte Técnico',
          syncLimit: 100
        });
      } else {
        resolve(cond);
      }
    });
  });

  console.log('Sincronizando com condições:', JSON.stringify(conditions));

  try {
    await ensureDbAvailable();
  } catch (error) {
    throw new Error('Banco indisponível no momento. Verifique conectividade com PostgreSQL e tente novamente.');
  }

  let collectedIds = [];
  const seenTicketIds = new Set();
  let fetchError = null;
  let totalFetched = 0;
  let totalSaved = 0;
  let processedBatches = 0;

  // Construir filtro dinamicamente a partir das configurações
  const excludedStatusParts = (conditions.excludedBaseStatuses || ['Resolved', 'Closed', 'Canceled'])
    .map(status => `baseStatus ne '${status}'`);
  
  let filterParts = [...excludedStatusParts];
  
  // Adicionar filtro de ownerTeam se configurado
  if (conditions.ownerTeam && conditions.ownerTeam.trim()) {
    filterParts.push(`ownerTeam eq '${conditions.ownerTeam}'`);
  }
  
  const OPEN_AND_PAST_FILTER = filterParts.join(' and ');

  const pageSize = Number(conditions.syncLimit) || 100;

  const syncEndpoint = async (label, endpointPath, applyStatusFilter, customFilter = '') => {
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      updateSyncState({
        phase: 'fetching',
        message: `Buscando ${label} lote ${processedBatches + 1} (skip=${skip})`,
        totalFetched,
        totalSaved,
        processedBatches,
      });

      const tickets = await fetchTicketsFromApi(token, skip, 0, conditions, {
        endpointPath,
        applyStatusFilter,
        customFilter,
      });

      // null = ECONNRESET tratado como fim de paginação
      if (tickets === null) {
        hasMore = false;
        break;
      }
      if (!Array.isArray(tickets) || tickets.length === 0) {
        hasMore = false;
        break;
      }

      processedBatches += 1;
      totalFetched += tickets.length;

      updateSyncState({
        phase: 'processing',
        message: `Processando ${label} lote ${processedBatches} com ${tickets.length} chamados`,
        totalFetched,
        totalSaved,
        processedBatches,
        lastBatchSize: tickets.length,
      });

      for (const ticket of tickets) {
        const ticketId = ticket && ticket.id;
        if (!ticketId || seenTicketIds.has(ticketId)) {
          continue;
        }

        // Validação de fallback: se o customField foi configurado, verificar se o ticket o possui
        // (caso o filtro da API não tenha funcionado corretamente)
        if (conditions.customFieldId && conditions.customFieldValue) {
          if (!ticketMatchesCustomFieldFilter(ticket, conditions.customFieldId, conditions.customFieldValue)) {
            console.log(`Ticket ${ticketId} não passa no filtro de customField ${conditions.customFieldId}=${conditions.customFieldValue}. Ignorando.`);
            continue;
          }
        }

        seenTicketIds.add(ticketId);
        collectedIds.push(ticketId);

        try {
          await saveTicketToDb(ticket);
          totalSaved += 1;
        } catch (error) {
          if (isDbUnavailableError(error)) {
            console.error('Banco indisponivel durante persistencia de tickets. Interrompendo sync.', error);
            throw new Error('Sincronizacao interrompida: conexao com banco indisponivel. Dados parciais ja foram salvos.');
          }
          console.error(`Erro ao salvar ticket ${ticket.id}:`, error);
        }
      }

      updateSyncState({
        phase: 'analyzing',
        message: `${label} lote ${processedBatches} salvo e analisado`,
        totalFetched,
        totalSaved,
        processedBatches,
        lastBatchSize: tickets.length,
      });

      if (tickets.length < pageSize) {
        hasMore = false;
      } else {
        skip += pageSize;
      }
    }
  };

  try {
    await syncEndpoint('abertos', '', false, OPEN_AND_PAST_FILTER);
    await syncEndpoint('past', '/past', false, OPEN_AND_PAST_FILTER);
  } catch (error) {
    console.error('Erro durante sincronizacao de lotes:', error);
    fetchError = error;
  }

  if (fetchError && totalFetched === 0) {
    throw new Error('Falha ao sincronizar com Movidesk (API indisponivel/limitada). Dados locais preservados.');
  }

  if (fetchError) {
    throw new Error(`Sincronizacao parcial: ${totalSaved} chamados salvos antes de falha na API Movidesk.`);
  }

  // Marca como fechados no banco os tickets abertos que nao apareceram na coleta completa.
  updateSyncState({
    phase: 'finalizing',
    message: 'Finalizando sincronizacao e fechando chamados ausentes na API',
    totalFetched,
    totalSaved,
    processedBatches,
  });

  if (!fetchError) {
    const uniqueIds = Array.from(new Set(collectedIds));
    await markMissingTicketsAsClosed(uniqueIds);
  }

  updateSyncState({
    running: false,
    status: 'completed',
    phase: 'completed',
    message: `Sincronizacao concluida: ${totalSaved} chamados salvos`,
    completedAt: new Date().toISOString(),
    totalFetched,
    totalSaved,
    processedBatches,
    lastError: null,
  });

  return totalSaved;
  })();

  try {
    return await activeSyncPromise;
  } catch (error) {
    updateSyncState({
      running: false,
      status: 'failed',
      phase: 'failed',
      message: error.message || 'Falha na sincronizacao',
      completedAt: new Date().toISOString(),
      lastError: error.message || 'Falha na sincronizacao',
    });
    throw error;
  } finally {
    activeSyncPromise = null;
  }
}

// POST - Sincronizar tickets da API do Movidesk
router.post('/sync', authMiddleware, requireRole('admin'), async (req, res) => {
  if (!ENABLE_TICKET_SYNC) {
    return res.status(503).json({
      error: 'Sincronizacao da API Movidesk desativada no modo manual. Defina ENABLE_TICKET_SYNC=1 para habilitar.'
    });
  }

  const asyncMode = ['1', 'true', 'yes'].includes(String(req.query.async || '').toLowerCase());
  if (asyncMode) {
    const alreadyRunning = Boolean(activeSyncPromise);
    runSync().catch((error) => {
      console.error('Erro na sincronizacao em background:', error);
    });

    const state = getSyncState();
    return res.status(alreadyRunning ? 200 : 202).json({
      success: true,
      running: true,
      alreadyRunning,
      syncId: state.syncId,
      message: alreadyRunning ? 'Sincronizacao ja esta em andamento' : 'Sincronizacao iniciada',
    });
  }

  try {
    const count = await runSync();
    res.json({ success: true, message: `${count} tickets sincronizados com sucesso`, count });
  } catch (error) {
    console.error('Erro na sincronização:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/sync/status', authMiddleware, requireRole('admin'), (req, res) => {
  const state = getSyncState();
  res.json({
    ...state,
    running: Boolean(activeSyncPromise) || state.running,
    requestedSyncId: req.query.syncId || null,
  });
});

// GET - Estatísticas
router.get('/stats/overview', (req, res) => {
  db.get(`
    SELECT 
      COUNT(*) FILTER (WHERE baseStatus IN ('New', 'InAttendance', 'Stopped', 'InProgress')) as total,
      SUM(CASE WHEN baseStatus = 'New' THEN 1 ELSE 0 END) as novo,
      SUM(CASE WHEN baseStatus = 'InAttendance' THEN 1 ELSE 0 END) as emAtendimento,
      SUM(CASE WHEN baseStatus = 'Stopped' THEN 1 ELSE 0 END) as parado
    FROM tickets
  `, (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao obter estatísticas' });
    }
    res.json(row || { total: 0, novo: 0, emAtendimento: 0, parado: 0 });
  });
});

// SLA - Rotas de cálculo de SLA de primeiro contato
const { calcularSLAPrimeiroContato } = require('../utils/sla');

async function fetchTicketDetalhado(token, id) {
  const expand = "$expand=actions($select=id,type,origin,status,createdDate,isDeleted,description;$expand=createdBy),statusHistories,clients";
  const tentativas = [
    `${MOVIDESK_API}/${id}?token=${token}&${expand}`,
    `${MOVIDESK_API}?token=${token}&$filter=id eq ${id}&$top=1&${expand}`,
    `${MOVIDESK_API}?token=${token}&$filter=id eq '${id}'&$top=1&${expand}`
  ];

  for (const url of tentativas) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const payload = await response.json();
      const ticket = Array.isArray(payload) ? payload[0] : payload;
      if (ticket && ticket.id) {
        return ticket;
      }
    } catch (error) {
      // Tenta a próxima estratégia de busca
    }
  }

  return null;
}

// GET - Calcular SLA para um ticket específico do banco
router.get('/:id/sla', async (req, res) => {
  const { id } = req.params;
  
  try {
    const ticketLocal = await new Promise((resolve, reject) => {
      db.get(
        `SELECT
           id,
           slaagreementrule AS "slaAgreementRule",
           createddate AS "createdDate",
           actionsjson AS "actionsJson",
           clientsjson AS "clientsJson",
           statushistoriesjson AS "statusHistoriesJson"
         FROM tickets WHERE id = ?`,
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });

    if (ticketLocal && ticketLocal.createdDate) {
      try {
        const ticket = {
          id: ticketLocal.id,
          slaAgreementRule: ticketLocal.slaAgreementRule,
          createdDate: ticketLocal.createdDate,
          actions: safeJsonParse(ticketLocal.actionsJson, []),
          clients: safeJsonParse(ticketLocal.clientsJson, []),
          statusHistories: safeJsonParse(ticketLocal.statusHistoriesJson, [])
        };

        const slaResult = calcularSLAPrimeiroContato(ticket);
        return res.json(slaResult);
      } catch (calcError) {
        console.error('Fallback SLA local falhou:', calcError);
        return res.json({
          ticketId: Number(id),
          slaPrevistoMinutos: null,
          abertura: ticketLocal.createdDate ? new Date(ticketLocal.createdDate).toISOString?.() || null : null,
          primeiroContatoEncontrado: false,
          primeiroContato: null,
          minutosUteisConsumidos: null,
          dentroDoSLA: null,
          minutosEstouro: null,
          erro: true
        });
      }
    }

    // Buscar ticket completo da API do Movidesk para ter actions e statusHistories
    const token = await new Promise((resolve, reject) => {
      require('./config').getToken((err, t) => {
        if (err) reject(err);
        else resolve(t);
      });
    });

    if (!token) {
      return res.status(500).json({ error: 'Token não configurado' });
    }

    const ticket = await fetchTicketDetalhado(token, id);

    if (!ticket || !ticket.id) {
      return res.status(404).json({ error: 'Ticket não encontrado na API' });
    }

    // Normalizar dados - garantir que arrays sejam arrays, não strings
    ticket.actions = safeJsonParse(ticket.actions, ticket.actions || []);
    ticket.clients = safeJsonParse(ticket.clients, ticket.clients || []);
    ticket.statusHistories = safeJsonParse(ticket.statusHistories, ticket.statusHistories || []);

    const slaResult = calcularSLAPrimeiroContato(ticket);

    res.json(slaResult);
  } catch (error) {
    console.error('Erro ao calcular SLA:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST - Calcular SLA para um ticket enviado no corpo
router.post('/sla', (req, res) => {
  try {
    const ticket = req.body;
    
    if (!ticket || !ticket.id) {
      return res.status(400).json({ error: 'Ticket inválido' });
    }

    const slaResult = calcularSLAPrimeiroContato(ticket);
    res.json(slaResult);
  } catch (error) {
    console.error('Erro ao calcular SLA:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── Sync Incremental ─────────────────────────────────────────────────────────
// Busca na API Movidesk apenas tickets cujo lastUpdate é maior que o maior
// updatedAt registrado no banco. Não remove tickets — só insere/atualiza.
async function runIncrementalSync() {
  // Evita sobreposição com sync completo em andamento
  if (activeSyncPromise) {
    console.log('⏭️  Incremental sync ignorado: sync completo em andamento');
    return 0;
  }

  const token = await new Promise((resolve, reject) => {
    require('./config').getToken((err, t) => {
      if (err) reject(err); else resolve(t);
    });
  });
  if (!token) throw new Error('Token não configurado');

  const conditions = await new Promise((resolve, reject) => {
    require('./config').getMovideskConditions((err, cond) => {
      if (err) resolve({
        statuses: ['New', 'InAttendance', 'Stopped'],
        serviceFirstLevel: '',
        customFieldId: '23946',
        customFieldValue: 'Suporte Técnico',
        syncLimit: 100,
      });
      else resolve(cond);
    });
  });

  try { await ensureDbAvailable(); } catch (e) {
    throw new Error('Banco indisponível para sync incremental.');
  }

  // Pegar o timestamp mais recente do banco
  const lastRow = await new Promise((resolve, reject) => {
    db.get(
      `SELECT MAX(COALESCE(updatedat, syncedat)) AS lastTs FROM tickets`,
      [],
      (err, row) => { if (err) reject(err); else resolve(row); }
    );
  });

  // Subtrai 30s para cobrir edge cases de clock skew
  const lastTs = lastRow?.lastTs ? new Date(new Date(lastRow.lastTs).getTime() - 30000) : new Date(0);
  const lastTsIso = lastTs.toISOString().replace(/\.\d{3}Z$/, 'Z');

  // Filtro OData: lastUpdate maior que o timestamp do banco
  const lastUpdateFilter = `lastUpdate gt ${lastTsIso}`;

  // Combina com os outros filtros existentes
  const excludedStatusParts = (conditions.excludedBaseStatuses || ['Resolved', 'Closed', 'Canceled'])
    .map(s => `baseStatus ne '${s}'`);
  const baseFilter = [...excludedStatusParts].join(' and ');
  const incrementalFilter = baseFilter ? `${baseFilter} and ${lastUpdateFilter}` : lastUpdateFilter;

  let skip = 0;
  let totalUpdated = 0;
  const pageSize = Number(conditions.syncLimit) || 100;

  console.log(`🔍 Incremental sync desde: ${lastTsIso}`);

  while (true) {
    const tickets = await fetchTicketsFromApi(token, skip, 0, conditions, {
      endpointPath: '',
      applyStatusFilter: false,
      customFilter: incrementalFilter,
    });

    if (!Array.isArray(tickets) || tickets.length === 0) break;

    for (const ticket of tickets) {
      if (!ticket?.id) continue;
      if (conditions.customFieldId && conditions.customFieldValue) {
        if (!ticketMatchesCustomFieldFilter(ticket, conditions.customFieldId, conditions.customFieldValue)) continue;
      }
      try {
        await saveTicketToDb(ticket);
        totalUpdated++;
      } catch (err) {
        if (isDbUnavailableError(err)) throw err;
        console.error(`[incremental] Erro ao salvar ticket ${ticket.id}:`, err.message);
      }
    }

    if (tickets.length < pageSize) break;
    skip += pageSize;
  }

  // Reconciliacao: apos atualizar os tickets alterados, varre os IDs abertos atuais
  // para fechar no banco os chamados que nao aparecem mais na consulta da Movidesk.
  try {
    const currentOpenIds = await collectCurrentOpenTicketIds(token, conditions);
    await markMissingTicketsAsClosed(currentOpenIds);
  } catch (err) {
    console.error('⚠️  Incremental sync: falha ao reconciliar chamados ausentes:', err.message || err);
  }

  if (totalUpdated > 0) {
    console.log(`✅ Incremental sync: ${totalUpdated} ticket(s) atualizados`);
  }
  return totalUpdated;
}

module.exports = router;
module.exports.runSync = runSync;
module.exports.runIncrementalSync = runIncrementalSync;
