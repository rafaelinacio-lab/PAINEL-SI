
// ── config.js — Painel de configurações ───────────────────────────────────

function setCfgStatus(elementId, message, type = '') {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `config-status${type ? ` ${type}` : ''}`;
}

async function loadMovideskTokenStatus() {
    try {
        const response = await fetch(`${API_BASE}/config/token`, {
            headers: authHeaders()
        });
        if (!response.ok) throw new Error('Falha ao consultar token Movidesk');
        const data = await response.json();
        const badge = document.getElementById('cfgMovideskTokenStatus');
        if (!badge) return;

        if (data.tokenExists) {
            badge.textContent = 'Configurado';
            badge.className = 'config-token-status config-token-status-on';
        } else {
            badge.textContent = 'Nao configurado';
            badge.className = 'config-token-status config-token-status-off';
        }
    } catch (error) {
        setCfgStatus('cfgMovideskStatus', `Erro ao verificar token: ${error.message}`, 'error');
    }
}

async function saveMovideskToken() {
    const input = document.getElementById('cfgMovideskToken');
    const token = input?.value?.trim();
    if (!token) {
        setCfgStatus('cfgMovideskStatus', 'Informe o token Movidesk antes de salvar.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/config/token`, {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao salvar token');

        input.value = '';
        setCfgStatus('cfgMovideskStatus', 'Token Movidesk salvo com sucesso.', 'ok');
        await loadMovideskTokenStatus();
    } catch (error) {
        setCfgStatus('cfgMovideskStatus', `Erro ao salvar token: ${error.message}`, 'error');
    }
}

