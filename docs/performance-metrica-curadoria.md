# Metrica de Performance do Colaborador (Card Progress)

## Objetivo
Definir uma metrica clara, auditavel e implementavel para medir a performance individual de colaboradores com base nos chamados da curadoria.

O resultado principal e um score unico de 0 a 100 por colaborador, em uma janela de tempo (ex.: ultimos 30 dias), com tendencia semanal para o grafico de barras do card Progress.

## Visao geral do calculo
A metrica e calculada em 2 etapas:

1. Calcular o `score_por_chamado` para cada ticket.
2. Agregar os scores do periodo para gerar o `score_colaborador`.

## Formula do score por chamado
Use a combinacao ponderada:

```text
score_por_chamado =
  0.35 * sla_score +
  0.30 * qualidade_score +
  0.20 * csat_score +
  0.15 * eficiencia_score
```

Todos os componentes devem estar na escala `0..100`.

## Componentes do score
### 1) SLA (`sla_score`)
- Se dentro do prazo: `100`
- Se atrasado: penalizacao linear por horas

```text
sla_score = max(0, 100 - k * atraso_horas)
```

Sugestao inicial: `k = 5`.

### 2) Qualidade (`qualidade_score`)
Idealmente vem de uma avaliacao objetiva da analise de curadoria.

Se ja existir `performance_suporte` em escala `0..10`, normalizar assim:

```text
qualidade_score = performance_suporte * 10
```

### 3) Satisfacao (`csat_score`)
Se `satisfacao` estiver em escala `1..5`:

```text
csat_score = satisfacao * 20
```

### 4) Eficiencia (`eficiencia_score`)
Penaliza excesso de interacoes acima de um alvo razoavel.

```text
eficiência_score = max(0, 100 - c * max(total_acoes - alvo_acoes, 0))
```

Sugestoes iniciais:
- `alvo_acoes = 8`
- `c = 4`

## Score agregado do colaborador
A agregacao recomendada e media ponderada por complexidade/criticidade do chamado:

```text
score_colaborador =
  sum(score_por_chamado_i * peso_i) / sum(peso_i)
```

### Pesos por urgencia sugerida
- Critica: `1.30`
- Alta: `1.15`
- Media: `1.00`
- Baixa: `0.90`

Se nao houver urgencia valida, usar peso `1.00`.

## Confiabilidade da metrica
Para evitar conclusoes com pouca amostra, calcular confiabilidade:

```text
confiabilidade = min(1, N / N_min)
```

Onde:
- `N`: quantidade de chamados do colaborador no periodo
- `N_min`: minimo para confianca estatistica (sugestao: `20`)

Exibicao recomendada no card:
- Score final
- Numero de chamados
- Confiabilidade (ex.: 72%)

## Janela temporal
Recomendacao inicial:
- Janela padrao: ultimos 30 dias
- Tendencia no grafico: ultimas 4 ou 8 semanas
- Recalculo: diario

## Como montar o card Progress
### Valor principal
- Exibir `score_colaborador` (ex.: `84.7`)

### Subtexto
- `Performance nos ultimos 30 dias`

### Barras
- Cada barra representa o score medio semanal

### Rodape auxiliar
- `N chamados`
- `SLA medio`
- `CSAT medio`
- `Confiabilidade`

## Campos atuais que podem ser reaproveitados
Com base na estrutura atual de curadoria, estes campos sao candidatos:
- `owner`
- `owner_team`
- `ticket_id`
- `total_acoes`
- `satisfacao`
- `nota_urgencia`
- `urgencia_sugerida`
- `performance_suporte`
- `processado_em` (se usado para recorte temporal)

## Regras de negocio recomendadas
- Nao comparar ranking de colaboradores com `N < 10` chamados.
- Exibir aviso de baixa amostra quando `confiabilidade < 0.6`.
- Tratar valores ausentes com fallback explicito (sem inflar score).
- Versionar a formula (ex.: `v1`) para rastreabilidade historica.

## Exemplo de payload da API de metricas
```json
{
  "owner": "Nome do Colaborador",
  "periodo": {
    "inicio": "2026-04-19",
    "fim": "2026-05-19",
    "dias": 30
  },
  "score": 84.7,
  "confiabilidade": 0.78,
  "chamados": 18,
  "componentes": {
    "sla": 88.0,
    "qualidade": 82.5,
    "csat": 90.0,
    "eficiencia": 76.0
  },
  "tendencia_semanal": [72.0, 79.5, 81.3, 84.7]
}
```

## Plano de implementacao sugerido
1. Criar endpoint dedicado de metricas por owner e periodo.
2. Calcular score por chamado no backend (fonte unica da verdade).
3. Agregar score semanal e consolidado no backend.
4. Atualizar o card Progress para consumir o endpoint.
5. Validar com casos de teste (owner com alta/baixa amostra, dados faltantes, outliers).

## Observacao final
Esta proposta prioriza equilibrio entre simplicidade, explicabilidade e utilidade operacional. Ela pode evoluir para um modelo mais avancado sem quebrar compatibilidade, desde que a versao da formula seja mantida.
