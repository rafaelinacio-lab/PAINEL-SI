// ── script.js — Orquestrador principal ────────────────────────────────────
// Os módulos abaixo são carregados via <script> no index.html:
//   auth.js | dashboard.js | curadoria.js | pessoas.js | config.js

// Configuração da API
const API_BASE = `${window.location.origin}/api`;
const CURADORIA_API = `${API_BASE}/curadoria`;
let _currentUser = null;
let _appInitialized = false;
let _curadoriaLoaded = false;
let _curadoriaRows = [];
let _curadoriaFiltersReady = false;
let _usersCache = []; // Cache de usuários para lookup de email por nome
let _autoSyncIntervalId = null;

const AUTO_SYNC_STORAGE_KEY = 'autosyncEnabled';
const ENABLE_AUTO_LOAD_TICKETS = false;
const ENABLE_FRONTEND_AUTOSYNC_LOOP = false;

const URL_PARAMS = new URLSearchParams(window.location.search);
const LEGACY_VIEW = URL_PARAMS.get('legacyView') || '';
const EMBED_MODE = !LEGACY_VIEW;
const EMBED_PAGE_ROUTES = {
    dashboard: 'pages/dashboard.html',
    chamados: 'pages/curadoria.html',
    pessoas: 'pages/pessoas.html',
    configuracoes: 'pages/configuracoes.html'
};

function applyRuntimeLayoutMode() {
    if (LEGACY_VIEW) {
        document.body.classList.add('legacy-view-mode');
    } else {
        document.body.classList.add('embedded-shell-mode');
    }
}

function loadEmbeddedPage(view) {
    const frame = document.getElementById('embeddedPageFrame');
    const host = document.getElementById('embeddedPagesView');
    if (!frame || !host) return;

    host.style.display = 'block';

    const src = EMBED_PAGE_ROUTES[view] || EMBED_PAGE_ROUTES.dashboard;
    if (frame.getAttribute('src') !== src) {
        frame.setAttribute('src', src);
    }
}

// ─── Função auxiliar para gerar URL de foto de usuário ───────────────────────
function getPhotoUrl(email) {
    if (!email) return null;
    return `${API_BASE}/pessoas/foto/${encodeURIComponent(email)}`;
}

// ─── Função para buscar email de um usuário pelo nome ───────────────────────
// ─── Renderiza avatar do usuário logado na sidebar ───────────────────────────
function renderSidebarUser() {
    if (!_currentUser) return;
    const sidebarUser = document.getElementById('sidebarUser');
    if (!sidebarUser) return;
    const nome = _currentUser.name || _currentUser.nome || 'Usuário';
    const email = _currentUser.email || '';
    const avatar = createAvatarHTML(email, nome);
    sidebarUser.innerHTML = `
        <div class="sidebar-user-avatar" title="${nome}${email ? ' (' + email + ')' : ''}">${avatar}</div>
    `;
}

async function getUserEmailByName(name) {
    if (!name) return null;
    
    // Tenta encontrar no cache
    const cached = _usersCache.find(u => u.name && u.name.toLowerCase() === name.toLowerCase());
    if (cached) return cached.email;
    
    // Se não encontrou no cache, tenta fazer fetch
    if (_usersCache.length === 0) {
        try {
            const response = await fetch(`${API_BASE}/pessoas`, {
                headers: authHeaders()
            });
            if (response.ok) {
                _usersCache = await response.json();
                // Tenta de novo
                const found = _usersCache.find(u => u.name && u.name.toLowerCase() === name.toLowerCase());
                return found?.email || null;
            }
        } catch (e) {
            console.error('Erro ao carregar usuários:', e);
        }
    }
    
    return null;
}