async function syncTicketsFromConfig() {
    const btn = document.getElementById('cfgSyncTickets');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sincronizando...';
    }

    try {
        const response = await fetch(`${API_BASE}/tickets/sync`, {
            method: 'POST',
            headers: authHeaders()
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao sincronizar');

        setCfgStatus('cfgMovideskStatus', data.message || 'Sincronizacao concluida com sucesso.', 'ok');
        await loadAdminStats();
        await fetchOpenTickets();
    } catch (error) {
        setCfgStatus('cfgMovideskStatus', `Erro ao sincronizar: ${error.message}`, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Sincronizar agora';
        }
    }
}

function isAutoSyncEnabled() {
    return window._serverAutoSyncEnabled === true;
}

function stopAutoSyncLoop() {
    if (_autoSyncIntervalId) {
        clearInterval(_autoSyncIntervalId);
        _autoSyncIntervalId = null;
    }
}

function startAutoSyncLoop() {
    if (_autoSyncIntervalId) return;
    _autoSyncIntervalId = setInterval(() => syncAndRefresh(true), 60 * 1000);
}

// Atualiza o dashboard com dados do banco a cada 1 minuto (sem disparar sync na API)
let _dashboardRefreshIntervalId = null;

function startDashboardRefreshLoop() {
    if (_dashboardRefreshIntervalId) return;
    _dashboardRefreshIntervalId = setInterval(async () => {
        try {
            await fetchOpenTickets();
        } catch (e) {
            console.warn('Dashboard refresh silencioso falhou:', e.message);
        }
    }, 60 * 1000);
}

function stopDashboardRefreshLoop() {
    if (_dashboardRefreshIntervalId) {
        clearInterval(_dashboardRefreshIntervalId);
        _dashboardRefreshIntervalId = null;
    }
}

function refreshAutoSyncLoop() {
    if (!ENABLE_FRONTEND_AUTOSYNC_LOOP || !isCurrentUserAdmin() || EMBED_MODE || !isAutoSyncEnabled()) {
        stopAutoSyncLoop();
        return;
    }
    startAutoSyncLoop();
}

// ============================================================
// COMPETÊNCIAS DE CURADORIA — Editor de configuração
// ============================================================

const DEFAULT_CURADORIA_CATEGORIES = [
    {
        key: 'comunicacao_clara', label: 'Comunicação clara', icon: 'forum',
        description: 'Clareza e cordialidade nas interações', isNegative: false,
        prompt: 'O atendente se comunicou de forma clara, objetiva e cordial? Avalie se as respostas são fáceis de entender, sem jargão excessivo, e se o tom foi respeitoso e profissional.'
    },
    {
        key: 'detalhamento', label: 'Detalhamento', icon: 'manage_search',
        description: 'Profundidade na análise e explicação', isNegative: false,
        prompt: 'O atendente detalhou adequadamente o problema e a solução? Avalie se houve explicação da causa raiz, descrição técnica suficiente e informações que ajudem o cliente a entender o que ocorreu.'
    },
    {
        key: 'fechamento', label: 'Fechamento', icon: 'task_alt',
        description: 'Conclusão adequada dos atendimentos', isNegative: false,
        prompt: 'O atendente encerrou o chamado de forma adequada? Avalie se houve confirmação com o cliente, resumo da solução aplicada e fechamento formal do ticket.'
    },
    {
        key: 'acompanhamento', label: 'Acompanhamento', icon: 'update',
        description: 'Follow-up e atualização de status', isNegative: false,
        prompt: 'O atendente realizou acompanhamento proativo? Avalie se houve retorno ao cliente sem ele precisar cobrar, atualizações de status e follow-up para verificar se o problema foi resolvido.'
    },
    {
        key: 'solucao_tecnica', label: 'Solução técnica', icon: 'build_circle',
        description: 'Resolução e ajustes técnicos', isNegative: false,
        prompt: 'O atendente demonstrou competência técnica na resolução? Avalie se a solução foi adequada ao problema, se houve análise técnica e se os ajustes realizados resolveram o issue.'
    },
    {
        key: 'transparencia', label: 'Transparência', icon: 'visibility',
        description: 'Reconhecimento de prazos e limitações', isNegative: false,
        prompt: 'O atendente foi transparente sobre prazos, limitações e o andamento do chamado? Avalie se ele reconheceu quando não sabia algo, informou prazos realistas e foi honesto sobre restrições.'
    },
    {
        key: 'dificuldade_resolucao', label: 'Dificuldade de resolução', icon: 'warning_amber',
        description: 'Ocorrências sem solução registrada', isNegative: true,
        prompt: 'O chamado ficou sem solução, com falta de retorno ou foi encerrado sem resolver o problema do cliente? Identifique se houve abandono, falta de follow-up ou encerramento indevido.'
    },
];

function _escCfg(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadCategoriesConfig() {
    const container = document.getElementById('cfgCategoriesList');
    if (!container) return;
    try {
        const response = await fetch(`${API_BASE}/config/curadoria-categories`, { headers: authHeaders() });
        const data = response.ok ? await response.json() : {};
        const cats = (data.categories && data.categories.length) ? data.categories : DEFAULT_CURADORIA_CATEGORIES;
        renderCategoriesEditor(cats);
    } catch {
        renderCategoriesEditor(DEFAULT_CURADORIA_CATEGORIES);
    }
}

function renderCategoriesEditor(categories) {
    const container = document.getElementById('cfgCategoriesList');
    if (!container) return;
    container.innerHTML = categories.map((cat) => {
        const prompt = cat.prompt || '';
        const negBadge = cat.isNegative
            ? `<span class="cfg-cat-badge cfg-cat-badge-neg">⚠ Negativa</span>`
            : `<span class="cfg-cat-badge cfg-cat-badge-pos">✅ Positiva</span>`;
        return `
        <div class="cfg-category-row" data-icon="${_escCfg(cat.icon || 'star')}" data-key="${_escCfg(cat.key)}">
            <div class="cfg-cat-top">
                ${negBadge}
                <span class="cfg-cat-name-preview">${_escCfg(cat.label)}</span>
                <button class="config-btn config-btn-danger" onclick="cfgRemoveCategoryRow(this)" title="Remover esta competência">✕ Remover</button>
            </div>
            <div class="cfg-cat-fields">
                <div class="cfg-field-group">
                    <label class="cfg-field-label">Nome da competência</label>
                    <input class="config-input cfg-cat-label" type="text" placeholder="Ex: Comunicação clara" value="${_escCfg(cat.label)}" oninput="this.closest('.cfg-category-row').querySelector('.cfg-cat-name-preview').textContent=this.value">
                </div>
                <div class="cfg-field-group">
                    <label class="cfg-field-label">Descrição curta <span class="cfg-field-hint">(aparece no cartão da análise)</span></label>
                    <input class="config-input cfg-cat-desc" type="text" placeholder="Ex: Clareza e cordialidade nas interações" value="${_escCfg(cat.description)}">
                </div>
                <div class="cfg-field-group">
                    <label class="cfg-field-label">Prompt de avaliação <span class="cfg-field-hint">(instrução para a IA identificar esta competência nos chamados)</span></label>
                    <p class="cfg-help-text">💡 Descreva em linguagem natural o que a IA deve observar nos chamados para identificar esta competência. Seja específico sobre comportamentos e evidências esperados.</p>
                    <textarea class="config-input cfg-cat-prompt" rows="4" placeholder="Ex: O atendente se comunicou de forma clara e objetiva? Avalie se as respostas são fáceis de entender e o tom foi profissional.">${_escCfg(prompt)}</textarea>
                </div>
                <div class="cfg-field-group">
                    <label class="config-checkbox-label cfg-neg-toggle">
                        <input type="checkbox" class="cfg-cat-negative" ${cat.isNegative ? 'checked' : ''}
                            onchange="const b=this.closest('.cfg-category-row').querySelector('.cfg-cat-badge'); b.className='cfg-cat-badge '+(this.checked?'cfg-cat-badge-neg':'cfg-cat-badge-pos'); b.textContent=this.checked?'⚠ Negativa':'✅ Positiva';">
                        <div>
                            <strong>É uma competência negativa?</strong>
                            <p class="cfg-help-text" style="margin:0">Marque se esta competência representa um <strong>problema</strong> no atendimento (ex: falta de solução, demora). Deixe desmarcado para pontos positivos.</p>
                        </div>
                    </label>
                </div>
            </div>
        </div>`;
    }).join('');
}

function cfgAddCategoryRow() {
    const container = document.getElementById('cfgCategoriesList');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'cfg-category-row';
    div.dataset.icon = 'star';
    div.dataset.key = '';
    div.innerHTML = `
        <div class="cfg-cat-top">
            <span class="cfg-cat-badge cfg-cat-badge-pos">✅ Positiva</span>
            <span class="cfg-cat-name-preview" style="color:var(--text-secondary);font-style:italic">Nova competência</span>
            <button class="config-btn config-btn-danger" onclick="cfgRemoveCategoryRow(this)" title="Remover">✕ Remover</button>
        </div>
        <div class="cfg-cat-fields">
            <div class="cfg-field-group">
                <label class="cfg-field-label">Nome da competência</label>
                <input class="config-input cfg-cat-label" type="text" placeholder="Ex: Proatividade" value="" oninput="this.closest('.cfg-category-row').querySelector('.cfg-cat-name-preview').textContent=this.value||'Nova competência'">
            </div>
            <div class="cfg-field-group">
                <label class="cfg-field-label">Descrição curta <span class="cfg-field-hint">(aparece no cartão da análise)</span></label>
                <input class="config-input cfg-cat-desc" type="text" placeholder="Ex: Atitude proativa do atendente" value="">
            </div>
            <div class="cfg-field-group">
                <label class="cfg-field-label">Prompt de avaliação <span class="cfg-field-hint">(instrução para a IA identificar esta competência nos chamados)</span></label>
                <p class="cfg-help-text">💡 Descreva o que a IA deve observar para identificar esta competência. Seja específico sobre comportamentos e evidências esperados.</p>
                <textarea class="config-input cfg-cat-prompt" rows="4" placeholder="Ex: O atendente demonstrou proatividade? Identifique se ele antecipou problemas, tomou iniciativa sem esperar o cliente cobrar e sugeriu soluções além do solicitado."></textarea>
            </div>
            <div class="cfg-field-group">
                <label class="config-checkbox-label cfg-neg-toggle">
                    <input type="checkbox" class="cfg-cat-negative"
                        onchange="const b=this.closest('.cfg-category-row').querySelector('.cfg-cat-badge'); b.className='cfg-cat-badge '+(this.checked?'cfg-cat-badge-neg':'cfg-cat-badge-pos'); b.textContent=this.checked?'⚠ Negativa':'✅ Positiva';">
                    <div>
                        <strong>É uma competência negativa?</strong>
                        <p class="cfg-help-text" style="margin:0">Marque se esta competência representa um <strong>problema</strong> no atendimento. Deixe desmarcado para pontos positivos.</p>
                    </div>
                </label>
            </div>
        </div>`;
    container.appendChild(div);
    div.querySelector('.cfg-cat-label').focus();
}

function cfgRemoveCategoryRow(btn) {
    btn.closest('.cfg-category-row').remove();
}

function cfgReadCategoriesFromEditor() {
    const rows = document.querySelectorAll('#cfgCategoriesList .cfg-category-row');
    const categories = [];
    for (const row of rows) {
        const label = row.querySelector('.cfg-cat-label')?.value?.trim();
        const prompt = row.querySelector('.cfg-cat-prompt')?.value?.trim() || '';
        if (!label || !prompt) continue;
        const description = row.querySelector('.cfg-cat-desc')?.value?.trim() || '';
        const isNegative  = row.querySelector('.cfg-cat-negative')?.checked || false;
        const icon = row.dataset.icon || (isNegative ? 'warning_amber' : 'check_circle');
        const key = label.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        categories.push({ key, label, prompt, icon, description, isNegative });
    }
    return categories;
}

async function saveCategoriesConfig() {
    const categories = cfgReadCategoriesFromEditor();
    if (categories.length === 0) {
        setCfgStatus('cfgCategoriesStatus', 'Adicione pelo menos uma competência com nome e prompt antes de salvar.', 'error');
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/config/curadoria-categories`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ categories })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao salvar');
        setCfgStatus('cfgCategoriesStatus', `✅ ${categories.length} competência(s) salvas com sucesso.`, 'ok');
    } catch (e) {
        setCfgStatus('cfgCategoriesStatus', `Erro ao salvar: ${e.message}`, 'error');
    }
}

function resetCategoriesConfig() {
    renderCategoriesEditor(DEFAULT_CURADORIA_CATEGORIES);
    setCfgStatus('cfgCategoriesStatus', 'Padrão restaurado. Clique em "Salvar competências" para confirmar.', 'ok');
}

function switchConfigTab(tab) {
    document.querySelectorAll('.cfg-tab-panel').forEach(p => p.classList.add('cfg-tab-hidden'));
    document.querySelectorAll('.cfg-tab-btn').forEach(b => b.classList.remove('cfg-tab-active'));
    document.getElementById(`cfgTab-${tab}`)?.classList.remove('cfg-tab-hidden');
    document.querySelector(`.cfg-tab-btn[data-tab="${tab}"]`)?.classList.add('cfg-tab-active');
    // Volta o scroll para o topo ao trocar de aba
    document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadAutoSyncStatus() {
    const status = document.getElementById('cfgAutoSyncStatus');
    const toggleBtn = document.getElementById('cfgToggleAutoSync');
    let enabled = false;

    try {
        const response = await fetch(`${API_BASE}/config/autosync`, {
            headers: authHeaders()
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao consultar autosync');
        enabled = !!data.enabled;
        window._serverAutoSyncEnabled = enabled;
    } catch (error) {
        window._serverAutoSyncEnabled = false;
        if (status) {
            status.textContent = 'Erro ao consultar';
            status.className = 'config-token-status config-token-status-off';
        }
        if (toggleBtn) {
            toggleBtn.textContent = 'Tentar novamente';
            toggleBtn.className = 'config-btn';
        }
        setCfgStatus('cfgMovideskStatus', `Erro ao consultar autosync: ${error.message}`, 'error');
        return;
    }

    if (status) {
        status.textContent = enabled ? 'Ativado (a cada 5 minutos)' : 'Desativado';
        status.className = `config-token-status ${enabled ? 'config-token-status-on' : 'config-token-status-off'}`;
    }

    if (toggleBtn) {
        toggleBtn.textContent = enabled ? 'Desativar autosync' : 'Ativar autosync';
        toggleBtn.className = `config-btn ${enabled ? 'config-btn-muted' : ''}`;
    }
}

async function toggleAutoSync() {
    const enabled = !isAutoSyncEnabled();

    try {
        const response = await fetch(`${API_BASE}/config/autosync`, {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ enabled })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao salvar autosync');

        window._serverAutoSyncEnabled = !!data.enabled;
        await loadAutoSyncStatus();
        refreshAutoSyncLoop();
        setCfgStatus('cfgMovideskStatus', data.message || `Autosync ${enabled ? 'ativado' : 'desativado'} com sucesso.`, 'ok');
    } catch (error) {
        setCfgStatus('cfgMovideskStatus', `Erro ao salvar autosync: ${error.message}`, 'error');
    }
}

async function loadAdminStats() {
    try {
        const response = await fetch(`${API_BASE}/tickets/stats/overview`, {
            headers: authHeaders()
        });
        if (!response.ok) throw new Error('Falha ao carregar estatisticas');
        const stats = await response.json();

        const grid = document.getElementById('cfgStatsGrid');
        if (!grid) return;
        const values = grid.querySelectorAll('strong');
        if (values.length < 4) return;

        values[0].textContent = stats.total || 0;
        values[1].textContent = stats.novo || 0;
        values[2].textContent = stats.emAtendimento || 0;
        values[3].textContent = stats.parado || 0;
    } catch {
        setCfgStatus('cfgMovideskStatus', 'Nao foi possivel carregar as estatisticas.', 'error');
    }
}

async function loadGptStatus() {
    if (!isCurrentUserAdmin()) {
        setCfgStatus('cfgGptStatus', 'Somente admin pode consultar a chave GPT.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/config/gpt-key`, {
            headers: authHeaders()
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao consultar chave GPT');

        if (data.configured) {
            setCfgStatus('cfgGptStatus', 'Chave GPT configurada.', 'ok');
        } else {
            setCfgStatus('cfgGptStatus', 'Chave GPT ainda nao configurada.');
        }
    } catch (error) {
        setCfgStatus('cfgGptStatus', `Erro ao consultar chave GPT: ${error.message}`, 'error');
    }
}

function showLoginScreen(message = '') {
    // Login está em página separada — redireciona
    window.location.replace('/login.html');
}

function hideLoginScreen() {
    // No-op: login agora é página separada
}

function setLoginError(message) {
    const err = document.getElementById('loginError');
    if (!err) return;
    err.textContent = message;
    err.style.display = message ? 'block' : 'none';
}

async function loginSubmit(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value?.trim();
    const btn = document.getElementById('loginSubmit');
    setLoginError('');

    if (!email || !password) {
        setLoginError('Informe e-mail e senha.');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Entrando...';
    }

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Falha no login');
        }

        if (data.requiresMFA) {
            throw new Error('MFA habilitado neste usuário. O fluxo de confirmação ainda não está implementado nesta tela.');
        }

        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        _currentUser = data.user;
        setLoginError('');
        hideLoginScreen();
        await initializeApp();
    } catch (error) {
        setLoginError(error.message || 'Erro ao entrar.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Entrar';
        }
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: 'POST',
            headers: authHeaders()
        });
    } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    _currentUser = null;
    _appInitialized = false;
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    if (loginEmail) loginEmail.value = '';
    if (loginPassword) loginPassword.value = '';
    showLoginScreen();
}

