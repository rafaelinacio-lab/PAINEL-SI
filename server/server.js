const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const db = require('./db/remote');
const configRoutes = require('./routes/config').router;
const ticketsRoutes = require('./routes/tickets');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const pessoasRoutes = require('./routes/pessoas');
const curadoriaRoutes = require('./routes/curadoria');
const ouvidoriaRoutes = require('./routes/ouvidoria');
const gccRoutes = require('./routes/gcc');
const { runSync, runIncrementalSync } = require('./routes/tickets');
const { getAutoSyncConfig, getCuradoriaMovideskConfig } = require('./routes/config');

const app = express();
const PORT = process.env.PORT || 3000;
const ENABLE_SERVER_AUTOSYNC = process.env.ENABLE_SERVER_AUTOSYNC !== '0';

// Middleware
app.use(helmet({ contentSecurityPolicy: false })); // cabeçalhos de segurança HTTP
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : [`http://localhost:${process.env.PORT || 3000}`],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, '../')));

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/pessoas', pessoasRoutes);
app.use('/api/curadoria', curadoriaRoutes);
app.use('/api/ouvidoria', ouvidoriaRoutes);
app.use('/api/gcc', gccRoutes);
app.use('/api/config', configRoutes);
app.use('/api/tickets', ticketsRoutes);

// Rota raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});


// Rota login
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../login.html'));
});
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../login.html'));
});
// Rota para admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor funcionando' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// Limpeza periódica de sessões expiradas (a cada hora)
setInterval(() => {
  db.query('DELETE FROM sessions WHERE expires_at < NOW()').catch(() => {});
}, 60 * 60 * 1000);

// ===== Carga bruta agendada da Curadoria (manhã, almoço e fim de tarde) =====
// Dispara os jobs de enriquecimento (análise de IA, satisfação real, módulo x rotina)
// automaticamente 3x ao dia, para que os KPIs e o Foco de Atendimento da Visão Geral
// reflitam dados atualizados sem precisar de acionamento manual. Cada job já é
// resumível e idempotente (só processa o que ainda não foi verificado), então disparar
// de novo antes do anterior terminar não duplica trabalho.
const DEFAULT_CURADORIA_FULL_LOAD_TIMES = ['08:00', '12:00', '19:00'];
let curadoriaFullLoadFiredKeys = new Set();

// Horários vêm de curadoria_movidesk_config (Configurações → Curadoria Avançado); o array
// acima só é usado como fallback se ainda não houver nada configurado.
function checkCuradoriaFullLoadSchedule() {
  getCuradoriaMovideskConfig((err, cfg) => {
    const times = (!err && Array.isArray(cfg?.fullLoadTimes) && cfg.fullLoadTimes.length) ? cfg.fullLoadTimes : DEFAULT_CURADORIA_FULL_LOAD_TIMES;

    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (!times.includes(hhmm)) return;

    const dayKey = now.toISOString().slice(0, 10);
    const fireKey = `${dayKey}T${hhmm}`;
    if (curadoriaFullLoadFiredKeys.has(fireKey)) return;
    curadoriaFullLoadFiredKeys.add(fireKey);
    // Evita crescimento infinito do Set — mantém só as chaves do dia atual
    curadoriaFullLoadFiredKeys.forEach((k) => { if (!k.startsWith(dayKey)) curadoriaFullLoadFiredKeys.delete(k); });

    console.log(`⏱️  [${now.toLocaleTimeString('pt-BR')}] Disparando carga bruta agendada da Curadoria (${hhmm})`);
    curadoriaRoutes.runFullLoad('scheduled');
  });
}

setInterval(checkCuradoriaFullLoadSchedule, 30 * 1000);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`⚙️  Admin: http://localhost:${PORT}/admin`);
  console.log(`\n💡 Dica: Configure o token Movidesk na página de admin antes de sincronizar\n`);
});

// Auto-sync incremental centralizado a cada 1 minuto
const SYNC_INTERVAL_MS = 60 * 1000;
let autoSyncTimer = null;
let isShuttingDown = false;
let syncInFlight = null;

async function autoSyncLoop() {
  if (isShuttingDown) return;

  try {
    const autoSyncEnabled = await new Promise((resolve) => {
      getAutoSyncConfig((err, config) => {
        if (err) {
          console.error('Erro ao ler configuracao de autosync:', err.message || err);
          return resolve(false);
        }
        resolve(!!config?.enabled);
      });
    });

    if (!autoSyncEnabled) {
      return;
    }

    syncInFlight = runIncrementalSync();
    const count = await syncInFlight;
    if (count > 0) {
      console.log(`🔄 [${new Date().toLocaleTimeString('pt-BR')}] Incremental sync: ${count} ticket(s) atualizados`);
    }
  } catch (err) {
    console.error('❌ Incremental sync falhou:', err.message);
  } finally {
    syncInFlight = null;
    if (!isShuttingDown) {
      autoSyncTimer = setTimeout(autoSyncLoop, SYNC_INTERVAL_MS);
    }
  }
}

if (ENABLE_SERVER_AUTOSYNC) {
  setTimeout(() => {
    console.log('⏱️  Incremental sync iniciado (a cada 2 minutos)');
    autoSyncLoop();
  }, 5000);
} else {
  console.log('⏸️  Auto-sync do servidor desativado (modo manual).');
}

// Graceful shutdown
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n⛔ Encerrando servidor (${signal})...`);

  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = null;
  }

  if (syncInFlight) {
    console.log('⌛ Aguardando sincronização em andamento finalizar...');
    try {
      await syncInFlight;
    } catch (_) {
      // noop: erro ja foi logado no loop
    }
  }

  try {
    await db.close();
  } catch (err) {
    console.error('Erro ao fechar conexões do banco:', err.message || err);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
