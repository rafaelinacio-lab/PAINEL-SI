const express = require('express');
const router = express.Router();
const db = require('../db/remote');
const { authMiddleware } = require('./auth');

const CURADORIA_COLUMNS = [
  'ticket_id',
  'servico',
  'owner',
  'status',
  'urgencia',
  'processado',
  'actions',
  'solicitante',
  'perfil_cliente',
  'resumo',
  'organizacao',
  'convertido',
  'analise_fato',
  'causa',
  'acao',
  'fato',
  'modulo_x_rotina',
  'equipe',
  'urgencia_sugerida',
  'performance_suporte',
  'owner_team',
  'total_acoes',
  'total_cliente',
  'total_agente',
  'tempo_resol_dias',
  'tempo_resp_owner',
  'tabela_acoes',
  'comportamento_cliente',
  'perfil_cliente_descricao',
  'padrao_suporte',
  'dinamica_conversa',
  'pontos_criticos',
  'conclusao',
  'evidencias_urgencia',
  'cliente_nao_fez',
  'impacto_real',
  'nota_urgencia',
  'nota_urgencia_descricao',
  'justificativa_urgencia',
  'recomendacao_atendente',
  'sentimento',
  'satisfacao',
  'alertas',
  'causa_normalizada',
  'modulo_rotina_normalizado',
  'fato_palavras_chave',
  'fato_categoria_principal',
  'relacao_fato_causa',
  'impacto_inferido',
  'par_agrupamento',
  'diagnostico_raw',
  'analise_completa',
  'processado_em'
];

const NUMERIC_COLUMNS = new Set([
  'ticket_id',
  'processado',
  'convertido',
  'total_acoes',
  'total_cliente',
  'total_agente',
  'tempo_resol_dias',
  'nota_urgencia',
  'satisfacao'
]);

function normalizeCuradoriaRow(row = {}) {
  const normalized = {};

  CURADORIA_COLUMNS.forEach((column) => {
    const value = row[column];
    if (value === undefined || value === null) {
      normalized[column] = NUMERIC_COLUMNS.has(column) ? null : '';
      return;
    }
    normalized[column] = value;
  });

  return normalized;
}

router.get('/', async (req, res) => {
  try {
    const result = await db.queryDatabase(
      'movidesk_curadoria',
      `SELECT
        ${CURADORIA_COLUMNS.join(',\n        ')}
      FROM public.curadoria_chamados
      ORDER BY ticket_id DESC
      LIMIT 500`
    );

    res.json((result.rows || []).map(normalizeCuradoriaRow));
  } catch (error) {
    console.error('Erro ao buscar curadoria:', error);
    res.status(500).json({ error: 'Erro ao carregar dados de curadoria' });
  }
});

module.exports = router;
