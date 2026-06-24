/**
 * ANALISADOR DE TICKETS - Análise profunda de chamados
 * Segue as regras definidas no prompt de análise crítica
 */

// Normalização de texto
function normalize(text) {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/\s+/g, '_')
        .replace(/[^\w_]/g, '');
}

// Detectar urgência crítica por gatilhos automáticos
function detectUrgenciaGatilho(subject, description, tags = []) {
    const termosCritica = [
        'falha catastrófica',
        'falha catastrofica',
        'indisponível',
        'indisponivel',
        'fora do ar',
        'sistema parado',
        'não abre',
        'nao abre',
        'não funciona',
        'nao funciona'
    ];

    const textoCompleto = `${subject} ${description}`.toLowerCase();
    
    // Verifica gatilhos críticos
    for (const termo of termosCritica) {
        if (textoCompleto.includes(termo)) {
            return 'critica';
        }
    }
    
    // Verifica tag de urgência
    if (tags && tags.some(tag => tag.toLowerCase().includes('urgencia_suporte'))) {
        return 'alta';
    }
    
    return null;
}

// Modelos críticos
const MODULOS_CRITICOS = [
    'pedido de venda',
    'pedido de compra',
    'emissão de nota fiscal',
    'nf-e',
    'pagamento',
    'recebimento',
    'fechamento de caixa',
    'acesso ao sistema',
    'login'
];

function isModuloCritico(modulo) {
    if (!modulo) return false;
    const moduloLower = modulo.toLowerCase();
    return MODULOS_CRITICOS.some(m => moduloLower.includes(m));
}

// Classificar urgência
function classificarUrgencia(ticket, gatilho = null) {
    // Primeiro: verifica gatilhos automáticos
    if (gatilho) {
        return gatilho;
    }
    
    // Segundo: verifica módulo crítico
    const modulo = ticket.ModuloXRotina || '';
    if (isModuloCritico(modulo)) {
        return 'critica';
    }
    
    // Terceiro: analisa causa e fato
    const causa = (ticket.causa || '').toLowerCase();
    const fato = (ticket.fato || '').toLowerCase();
    
    if (causa.includes('falha') || fato.includes('bloqueado') || fato.includes('indisponível')) {
        return 'alta';
    }
    
    if (causa.includes('duvida') || causa.includes('informação')) {
        return 'media';
    }
    
    return 'media';
}

// Classificar perfil do cliente baseado no comportamento
function classificarPerfilCliente(acoes) {
    if (!acoes || acoes.length === 0) {
        return 'neutro';
    }
    
    let sinaisAnsioso = 0;
    let sinaisDetalhista = 0;
    let sinaisLeigo = 0;
    let sinaisAgressivo = 0;
    let sinaisModerado = 0;
    
    for (const acao of acoes) {
        const descLower = (acao.description || '').toLowerCase();
        
        // Sinais de ansiedade
        if (descLower.includes('resolveram') || descLower.includes('novidade') || 
            descLower.includes('urgente') || descLower.includes('já')) {
            sinaisAnsioso += 2;
        }
        
        // Sinais de detalhismo
        if (descLower.includes('log') || descLower.includes('print') || 
            descLower.includes('versão') || descLower.includes('passo') ||
            descLower.includes('reproduz')) {
            sinaisDetalhista += 2;
        }
        
        // Sinais de leigo
        if (descLower.includes('não entendo') || descLower.includes('como assim') ||
            descLower.includes('por quê') || descLower.includes('porquê')) {
            sinaisLeigo += 2;
        }
        
        // Sinais de agressividade
        if (descLower.includes('absurdo') || descLower.includes('inadmissível') ||
            descLower.includes('péssimo') || descLower.includes('cancelamento')) {
            sinaisAgressivo += 2;
        }
        
        // Sinais de moderação
        if (descLower.includes('obrigado') || descLower.includes('por favor') ||
            descLower.includes('gentilmente')) {
            sinaisModerado += 1;
        }
    }
    
    // Determina o perfil dominante
    const perfis = {
        ansioso: sinaisAnsioso,
        detalhista: sinaisDetalhista,
        leigo: sinaisLeigo,
        agressivo: sinaisAgressivo,
        moderado: sinaisModerado
    };
    
    let perfilMax = 'neutro';
    let valorMax = 0;
    
    for (const [perfil, valor] of Object.entries(perfis)) {
        if (valor > valorMax) {
            valorMax = valor;
            perfilMax = perfil;
        }
    }
    
    return perfilMax;
}