async function loadGptPrompt() {
    if (!isCurrentUserAdmin()) {
        setCfgStatus('cfgPromptStatus', 'Somente admin pode consultar o prompt.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/config/gpt-prompt`, {
            headers: authHeaders()
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao consultar prompt');

        const input = document.getElementById('cfgGptPrompt');
        if (input) input.value = data.prompt || '';
        setCfgStatus('cfgPromptStatus', data.configured ? 'Prompt carregado.' : 'Prompt ainda nao configurado.');
    } catch (error) {
        setCfgStatus('cfgPromptStatus', `Erro ao consultar prompt: ${error.message}`, 'error');
    }
}

async function saveGptApiKey() {
    if (!isCurrentUserAdmin()) {
        setCfgStatus('cfgGptStatus', 'Somente admin pode salvar a chave GPT.', 'error');
        return;
    }

    const input = document.getElementById('cfgGptApiKey');
    const apiKey = input?.value?.trim();
    if (!apiKey) {
        setCfgStatus('cfgGptStatus', 'Informe a chave GPT antes de salvar.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/config/gpt-key`, {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ apiKey })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao salvar chave GPT');

        input.value = '';
        setCfgStatus('cfgGptStatus', 'Chave GPT salva com sucesso.', 'ok');
        await loadGptStatus();
    } catch (error) {
        setCfgStatus('cfgGptStatus', `Erro ao salvar chave GPT: ${error.message}`, 'error');
    }
}

async function saveGptPrompt() {
    if (!isCurrentUserAdmin()) {
        setCfgStatus('cfgPromptStatus', 'Somente admin pode salvar o prompt.', 'error');
        return;
    }

    const input = document.getElementById('cfgGptPrompt');
    const prompt = input?.value?.trim();
    if (!prompt) {
        setCfgStatus('cfgPromptStatus', 'Informe o prompt antes de salvar.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/config/gpt-prompt`, {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao salvar prompt');

        setCfgStatus('cfgPromptStatus', 'Prompt salvo com sucesso.', 'ok');
        await loadGptPrompt();
    } catch (error) {
        setCfgStatus('cfgPromptStatus', `Erro ao salvar prompt: ${error.message}`, 'error');
    }
}

async function loadDbConfig() {
    if (!isCurrentUserAdmin()) {
        setCfgStatus('cfgDbStatus', 'Somente admin pode consultar as configurações do banco.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/config/database`, {
            headers: authHeaders()
        });
        const raw = await response.text();
        let data = {};
        if (raw) {
            try { data = JSON.parse(raw); } catch { data = { error: raw }; }
        }
        if (!response.ok) throw new Error(data.error || 'Falha ao consultar banco');

        const host = document.getElementById('cfgDbHost');
        const port = document.getElementById('cfgDbPort');
        const name = document.getElementById('cfgDbName');
        const user = document.getElementById('cfgDbUser');
        const password = document.getElementById('cfgDbPassword');
        const dialect = document.getElementById('cfgDbDialect');

        if (host) host.value = data.host || '';
        if (port) port.value = data.port || '';
        if (name) name.value = data.name || '';
        if (user) user.value = data.user || '';
        if (password) password.value = data.password || '';
        if (dialect) dialect.value = data.dialect || 'postgres';

        setCfgStatus('cfgDbStatus', data.configured ? 'Configurações do banco carregadas.' : 'Banco ainda não configurado.');
    } catch (error) {
        setCfgStatus('cfgDbStatus', `Erro ao consultar banco: ${error.message}`, 'error');
    }
}

