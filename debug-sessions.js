const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data/movidesk.db');
const db = new sqlite3.Database(dbPath);

console.log('Verificando sessoes no banco de dados...\n');

// Listar todas as sessoes
db.all(`SELECT * FROM sessions ORDER BY created_at DESC LIMIT 5`, (err, sessions) => {
  if (err) {
    console.error('Erro ao consultar sessoes:', err);
    db.close();
    return;
  }
  
  console.log('Sessoes encontradas:', sessions.length);
  sessions.forEach((s, i) => {
    console.log(`\n[${i+1}] Token: ${s.token.substring(0, 30)}...`);
    console.log(`    User ID: ${s.user_id}`);
    console.log(`    Expires: ${s.expires_at}`);
    console.log(`    Created: ${s.created_at}`);
  });
  
  // Agora, vamos tentar fazer login e imprimir o token
  console.log('\n\n--- FAZENDO LOGIN PARA OBTER NOVO TOKEN ---\n');
  
  const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
  
  fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'Admin@123456'
    })
  })
  .then(res => res.json())
  .then(data => {
    console.log('Login response:', JSON.stringify(data, null, 2));
    
    if (data.token) {
      console.log('\n--- VERIFICANDO SESSAO NA BASE DE DADOS ---');
      
      db.get(
        `SELECT * FROM sessions WHERE token = ?`,
        [data.token],
        (err, session) => {
          if (err) {
            console.error('Erro:', err);
          } else if (session) {
            console.log('Sessao encontrada no banco!');
            console.log(JSON.stringify(session, null, 2));
          } else {
            console.log('AVISO: Sessao NAO encontrada no banco de dados!');
            console.log('Token:', data.token);
          }
          
          db.close();
        }
      );
    } else {
      db.close();
    }
  })
  .catch(err => {
    console.error('Erro ao fazer login:', err);
    db.close();
  });
});
