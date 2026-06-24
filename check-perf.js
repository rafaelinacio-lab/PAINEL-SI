const db = require('./server/db/remote');

async function main() {
    const result = await db.queryDatabase(
        'movidesk_curadoria',
        `SELECT performance_suporte FROM public.curadoria_chamados 
         WHERE performance_suporte IS NOT NULL 
         AND performance_suporte <> '' 
         LIMIT 2`
    );
    
    result.rows.forEach((row, i) => {
        console.log('=== Row', i, '===');
        let v = row.performance_suporte;
        if (typeof v === 'string') {
            try { v = JSON.parse(v); } catch(e) {}
        }
        console.log(JSON.stringify(v, null, 2).substring(0, 3000));
    });
    process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