async function saveDbConfig() {
    if (!isCurrentUserAdmin()) {
        setCfgStatus('cfgDbStatus', 'Somente admin pode salvar as configurações do banco.', 'error');
        return;
    }

    const host = document.getElementById('cfgDbHost')?.value?.trim();
    const port = document.getElementById('cfgDbPort')?.value?.trim();
    const name = document.getElementById('cfgDbName')?.value?.trim();
    const user = document.getElementById('cfgDbUser')?.value?.trim();
    const password = document.getElementById('cfgDbPassword')?.value?.trim();
    const dialect = document.getElementById('cfgDbDialect')?.value || 'postgres';

    if (!host || !port || !name || !user || !password) {
        setCfgStatus('cfgDbStatus', 'Preencha host, porta, nome, usuário e senha.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/config/database`, {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ host, port, name, user, password, dialect })
        });
        const raw = await response.text();
        let data = {};
        if (raw) {
            try { data = JSON.parse(raw); } catch { data = { error: raw }; }
        }
        if (!response.ok) throw new Error(data.error || 'Falha ao salvar banco');

        setCfgStatus('cfgDbStatus', 'Configurações do banco salvas com sucesso.', 'ok');
        await loadDbConfig();
    } catch (error) {
        setCfgStatus('cfgDbStatus', `Erro ao salvar banco: ${error.message}`, 'error');
    }
}

