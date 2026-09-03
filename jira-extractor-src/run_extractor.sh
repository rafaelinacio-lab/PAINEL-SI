#!/usr/bin/env bash
# Roda o jira_extractor.py usando o venv já criado em Jira/venv, logando
# cada execução em run_extractor.log (mantém só os N registros mais recentes
# pra não crescer pra sempre). Pensado pra ser chamado pelo cron do usuário
# que já tem o venv + Jira/.env configurados (rafael.silva).
#
# Duas proteções a mais em relação à versão original:
#
# 1. Auto-restauração: jira_extractor.py e jira_credentials.py já sumiram
#    do disco uma vez (causa não confirmada), derrubando o cron por 17h sem
#    ninguém perceber. Se qualquer um faltar, restaura da cópia versionada
#    em jira-extractor-src/ (sibling de Jira/) antes de tentar rodar.
#
# 2. Log honesto: a versão original tinha `{ cmds; } || fallback` com
#    `set -e` — bash desliga o efeito do errexit dentro de um bloco cujo
#    status alimenta um `||`, então mesmo o Python falhando o script
#    continuava até o `echo "Concluído com sucesso"` e o `||` nunca disparava.
#    O log mentia "sucesso" em toda falha (foi exatamente o que escondeu o
#    problema de 2026-09-02 19h até 2026-09-03 12h). Agora o status do
#    Python é checado explicitamente.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

LOG="$DIR/run_extractor.log"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"
BACKUP_DIR="$DIR/../jira-extractor-src"

{
  echo "════════════════════════════════════════════════"
  echo "[$STAMP] Iniciando jira_extractor.py"

  for f in jira_extractor.py jira_credentials.py; do
    if [ ! -f "$DIR/$f" ]; then
      if [ -f "$BACKUP_DIR/$f" ]; then
        echo "[AVISO] $f não encontrado em $DIR — restaurando de $BACKUP_DIR/$f"
        cp "$BACKUP_DIR/$f" "$DIR/$f"
      else
        echo "[ERRO] $f não encontrado em $DIR nem no backup ($BACKUP_DIR) — não é possível rodar."
      fi
    fi
  done

  "$DIR/venv/bin/python" "$DIR/jira_extractor.py"
  STATUS=$?

  if [ "$STATUS" -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Concluído com sucesso"
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] FALHOU (status $STATUS, ver acima)"
  fi
} >> "$LOG" 2>&1

# Mantém só as últimas ~2000 linhas do log (evita crescimento infinito)
tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
