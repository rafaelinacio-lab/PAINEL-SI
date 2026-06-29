const express = require('express');
const router = express.Router();
const db = require('../db/remote');
const { encryptToken, decryptToken } = require('../utils/crypto');
const { authMiddleware, requireRole } = require('./auth');

function saveConfigValue(key, value, callback) {
  db.run(
    `INSERT INTO config (key, value)
     VALUES (?, ?)
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
    (err) => {
      // Fallback defensivo para cenarios de corrida onde o banco retorna
      // violacao de unicidade mesmo com ON CONFLICT.
      if (err && err.code === '23505') {
        return db.run(
          `UPDATE config SET value = ?, encryptedAt = CURRENT_TIMESTAMP WHERE key = ?`,
          [value, key],
          callback
        );
      }
      callback(err);
    }
  );
}

function getConfigValue(key, callback) {
  db.get('SELECT value FROM config WHERE key = ?', [key], callback);
}

// GET - Obter status do token Movidesk (somente admin)
router.get('/token', authMiddleware, requireRole('admin'), (req, res) => {
  getConfigValue('movidesk_token', (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao consultar banco de dados' });
    }
    res.json({ tokenExists: !!row });
  });
});

// POST - Salvar token criptografado (somente admin)
router.post('/token', authMiddleware, requireRole('admin'), (req, res) => {
  const { token } = req.body;

  if (!token || token.trim() === '') {
    return res.status(400).json({ error: 'Token nao pode estar vazio' });
  }

  try {
    const encryptedToken = encryptToken(token);
    saveConfigValue('movidesk_token', encryptedToken, (err) => {
      if (err) {
        console.error('Erro ao salvar token:', err);
        return res.status(500).json({ error: 'Erro ao salvar token' });
      }
      res.json({ success: true, message: 'Token salvo com seguranca' });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET - Verificar se chave GPT esta configurada (somente admin)
router.get('/gpt-key', authMiddleware, requireRole('admin'), (req, res) => {
  getConfigValue('openai_api_key', (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao consultar banco de dados' });
    }
    res.json({ configured: !!row });
  });
});

// GET - Retorna chave GPT descriptografada para uso no frontend (qualquer usuário autenticado)
// A chave é usada para chamadas diretas à OpenAI a partir do browser
router.get('/gpt-key-for-client', authMiddleware, (req, res) => {
  getConfigValue('openai_api_key', (err, row) => {
    if (err) return res.status(500).json({ error: 'Erro ao consultar banco de dados' });
    if (!row) return res.json({ configured: false, apiKey: null });
    try {
      const apiKey = decryptToken(row.value);
      res.json({ configured: true, apiKey });
    } catch {
      res.json({ configured: false, apiKey: null });
    }
  });
});

// POST - Salvar chave GPT criptografada (somente admin)
router.post('/gpt-key', authMiddleware, requireRole('admin'), (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey || apiKey.trim() === '') {
    return res.status(400).json({ error: 'Chave da API GPT nao pode estar vazia' });
  }

  try {
    const encrypted = encryptToken(apiKey.trim());
    saveConfigValue('openai_api_key', encrypted, (err) => {
      if (err) {
        console.error('Erro ao salvar chave GPT:', err);
        return res.status(500).json({ error: 'Erro ao salvar chave GPT' });
      }
      res.json({ success: true, message: 'Chave GPT salva com sucesso' });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET - Verificar se o prompt da IA esta configurado (somente admin)
router.get('/gpt-prompt', authMiddleware, requireRole('admin'), (req, res) => {
  getConfigValue('openai_executive_prompt', (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao consultar banco de dados' });
    }
    res.json({
      configured: !!row,
      prompt: row?.value || ''
    });
  });
});

// POST - Salvar prompt da IA (somente admin)
router.post('/gpt-prompt', authMiddleware, requireRole('admin'), (req, res) => {
  const { prompt } = req.body;

  if (!prompt || prompt.trim() === '') {
    return res.status(400).json({ error: 'Prompt nao pode estar vazio' });
  }

  saveConfigValue('openai_executive_prompt', prompt.trim(), (err) => {
    if (err) {
      console.error('Erro ao salvar prompt GPT:', err);
      return res.status(500).json({ error: 'Erro ao salvar prompt GPT' });
    }
    res.json({ success: true, message: 'Prompt GPT salvo com sucesso' });
  });
});

// GET - Configurações do banco remoto (somente admin)
router.get('/database', authMiddleware, requireRole('admin'), (req, res) => {
  const keys = ['db_host', 'db_port', 'db_name', 'db_user', 'db_password', 'db_dialect'];
  const state = {};
  let remaining = keys.length;
  let finished = false;

  const finish = () => {
    if (finished) return;
    remaining -= 1;
    if (remaining === 0) {
      finished = true;
      res.json({
        configured: !!(state.db_host && state.db_name && state.db_user),
        host: state.db_host || '',
        port: state.db_port || '',
        name: state.db_name || '',
        user: state.db_user || '',
        password: state.db_password || '',
        dialect: state.db_dialect || 'postgres'
      });
    }
  };

  keys.forEach((key) => {
    getConfigValue(key, (err, row) => {
      if (finished) return;
      if (err) {
        finished = true;
        return res.status(500).json({ error: 'Erro ao consultar configuracoes do banco' });
      }
      state[key] = row?.value || '';
      finish();
    });
  });
});

// POST - Salvar configurações do banco remoto (somente admin)
router.post('/database', authMiddleware, requireRole('admin'), (req, res) => {
  const { host, port, name, user, password, dialect } = req.body;

  if (!host || !port || !name || !user || !password) {
    return res.status(400).json({ error: 'Host, porta, nome, usuário e senha são obrigatórios' });
  }

  const entries = [
    ['db_host', host.trim()],
    ['db_port', String(port).trim()],
    ['db_name', name.trim()],
    ['db_user', user.trim()],
    ['db_password', encryptToken(password)],
    ['db_dialect', (dialect || 'postgres').trim()]
  ];

  let remaining = entries.length;
  let failed = false;

  entries.forEach(([key, value]) => {
    saveConfigValue(key, value, (err) => {
      if (failed) return;
      if (err) {
        failed = true;
        return res.status(500).json({ error: 'Erro ao salvar configuracoes do banco' });
      }
      remaining -= 1;
      if (remaining === 0) {
        res.json({ success: true, message: 'Configuracoes do banco salvas com sucesso' });
      }
    });
  });
});

function getPrompt(callback) {
  getConfigValue('openai_executive_prompt', (err, row) => {
    if (err) {
      callback(err, null);
      return;
    }
    callback(null, row?.value || null);
  });
}

// GET - Recuperar token para uso (apenas internamente)
function getToken(callback) {
  getConfigValue('movidesk_token', (err, row) => {
    if (err) {
      callback(err, null);
      return;
    }
    if (!row) {
      callback(new Error('Token nao configurado'), null);
      return;
    }
    try {
      const decryptedToken = decryptToken(row.value);
      callback(null, decryptedToken);
    } catch (error) {
      callback(error, null);
    }
  });
}

function getDatabaseConfig(callback) {
  const keys = ['db_host', 'db_port', 'db_name', 'db_user', 'db_password', 'db_dialect'];
  const result = {};
  let remaining = keys.length;
  let failed = false;

  keys.forEach((key) => {
    getConfigValue(key, (err, row) => {
      if (failed) return;
      if (err) {
        failed = true;
        return callback(err, null);
      }
      result[key] = row?.value || '';
      remaining -= 1;
      if (remaining === 0) {
        callback(null, {
          host: result.db_host || '',
          port: result.db_port || '',
          name: result.db_name || '',
          user: result.db_user || '',
          password: result.db_password ? decryptToken(result.db_password) : '',
          dialect: result.db_dialect || 'postgres'
        });
      }
    });
  });
}

function getAutoSyncConfig(callback) {
  getConfigValue('autosync_enabled', (err, row) => {
    if (err) {
      callback(err, null);
      return;
    }

    if (!row) {
      callback(null, { enabled: true });
      return;
    }

    const raw = String(row?.value ?? '').trim().toLowerCase();
    callback(null, {
      enabled: raw === '1' || raw === 'true' || raw === 'yes'
    });
  });
}

// Função para obter as condições da requisição Movidesk
function getMovideskConditions(callback) {
  getConfigValue('movidesk_conditions', (err, row) => {
    if (err) {
      return callback(err, null);
    }

    let conditions = {
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

    if (row && row.value) {
      try {
        conditions = JSON.parse(row.value);
      } catch (e) {
        console.warn('Erro ao parsear condições Movidesk:', e);
      }
    }

    callback(null, conditions);
  });
}

// GET - Obter condições da requisição Movidesk (somente admin)
router.get('/movidesk-conditions', authMiddleware, requireRole('admin'), (req, res) => {
  getConfigValue('movidesk_conditions', (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao consultar banco de dados' });
    }
    
    let conditions = {
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
    
    if (row && row.value) {
      try {
        conditions = JSON.parse(row.value);
      } catch (e) {
        console.warn('Erro ao parsear condições Movidesk:', e);
      }
    }
    
    res.json(conditions);
  });
});

// POST - Salvar condições da requisição Movidesk (somente admin)
router.post('/movidesk-conditions', authMiddleware, requireRole('admin'), (req, res) => {
  const { 
    statuses, 
    serviceFirstLevel, 
    customFieldId, 
    customFieldValue, 
    syncLimit,
    ownerTeam,
    excludedBaseStatuses,
    selectFields,
    expandRelations
  } = req.body;

  if (!statuses || !Array.isArray(statuses) || statuses.length === 0) {
    return res.status(400).json({ error: 'Statuses deve ser um array nao vazio' });
  }

  const limit = parseInt(syncLimit) || 100;
  if (limit < 1 || limit > 500) {
    return res.status(400).json({ error: 'Limite deve estar entre 1 e 500' });
  }

  const conditions = {
    statuses,
    serviceFirstLevel: serviceFirstLevel || '',
    customFieldId: customFieldId || '23946',
    customFieldValue: customFieldValue || 'Suporte Técnico',
    syncLimit: limit,
    ownerTeam: ownerTeam || 'VIASOFT - Sistemas Internos',
    excludedBaseStatuses: Array.isArray(excludedBaseStatuses) ? excludedBaseStatuses : ['Resolved', 'Closed', 'Canceled'],
    selectFields: selectFields || 'id,subject,status,baseStatus,createdDate,lastActionDate,lastUpdate,serviceFirstLevelId,serviceFirstLevel,serviceSecondLevel,slaAgreement,slaAgreementRule,slaSolutionTime,slaResponseTime,slaSolutionDate,slaSolutionDateIsPaused,slaResponseDate,slaRealResponseDate,justification,ownerTeam',
    expandRelations: expandRelations || 'owner,actions($select=id,type,origin,status,createdDate,description;$expand=createdBy),customFieldValues($expand=items),clients($expand=organization)'
  };

  try {
    const json = JSON.stringify(conditions);
    saveConfigValue('movidesk_conditions', json, (err) => {
      if (err) {
        console.error('Erro ao salvar condições Movidesk:', err);
        return res.status(500).json({ error: 'Erro ao salvar condições' });
      }
      res.json({ success: true, message: 'Condições salvas com sucesso' });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/autosync', authMiddleware, requireRole('admin'), (req, res) => {
  getAutoSyncConfig((err, config) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao consultar configuracao de autosync' });
    }
    res.json(config || { enabled: false });
  });
});

router.post('/autosync', authMiddleware, requireRole('admin'), (req, res) => {
  const enabled = !!req.body?.enabled;

  saveConfigValue('autosync_enabled', enabled ? '1' : '0', (err) => {
    if (err) {
      console.error('Erro ao salvar configuracao de autosync:', err);
      return res.status(500).json({ error: 'Erro ao salvar configuracao de autosync' });
    }

    res.json({
      success: true,
      enabled,
      message: `Autosync ${enabled ? 'ativado' : 'desativado'} com sucesso`
    });
  });
});

// GET - competências de curadoria
router.get('/curadoria-categories', authMiddleware, (req, res) => {
  getConfigValue('curadoria_categories', (err, row) => {
    if (err) return res.status(500).json({ error: 'Erro ao consultar banco de dados' });
    if (!row) return res.json({ categories: null });
    try {
      res.json({ categories: JSON.parse(row.value) });
    } catch {
      res.json({ categories: null });
    }
  });
});

// POST - salvar competências de curadoria (somente admin)
router.post('/curadoria-categories', authMiddleware, requireRole('admin'), (req, res) => {
  const { categories } = req.body;
  if (!Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({ error: 'Lista de categorias inválida' });
  }
  for (const cat of categories) {
    if (!cat.key || !cat.label || !cat.prompt) {
      return res.status(400).json({ error: `Categoria inválida: campos obrigatórios são key, label e prompt` });
    }
    if (typeof cat.prompt !== 'string' || cat.prompt.trim().length < 10) {
      return res.status(400).json({ error: `Prompt muito curto em "${cat.label}": descreva melhor o critério de avaliação` });
    }
  }
  saveConfigValue('curadoria_categories', JSON.stringify(categories), (err) => {
    if (err) return res.status(500).json({ error: 'Erro ao salvar categorias' });
    res.json({ success: true });
  });
});


// ============================================================
// AI USAGE LOG
// ============================================================

// Preços por 1M tokens (gpt-4o-mini e gpt-4.1-mini — mesmos preços)
const AI_PRICES = {
  'gpt-4o-mini':  { input: 0.15, output: 0.60 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4o':       { input: 5.00, output: 15.00 },
  'gpt-4.1':      { input: 2.00, output:  8.00 },
};

function estimateCost(model, inputTokens, outputTokens) {
  const price = AI_PRICES[model] || AI_PRICES['gpt-4o-mini'];
  return ((inputTokens * price.input) + (outputTokens * price.output)) / 1_000_000;
}

// POST - registrar uso de IA (chamado pelo frontend e pelo backend)
router.post('/ai-usage', authMiddleware, (req, res) => {
  const { source, model, input_tokens, output_tokens, meta } = req.body;
  if (!source || input_tokens == null || output_tokens == null) {
    return res.status(400).json({ error: 'Campos obrigatórios: source, input_tokens, output_tokens' });
  }
  const totalTokens = (input_tokens || 0) + (output_tokens || 0);
  const cost = estimateCost(model || 'gpt-4o-mini', input_tokens || 0, output_tokens || 0);
  const userEmail = req.user?.email || null;

  db.run(
    `INSERT INTO ai_usage_log (source, model, input_tokens, output_tokens, total_tokens, estimated_cost_usd, user_email, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [source, model || 'gpt-4o-mini', input_tokens || 0, output_tokens || 0, totalTokens, cost, userEmail, meta ? JSON.stringify(meta) : null],
    (err) => {
      if (err) return res.status(500).json({ error: 'Erro ao salvar usage' });
      res.json({ success: true, cost });
    }
  );
});

