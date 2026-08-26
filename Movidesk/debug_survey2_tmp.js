const { Pool } = require('pg');
require('dotenv').config();
const { decryptToken } = require('./server/utils/crypto');
const pool = new Pool({ host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT||'5432'), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, ssl: false });
(async () => {
  try {
    const keyRow = await pool.query(`SELECT value FROM config WHERE key = 'movidesk_token'`);
    const token = decryptToken(keyRow.rows[0].value);
    const API_SURVEY_URL = 'https://api.movidesk.com/public/v1/survey/responses';
    const sinceIso = '2020-01-01T00:00:00Z';

    let items = [];
    let skip = 0;
    const filter = encodeURIComponent(`createdDate gt ${sinceIso}`);
    let page = 0;
    while (true) {
      page++;
      const url = `${API_SURVEY_URL}?token=${encodeURIComponent(token)}&$filter=${filter}&$skip=${skip}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`FALHOU na pagina ${page}, skip=${skip}, status=${res.status}`);
        console.log(await res.text());
        break;
      }
      const data = await res.json();
      const pageItems = data?.items || [];
      items.push(...pageItems);
      console.log(`pagina ${page}: skip=${skip}, itens=${pageItems.length}, hasMore=${data.hasMore}, total acumulado=${items.length}`);
      if (!data?.hasMore || !pageItems.length) break;
      skip += pageItems.length;
      if (page > 60) { console.log('parando por seguranca (60 paginas)'); break; }
    }
    console.log('TOTAL FINAL:', items.length);
  } finally { await pool.end(); }
})();
