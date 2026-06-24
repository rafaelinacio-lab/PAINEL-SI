
// ── pessoas.js — Gestão de usuários ───────────────────────────────────────

async function pessoasLoad() {
    const tbody = document.getElementById('pessoasTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="pessoas-loading">Carregando…</td></tr>';

    try {
        const res = await fetch(PESSOAS_API, { headers: authHeaders() });
        if (!res.ok) throw new Error('Erro ao carregar');
        const users = await res.json();
        _pessoasAllUsers = users;
        pessoasPopulateEquipeFilter(users);
        pessoasApplyFilters();
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" class="pessoas-loading" style="color:#ef4444;">Erro ao carregar usuários.</td></tr>`;
    }
}

function pessoasPopulateEquipeFilter(users) {
    const select = document.getElementById('pessoasFilterEquipe');
    if (!select) return;
    const equipes = [...new Set(users.map(u => u.vertical).filter(Boolean))].sort();
    const current = select.value;
    select.innerHTML = '<option value="">Todas as equipes</option>' +
        equipes.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
    select.value = current;
}

function pessoasApplyFilters() {
    const search = (document.getElementById('pessoasSearch')?.value || '').toLowerCase().trim();
    const equipe = (document.getElementById('pessoasFilterEquipe')?.value || '').trim();

    const filtered = _pessoasAllUsers.filter(u => {
        if (search && !u.name?.toLowerCase().includes(search) && !u.email?.toLowerCase().includes(search)) return false;
        if (equipe && u.vertical !== equipe) return false;
        return true;
    });
    pessoasRenderTable(filtered);
}

function pessoasClearFilters() {
    const search = document.getElementById('pessoasSearch');
    const equipe = document.getElementById('pessoasFilterEquipe');
    if (search) search.value = '';
    if (equipe) equipe.value = '';
    pessoasApplyFilters();
}

const ROLE_LABELS = { admin: 'Admin', supervisor: 'Supervisor', atendente: 'Atendente' };

function pessoasRenderTable(users) {
    const tbody = document.getElementById('pessoasTbody');
    if (!tbody) return;

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="pessoas-loading">Nenhum usuário cadastrado.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => {
        const initials = (u.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const roleLabel = ROLE_LABELS[u.role] || u.role;
        const roleClass = u.role === 'admin' ? 'role-admin' : u.role === 'supervisor' ? 'role-supervisor' : 'role-atendente';
        const statusClass = u.is_active ? 'status-ativo' : 'status-inativo';
        const statusLabel = u.is_active ? 'Ativo' : 'Inativo';
        const lastLogin = u.last_login
            ? new Date(u.last_login).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
            : '—';

        // URL da foto do usuário
        const fotoUrl = `${API_BASE}/pessoas/foto/${encodeURIComponent(u.email)}`;

        return `
        <tr class="${u.is_active ? '' : 'row-inactive'}">
            <td>
                <div class="pt-avatar-container">
                    <img 
                        src="${fotoUrl}" 
                        alt="${escapeHtml(u.name)}"
                        class="pt-avatar-foto"
                        onerror="this.style.display='none'; this.parentElement.querySelector('.pt-avatar').style.display='flex';"
                        onload="this.parentElement.querySelector('.pt-avatar').style.display='none';"
                    />
                    <div class="pt-avatar" style="display:none;">${initials}</div>
                </div>
            </td>
            <td>
                <div class="pt-user-cell">
                    <span class="pt-name">${escapeHtml(u.name)}</span>
                </div>
            </td>
            <td class="pt-email">${escapeHtml(u.email)}</td>
            <td><span class="pt-role ${roleClass}">${roleLabel}</span></td>
            <td><span class="pt-vertical">${escapeHtml(u.vertical || '—')}</span></td>
            <td><span class="pt-status ${statusClass}">${statusLabel}</span></td>
            <td class="pt-date">${lastLogin}</td>
            <td>
                <div class="pt-actions">
                    <button class="pt-btn pt-btn-edit" onclick="pessoasOpenEdit(${u.id})" title="Editar">✏️</button>
                    <button class="pt-btn pt-btn-reset" onclick="pessoasResetSenha(${u.id}, '${escapeHtml(u.name)}')" title="Resetar senha">🔑</button>
                    <button class="pt-btn ${u.is_active ? 'pt-btn-deact' : 'pt-btn-act'}"
                        onclick="pessoasToggleAtivo(${u.id}, ${u.is_active})"
                        title="${u.is_active ? 'Desativar' : 'Ativar'}">
                        ${u.is_active ? '🚫' : '✅'}
                    </button>
                    <button class="pt-btn pt-btn-delete" onclick="pessoasDelete(${u.id}, '${escapeHtml(u.name)}')" title="Excluir">🗑️</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ─── Abrir modal de criação ───────────────────────────────────────
function pessoasOpenNovo() {
    document.getElementById('pmId').value = '';
    document.getElementById('pmTitle').textContent = 'Novo Usuário';
    document.getElementById('pmName').value = '';
    document.getElementById('pmEmail').value = '';
    document.getElementById('pmRole').value = 'atendente';
    const vertical = document.getElementById('pmVertical');
    if (vertical) vertical.value = '';
    document.getElementById('pmEmailField').style.display = '';
    document.getElementById('pmActiveField').style.display = 'none';
    document.getElementById('pmError').style.display = 'none';
    document.getElementById('pmSave').textContent = 'Criar Usuário';
    document.getElementById('pessoaModal').style.display = 'flex';
    document.getElementById('pmName').focus();
}

// ─── Abrir modal de edição ────────────────────────────────────────
async function pessoasOpenEdit(id) {
    try {
        const res = await fetch(PESSOAS_API, { headers: authHeaders() });
        const users = await res.json();
        const u = users.find(x => x.id === id);
        if (!u) return;

        document.getElementById('pmId').value = u.id;
        document.getElementById('pmTitle').textContent = 'Editar Usuário';
        document.getElementById('pmName').value = u.name;
        document.getElementById('pmEmail').value = u.email;
        document.getElementById('pmRole').value = u.role;
        const vertical = document.getElementById('pmVertical');
        if (vertical) vertical.value = u.vertical || '';
        document.getElementById('pmActive').value = u.is_active ? '1' : '0';
        document.getElementById('pmEmailField').style.display = '';
        document.getElementById('pmActiveField').style.display = '';
        document.getElementById('pmError').style.display = 'none';
        document.getElementById('pmSave').textContent = 'Salvar Alterações';
        document.getElementById('pessoaModal').style.display = 'flex';
        document.getElementById('pmName').focus();
    } catch (e) {
        alert('Erro ao carregar dados do usuário.');
    }
}

function pessoasCloseModal() {
    document.getElementById('pessoaModal').style.display = 'none';
}

// ─── Submeter formulário ──────────────────────────────────────────
async function pessoasSubmit(e) {
    e.preventDefault();
    const id    = document.getElementById('pmId').value;
    const name  = document.getElementById('pmName').value.trim();
    const email = document.getElementById('pmEmail').value.trim();
    const role  = document.getElementById('pmRole').value;
    const vertical = document.getElementById('pmVertical').value;
    const active = document.getElementById('pmActive').value;
    const errEl = document.getElementById('pmError');
    const saveBtn = document.getElementById('pmSave');

    errEl.style.display = 'none';

    if (!name) { pmShowError('Nome é obrigatório.'); return; }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando…';

    try {
        let res, data;
        if (!id) {
            // Criar
            if (!email) { pmShowError('E-mail é obrigatório.'); return; }
            if (!vertical) { pmShowError('Vertical é obrigatória.'); return; }
            res = await fetch(PESSOAS_API, {
                method: 'POST',
                headers: {
                    ...authHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, role, vertical })
            });
            data = await res.json();
            if (!res.ok) { pmShowError(data.error || 'Erro ao criar.'); return; }
            pessoasCloseModal();
            pessoasMostrarSenha(data.initialPassword);
        } else {
            // Editar
            const body = { email, name, role, is_active: active === '1', vertical };
            res = await fetch(`${PESSOAS_API}/${id}`, {
                method: 'PUT',
                headers: {
                    ...authHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            data = await res.json();
            if (!res.ok) { pmShowError(data.error || 'Erro ao salvar.'); return; }
            pessoasCloseModal();
        }
        pessoasLoad();
    } catch (err) {
        pmShowError('Erro de conexão.');
    } finally {
        saveBtn.disabled = false;
        document.getElementById('pmSave').textContent = id ? 'Salvar Alterações' : 'Criar Usuário';
    }
}

function pmShowError(msg) {
    const el = document.getElementById('pmError');
    el.textContent = msg;
    el.style.display = 'block';
    document.getElementById('pmSave').disabled = false;
}

// ─── Toggle ativo/inativo ─────────────────────────────────────────
async function pessoasToggleAtivo(id, currentlyActive) {
    const acao = currentlyActive ? 'desativar' : 'ativar';
    if (!confirm(`Deseja ${acao} este usuário?`)) return;
    try {
        const res = await fetch(`${PESSOAS_API}/${id}`, {
            method: 'PUT',
            headers: {
                ...authHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ is_active: !currentlyActive })
        });
        if (!res.ok) throw new Error();
        pessoasLoad();
    } catch {
        alert('Erro ao alterar status.');
    }
}

async function pessoasDelete(id, nome) {
    if (!confirm(`Excluir permanentemente o usuário "${nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
        const res = await fetch(`${PESSOAS_API}/${id}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        const raw = await res.text();
        let data = {};
        if (raw) {
            try { data = JSON.parse(raw); } catch { data = { error: raw }; }
        }
        if (!res.ok) {
            alert(data.error || 'Erro ao excluir usuário.');
            return;
        }
        pessoasLoad();
    } catch (err) {
        alert(`Erro de conexão: ${err.message}`);
    }
}

// ─── Reset de senha ───────────────────────────────────────────────
async function pessoasResetSenha(id, nome) {
    if (!confirm(`Resetar a senha de "${nome}"? A senha atual será invalidada.`)) return;
    try {
        const res = await fetch(`${PESSOAS_API}/${id}/reset-password`, {
            method: 'POST',
            headers: authHeaders()
        });
        const raw = await res.text();
        let data = {};
        if (raw) {
            try { data = JSON.parse(raw); } catch { data = { error: raw }; }
        }
        if (!res.ok) { alert(data.error || 'Erro ao resetar.'); return; }
        pessoasMostrarSenha(data.initialPassword);
    } catch (err) {
        alert(`Erro de conexão: ${err.message}`);
    }
}

// ─── Modal de senha gerada ────────────────────────────────────────
function pessoasMostrarSenha(senha) {
    document.getElementById('pmSenhaValue').textContent = senha;
    document.getElementById('senhaModal').style.display = 'flex';
}

function pessoasCloseSenha() {
    document.getElementById('senhaModal').style.display = 'none';
}

// ─── Setup de eventos do modal ────────────────────────────────────
function setupPessoasEvents() {
    const novaPessoaBtn = document.getElementById('btnNovaPessoa');
    if (novaPessoaBtn && !novaPessoaBtn.dataset.bound) {
        novaPessoaBtn.addEventListener('click', pessoasOpenNovo);
        novaPessoaBtn.dataset.bound = '1';
    }
    const pmClose = document.getElementById('pmClose');
    if (pmClose && !pmClose.dataset.bound) {
        pmClose.addEventListener('click', pessoasCloseModal);
        pmClose.dataset.bound = '1';
    }
    const pmCancel = document.getElementById('pmCancel');
    if (pmCancel && !pmCancel.dataset.bound) {
        pmCancel.addEventListener('click', pessoasCloseModal);
        pmCancel.dataset.bound = '1';
    }
    const pmForm = document.getElementById('pmForm');
    if (pmForm && !pmForm.dataset.bound) {
        pmForm.addEventListener('submit', pessoasSubmit);
        pmForm.dataset.bound = '1';
    }
    const senhaClose = document.getElementById('senhaClose');
    if (senhaClose && !senhaClose.dataset.bound) {
        senhaClose.addEventListener('click', pessoasCloseSenha);
        senhaClose.dataset.bound = '1';
    }
    const btnCopySenha = document.getElementById('btnCopySenha');
    if (btnCopySenha && !btnCopySenha.dataset.bound) {
        btnCopySenha.addEventListener('click', () => {
        const val = document.getElementById('pmSenhaValue').textContent;
        navigator.clipboard.writeText(val).then(() => {
            const btn = document.getElementById('btnCopySenha');
            btn.textContent = 'Copiado!';
            setTimeout(() => btn.textContent = 'Copiar Senha', 2000);
        });
        });
        btnCopySenha.dataset.bound = '1';
    }
    // Fechar modais clicando no overlay
    const pessoaModal = document.getElementById('pessoaModal');
    if (pessoaModal && !pessoaModal.dataset.bound) {
        pessoaModal.addEventListener('click', function(e) {
            if (e.target === this) pessoasCloseModal();
        });
        pessoaModal.dataset.bound = '1';
    }
    const senhaModal = document.getElementById('senhaModal');
    if (senhaModal && !senhaModal.dataset.bound) {
        senhaModal.addEventListener('click', function(e) {
            if (e.target === this) pessoasCloseSenha();
        });
        senhaModal.dataset.bound = '1';
    }

    const executiveSummaryClose = document.getElementById('executiveSummaryClose');
    if (executiveSummaryClose && !executiveSummaryClose.dataset.bound) {
        executiveSummaryClose.addEventListener('click', closeExecutiveSummaryModal);
        executiveSummaryClose.dataset.bound = '1';
    }
    const executiveSummaryCancel = document.getElementById('executiveSummaryCancel');
    if (executiveSummaryCancel && !executiveSummaryCancel.dataset.bound) {
        executiveSummaryCancel.addEventListener('click', closeExecutiveSummaryModal);
        executiveSummaryCancel.dataset.bound = '1';
    }
    const executiveSummaryModal = document.getElementById('executiveSummaryModal');
    if (executiveSummaryModal && !executiveSummaryModal.dataset.bound) {
        executiveSummaryModal.addEventListener('click', function(e) {
            if (e.target === this) closeExecutiveSummaryModal();
        });
        executiveSummaryModal.dataset.bound = '1';
    }
}

