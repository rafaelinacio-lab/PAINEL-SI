
// ── dashboard.js — Tickets, sparklines, SLA cards e sincronização ─────────

async function fetchOpenTickets() {
    const container = document.getElementById('cardsContainer');
    if (!container) return;
    
    try {
        // Buscar tickets ativos
        const activeResponse = await fetch(`${API_BASE}/tickets`, {
            headers: authHeaders()
        });
        
        if (!activeResponse.ok) {
            throw new Error(`Erro na API: ${activeResponse.status}`);
        }
        
        const tickets = await activeResponse.json();
        
        _cachedTickets = tickets;
        renderTickets(tickets, container);

        try {
            updateSummaryCards(tickets);
        } catch (summaryError) {
            console.error('Erro ao atualizar resumo da dashboard:', summaryError);
        }

        try {
            populateDashboardFilters();
        } catch (filtersError) {
            console.error('Erro ao popular filtros da dashboard:', filtersError);
        }

        const hora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        localStorage.setItem('lastSyncTime', hora);
        updateSyncStatus(`⏰ Atualizado em ${hora}`);
        
    } catch (error) {
        console.error('Erro ao buscar chamados:', error);
        container.innerHTML = `
            <div style="grid-column: 1/-1; padding: 40px; text-align: center;">
                <p style="color: #e74c3c; font-size: 16px;">
                    Erro ao carregar chamados. Verifique se o servidor está rodando.
                </p>
                <p style="color: #95a5a6; font-size: 14px; margin-top: 10px;">
                    ${error.message}
                </p>
                <p style="color: #95a5a6; font-size: 12px; margin-top: 10px;">
                    Execute: <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 3px;">npm start</code>
                </p>
            </div>
        `;
    }
}