// ─── Função para criar HTML de avatar (foto ou fallback com iniciais) ───────
function createAvatarHTML(email, name) {
    const initials = (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const photoUrl = getPhotoUrl(email);
    
    // Se tem email, tenta primeiro por email, depois por nome como fallback
    // Se não tem email mas tem nome, tenta buscar por nome
    let imageSrc = photoUrl || (name ? `${API_BASE}/pessoas/foto-por-nome/${encodeURIComponent(name)}` : null);
    
    return `
        <div class="avatar-container" title="${escapeHtml(name || '')}">
            <img 
                src="${imageSrc || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}"
                alt="${escapeHtml(name || '')}"
                class="avatar-foto"
                onerror="this.style.display='none'; this.parentElement.querySelector('.avatar-initials').style.display='flex';"
                onload="this.parentElement.querySelector('.avatar-initials').style.display='none';"
            />
            <div class="avatar-initials">${initials}</div>
        </div>
    `;
}

function getTicketValue(ticket, camelKey, snakeKey, fallback = '') {
    if (!ticket) return fallback;
    if (ticket[camelKey] !== undefined && ticket[camelKey] !== null && ticket[camelKey] !== '') {
        return ticket[camelKey];
    }
    if (snakeKey && ticket[snakeKey] !== undefined && ticket[snakeKey] !== null && ticket[snakeKey] !== '') {
        return ticket[snakeKey];
    }
    return fallback;
}


// ── Navegação ────────────────────────────────────────────────────────────
let _cachedTickets = [];

// ─── Navegação entre Views ────────────────────────────────────────
function navigateTo(view) {
    if (EMBED_MODE) {
        if (view === 'configuracoes' && !isCurrentUserAdmin()) {
            return;
        }

        document.querySelectorAll('.sidebar-btn[data-view]').forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.sidebar-btn[data-view="${view}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        loadEmbeddedPage(view);
        localStorage.setItem('activeEmbeddedView', view);
        return;
    }

    const views = {
        dashboard: document.getElementById('dashboardView'),
        chamados: document.getElementById('curadoriaView'),
        pessoas:   document.getElementById('pessoasView'),
        configuracoes: document.getElementById('configuracoesView'),
    };

    if (view === 'configuracoes' && !isCurrentUserAdmin()) {
        const denied = document.getElementById('configAccessDenied');
        if (denied) denied.style.display = 'block';
        return;
    }

    const denied = document.getElementById('configAccessDenied');
    if (denied) denied.style.display = 'none';

    document.querySelectorAll('.sidebar-btn[data-view]').forEach(b => b.classList.remove('active'));
    Object.values(views).forEach(v => { if (v) v.style.display = 'none'; });

    if (views[view]) views[view].style.display = 'block';
    const activeBtn = document.querySelector(`.sidebar-btn[data-view="${view}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    if (view === 'dashboard') {
        fetchOpenTickets();
        startDashboardRefreshLoop();
    } else {
        stopDashboardRefreshLoop();
    }
    if (view === 'pessoas') pessoasLoad();
    if (view === 'chamados') loadCuradoria();
    if (view === 'configuracoes') {
        loadMovideskTokenStatus();
        loadAdminStats();
        loadGptStatus();
        loadAutoSyncStatus();
        loadCategoriesConfig();
    }
}


// ===== FILTROS DO DASHBOARD =====
function applyDashboardFilters() {
    const container = document.getElementById('cardsContainer');
    if (!container) return;

    const statusFilter = document.getElementById('filterStatus')?.value?.trim() || '';
    const urgencyFilter = document.getElementById('filterUrgency')?.value?.trim() || '';
    const attendeeFilter = document.getElementById('filterAtendente')?.value?.trim() || '';
    const teamFilter = document.getElementById('filterEquipe')?.value?.trim() || '';
    const lastActionFilter = document.getElementById('filterLastAction')?.value?.trim() || '';
    const slaFilter = document.getElementById('filterSla')?.value?.trim() || '';

    if (!_cachedTickets || _cachedTickets.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; padding: 40px; text-align: center;"><p>Nenhum chamado encontrado.</p></div>';
        document.getElementById('filterCount').textContent = '';
        return;
    }

    let filtered = _cachedTickets.filter(ticket => {
        // Filtro por Status
        if (statusFilter) {
            const baseStatusRaw = getTicketValue(ticket, 'baseStatus', 'basestatus', '') || getTicketValue(ticket, 'status', 'status', '');
            const baseStatus = normalizeDashboardBaseStatus(baseStatusRaw);
            if (baseStatus !== statusFilter) return false;
        }

        // Filtro por Urgência
        if (urgencyFilter) {
            const urgency = getUrgencyFromSLA(getTicketValue(ticket, 'slaAgreementRule', 'slaagreementrule', ''));
            if (urgency.label !== urgencyFilter) return false;
        }

        // Filtro por Atendente
        if (attendeeFilter) {
            const ownerName = getTicketValue(ticket, 'ownerName', 'ownername', 'Sem atribuição');
            if (ownerName !== attendeeFilter) return false;
        }

        // Filtro por Equipe (owner_team)
        if (teamFilter) {
            const ownerTeam = getTicketValue(ticket, 'ownerTeam', 'owner_team', '');
            if (ownerTeam !== teamFilter) return false;
        }

        // Filtro por Última Ação
        if (lastActionFilter) {
            const lastActionOrigin = getTicketValue(ticket, 'lastActionOrigin', 'lastactionorigin', '');
            if (lastActionOrigin !== lastActionFilter) return false;
        }

        // Filtro por SLA
        if (slaFilter) {
            const isPaused = getTicketValue(ticket, 'slaSolutionDateIsPaused', 'slasolutiondateispaused', false) === 1 || getTicketValue(ticket, 'slaSolutionDateIsPaused', 'slasolutiondateispaused', false) === true;
            
            if (slaFilter === 'paused') {
                if (!isPaused) return false;
            } else {
                const slaSolutionDate = getTicketValue(ticket, 'slaSolutionDate', 'slasolutiondate', '');
                const slaSolutionTime = getTicketValue(ticket, 'slaSolutionTime', 'slasolutiontime', '');
                const createdDate = getTicketValue(ticket, 'createdDate', 'createddate', '');
                
                let deadline = null;
                if (slaSolutionDate) {
                    deadline = new Date(slaSolutionDate);
                } else if (isPaused && slaSolutionTime && createdDate) {
                    const created = new Date(createdDate);
                    deadline = new Date(created.getTime() + slaSolutionTime * 60000);
                }

                if (!deadline) return slaFilter !== 'overdue'; // Sem prazo = não é overdue

                const now = new Date();
                const isOverdue = now >= deadline;

                if (slaFilter === 'ontime' && isOverdue) return false;
                if (slaFilter === 'overdue' && !isOverdue) return false;
            }
        }

        return true;
    });

    renderTickets(filtered, container);
    updateSummaryCards(filtered);
    
    const countText = filtered.length === _cachedTickets.length 
        ? '' 
        : `${filtered.length} de ${_cachedTickets.length}`;
    document.getElementById('filterCount').textContent = countText;
}

function populateDashboardFilters() {
    if (!_cachedTickets || _cachedTickets.length === 0) return;

    // Coletar todos os atendentes únicos
    const attendees = new Set();
    const teams = new Set();
    _cachedTickets.forEach(ticket => {
        const owner = getTicketValue(ticket, 'ownerName', 'ownername', 'Sem atribuição');
        if (owner) attendees.add(owner);
        const team = getTicketValue(ticket, 'ownerTeam', 'owner_team', '');
        if (team) teams.add(team);
    });

    const attendeeSelect = document.getElementById('filterAtendente');
    if (attendeeSelect) {
        const currentValue = attendeeSelect.value;
        const options = ['<option value="">Todos os atendentes</option>'];
        Array.from(attendees).sort().forEach(name => {
            options.push(`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`);
        });
        attendeeSelect.innerHTML = options.join('');
        attendeeSelect.value = currentValue;
    }

    const teamSelect = document.getElementById('filterEquipe');
    if (teamSelect) {
        const currentValue = teamSelect.value;
        const options = ['<option value="">Todas as equipes</option>'];
        Array.from(teams).sort().forEach(team => {
            options.push(`<option value="${escapeHtml(team)}">${escapeHtml(team)}</option>`);
        });
        teamSelect.innerHTML = options.join('');
        teamSelect.value = currentValue;
    }
}

function setupDashboardFilters() {
    const filterStatus = document.getElementById('filterStatus');
    const filterUrgency = document.getElementById('filterUrgency');
    const filterAtendente = document.getElementById('filterAtendente');
    const filterEquipe = document.getElementById('filterEquipe');
    const filterLastAction = document.getElementById('filterLastAction');
    const filterSla = document.getElementById('filterSla');
    const filterClear = document.getElementById('filterClear');

    if (filterStatus) filterStatus.addEventListener('change', applyDashboardFilters);
    if (filterUrgency) filterUrgency.addEventListener('change', applyDashboardFilters);
    if (filterAtendente) filterAtendente.addEventListener('change', applyDashboardFilters);
    if (filterEquipe) filterEquipe.addEventListener('change', applyDashboardFilters);
    if (filterLastAction) filterLastAction.addEventListener('change', applyDashboardFilters);
    if (filterSla) filterSla.addEventListener('change', applyDashboardFilters);

    if (filterClear) {
        filterClear.addEventListener('click', () => {
            if (filterStatus) filterStatus.value = '';
            if (filterUrgency) filterUrgency.value = '';
            if (filterAtendente) filterAtendente.value = '';
            if (filterEquipe) filterEquipe.value = '';
            if (filterLastAction) filterLastAction.value = '';
            if (filterSla) filterSla.value = '';
            applyDashboardFilters();
        });
    }
}

function setupConfigEvents() {
    const saveTokenBtn = document.getElementById('cfgSaveMovideskToken');
    if (saveTokenBtn) saveTokenBtn.addEventListener('click', saveMovideskToken);

    const syncBtn = document.getElementById('cfgSyncTickets');
    if (syncBtn) syncBtn.addEventListener('click', syncTicketsFromConfig);

    const toggleAutoSyncBtn = document.getElementById('cfgToggleAutoSync');
    if (toggleAutoSyncBtn) toggleAutoSyncBtn.addEventListener('click', toggleAutoSync);

    const reloadBtn = document.getElementById('cfgReloadStats');
    if (reloadBtn) reloadBtn.addEventListener('click', loadAdminStats);

    const saveGptBtn = document.getElementById('cfgSaveGptApiKey');
    if (saveGptBtn) saveGptBtn.addEventListener('click', saveGptApiKey);

    const savePromptBtn = document.getElementById('cfgSaveGptPrompt');
    if (savePromptBtn) savePromptBtn.addEventListener('click', saveGptPrompt);

    const resetPromptBtn = document.getElementById('cfgResetGptPrompt');
    if (resetPromptBtn) resetPromptBtn.addEventListener('click', resetGptPromptToDefault);

    const saveDbBtn = document.getElementById('cfgSaveDbConfig');
    if (saveDbBtn) saveDbBtn.addEventListener('click', saveDbConfig);

    const reloadDbBtn = document.getElementById('cfgReloadDbConfig');
    if (reloadDbBtn) reloadDbBtn.addEventListener('click', loadDbConfig);

    const saveMovideskCondBtn = document.getElementById('cfgSaveMovideskConditions');
    if (saveMovideskCondBtn) saveMovideskCondBtn.addEventListener('click', saveMovideskConditions);

    const resetMovideskCondBtn = document.getElementById('cfgResetMovideskConditions');
    if (resetMovideskCondBtn) resetMovideskCondBtn.addEventListener('click', resetMovideskConditions);
}

// Inicializar quando a página carregar
document.addEventListener('DOMContentLoaded', async function() {
    applyRuntimeLayoutMode();

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', loginSubmit);

    const current = await loadCurrentUser();
    if (!current) {
        showLoginScreen();
        return;
    }

    hideLoginScreen();
    await initializeApp();
});

async function initializeApp() {
    if (_appInitialized) return;
    _appInitialized = true;
    
    // Limpar qualquer elemento duplicado de sincronização
    const syncElements = document.querySelectorAll('[id="syncStatusBubble"]');
    if (syncElements.length > 1) {
        for (let i = 1; i < syncElements.length; i++) {
            syncElements[i].remove();
        }
    }

    if (EMBED_MODE) {
        applyRoleBasedNavigation();
        setupDarkMode();

        document.querySelectorAll('.sidebar-btn[data-view]').forEach(b => {
            b.addEventListener('click', () => navigateTo(b.dataset.view));
        });

        const savedView = localStorage.getItem('activeEmbeddedView') || 'dashboard';
        const startView = EMBED_PAGE_ROUTES[savedView] ? savedView : 'dashboard';
        navigateTo(startView);

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && !logoutBtn.dataset.bound) {
            logoutBtn.addEventListener('click', logout);
            logoutBtn.dataset.bound = '1';
        }

        return;
    }

    if (LEGACY_VIEW) {
        applyRoleBasedNavigation();
        setupDarkMode();
        setupDashboardFilters();
        setupConfigEvents();
        setupPessoasEvents();

        const btn = document.getElementById('syncBtn');
        if (btn && !btn.dataset.bound) {
            btn.addEventListener('click', async () => {
                if (btn.disabled) return;
                await syncAndRefresh(false);
            });
            btn.dataset.bound = '1';
        }

        const toggleBtn = document.getElementById('toggleBtn');
        if (toggleBtn && !toggleBtn.dataset.bound) {
            toggleBtn.addEventListener('click', toggleCardsSection);
            toggleBtn.dataset.bound = '1';
        }

        document.querySelectorAll('.sidebar-btn[data-view]').forEach(b => {
            if (!b.dataset.bound) {
                b.addEventListener('click', () => navigateTo(b.dataset.view));
                b.dataset.bound = '1';
            }
        });

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && !logoutBtn.dataset.bound) {
            logoutBtn.addEventListener('click', logout);
            logoutBtn.dataset.bound = '1';
        }

        const view = EMBED_PAGE_ROUTES[LEGACY_VIEW] ? LEGACY_VIEW : 'dashboard';
        navigateTo(view);
        return;
    }

    showLastSync();
    applyRoleBasedNavigation();
    if (ENABLE_AUTO_LOAD_TICKETS) {
        fetchOpenTickets();
        startDashboardRefreshLoop();
    } else {
        updateSyncStatus('Modo manual: tickets nao carregados automaticamente.');
    }
    setupDarkMode();
    setupDashboardFilters();
    setupConfigEvents();
    loadGptPrompt();
    loadDbConfig();
    loadMovideskConditions();
    loadAutoSyncStatus();

    const btn = document.getElementById('syncBtn');
    if (btn && !btn.dataset.bound) {
        btn.addEventListener('click', async () => {
            if (btn.disabled) return;
            await syncAndRefresh(false);
        });
        btn.dataset.bound = '1';
    }

    const toggleBtn = document.getElementById('toggleBtn');
    if (toggleBtn && !toggleBtn.dataset.bound) {
        toggleBtn.addEventListener('click', toggleCardsSection);
        toggleBtn.dataset.bound = '1';
    }

    document.querySelectorAll('.sidebar-btn[data-view]').forEach(b => {
        if (!b.dataset.bound) {
            b.addEventListener('click', () => navigateTo(b.dataset.view));
            b.dataset.bound = '1';
        }
    });

    setupPessoasEvents();

    refreshAutoSyncLoop();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn && !logoutBtn.dataset.bound) {
        logoutBtn.addEventListener('click', logout);
        logoutBtn.dataset.bound = '1';
    }
}

// ─── Dark Mode ────────────────────────────────────────────────────
function setupDarkMode() {
    const saved = localStorage.getItem('theme') || 'light';
    applyTheme(saved);
    const toggle = document.getElementById('darkModeToggle');
    if (!toggle) return;

    toggle.checked = saved === 'dark';

    if (toggle.dataset.bound) return;

    toggle.addEventListener('change', () => {
        const next = toggle.checked ? 'dark' : 'light';
        applyTheme(next);
        localStorage.setItem('theme', next);
    });

    toggle.dataset.bound = '1';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}
