# jira-extractor-src

Cópia versionada do `jira_extractor.py` + `jira_credentials.py` que rodam
**fora** deste repositório, direto na VM (`/home/rafael.silva/painel-si/Jira/`,
agendados por hora via cron do usuário `rafael.silva`).

Esses dois arquivos não fazem parte da aplicação Node (`Movidesk/`) — é só
um script Python que gera os `.json` que a aba Jira do painel lê via
`/api/jira/*`. A pasta `Jira/` no topo do repo é um gitlink solto (sem
`.gitmodules` real, não é um submódulo funcional), então o git nunca
rastreia o que tem lá dentro — só esta cópia em `jira-extractor-src/` é
versionada de verdade, como backup pra restaurar rápido se os arquivos
sumirem/corromperem na VM (já aconteceu uma vez).

**Deploy/restauração na VM:**
```bash
cd /home/rafael.silva/painel-si
git pull
cp jira-extractor-src/jira_extractor.py jira-extractor-src/jira_credentials.py Jira/
cd Jira && ./run_extractor.sh
```