// Renderiza sparkline em canvas
function drawSparkline(canvasId, data, color) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (!data || data.length === 0) return;
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    
    data.forEach((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * (height - 4) - 2;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.stroke();
}

// Renderiza gráfico donut em SVG
function drawDonut(circleId, percentage, color) {
    const circle = document.getElementById(circleId);
    if (!circle) return;
    
    const circumference = 2 * Math.PI * 30; // raio = 30
    const offset = circumference - (percentage / 100) * circumference;
    
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-dasharray', circumference);
    circle.setAttribute('stroke-dashoffset', offset);
}

// Atualiza os cards de resumo por status e SLA
function updateSummaryCards(tickets) {
    const counts = { New: 0, InAttendance: 0, Stopped: 0, onTime: 0, overdue: 0 };
    const attendantMap = {};
    const statusHistory = { New: [], InAttendance: [], Stopped: [], Total: [] };

    (tickets || []).forEach(t => {
        const baseStatusRaw = getTicketValue(t, 'baseStatus', 'basestatus', '') || getTicketValue(t, 'status', 'status', '');
        const baseStatus = normalizeDashboardBaseStatus(baseStatusRaw);
        if (counts[baseStatus] !== undefined) counts[baseStatus]++;

        // Contar SLA
        const slaSolutionDateIsPaused = getTicketValue(t, 'slaSolutionDateIsPaused', 'slasolutiondateispaused', false);
        const slaSolutionDate = getTicketValue(t, 'slaSolutionDate', 'slasolutiondate', '');
        const slaSolutionTime = getTicketValue(t, 'slaSolutionTime', 'slasolutiontime', '');
        const createdDate = getTicketValue(t, 'createdDate', 'createddate', '');
        const owner = getTicketValue(t, 'ownerName', 'ownername', 'Sem atribuição');

        let ticketIsOverdue = false;

        if (slaSolutionDateIsPaused !== 1 && slaSolutionDateIsPaused !== true && slaSolutionDate) {
            const deadline = new Date(slaSolutionDate);
            const now = new Date();
            if (now < deadline) {
                counts.onTime++;
            } else {
                counts.overdue++;
                ticketIsOverdue = true;
            }
        } else if (slaSolutionDateIsPaused && slaSolutionTime && createdDate) {
            const created = new Date(createdDate);
            const deadline = new Date(created.getTime() + slaSolutionTime * 60000);
            const now = new Date();
            if (now < deadline) {
                counts.onTime++;
            } else {
                counts.overdue++;
                ticketIsOverdue = true;
            }
        }

        if (ticketIsOverdue) {
            // contagem de overdue já feita acima
        }

        // Contar atendentes
        const ownerEmail = getTicketValue(t, 'ownerEmail', 'owneremail', '');
        if (!attendantMap[owner]) attendantMap[owner] = { count: 0, tickets: [], email: ownerEmail };
        attendantMap[owner].count++;
        const urg = getUrgencyFromSLA(getTicketValue(t, 'slaAgreementRule', 'slaagreementrule', ''));
        attendantMap[owner].tickets.push({ id: t.id, urgClass: urg.class });
    });

    const total = counts.New + counts.InAttendance + counts.Stopped;
    document.getElementById('countNew').textContent = counts.New;
    document.getElementById('countInAttendance').textContent = counts.InAttendance;
    document.getElementById('countStopped').textContent = counts.Stopped;
    document.getElementById('countTotal').textContent = total;
    document.getElementById('countOnTime').textContent = counts.onTime;
    document.getElementById('countOverdue').textContent = counts.overdue;

    // Renderizar sparklines (dados aleatórios para demo)
    const sparklineData = [5, 12, 8, 15, 9, 14, 11];
    drawSparkline('sparkNew', sparklineData, '#1d9e75');
    drawSparkline('sparkInAttendance', sparklineData.map(v => v + 2), '#378add');
    drawSparkline('sparkStopped', sparklineData.map(v => v + 5), '#ef9f27');
    drawSparkline('sparkTotal', sparklineData.map(v => v + 8), '#8b5cf6');

    // Renderizar donuts
    const onTimePercentage = total > 0 ? (counts.onTime / total) * 100 : 0;
    const overduePercentage = total > 0 ? (counts.overdue / total) * 100 : 0;

    drawDonut('donutOntime', onTimePercentage, '#10b981');
    drawDonut('donutOverdue', overduePercentage, '#ef4444');

    document.getElementById('pctOnTime').textContent = onTimePercentage.toFixed(1) + '%';
    document.getElementById('pctOverdue').textContent = overduePercentage.toFixed(1) + '%';

    // Gerar insight do card "Fora do Prazo" (desativado temporariamente)
    const insightEl = document.getElementById('overdueInsight');
    if (insightEl) insightEl.textContent = '';

    updateAttendantsList(attendantMap);
}

// Atualiza a lista de atendentes
function updateAttendantsList(attendantMap) {
    const container = document.getElementById('attendantsContainer');
    if (!container) return;

    let html = '';
    Object.entries(attendantMap)
        .sort((a, b) => b[1].count - a[1].count)
        .forEach(([name, data]) => {
            const slugId = 'att-' + name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
            const ticketLinks = data.tickets
                .map(({ id, urgClass }) => `<a class="att-ticket-link ${urgClass}" onclick="handleCardClick(${id});event.stopPropagation()" href="#">#${id}</a>`)
                .join('');
            
            // Usar avatar com foto (email ou nome) ou fallback com iniciais
            const avatarHTML = createAvatarHTML(data.email || null, name);
            
            html += `
                <div class="attendant-item attendant-expandable" onclick="toggleAttendant('${slugId}')">
                    <div class="attendant-header">
                        <div class="attendant-avatar-wrapper">
                            ${avatarHTML}
                        </div>
                        <div class="attendant-info">
                            <div class="attendant-name">${escapeHtml(name)}</div>
                        </div>
                    </div>
                    <span class="attendant-count">${data.count}</span>
                    <div class="attendant-tickets" id="${slugId}">${ticketLinks}</div>
                </div>
            `;
        });

    container.innerHTML = html || '<p style="color: #999;">Nenhum atendente</p>';
}

function toggleAttendant(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('expanded');
}

// Função para renderizar os tickets como cards
function renderTickets(tickets, container) {
    if (!tickets || tickets.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; padding: 40px; text-align: center;">
                <p style="color: #7f8c8d; font-size: 16px;">Nenhum chamado encontrado. Acesse o painel admin para sincronizar.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = tickets.map(ticket => createCardHTML(ticket)).join('');
    loadFirstResponseSla(tickets);
}

function normalizeDashboardBaseStatus(value) {
    const raw = String(value || '').trim();
    const key = raw.toLowerCase();

    if (key === 'new' || key === 'novo') return 'New';
    if (key === 'inattendance' || key === 'inprogress' || key === 'em atendimento') return 'InAttendance';
    if (key === 'stopped' || key.startsWith('aguardando')) return 'Stopped';

    return raw;
}

// Mapas de status para o estilo do card
const BASE_STATUS_LABEL = {
    'New': 'Novo',
    'InAttendance': 'Em Atendimento',
    'Stopped': 'Aguardando'
};

const BASE_STATUS_HEADER_CLASS = {
    'New': 'status-baixa',
    'InAttendance': 'status-media',
    'Stopped': 'status-alta'
};

// Extrai urgência do slaAgreementRule e retorna classe CSS + label
function getUrgencyFromSLA(slaAgreementRule) {
    if (!slaAgreementRule) return { label: 'Sem SLA', class: 'urgency-none' };
    
    const rule = slaAgreementRule.toLowerCase();
    
    if (rule.includes('crítica')) {
        return { label: 'Crítica', class: 'urgency-critica' };
    } else if (rule.includes('alta')) {
        return { label: 'Alta', class: 'urgency-alta' };
    } else if (rule.includes('média')) {
        return { label: 'Média', class: 'urgency-media' };
    } else if (rule.includes('baixa')) {
        return { label: 'Baixa', class: 'urgency-baixa' };
    }
    
    return { label: 'Indefinida', class: 'urgency-none' };
}

// Calcula e retorna o badge HTML do SLA
function buildSlaBadge(ticket) {
    const isPaused = ticket.slaSolutionDateIsPaused === 1 || ticket.slaSolutionDateIsPaused === true;
    let deadline;
    
    // Determinar o prazo a ser comparado
    if (ticket.slaSolutionDate) {
        deadline = new Date(ticket.slaSolutionDate);
    } else if (isPaused && ticket.slaSolutionTime && ticket.createdDate) {
        // Quando pausado sem slaSolutionDate, calcular uma data teórica
        // slaSolutionTime está em MINUTOS
        const created = new Date(ticket.createdDate);
        deadline = new Date(created.getTime() + ticket.slaSolutionTime * 60000);
    } else {
        return ''; // Sem informação de prazo
    }

    const now = new Date();
    const diffMs = deadline - now;
    const absDiff = Math.abs(diffMs);
    const hours = Math.floor(absDiff / 3600000);
    const minutes = Math.floor((absDiff % 3600000) / 60000);
    const timeStr = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;

    // Determinar status
    let statusText, badgeClass;
    if (diffMs > 0) {
        const urgentClass = diffMs < 3600000 ? 'sla-warning' : 'sla-ok';
        statusText = `✅ No prazo: ${timeStr} restantes`;
        badgeClass = urgentClass;
    } else {
        statusText = `❌ Fora do Prazo há: ${timeStr}`;
        badgeClass = 'sla-breached';
    }

    // Adicionar indicador de pausa se aplicável
    if (isPaused) {
        return `<span class="sla-badge sla-paused">⏸️ SLA Pausado - ${statusText}</span>`;
    } else {
        return `<span class="sla-badge ${badgeClass}">${statusText}</span>`;
    }
}

function formatMinutesAsText(totalMinutes) {
    const mins = Number(totalMinutes || 0);
    const hours = Math.floor(mins / 60);
    const rest = mins % 60;
    if (hours <= 0) return `${rest}min`;
    return `${hours}h ${rest}min`;
}

function buildFirstResponsePlaceholder(ticketId, lastActionAuthor, lastActionOrigin, ownerName) {
    const author = lastActionAuthor || 'Não registrado';
    let originLabel = 'Agente';
    let originIcon = '👨\u200d💼';
    
    if (lastActionOrigin === 'Customer') {
        originLabel = 'Cliente';
        originIcon = '👤';
    } else if (lastActionOrigin === 'Attendant') {
        originLabel = 'Agente';
        originIcon = '👨\u200d💼';
    }
    
    return `<span class="action-pill action-pill-${originLabel.toLowerCase()}">
        <span class="sla-icon">${originIcon}</span><span>${originLabel}${author ? ` • ${escapeHtml(author)}` : ''}</span>
    </span>`;


}

function buildOriginBadge(origin) {
    const normalized = String(origin || '').toLowerCase();
    const label = normalized === 'customer'
        ? 'Cliente'
        : normalized === 'attendant'
            ? 'Agente'
            : 'Indefinido';
    return `<span class="origin-badge origin-${normalized || 'unknown'}">${label}</span>`;
}

function buildSlaStatusCard(ticket) {
    const isPaused = ticket.slaSolutionDateIsPaused === 1 || ticket.slaSolutionDateIsPaused === true;
    let deadline;
    
    if (ticket.slaSolutionDate) {
        deadline = new Date(ticket.slaSolutionDate);
    } else if (isPaused && ticket.slaSolutionTime && ticket.createdDate) {
        const created = new Date(ticket.createdDate);
        deadline = new Date(created.getTime() + ticket.slaSolutionTime * 60000);
    } else {
        return '';
    }

    const now = new Date();
    const diffMs = deadline - now;
    const absDiff = Math.abs(diffMs);
    const hours = Math.floor(absDiff / 3600000);
    const minutes = Math.floor((absDiff % 3600000) / 60000);
    const timeStr = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;

    let statusHTML = '';
    if (diffMs > 0) {
        statusHTML = `<div class="sla-status-card sla-status-ok"><span class="sla-status-icon">✓</span>No prazo: ${timeStr} restantes</div>`;
    } else {
        const estouro = absDiff / 60000;
        const hEst = Math.floor(estouro / 60);
        const mEst = Math.floor(estouro % 60);
        const estStr = hEst > 0 ? `${hEst}h ${mEst}min` : `${mEst}min`;
        statusHTML = `<div class="sla-status-card sla-status-overdue"><span class="sla-status-icon">✕</span>Atrasado: ${estStr}</div>`;
    }
    
    return statusHTML;
}

function buildSlaMetricsSection(ticketId) {
    return `<div style="display: flex; flex-direction: column; gap: 8px;">
        <span id="first-response-sla-${ticketId}" class="sla-metric-pill sla-metric-loading"><span class="sla-icon">⋯</span><span>1ª resposta: calculando...</span></span>
        <span id="solution-sla-${ticketId}" class="sla-metric-pill sla-metric-loading"><span class="sla-icon">⋯</span><span>Resolução: calculando...</span></span>
    </div>`;
}

async function loadFirstResponseSla(tickets) {
    const tasks = (tickets || []).map(async (ticket) => {
        const firstRespId = `first-response-sla-${ticket.id}`;
        const solutionId = `solution-sla-${ticket.id}`;
        const firstRespEl = document.getElementById(firstRespId);
        if (!firstRespEl) return;

        try {
            const response = await fetch(`${API_BASE}/tickets/${ticket.id}/sla`, {
                headers: authHeaders()
            });
            if (!response.ok) throw new Error(`status ${response.status}`);

            const sla = await response.json();
            const stillMountedFirst = document.getElementById(firstRespId);
            const stillMountedSolution = document.getElementById(solutionId);
            if (!stillMountedFirst && !stillMountedSolution) return;

            // ===== PRIMEIRA RESPOSTA =====
            const previsto = formatMinutesAsText(sla.slaPrevistoMinutos);
            if (!sla.primeiroContatoEncontrado) {
                if (stillMountedFirst) {
                    stillMountedFirst.className = 'sla-metric-pill sla-metric-missing';
                    stillMountedFirst.innerHTML = `<span class="sla-icon">⏳</span><span>1ª resposta: Sem contato (${previsto})</span>`;
                }
            } else {
                const consumidos = formatMinutesAsText(sla.minutosUteisConsumidos);
                if (stillMountedFirst) {
                    if (sla.dentroDoSLA) {
                        stillMountedFirst.className = 'sla-metric-pill sla-metric-ok';
                        stillMountedFirst.innerHTML = `<span class="sla-icon">✓</span><span>1ª resposta: ${consumidos}</span>`;
                    } else {
                        const estouro = formatMinutesAsText(sla.minutosEstouro);
                        stillMountedFirst.className = 'sla-metric-pill sla-metric-breach';
                        stillMountedFirst.innerHTML = `<span class="sla-icon">⚠</span><span>1ª resposta: +${estouro}</span>`;
                    }
                }
            }

            // ===== RESOLUÇÃO =====
            if (stillMountedSolution) {
                if (ticket.slaSolutionDate) {
                    const deadline = new Date(ticket.slaSolutionDate);
                    const now = new Date();
                    const diffMs = deadline - now;
                    const absDiff = Math.abs(diffMs);
                    const hours = Math.floor(absDiff / 3600000);
                    const minutes = Math.floor((absDiff % 3600000) / 60000);
                    const timeStr = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
                    
                    if (diffMs > 0) {
                        stillMountedSolution.className = 'sla-metric-pill sla-metric-ok';
                        stillMountedSolution.innerHTML = `<span class="sla-icon">✓</span><span>Resolução: ${timeStr}</span>`;
                    } else {
                        const estouro = absDiff / 60000;
                        const hEst = Math.floor(estouro / 60);
                        const mEst = Math.floor(estouro % 60);
                        const estStr = hEst > 0 ? `${hEst}h ${mEst}min` : `${mEst}min`;
                        stillMountedSolution.className = 'sla-metric-pill sla-metric-breach';
                        stillMountedSolution.innerHTML = `<span class="sla-icon">+</span><span>Resolução: ${estStr}</span>`;
                    }
                } else {
                    const justification = ticket.justification || ticket.justificacao || '';
                    if (justification) {
                        const isValidacaoCliente = justification.toLowerCase().includes('valida') && justification.toLowerCase().includes('cliente');
                        stillMountedSolution.className = isValidacaoCliente ? 'sla-metric-pill sla-metric-validation' : 'sla-metric-pill sla-metric-missing';
                        stillMountedSolution.innerHTML = `<span class="sla-icon">—</span><span>Resolução: ${escapeHtml(justification)}</span>`;
                    } else {
                        stillMountedSolution.className = 'sla-metric-pill sla-metric-missing';
                        stillMountedSolution.innerHTML = `<span class="sla-icon">—</span><span>Resolução: Sem prazo</span>`;
                    }
                }
            }
        } catch (error) {
            const stillMountedFirst = document.getElementById(firstRespId);
            const stillMountedSolution = document.getElementById(solutionId);
            if (stillMountedFirst) {
                stillMountedFirst.className = 'sla-metric-pill sla-metric-error';
                stillMountedFirst.innerHTML = `<span class="sla-icon">?</span><span>1ª resposta: Erro</span>`;
            }
            if (stillMountedSolution) {
                stillMountedSolution.className = 'sla-metric-pill sla-metric-error';
                stillMountedSolution.innerHTML = `<span class="sla-icon">?</span><span>Resolução: Erro</span>`;
            }
        }
    });

    await Promise.all(tasks);
}

// Função para criar o HTML de um card
function createCardHTML(ticket) {
    const urgency = getUrgencyFromSLA(getTicketValue(ticket, 'slaAgreementRule', 'slaagreementrule', ''));
    const ownerName = getTicketValue(ticket, 'ownerName', 'ownername', 'Não atribuído');
    const ownerEmail = getTicketValue(ticket, 'ownerEmail', 'owneremail', '');
    const clientName = getTicketValue(ticket, 'clientName', 'clientname', 'Não informado');
    const initials = ownerName
        .split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    
    // Cria avatar com foto ou fallback
    const avatarHTML = ownerEmail ? createAvatarHTML(ownerEmail, ownerName) : `
        <div class="card-agent-avatar-placeholder">
            ${initials}
        </div>
    `;

    return `
        <div class="card" onclick="handleCardClick(${ticket.id})">
            <div class="card-header-new">
                <span class="card-id">#${ticket.id}</span>
                <span class="urgency-bubble ${urgency.class}">${urgency.label}</span>
            </div>
            <div class="card-body-new">
                <h3 class="card-title-new" title="${escapeHtml(ticket.subject)}">${escapeHtml(ticket.subject)}</h3>
                
                <div class="card-agent">
                    ${avatarHTML}
                    <span class="card-agent-name">Agente: ${escapeHtml(ownerName)}</span>
                </div>
                
                <div class="card-info-row">
                    <div class="card-info-col">
                        <span class="card-info-label">ÚLT. AÇÃO:</span>
                        <div style="margin-top: 6px;">
                            ${buildFirstResponsePlaceholder(ticket.id, getTicketValue(ticket, 'lastActionCreatedByBusinessName', 'lastactioncreatedbybusinessname', ''), getTicketValue(ticket, 'lastActionOrigin', 'lastactionorigin', ''), ownerName)}
                        </div>
                    </div>
                    <div class="card-info-col">
                        <span class="card-info-label">CLIENTE:</span>
                        <span class="card-info-value">${escapeHtml(clientName)}</span>
                    </div>
                </div>
                
                <div style="padding: 12px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin-top: 12px;">
                    <span class="card-info-label" style="display: block; margin-bottom: 8px;">PRAZOS SLA:</span>
                    ${buildSlaMetricsSection(ticket.id)}
                </div>
                
                ${buildSlaStatusCard({
                    ...ticket,
                    createdDate: getTicketValue(ticket, 'createdDate', 'createddate', ''),
                    slaSolutionDateIsPaused: getTicketValue(ticket, 'slaSolutionDateIsPaused', 'slasolutiondateispaused', false),
                    slaSolutionTime: getTicketValue(ticket, 'slaSolutionTime', 'slasolutiontime', ''),
                    slaSolutionDate: getTicketValue(ticket, 'slaSolutionDate', 'slasolutiondate', '')
                })}
                
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 10px; color: #94a3b8; display: flex; justify-content: flex-end;">
                    Atualizado em ${formatDate(new Date())}
                </div>
            </div>
        </div>
    `;
}

// Utilitários
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function handleCardClick(ticketId) {
    console.log('✓ Card clicado - Ticket ID:', ticketId, 'Tipo:', typeof ticketId);
    
    // Normaliza o ID para número
    const normalizedId = Number(ticketId);
    
    // Recupera o ticket do cache - compara como número
    let ticket = null;
    if (_cachedTickets && _cachedTickets.length > 0) {
        ticket = _cachedTickets.find(t => Number(t.id) === normalizedId);
    }
    
    if (!ticket) {
        console.warn(`⚠ Ticket ${ticketId} (normalizado: ${normalizedId}) não encontrado no cache. Cache total: ${_cachedTickets ? _cachedTickets.length : 0}`);
        console.log('IDs disponíveis no cache:', _cachedTickets?.map(t => ({ id: t.id, tipo: typeof t.id })).slice(0, 5));
        
        // Fallback: abre no Movidesk direto
        console.log('🔗 Abrindo no Movidesk (sem cache completo)');
        window.open(`https://atendimento.viasoft.com.br/Ticket/Edit/${ticketId}`, '_blank');
        return;
    }
    
    console.log('✓ Ticket encontrado no cache:', ticket.id);
    
    // Faz a análise
    const analise = analyzeTicket(ticket);
    console.log('✓ Análise gerada');
    
    // Popula o modal
    const modal = document.getElementById('executiveSummaryModal');
    const title = document.getElementById('executiveSummaryTitle');
    const body = document.getElementById('executiveSummaryBody');
    const openBtn = document.getElementById('executiveSummaryOpenTicket');
    
    if (!modal || !title || !body) {
        console.error('❌ Modal ou elementos não encontrados');
        return;
    }
    
    title.innerHTML = `Análise do Ticket #${ticketId}`;
    body.innerHTML = formatarResumoExecutivoCompacto(analise);
    modal.style.display = 'flex';
    console.log('✓ Modal exibido');
    
    // Botão para abrir no Movidesk
    if (openBtn) {
        openBtn.onclick = () => {
            window.open(`https://atendimento.viasoft.com.br/Ticket/Edit/${ticketId}`, '_blank');
        };
    }
}

function formatCuradoriaBadge(value, type = 'neutral') {
    const safe = escapeHtml(value || '—');
    return `<span class="curadoria-badge curadoria-badge-${type}">${safe}</span>`;
}

function getCuradoriaUrgencyType(value) {
    const normalized = String(value || '').toLowerCase();
    if (normalized.includes('crit')) return 'critica';
    if (normalized.includes('alta')) return 'alta';
    if (normalized.includes('med')) return 'media';
    if (normalized.includes('baix')) return 'baixa';
    return 'neutral';
}

function safeCuradoriaText(value, fallback = '—') {
    if (value === undefined || value === null) return fallback;
    const str = String(value).trim();
    return str ? str : fallback;
}

function parseJsonLoose(value) {
    if (value === undefined || value === null) return value;
    if (typeof value === 'object') return value;
    const text = String(value).trim();
    if (!text) return '';
    if (!(text.startsWith('{') || text.startsWith('['))) return value;
    try {
        return JSON.parse(text);
    } catch {
        return value;
    }
}

function formatCuradoriaComplexValue(value) {
    const parsed = parseJsonLoose(value);
    if (parsed === undefined || parsed === null || parsed === '') return '—';
    if (Array.isArray(parsed)) {
        if (!parsed.length) return '—';
        const items = parsed.map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
                if (item.nome) return item.nome;
                if (item.indicacao) return item.indicacao;
                return Object.values(item).filter(Boolean).join(' - ');
            }
            return String(item);
        }).filter(Boolean);
        return items.length ? items.join(' | ') : '—';
    }
    if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed)
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(' | ');
    }
    return String(parsed);
}

