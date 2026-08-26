#!/usr/bin/env node
/**
 * Sincronização de chamados Movidesk → banco (tickets).
 *
 * Este é o ÚNICO lugar do sistema que fala com a API do Movidesk. O servidor
 * web (server/server.js) e todas as rotas HTTP (/api/tickets, etc.) só leem
 * a tabela `tickets` do Postgres — nunca chamam a API do Movidesk em tempo
 * de requisição.
 *
 * Pensado para rodar como processo independente, agendado via Windows Task
 * Scheduler (mesmo padrão já usado pelo extrator do Jira, em `Jira/`):
 *   - modo "incremental" (padrão): busca só o que mudou desde o último
 *     registro salvo, e reconcilia chamados que saíram da consulta (fecha
 *     no banco). É o mesmo comportamento que antes rodava dentro do
 *     servidor a cada 1 minuto.
 *   - modo "full": varre tudo (aberto + histórico) do zero. Útil pra
 *     popular o banco na primeira vez ou reprocessar depois de mudar as
 *     condições de sincronização em Configurações.
 *
 * Uso:
 *   node scripts/sync-movidesk.js              (incremental)
 *   node scripts/sync-movidesk.js incremental
 *   node scripts/sync-movidesk.js full
 *
 * Reaproveita runSync/runIncrementalSync de server/routes/tickets.js —
 * mesma lógica de sempre, só que fora do processo do Express.
 */
const path = require('path');
// Caminho explícito do .env (independente do cwd de quem chama este script —
// importante pro wrapper oculto do Task Scheduler, que invoca node.exe direto,
// sem passar por um "cd" antes).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require(path.join(__dirname, '..', 'server', 'db', 'remote'));
const { runSync, runIncrementalSync } = require(path.join(__dirname, '..', 'server', 'routes', 'tickets'));

async function main() {
  const mode = (process.argv[2] || 'incremental').toLowerCase();
  const startedAt = new Date();
  console.log(`[${startedAt.toLocaleString('pt-BR')}] Iniciando sync-movidesk.js (modo: ${mode})`);

  let result;
  if (mode === 'full') {
    result = await runSync();
    console.log(`[sync-movidesk] Sincronização completa: ${result} chamado(s) salvos.`);
  } else if (mode === 'incremental') {
    result = await runIncrementalSync();
    console.log(`[sync-movidesk] Sincronização incremental: ${result} chamado(s) atualizados.`);
  } else {
    throw new Error(`Modo desconhecido: "${mode}". Use "incremental" ou "full".`);
  }

  return result;
}

main()
  .then(async () => {
    await db.close().catch(() => {});
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[sync-movidesk] Falhou:', err.message || err);
    await db.close().catch(() => {});
    process.exit(1);
  });