function resetGptPromptToDefault() {
    const input = document.getElementById('cfgGptPrompt');
    if (!input) return;
    input.value = `Analise o ticket JSON abaixo e retorne APENAS um objeto JSON valido com todos os campos preenchidos com dados reais do ticket.

JSON DO TICKET:
{{ticketJson}}

Voce e um analista senior de suporte critico que analisa tickets de suporte em JSON.

REGRAS ABSOLUTAS:
- Analise TODO o JSON do ticket fornecido, incluindo campos principais, customFields, actions, clients e statusHistories
- Se serviceFirstLevel for exatamente "Sistemas Internos", nao use causa, fato nem ModuloXRotina como base da analise, porque esses campos podem nao existir ou nao ser aplicaveis
- Em tickets de Sistemas Internos, baseie diagnostico, urgencia e impacto principalmente em subject, description, justification, actions, clients, statusHistories e demais campos reais do ticket
- Ignore acoes com type = 1 (acoes internas de escalonamento/atribuicao)
- Ignore acoes onde createdBy.id = "007" (acoes de sistema)
- Suporte = createdBy com email contendo @viasoft.com.br OU createdBy.businessName === owner.businessName (quando businessName nao for vazio)
- Cliente = usuario solicitante do chamado {{solicitante}}
- Fato relatado = {{fato}}
- Causa identificada = {{causa}}
- Modulo X Rotina = {{ModuloXRotina}}
- Responda APENAS com um JSON valido, sem markdown, sem texto adicional, sem crases, sem blocos de codigo
- Preencha TODOS os campos com dados reais do JSON do ticket
- Nunca use dados ficticios como user123 ou owner@example.com
- Use SEMPRE os nomes e e-mails reais presentes no JSON fornecido

ANALISE ENCADEADA:
- Excecao: se o ticket for de Sistemas Internos, o diagnostico nao deve depender de causa, fato ou ModuloXRotina; nesses casos, preencha esses campos apenas com "Nao se aplica a Sistemas Internos" quando nao houver valor real no JSON

Actions do ticket (JSON):
{{actionsJson}}`;
    setCfgStatus('cfgPromptStatus', 'Modelo padrão restaurado no campo. Clique em salvar para aplicar.', 'ok');
}