// Extrair palavras-chave do fato
function extrairPalavrasChave(fato) {
    if (!fato) return [];
    
    const palavrasImportantes = [
        'bloqueio', 'travamento', 'lentidao', 'lentidão',
        'timeout', 'erro', 'falha', 'emissao', 'emissão',
        'pedido', 'nota_fiscal', 'pagamento', 'login',
        'campo_bloqueado', 'valor_incorreto', 'nao_salva', 'tela_branca'
    ];
    
    const palavras = [];
    for (const palavra of palavrasImportantes) {
        if (fato.toLowerCase().includes(palavra)) {
            palavras.push(normalize(palavra));
        }
    }
    
    // Se não encontrou palavras, extrai as 3 primeiras palavras importantes
    if (palavras.length === 0) {
        const tokens = fato.split(/\s+/).slice(0, 5);
        return tokens.map(t => normalize(t)).filter(t => t.length > 3);
    }
    
    return palavras.slice(0, 5);
}

/**
 * Função principal de análise de ticket
 */
function analyzeTicket(ticket) {
    if (!ticket) {
        return { erro: 'Ticket não encontrado' };
    }
    
    // PASSO 1: CAUSA
    const causa = ticket.causa || 'Não informada';
    const causaNormalizada = normalize(causa);
    
    // PASSO 2: MÓDULO/ROTINA
    const moduloRotina = ticket.ModuloXRotina || 'Não informado';
    const moduloRotinaNormalizado = normalize(moduloRotina);
    
    // PASSO 3: FATO
    const fato = ticket.fato || 'Não informado';
    const palavrasChave = extrairPalavrasChave(fato);
    const categoriaFato = palavrasChave[0] || normalize(fato.split(/\s+/)[0]);
    
    // Compilado
    const compilado = `${causa} no módulo ${moduloRotina} evidenciado por: ${fato}`;
    
    // URGÊNCIA
    const gatilho = detectUrgenciaGatilho(
        ticket.subject || '',
        ticket.description || '',
        ticket.tags || []
    );
    const urgencia = classificarUrgencia(ticket, gatilho);
    const notaUrgencia = {
        'critica': 4,
        'alta': 3,
        'media': 2,
        'baixa': 1
    }[urgencia] || 2;
    
    // PERFIL DO CLIENTE
    const acoes = ticket.actions || [];
    const perfilCliente = classificarPerfilCliente(acoes);
    
    // Construir análise completa
    return {
        tabela_acoes: acoes.map((acao, idx) => ({
            id: idx + 1,
            origem: ['Abertura', 'Cliente', 'Suporte', 'Sistema', 'Sistema'][acao.origin || 0] || 'Desconhecida',
            criado_por: acao.createdBy?.name || acao.createdBy?.businessName || 'Sistema',
            ator: (acao.origin === 1 || acao.origin === 0) ? 'Cliente' : 'Suporte'
        })),
        total_acoes: acoes.length,
        total_cliente: acoes.filter(a => a.origin === 1 || a.origin === 0).length,
        total_agente: acoes.filter(a => a.origin === 2).length,
        perfil_cliente: perfilCliente,
        perfil_cliente_descricao: `Cliente apresenta padrão ${perfilCliente} baseado nas interações com o suporte.`,
        urgencia: urgencia,
        nota_urgencia: notaUrgencia,
        nota_urgencia_descricao: ['Baixa', 'Média', 'Alta', 'Crítica'][notaUrgencia - 1],
        justificativa_urgencia: gatilho ? 
            `Gatilho automático identificado: ${urgencia.toUpperCase()}.` :
            `Classificação baseada em módulo, causa e impacto operacional.`,
        diagnostico: {
            causa: causa,
            causa_normalizada: causaNormalizada,
            modulo_rotina: moduloRotina,
            modulo_rotina_normalizado: moduloRotinaNormalizado,
            fato: fato,
            fato_palavras_chave: palavrasChave,
            fato_categoria_principal: categoriaFato,
            compilado_causa_modulo_fato: compilado,
            par_agrupamento: `${causaNormalizada}::${moduloRotinaNormalizado}::${categoriaFato}`
        },
        impacto_real: `Impacto no módulo ${moduloRotina} afetando a operação relacionada a ${causa.toLowerCase()}.`,
        sentimento: acoes.some(a => (a.description || '').includes('absurdo')) ? 'negativo' : 'neutro',
        satisfacao: 5
    };
}

/**
 * Formatar análise para exibição em HTML
 */
