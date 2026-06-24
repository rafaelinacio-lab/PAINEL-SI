const { Pool } = require('pg');
require('dotenv').config();

const cfg = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true'
};

console.log('🔍 Conectando ao banco de dados...');
console.log(`Host: ${cfg.host}, Base: ${cfg.database}, User: ${cfg.user}`);

const pool = new Pool(cfg);

async function checkTableStructure() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'curadoria_chamados'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Estrutura da tabela curadoria_chamados:\n');
    result.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.column_name} (${row.data_type})`);
    });
    
    console.log(`\n✅ Total: ${result.rows.length} colunas\n`);
  } catch (err) {
    console.error('❌ Erro ao conectar:', err.message);
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkTableStructure();