// ===== CONDIÇÕES DA REQUISIÇÃO MOVIDESK =====
async function loadMovideskConditions() {
    if (!isCurrentUserAdmin()) return;

    try {
        const response = await fetch(`${API_BASE}/config/movidesk-conditions`, {
            headers: authHeaders()
        });
        
        if (!response.ok) {
            console.warn('Falha ao carregar condições Movidesk, usando padrões');
            setDefaultMovideskConditions();
            return;
        }

        const data = await response.json();

        // Carregar status
        const statuses = data.statuses || ['New', 'InAttendance', 'Stopped'];
        document.getElementById('cfgStatusNew').checked = statuses.includes('New');
        document.getElementById('cfgStatusInAttendance').checked = statuses.includes('InAttendance');
        document.getElementById('cfgStatusStopped').checked = statuses.includes('Stopped');
        document.getElementById('cfgStatusInProgress').checked = statuses.includes('InProgress');

        // Carregar filtro de serviço
        document.getElementById('cfgServiceFirstLevel').value = data.serviceFirstLevel || '';

        // Carregar filtro de campo customizado
        document.getElementById('cfgCustomFieldId').value = data.customFieldId || '23946';
        document.getElementById('cfgCustomFieldValue').value = data.customFieldValue || 'Suporte Técnico';

        // Carregar limite
        document.getElementById('cfgSyncLimit').value = data.syncLimit || '100';

        // Carregar ownerTeam
        document.getElementById('cfgOwnerTeam').value = data.ownerTeam || 'VIASOFT - Sistemas Internos';

        // Carregar status base excluídos
        const excludedStatuses = data.excludedBaseStatuses || ['Resolved', 'Closed', 'Canceled'];
        document.getElementById('cfgExcludedResolved').checked = excludedStatuses.includes('Resolved');
        document.getElementById('cfgExcludedClosed').checked = excludedStatuses.includes('Closed');
        document.getElementById('cfgExcludedCanceled').checked = excludedStatuses.includes('Canceled');

        // Carregar campos de select e expand
        document.getElementById('cfgSelectFields').value = data.selectFields || 'id,subject,status,baseStatus,createdDate,lastActionDate,lastUpdate,serviceFirstLevelId,serviceFirstLevel,serviceSecondLevel,slaAgreement,slaAgreementRule,slaSolutionTime,slaResponseTime,slaSolutionDate,slaSolutionDateIsPaused,slaResponseDate,slaRealResponseDate,justification,ownerTeam';
        document.getElementById('cfgExpandRelations').value = data.expandRelations || 'owner,actions($select=id,type,origin,status,createdDate,description;$expand=createdBy),customFieldValues($expand=items),clients($expand=organization)';
    } catch (error) {
        console.error('Erro ao carregar condições Movidesk:', error);
        setDefaultMovideskConditions();
    }
}

