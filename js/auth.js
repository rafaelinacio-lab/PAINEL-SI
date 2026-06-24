
// ── auth.js — Token, sessão e navegação por role ──────────────────────────

function getAuthToken() {
    return localStorage.getItem('token') || '';
}

function authHeaders(extra = {}) {
    const token = getAuthToken();
    if (!token) return { ...extra };
    return {
        ...extra,
        Authorization: `Bearer ${token}`
    };
}

// Função para buscar tickets da API local

function isCurrentUserAdmin() {
    return String(_currentUser?.role || '').toLowerCase() === 'admin';
}

async function loadCurrentUser() {
    const token = getAuthToken();
    if (!token) {
        try {
            const raw = localStorage.getItem('user');
            if (raw) _currentUser = JSON.parse(raw);
        } catch {}
        return _currentUser;
    }

    try {
        const res = await fetch(`${API_BASE}/auth/me`, {
            headers: authHeaders()
        });
        if (!res.ok) return null;
        _currentUser = await res.json();
        renderSidebarUser();
        return _currentUser;
    } catch {
        try {
            const raw = localStorage.getItem('user');
            if (raw) _currentUser = JSON.parse(raw);
        } catch {}
        return _currentUser;
    }
}

function applyRoleBasedNavigation() {
    const cfgBtn = document.getElementById('navConfiguracoes');
    const syncBtn = document.getElementById('syncBtn');
    if (!cfgBtn) return;

    if (isCurrentUserAdmin()) {
        cfgBtn.style.display = 'flex';
        if (syncBtn) syncBtn.style.display = 'inline-flex';
    } else {
        cfgBtn.style.display = 'none';
        if (syncBtn) syncBtn.style.display = 'none';
    }

    // Renderiza avatar do usuário logado ao trocar de usuário
    renderSidebarUser();
}

// ─────────────────────────────────────────────────────────────────
// ÁREA DE PESSOAS — CRUD (variáveis declaradas em script.js)
// ─────────────────────────────────────────────────────────────────

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
