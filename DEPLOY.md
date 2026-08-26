# Deploy na VM (Oracle Cloud / OCI)

Guia para subir o painel numa instância OCI existente, via Docker. O Postgres
(`DB_HOST` no `.env`) e o API Gateway (`GATEWAY_URL`) são serviços externos —
não sobem junto, só precisam estar alcançáveis pela VM.

## 1. Pré-requisitos na VM

Acesse a VM via SSH e confirme se o Docker está instalado:

```bash
docker --version
docker compose version
```

Se não estiver (ex: Ubuntu):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# saia e reconecte via SSH pra o grupo "docker" valer
```

## 2. Trazer o código

```bash
git clone https://github.com/rafaelinacio-lab/PAINEL-SI.git painel-si
cd painel-si
git checkout claude/api-gateway-painel-rota-bq8uhd   # ou main, depois que o PR #1 for mergeado
```

Se já existir um clone anterior na VM, é só `git pull` na branch certa.

## 3. Configurar o `.env`

O `.env` já vem versionado no repositório (não ideal, mas é como o projeto
está hoje) — confira/ajuste os valores antes de subir:

```bash
nano .env
```

Preencha:
- `PORT` — porta que o painel vai escutar (padrão `5000`)
- `ALLOWED_ORIGINS` — origem(ns) que podem chamar a API (ex: `http://SEU_IP:5000` ou o domínio, se tiver um na frente)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — Postgres (já preenchidos; confirme se esse Postgres é alcançável a partir da VM)
- `ENCRYPTION_KEY` — chave para criptografar o token do Movidesk salvo no banco (gere uma: `openssl rand -hex 32`)
- `GATEWAY_URL` e `GATEWAY_TOKEN` — **novo**, usado pela rota de tickets (que agora consulta o API Gateway em vez do banco). Gere o token no painel admin do `movidesk--ponte-api` (Tokens → Novo token, perfil `readonly`)

## 4. Build e subir o container

```bash
docker compose up -d --build
```

Acompanhar logs:

```bash
docker compose logs -f painel
```

Testar localmente na própria VM:

```bash
curl -s http://localhost:${PORT:-5000}/health
```

Deve responder `{"status":"ok","message":"Servidor funcionando"}`.

## 5. Liberar a porta (rede OCI)

Duas camadas para liberar, ambas necessárias:

**a) Security List / Network Security Group (painel OCI)**
No console da OCI: VCN → sua VCN → Security Lists (ou NSG da instância) →
Add Ingress Rule:
- Source CIDR: `0.0.0.0/0` (ou restrinja ao IP/rede de quem vai acessar)
- Protocolo: TCP
- Destination Port Range: a porta do `PORT` (ex: `5000`)

**b) Firewall do próprio SO** — imagens Ubuntu/Oracle Linux da OCI costumam vir
com `iptables`/`firewalld` bloqueando por padrão, além da Security List:

```bash
# Ubuntu (iptables) — libera a porta e persiste
sudo iptables -I INPUT -p tcp --dport ${PORT:-5000} -j ACCEPT
sudo netfilter-persistent save   # ou: sudo apt install iptables-persistent

# Oracle Linux (firewalld)
sudo firewall-cmd --permanent --add-port=${PORT:-5000}/tcp
sudo firewall-cmd --reload
```

Depois disso, `http://<IP-publico-da-VM>:${PORT}` deve responder de fora.

## 6. Primeiro acesso — criar usuário admin

Só na primeira vez (o script cria `admin@example.com` / `Admin@123456`):

```bash
docker compose exec painel node create-admin.js
```

Faça login em `http://<IP-da-VM>:${PORT}/login` e **troque a senha
imediatamente** pelo próprio painel (Configurações → Usuários).

## 7. Atualizações futuras

```bash
cd painel-si
git pull
docker compose up -d --build
```

## 8. Opcional — domínio + HTTPS

Sem domínio, o painel fica acessível só por `http://IP:PORTA` (sem TLS). Se
quiser um domínio com HTTPS na frente, o jeito mais simples é um Caddy/nginx
reverso na própria VM (o `movidesk--ponte-api` já tem um exemplo de Caddy em
`docker/Caddyfile` e `docker/docker-compose.prod.yml` que dá pra usar como
referência). Isso é opcional — não é necessário pra o painel funcionar.

## Observação de segurança já corrigida

O servidor servia a raiz inteira do repositório como arquivo estático
(`.env`, planilha de chamados, scripts de debug — tudo baixável via HTTP).
Isso foi corrigido: agora só `/css`, `/js` e `/pages` são servidos
estaticamente (ver `server/server.js`). Depois do deploy, vale confirmar que
`http://<IP>:${PORT}/.env` e `http://<IP>:${PORT}/curadoria_chamados.xlsx`
retornam 404.