function setDefaultMovideskConditions() {
    document.getElementById('cfgStatusNew').checked = true;
    document.getElementById('cfgStatusInAttendance').checked = true;
    document.getElementById('cfgStatusStopped').checked = true;
    document.getElementById('cfgStatusInProgress').checked = false;
    document.getElementById('cfgServiceFirstLevel').value = '';
    document.getElementById('cfgCustomFieldId').value = '23946';
    document.getElementById('cfgCustomFieldValue').value = 'Suporte Técnico';
    document.getElementById('cfgSyncLimit').value = '100';
    document.getElementById('cfgOwnerTeam').value = 'VIASOFT - Sistemas Internos';
    document.getElementById('cfgExcludedResolved').checked = true;
    document.getElementById('cfgExcludedClosed').checked = true;
    document.getElementById('cfgExcludedCanceled').checked = true;
    document.getElementById('cfgSelectFields').value = 'id,subject,status,baseStatus,createdDate,lastActionDate,lastUpdate,serviceFirstLevelId,serviceFirstLevel,serviceSecondLevel,slaAgreement,slaAgreementRule,slaSolutionTime,slaResponseTime,slaSolutionDate,slaSolutionDateIsPaused,slaResponseDate,slaRealResponseDate,justification,ownerTeam';
    document.getElementById('cfgExpandRelations').value = 'owner,actions($select=id,type,origin,status,createdDate,description;$expand=createdBy),customFieldValues($expand=items),clients($expand=organization)';
}

