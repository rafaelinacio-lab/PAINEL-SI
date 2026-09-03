# jira-extractor-src

Cópia versionada do `jira_extractor.py` + `jira_credentials.py` que rodam
**fora** deste repositório, direto na VM (`/home/rafael.silva/painel-si/Jira/`,
agendados por hora via cron do usuário `rafael.silva`).

Esses arquivos não fazem parte da aplicação Node (`Movidesk/`) — é só um
script Python que gera os `.json` que a aba Jira do painel lê via
`/api/jira/*`. A pasta `Jira/` no topo do repo é um gitlink solto (sem
`.gitmodules` real, não é um submódulo funcional), então o git nunca
rastreia o que tem lá dentro — só esta cópia em `jira-extractor-src/` é
versionada de verdade, como backup pra restaurar rápido se os arquivos
sumirem/corromperem na VM (já aconteceu uma vez, em 2026-09-02, derrubando
o cron por 17h sem ninguém perceber — ver `run_extractor.sh`).

**Deploy/restauração manual na VM:**
```bash
cd /home/rafael.silva/painel-si
git pull
cp jira-extractor-src/jira_extractor.py jira-extractor-src/jira_credentials.py jira-extractor-src/run_extractor.sh Jira/
chmod +x Jira/run_extractor.sh
cd Jira && ./run_extractor.sh
```

**Auto-restauração**: a partir desta versão, `run_extractor.sh` (rodando em
`Jira/`) checa sozinho se `jira_extractor.py`/`jira_credentials.py` existem
antes de cada execução e, se algum sumir de novo, restaura automaticamente
copiando desta pasta (`../jira-extractor-src/`, sibling de `Jira/`) — não
precisa mais de intervenção manual pra esse cenário específico. Ele também
para de mentir "Concluído com sucesso" quando o Python falha (bug do
`set -e` com `{ } || fallback` que mascarava toda falha no log).
