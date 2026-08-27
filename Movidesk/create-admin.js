require('dotenv').config();
const { Pool } = require('pg');
const { hashPassword } = require('./server/utils/auth');

const email = 'admin@example.com';
const password = 'Admin@123456';
const name = 'Administrador';

function getBootstrapConfig() {
  const host = process.env.DB_HOST || process.env.DATABASE_HOST;
  const port = Number(process.env.DB_PORT || process.env.DATABASE_PORT || 5432);
  const database = process.env.DB_NAME || process.env.DATABASE_NAME;
  const user = process.env.DB_USER || process.env.DATABASE_USER;
  const pass = process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD;
  const ssl = String(process.env.DB_SSL || process.env.DATABASE_SSL || '').toLowerCase() === 'true';

  if (!host || !database || !user || !pass) {
    throw new Error('Configure DB_HOST, DB_PORT, DB_NAME, DB_USER e DB_PASSWORD no .env antes de executar.');
  }

  return {
    host,
    port,
    database,
    user,
    password: pass,
    ssl
  };
}

async function main() {
  const cfg = getBootstrapConfig();
  const pool = new Pool({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : false
  });

  try {
    const roleRes = await pool.query('SELECT id FROM roles WHERE name = $1', ['admin']);
    if (!roleRes.rows.length) {
      throw new Error('Role admin nao encontrada');
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      console.log(`Usuario admin ja existe: ${email}`);
      return;
    }

    const passwordHash = await hashPassword(password);
    await pool.query(
      `INSERT INTO users (email, name, password_hash, role_id, is_active, first_access)
       VALUES ($1, $2, $3, $4, TRUE, FALSE)`,
      [email, name, passwordHash, roleRes.rows[0].id]
    );

    console.log('Admin criado com sucesso!');
    console.log(`Email: ${email}`);
    console.log(`Senha: ${password}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Erro ao criar admin:', err.message);
  process.exit(1);
});
