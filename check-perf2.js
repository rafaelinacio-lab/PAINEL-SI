const db = require('./server/db/remote');

async function main() {
    const owner = process.argv[2] || 'Diuliane Keper De Lima';

    // 1) Quantas linhas existem no total, e quantas têm performance_suporte preenchido
    const totals = await db.queryDatabase(
        'movidesk_curadoria',
        `SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE performance_suporte IS NOT NULL AND performance_suporte <> '') AS com_perf,
            COUNT(*) FILTER (WHERE owner = $1) AS total_owner,
            COUNT(*) FILTER (WHERE owner = $1 AND performance_suporte IS NOT NULL AND performance_suporte <> '') AS owner_com_perf
         FROM public.curadoria_chamados`,
        [owner]
    );
    console.log('=== Totais gerais ===');
    console.log(totals.rows[0]);

    // 2) Amostra de linhas do owner em questão, mostrando ticket_id e o conteúdo crú de performance_suporte
    const sample = await db.queryDatabase(
        'movidesk_curadoria',
        `SELECT ticket_id, owner, performance_suporte
         FROM public.curadoria_chamados
         WHERE owner = $1
         ORDER BY ticket_id DESC
         LIMIT 5`,
        [owner]
    );
    console.log('\n=== Amostra de chamados do owner:', owner, '===');
    sample.rows.forEach((row, i) => {
        console.log(`--- ticket_id ${row.ticket_id} ---`);
        let v = row.performance_suporte;
        if (v === null || v === undefined || v === '') {
            console.log('performance_suporte: NULL/VAZIO');
            return;
        }
        if (typeof v === 'string') {
            try { v = JSON.parse(v); } catch (e) {
                console.log('performance_suporte NAO eh JSON valido. Raw (primeiros 500 chars):', v.substring(0, 500));
                return;
            }
        }
        console.log(JSON.stringify(v, null, 2).substring(0, 1500));
    });

    process.exit(0);
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