function formatarResumoExecutivo(analise) {
    if (analise.erro) {
        return `<div class="alerta-erro">${analise.erro}</div>`;
    }
    
    const html = `
        <div class="resumo-executivo">
            <div class="resumo-header">
                <h3>Análise do Ticket</h3>
                <span class="badge-urgencia urgencia-${analise.urgencia}">${analise.nota_urgencia_descricao}</span>
            </div>
            
            <div class="resumo-secao">
                <h4>📋 Diagnóstico</h4>
                <div class="diagnostico-grid">
                    <div class="info-item">
                        <label>Causa</label>
                        <span>${analise.diagnostico.causa}</span>
                    </div>
                    <div class="info-item">
                        <label>Módulo</label>
                        <span>${analise.diagnostico.modulo_rotina}</span>
                    </div>
                    <div class="info-item">
                        <label>Fato</label>
                        <span>${analise.diagnostico.fato}</span>
                    </div>
                </div>
            </div>
            
            <div class="resumo-secao">
                <h4>👤 Comportamento do Cliente</h4>
                <div class="cliente-info">
                    <p><strong>Perfil:</strong> ${analise.perfil_cliente.charAt(0).toUpperCase() + analise.perfil_cliente.slice(1)}</p>
                    <p><strong>Descrição:</strong> ${analise.perfil_cliente_descricao}</p>
                    <p><strong>Satisfação:</strong> ${analise.satisfacao}/10 | <strong>Sentimento:</strong> ${analise.sentimento.charAt(0).toUpperCase() + analise.sentimento.slice(1)}</p>
                </div>
            </div>
            
            <div class="resumo-secao">
                <h4>⚠️ Urgência</h4>
                <div class="urgencia-info">
                    <p><strong>Nível:</strong> ${analise.nota_urgencia_descricao}</p>
                    <p><strong>Justificativa:</strong> ${analise.justificativa_urgencia}</p>
                    <p><strong>Impacto Real:</strong> ${analise.impacto_real}</p>
                </div>
            </div>
            
            <div class="resumo-secao">
                <h4>📊 Resumo da Conversa</h4>
                <div class="conversa-stats">
                    <div class="stat-item">
                        <span class="stat-label">Total de Ações</span>
                        <span class="stat-valor">${analise.total_acoes}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Cliente</span>
                        <span class="stat-valor">${analise.total_cliente}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Suporte</span>
                        <span class="stat-valor">${analise.total_agente}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    return html;
}

function formatarResumoExecutivoCompacto(analise) {
    if (analise.erro) {
        return `<div class="alerta-erro">${analise.erro}</div>`;
    }

    const escape = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    };

    const urgMap = {
        critica: ['#FEE2E2', '#B91C1C'],
        alta: ['#FEF3C7', '#B45309'],
        media: ['#DCFCE7', '#15803D'],
        baixa: ['#D1FAE5', '#065F46']
    };
    const sentMap = {
        positivo: ['#DCFCE7', '#16A34A'],
        neutro: ['#F0F9FF', '#0284C7'],
        negativo: ['#FEE2E2', '#DC2626']
    };

    const [urgBg, urgColor] = urgMap[analise.urgencia] || urgMap.media;
    const [sentBg, sentColor] = sentMap[analise.sentimento] || sentMap.neutro;
    const urgenciaLabel = escape((analise.nota_urgencia_descricao || analise.urgencia || '').toUpperCase());
    const sentimentoLabel = escape((analise.sentimento || '').toUpperCase());
    const notaLabel = `${escape(analise.satisfacao || 0)}/5`;
    const resumo = escape(analise.impacto_real || analise.conclusao || analise.justificativa_urgencia || 'Nao informado');
    const tempoResposta = escape(analise.dinamica_conversa?.tempo_resposta || analise.tempo_resposta || 'Nao informado');

    return `
        <div class="resumo-executivo resumo-executivo-compacto">
            <div class="resumo-header">
                <h3>Resumo Executivo</h3>
                <div class="resumo-badges">
                    <div class="resumo-badge" style="background:${urgBg};color:${urgColor}">
                        <span class="resumo-badge-label">Urgência</span>
                        <span class="resumo-badge-value">${urgenciaLabel}</span>
                    </div>
                    <div class="resumo-badge" style="background:${sentBg};color:${sentColor}">
                        <span class="resumo-badge-label">Sentimento</span>
                        <span class="resumo-badge-value">${sentimentoLabel}</span>
                    </div>
                    <div class="resumo-badge resumo-badge-note">
                        <span class="resumo-badge-label">Nota</span>
                        <span class="resumo-badge-value">${notaLabel}</span>
                    </div>
                </div>
            </div>

            <div class="resumo-secao resumo-secao-compacta">
                <h4>Resumo Executivo</h4>
                <div class="resumo-highlight">${resumo}</div>
            </div>

            <div class="metrics-footer">
                <div class="metric-item">
                    <div class="metric-val">${escape(analise.total_acoes || 0)}</div>
                    <div class="metric-lbl">Total Ações</div>
                </div>
                <div class="metric-item">
                    <div class="metric-val">${escape(analise.total_cliente || 0)}</div>
                    <div class="metric-lbl">Cliente</div>
                </div>
                <div class="metric-item">
                    <div class="metric-val">${escape(analise.total_agente || 0)}</div>
                    <div class="metric-lbl">Agente</div>
                </div>
                <div class="metric-item metric-item-text">
                    <div class="metric-text">${tempoResposta}</div>
                    <div class="metric-text-lbl">Tempo Resposta</div>
                </div>
            </div>
        </div>
    `;
}