async function saveMovideskConditions() {
    if (!isCurrentUserAdmin()) {
        setCfgStatus('cfgMovideskConditionsStatus', 'Somente admin pode salvar as condições Movidesk.', 'error');
        return;
    }

    const statuses = [];
    if (document.getElementById('cfgStatusNew').checked) statuses.push('New');
    if (document.getElementById('cfgStatusInAttendance').checked) statuses.push('InAttendance');
    if (document.getElementById('cfgStatusStopped').checked) statuses.push('Stopped');
    if (document.getElementById('cfgStatusInProgress').checked) statuses.push('InProgress');

    if (statuses.length === 0) {
        setCfgStatus('cfgMovideskConditionsStatus', 'Selecione pelo menos um status.', 'error');
        return;
    }

    const serviceFirstLevel = document.getElementById('cfgServiceFirstLevel')?.value?.trim() || '';
    const customFieldId = document.getElementById('cfgCustomFieldId')?.value?.trim() || '';
    const customFieldValue = document.getElementById('cfgCustomFieldValue')?.value?.trim() || '';
    const syncLimit = parseInt(document.getElementById('cfgSyncLimit')?.value || '100');

    if (syncLimit < 1 || syncLimit > 500) {
        setCfgStatus('cfgMovideskConditionsStatus', 'Limite deve estar entre 1 e 500.', 'error');
        return;
    }

    // Novos campos
    const ownerTeam = document.getElementById('cfgOwnerTeam')?.value?.trim() || '';
    
    const excludedBaseStatuses = [];
    if (document.getElementById('cfgExcludedResolved').checked) excludedBaseStatuses.push('Resolved');
    if (document.getElementById('cfgExcludedClosed').checked) excludedBaseStatuses.push('Closed');
    if (document.getElementById('cfgExcludedCanceled').checked) excludedBaseStatuses.push('Canceled');

    const selectFields = document.getElementById('cfgSelectFields')?.value?.trim() || '';
    const expandRelations = document.getElementById('cfgExpandRelations')?.value?.trim() || '';

    if (!selectFields.trim()) {
        setCfgStatus('cfgMovideskConditionsStatus', 'Campos a sincronizar não pode estar vazio.', 'error');
        return;
    }

    if (!expandRelations.trim()) {
        setCfgStatus('cfgMovideskConditionsStatus', 'Relações a expandir não pode estar vazio.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/config/movidesk-conditions`, {
            method: 'POST',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                statuses,
                serviceFirstLevel,
                customFieldId,
                customFieldValue,
                syncLimit,
                ownerTeam,
                excludedBaseStatuses,
                selectFields,
                expandRelations
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error || 'Falha ao salvar condições');
        }

        setCfgStatus('cfgMovideskConditionsStatus', 'Condições salvas com sucesso. Próxima sincronização usará os novos filtros.', 'ok');
    } catch (error) {
        setCfgStatus('cfgMovideskConditionsStatus', `Erro: ${error.message}`, 'error');
    }
}

function resetMovideskConditions() {
    setDefaultMovideskConditions();
    setCfgStatus('cfgMovideskConditionsStatus', 'Padrões restaurados. Clique em "Salvar condições" para aplicar.', 'ok');
}