// GET - consultar usage agregado (somente admin)
router.get('/ai-usage', authMiddleware, requireRole('admin'), (req, res) => {
  const days = parseInt(req.query.days || '30', 10);

  db.get(
    `SELECT
       COUNT(*)                                    AS total_calls,
       COALESCE(SUM(input_tokens),  0)             AS total_input_tokens,
       COALESCE(SUM(output_tokens), 0)             AS total_output_tokens,
       COALESCE(SUM(total_tokens),  0)             AS total_tokens,
       COALESCE(SUM(estimated_cost_usd), 0)        AS total_cost_usd
     FROM ai_usage_log
     WHERE created_at >= NOW() - INTERVAL '${days} days'`,
    [],
    (err, summary) => {
      if (err) return res.status(500).json({ error: 'Erro ao consultar usage' });

      db.all(
        `SELECT
           source,
           model,
           COUNT(*)                             AS calls,
           COALESCE(SUM(total_tokens),  0)      AS tokens,
           COALESCE(SUM(estimated_cost_usd), 0) AS cost_usd
         FROM ai_usage_log
         WHERE created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY source, model
         ORDER BY cost_usd DESC`,
        [],
        (err2, bySource) => {
          if (err2) return res.status(500).json({ error: 'Erro ao consultar breakdown' });

          db.all(
            `SELECT
               DATE(created_at) AS day,
               COALESCE(SUM(total_tokens),  0)      AS tokens,
               COALESCE(SUM(estimated_cost_usd), 0) AS cost_usd
             FROM ai_usage_log
             WHERE created_at >= NOW() - INTERVAL '${days} days'
             GROUP BY DATE(created_at)
             ORDER BY day ASC`,
            [],
            (err3, daily) => {
              if (err3) return res.status(500).json({ error: 'Erro ao consultar histórico diário' });
              res.json({ summary, bySource: bySource || [], daily: daily || [], days });
            }
          );
        }
      );
    }
  );
});

module.exports = { router, getToken, getPrompt, getDatabaseConfig, getMovideskConditions, getAutoSyncConfig };
