// Análise de tickets fora do prazo - todas as colunas
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: String(process.env.DB_SSL || '').toLowerCase() === 'true',
});

async function run() {
  const client = await pool.connect();
  try {
    // 1. Total de tickets no banco
    const { rows: [totRow] } = await client.query(`SELECT COUNT(*) AS total FROM tickets`);
    console.log(`\n=== TOTAL NO BANCO: ${totRow.total} tickets ===\n`);

    // 2. Buscar todos os tickets fora do prazo (SLA vencido)
    const { rows: overdue } = await client.query(`
      SELECT *
      FROM tickets
      WHERE (
        (slasolutiondateispaused IS NOT TRUE
          AND slasolutiondate IS NOT NULL
          AND slasolutiondate < NOW())
        OR
        (slasolutiondateispaused = TRUE
          AND slasolutiontime IS NOT NULL
          AND createddate IS NOT NULL
          AND (createddate::timestamptz + (slasolutiontime * interval '1 minute')) < NOW())
      )
      ORDER BY slasolutiondate ASC NULLS LAST
    `);

    console.log(`=== TICKETS FORA DO PRAZO: ${overdue.length} ===\n`);

    if (overdue.length === 0) {
      console.log('Nenhum ticket fora do prazo encontrado.');
      return;
    }

    // 3. IDs fora do prazo
    const ids = overdue.map(t => t.id);
    console.log('IDs fora do prazo:', ids.join(', '), '\n');

    // 4. Análise por serviceFirstLevel (categoria)
    const byCategory = {};
    overdue.forEach(t => {
      const cat = t.servicefirstlevel || t.serviceFirstLevel || '(sem categoria)';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });
    console.log('--- Por Categoria (serviceFirstLevel) ---');
    Object.entries(byCategory).sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${v}x  ${k}`));

    // 5. Análise por serviceSecondLevel
    const bySubCat = {};
    overdue.forEach(t => {
      const cat = t.servicesecondlevel || t.serviceSecondLevel || '(sem subcategoria)';
      bySubCat[cat] = (bySubCat[cat] || 0) + 1;
    });
    console.log('\n--- Por Subcategoria (serviceSecondLevel) ---');
    Object.entries(bySubCat).sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${v}x  ${k}`));

    // 6. Análise por ownerName (responsável)
    const byOwner = {};
    overdue.forEach(t => {
      const o = t.ownername || t.ownerName || '(sem responsável)';
      byOwner[o] = (byOwner[o] || 0) + 1;
    });
    console.log('\n--- Por Responsável (ownerName) ---');
    Object.entries(byOwner).sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${v}x  ${k}`));

    // 7. Análise por owner_team
    const byTeam = {};
    overdue.forEach(t => {
      const o = t.owner_team || '(sem equipe)';
      byTeam[o] = (byTeam[o] || 0) + 1;
    });
    console.log('\n--- Por Equipe (owner_team) ---');
    Object.entries(byTeam).sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${v}x  ${k}`));

    // 8. Análise por slaAgreementRule (urgência/SLA)
    const bySLA = {};
    overdue.forEach(t => {
      const s = t.slaagreementrule || t.slaAgreementRule || '(sem regra SLA)';
      bySLA[s] = (bySLA[s] || 0) + 1;
    });
    console.log('\n--- Por Regra SLA (slaAgreementRule) ---');
    Object.entries(bySLA).sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${v}x  ${k}`));

    // 9. Análise por baseStatus (status atual)
    const byStatus = {};
    overdue.forEach(t => {
      const s = t.basestatus || t.baseStatus || '(sem status)';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });
    console.log('\n--- Por Status Atual (baseStatus) ---');
    Object.entries(byStatus).sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${v}x  ${k}`));

    // 10. Análise por slaSolutionDateIsPaused
    const paused = overdue.filter(t => t.slasolutiondateispaused || t.slaSolutionDateIsPaused).length;
    const notPaused = overdue.length - paused;
    console.log(`\n--- SLA pausado vs ativo ---`);
    console.log(`  SLA ativo (slaSolutionDate < NOW()): ${notPaused}`);
    console.log(`  SLA pausado (calculado por tempo): ${paused}`);

    // 11. Atraso em dias por ticket (top 10 mais atrasados)
    const now = new Date();
    const withDelay = overdue.map(t => {
      let deadline;
      if (!(t.slasolutiondateispaused || t.slaSolutionDateIsPaused) && (t.slasolutiondate || t.slaSolutionDate)) {
        deadline = new Date(t.slasolutiondate || t.slaSolutionDate);
      } else if ((t.slasolutiondateispaused || t.slaSolutionDateIsPaused) && (t.createddate || t.createdDate) && (t.slasolutiontime || t.slaSolutionTime)) {
        const created = new Date(t.createddate || t.createdDate);
        const mins = Number(t.slasolutiontime || t.slaSolutionTime);
        deadline = new Date(created.getTime() + mins * 60000);
      }
      const delayMs = deadline ? (now - deadline) : 0;
      const delayDays = (delayMs / (1000 * 60 * 60 * 24)).toFixed(1);
      return { id: t.id, subject: (t.subject || '').substring(0, 60), owner: t.ownername || t.ownerName || '-', category: t.servicefirstlevel || t.serviceFirstLevel || '-', sla: t.slaagreementrule || '-', status: t.basestatus || '-', delayDays: Number(delayDays) };
    }).sort((a, b) => b.delayDays - a.delayDays);

    console.log('\n--- Top 15 tickets com maior atraso ---');
    console.log('ID'.padEnd(10) + 'Atraso'.padEnd(10) + 'Status'.padEnd(14) + 'SLA Rule'.padEnd(20) + 'Responsável'.padEnd(25) + 'Assunto');
    console.log('-'.repeat(120));
    withDelay.slice(0, 15).forEach(t => {
      console.log(
        String(t.id).padEnd(10) +
        `${t.delayDays}d`.padEnd(10) +
        t.status.padEnd(14) +
        (t.sla || '-').substring(0, 18).padEnd(20) +
        (t.owner || '-').substring(0, 23).padEnd(25) +
        t.subject
      );
    });

    // 12. Atraso médio
    const totalDelayDays = withDelay.reduce((s, t) => s + t.delayDays, 0);
    const avgDelay = (totalDelayDays / withDelay.length).toFixed(1);
    console.log(`\nAtraso médio: ${avgDelay} dias`);
    console.log(`Maior atraso: ${withDelay[0]?.delayDays} dias (ticket #${withDelay[0]?.id})`);

    // 13. Análise por ações: parado por cliente ou por agente?
    console.log('\n\n=== ANÁLISE DE RESPONSABILIDADE (cliente vs agente) ===\n');
    console.log('ID'.padEnd(10) + 'Culpa'.padEnd(20) + 'Último movimento'.padEnd(30) + 'Atraso'.padEnd(10) + 'Assunto');
    console.log('-'.repeat(110));

    let stoppedByClient = 0, stoppedByAgent = 0, neverAttended = 0;
    const detailRows = [];

    for (const t of overdue) {
      const actions = Array.isArray(t.actionsjson) ? t.actionsjson : [];
      const clients = Array.isArray(t.clientsjson) ? t.clientsjson : [];
      const owner = t.ownername || '';
      const clientNames = new Set(clients.map(c => (c.businessName || c.name || '').toLowerCase()));

      // Apenas ações públicas (type=2) com remetente identificado
      const publicActions = actions.filter(a => a.type === 2 && a.createdBy?.businessName);

      const delayDays = withDelay.find(w => String(w.id) === String(t.id))?.delayDays ?? '?';

      if (publicActions.length === 0) {
        neverAttended++;
        detailRows.push({ id: t.id, culpa: 'SEM AÇÕES PÚBLICAS', ultimo: '-', delay: delayDays, subject: (t.subject||'').substring(0,45) });
        continue;
      }

      const lastAction = publicActions[publicActions.length - 1];
      const senderName = lastAction.createdBy.businessName;
      const senderLower = senderName.toLowerCase();
      const isClient = clientNames.has(senderLower);
      const isOwner = owner.toLowerCase() === senderLower;

      // Agentes internos que não são o owner mas também não são clientes
      const isInternalAgent = !isClient;

      let culpa, razao;
      if (isClient) {
        // Cliente enviou último, agente não respondeu
        stoppedByAgent++;
        culpa = '⚠️  AGENTE';
        razao = `${senderName.split(' ')[0]} (cliente) esperando resposta`;
      } else if (isInternalAgent) {
        // Agente enviou último
        if ((t.basestatus || '').toLowerCase().includes('new') || (t.basestatus || '') === 'New') {
          // Status Novo mas agente interno agiu — provavelmente aguardando cliente abrir
          stoppedByClient++;
          culpa = '🔵 CLIENTE';
          razao = `Agente ${senderName.split(' ')[0]} aguarda cliente`;
        } else if ((t.basestatus || '') === 'Stopped') {
          stoppedByClient++;
          culpa = '🔵 CLIENTE';
          razao = `Aguardando retorno — último: ${senderName.split(' ')[0]}`;
        } else if ((t.basestatus || '') === 'InAttendance') {
          stoppedByAgent++;
          culpa = '⚠️  AGENTE';
          razao = `Em atendimento sem fechar — ${senderName.split(' ')[0]}`;
        } else {
          stoppedByClient++;
          culpa = '🔵 CLIENTE';
          razao = `Último msg agente: ${senderName.split(' ')[0]}`;
        }
      } else {
        neverAttended++;
        culpa = '❓ INDEFINIDO';
        razao = `sender: ${senderName.split(' ')[0]}`;
      }

      detailRows.push({ id: t.id, culpa, ultimo: razao, delay: delayDays, subject: (t.subject||'').substring(0,45) });
    }

    detailRows.sort((a, b) => (Number(b.delay) || 0) - (Number(a.delay) || 0));
    detailRows.forEach(r => {
      console.log(
        String(r.id).padEnd(10) +
        r.culpa.padEnd(20) +
        r.ultimo.substring(0, 28).padEnd(30) +
        `${r.delay}d`.padEnd(10) +
        r.subject
      );
    });

    console.log(`\nResumo:`);
    console.log(`  🔵 Parados por CLIENTE (agente aguarda resposta): ${stoppedByClient}`);
    console.log(`  ⚠️  Parados por AGENTE  (cliente aguarda retorno): ${stoppedByAgent}`);
    console.log(`  ❓ Sem ações suficientes para determinar:          ${neverAttended}`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
