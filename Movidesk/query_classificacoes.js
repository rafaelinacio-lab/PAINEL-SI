require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

(async () => {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: false,
    connectionTimeoutMillis: 10000,
  });
  try {
    await pool.query(`SET statement_timeout = '120s'`);
    const result = await pool.query(`
      SELECT id, subject, status, basestatus, createddate, lastupdate, owner_team
      FROM tickets
      WHERE owner_team = 'FRANQUIA - PRODACON - Suporte'
        AND basestatus IN ('New', 'InAttendance', 'Stopped', 'InProgress')
      ORDER BY createddate DESC NULLS LAST
    `);
    const counts = {};
    for (const row of result.rows) counts[row.basestatus] = (counts[row.basestatus] || 0) + 1;
    const gatewayPath = 'C:/Users/Rafael.inacio/outputs/movidesk_prodacon_suporte_abertos/tickets.json';
    const gatewayData = JSON.parse(fs.readFileSync(gatewayPath, 'utf8').replace(/^\uFEFF/, ''));
    const gatewayRows = (gatewayData.tickets || []).filter((row) => row.ownerTeam === 'FRANQUIA - PRODACON - Suporte');
    const localIds = new Set(result.rows.map((row) => String(row.id)));
    const gatewayIds = new Set(gatewayRows.map((row) => String(row.id)));
    const onlyLocal = result.rows.filter((row) => !gatewayIds.has(String(row.id)));
    const onlyGateway = gatewayRows.filter((row) => !localIds.has(String(row.id)));
    console.log(JSON.stringify({
      localActiveCount: result.rows.length,
      localCounts: counts,
      gatewayActiveCount: gatewayRows.length,
      onlyLocal,
      onlyGateway: onlyGateway.map((row) => ({
        id: row.id,
        subject: row.subject,
        status: row.status,
        baseStatus: row.baseStatus,
        createdDate: row.createdDate,
        lastUpdate: row.lastUpdate,
        ownerTeam: row.ownerTeam,
      })),
    }));
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