function findCuradoriaRowByTicketId(ticketId) {
    const target = String(ticketId || '').trim();
    if (!target) return null;
    return (_curadoriaRows || []).find((row) => String(row.ticket_id) === target) || null;
}

function parseCuradoriaActionsText(txt) {
    if (!txt || typeof txt !== 'string') return [];

    const blocks = txt.split(/--- Ação \d+ \(ID: \d+\) ---/).slice(1);
    const headers = [...txt.matchAll(/--- Ação (\d+) \(ID: (\d+)\) ---/g)];

    const readField = (block, label) => {
        const m = block.match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n(?:Tipo|Origem|Status|Data|Autor|Descrição|Descricao):|$)`));
        return m ? m[1].trim() : '';
    };

    return blocks.map((b, i) => ({
        ordem: headers[i] ? Number(headers[i][1]) : i + 1,
        id: headers[i] ? Number(headers[i][2]) : i + 1,
        tipo: readField(b, 'Tipo'),
        origem: readField(b, 'Origem'),
        status: readField(b, 'Status'),
        data: readField(b, 'Data'),
        autor: readField(b, 'Autor'),
        descricao: readField(b, 'Descrição') || readField(b, 'Descricao')
    }));
}

function parseCuradoriaJsonArray(value) {
    const parsed = parseJsonLoose(value);
    return Array.isArray(parsed) ? parsed : [];
}

function classifyCuradoriaActor(actor, author) {
    const actorNorm = String(actor || '').toLowerCase();
    if (actorNorm.includes('cliente')) return 'cliente';
    if (actorNorm.includes('suporte') || actorNorm.includes('agente')) return 'suporte';
    if (actorNorm.includes('sistema')) return 'sistema';

    const authorNorm = String(author || '').toLowerCase();
    if (!authorNorm || authorNorm.includes('desconhecido')) return 'sistema';
    if (authorNorm.includes('@viasoft.com.br')) return 'suporte';
    return 'cliente';
}

function escapeHtmlWithBreaks(value) {
    return escapeHtml(value || '—').replace(/\n/g, '<br>');
}

function parseCuradoriaActionDate(value) {
    if (!value) return null;
    const normalized = String(value).trim();
    const direct = new Date(normalized);
    if (!Number.isNaN(direct.getTime())) return direct;

    const m = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    const year = Number(m[3]);
    const hh = Number(m[4] || 0);
    const mm = Number(m[5] || 0);
    const ss = Number(m[6] || 0);
    const dt = new Date(year, month, day, hh, mm, ss);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

function toCuradoriaNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function parseCuradoriaObject(value, fallback = null) {
    const parsed = parseJsonLoose(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return fallback;
}

function parseCuradoriaObjectArray(value, fallback = []) {
    const parsed = parseJsonLoose(value);
    return Array.isArray(parsed) ? parsed.filter((x) => x && typeof x === 'object') : fallback;
}

function buildCuradoriaMergedActions(row) {
    const actionsRaw = row ? parseCuradoriaActionsText(row.actions) : [];
    const tabelaAcoes = row ? parseCuradoriaJsonArray(row.tabela_acoes) : [];

    return actionsRaw.map((a) => {
        const resumoAcao = tabelaAcoes.find((x) => Number(x.id) === Number(a.id));
        const ator = resumoAcao?.ator || '';
        const origem = resumoAcao?.origem || a.origem || '—';
        const criadoPor = resumoAcao?.criado_por || a.autor || '—';
        const role = classifyCuradoriaActor(ator, a.autor);
        return {
            ...a,
            ator: ator || (role === 'suporte' ? 'Suporte' : role === 'cliente' ? 'Cliente' : 'Sistema'),
            origem,
            criadoPor,
            role,
            _parsedDate: parseCuradoriaActionDate(a.data)
        };
    });
}


// ── Sync & Dashboard utilities ──────────────────────────────────────────
function getOrCreatePill() {
    // Remove completamente qualquer duplicata
    const existing = document.getElementById('syncStatusBubble');
    if (existing) {
        return existing;
    }
    
    // Remove qualquer elemento antigo que possa estar órfão
    document.querySelectorAll('div[style*="bottom:20px"][style*="right:20px"]').forEach(el => {
        if (el.id === 'syncStatusBubble' || !el.id) {
            el.remove();
        }
    });
    
    // Criar novo elemento
    const el = document.createElement('div');
    el.id = 'syncStatusBubble';
    el.style.cssText = [
        'position:fixed',
        'bottom:20px',
        'right:20px',
        'background:rgba(30,30,40,0.85)',
        'backdrop-filter:blur(6px)',
        'color:#fff',
        'padding:8px 16px',
        'border-radius:999px',
        'font-size:12px',
        'font-weight:500',
        'z-index:9999',
        'box-shadow:0 2px 10px rgba(0,0,0,0.25)',
        'display:flex',
        'align-items:center',
        'gap:8px',
        'transition:background 0.3s'
    ].join(';');
    document.body.appendChild(el);
    return el;
}

function updateSyncStatus(message, isError) {
    const el = getOrCreatePill();
    el.style.background = isError
        ? 'rgba(180,30,30,0.85)'
        : 'rgba(30,30,40,0.85)';
    el.textContent = message;
}

function showLastSync() {
    const saved = localStorage.getItem('lastSyncTime');
    const el = getOrCreatePill();
    // Só atualiza se não houver outra mensagem recente
    if (!el.textContent.includes('Sincronizando') && !el.textContent.includes('Falha')) {
        if (saved) {
            el.textContent = `⏰ Atualizado em ${saved}`;
        } else {
            el.textContent = '⏰ Nunca sincronizado';
        }
    }
}

function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function setSyncButtonState(isLoading) {
    const btn = document.getElementById('syncBtn');
    if (!btn) return;

    btn.disabled = isLoading;
    btn.classList.toggle('is-loading', isLoading);
    btn.setAttribute('aria-busy', isLoading ? 'true' : 'false');
}

function formatSyncProgress(status) {
    const fase = status?.phase || 'processando';
    const lotes = Number(status?.processedBatches || 0);
    const coletados = Number(status?.totalFetched || 0);
    const salvos = Number(status?.totalSaved || 0);
    return `🔄 ${fase} • lotes: ${lotes} • coletados: ${coletados} • salvos: ${salvos}`;
}

async function pollSyncUntilFinish(syncId, silent = false) {
    let lastProcessedBatch = -1;

    while (true) {
        const statusRes = await fetch(`${API_BASE}/tickets/sync/status?syncId=${encodeURIComponent(syncId)}`, {
            headers: authHeaders()
        });

        if (!statusRes.ok) {
            throw new Error(`status ${statusRes.status}`);
        }

        const status = await statusRes.json();
        const batches = Number(status.processedBatches || 0);

        if (batches > lastProcessedBatch) {
            lastProcessedBatch = batches;
            if (batches > 0) {
                await fetchOpenTickets();
            }
        }

        if (!silent) {
            updateSyncStatus(formatSyncProgress(status), status.status === 'failed');
        }

        if (status.status === 'completed') {
            await fetchOpenTickets();
            if (!silent) updateSyncStatus('✅ Sincronização concluída');
            return status;
        }

        if (status.status === 'failed') {
            await fetchOpenTickets();
            throw new Error(status.lastError || 'Falha na sincronização');
        }

        await waitMs(1500);
    }
}

// Sincroniza chamados via API e atualiza o display
async function syncAndRefresh(silent = false) {
    if (!silent) {
        setSyncButtonState(true);
        updateSyncStatus('🔄 Sincronizando...');
    }
    try {
        const res = await fetch(`${API_BASE}/tickets/sync?async=1`, {
            method: 'POST',
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `status ${res.status}`);
        if (!data.syncId) throw new Error('Sincronização iniciada sem identificador de progresso');

        await pollSyncUntilFinish(data.syncId, silent);
    } catch (err) {
        console.error('Erro no sync:', err);
        if (!silent) updateSyncStatus('❌ Falha na sincronização', true);
        await fetchOpenTickets();
    } finally {
        if (!silent) setSyncButtonState(false);
    }
}

// Toggle para seção de chamados
function toggleCardsSection() {
    const cardsSection = document.getElementById('cardsSection');
    const toggleBtn = document.getElementById('toggleBtn');
    if (cardsSection) {
        cardsSection.classList.toggle('collapsed');
        if (toggleBtn) {
            toggleBtn.textContent = cardsSection.classList.contains('collapsed') ? '▶ Chamados em Aberto' : '▼ Chamados em Aberto';
        }
    }
}
