"""
jira_credentials.py — Resolve as credenciais da API do Jira usadas por
jira_extractor.py, em ordem de prioridade:

  1. Painel (tabela `config` no mesmo Postgres do Movidesk) — editável em
     Configurações → Sistema → "Credenciais da API (Jira)". Token salvo lá
     é criptografado com o mesmo algoritmo usado pro token Movidesk/chave
     GPT (server/utils/crypto.js do Node — AES-256-CBC, chave ENCRYPTION_KEY
     truncada/preenchida pra 32 bytes, IV aleatório de 16 bytes prefixado em
     hex, formato "iv_hex:ciphertext_hex").
  2. Jira/.env (se existir e tiver JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN).
  3. Valores default passados por quem chama resolve_credentials() (fallback
     final — hoje são os valores que estavam hardcoded em jira_extractor.py).

Qualquer falha em 1 ou 2 (rede, driver ausente, banco fora do ar, valor não
configurado, erro de decriptografia) cai silenciosamente pro próximo nível —
nunca derruba a execução do extractor.
"""

import os


def _load_env_file(path):
    values = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip().strip('"').strip("'")
    except OSError:
        pass
    return values


def _decrypt_token(encrypted_data, encryption_key):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives import padding

    iv_hex, sep, enc_hex = encrypted_data.partition(":")
    if not sep:
        raise ValueError("Formato de token criptografado invalido")

    iv = bytes.fromhex(iv_hex)
    ciphertext = bytes.fromhex(enc_hex)
    key = (encryption_key or "").ljust(32, "0")[:32].encode("utf-8")

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()

    unpadder = padding.PKCS7(128).unpadder()
    data = unpadder.update(padded) + unpadder.finalize()
    return data.decode("utf-8")


def _resolve_from_db():
    try:
        import psycopg2
    except ImportError:
        print("[jira_credentials] psycopg2 nao instalado — pulando leitura do banco.")
        return None

    script_dir = os.path.dirname(os.path.abspath(__file__))
    movidesk_env = _load_env_file(os.path.join(script_dir, "..", "Movidesk", ".env"))

    host = movidesk_env.get("DB_HOST")
    name = movidesk_env.get("DB_NAME")
    user = movidesk_env.get("DB_USER")
    password = movidesk_env.get("DB_PASSWORD")
    port = movidesk_env.get("DB_PORT", "5432")
    ssl = movidesk_env.get("DB_SSL", "").lower() == "true"
    encryption_key = movidesk_env.get("ENCRYPTION_KEY", "")

    if not (host and name and user and password):
        print("[jira_credentials] DB_HOST/NAME/USER/PASSWORD ausentes em Movidesk/.env — pulando banco.")
        return None

    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            dbname=name,
            user=user,
            password=password,
            sslmode="require" if ssl else "prefer",
            connect_timeout=5,
        )
    except Exception as exc:
        print(f"[jira_credentials] Falha ao conectar no banco, usando fallback: {exc}")
        return None

    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT key, value FROM config WHERE key IN "
                "('jira_base_url','jira_email','jira_api_token')"
            )
            rows = dict(cur.fetchall())
    except Exception as exc:
        print(f"[jira_credentials] Falha ao consultar credenciais, usando fallback: {exc}")
        return None
    finally:
        conn.close()

    base_url = rows.get("jira_base_url")
    email = rows.get("jira_email")
    token_encrypted = rows.get("jira_api_token")
    if not (base_url and email and token_encrypted):
        print("[jira_credentials] Credenciais ainda nao configuradas no painel — usando fallback.")
        return None

    try:
        token = _decrypt_token(token_encrypted, encryption_key)
    except Exception as exc:
        print(f"[jira_credentials] Falha ao descriptografar token do painel, usando fallback: {exc}")
        return None

    return base_url.rstrip("/"), email, token


def resolve_credentials(default_base_url, default_email, default_token):
    """Retorna (base_url, email, token) — painel > Jira/.env > defaults."""
    from_db = _resolve_from_db()
    if from_db:
        print("[jira_credentials] Usando credenciais salvas no painel (Configuracoes -> Sistema).")
        return from_db

    script_dir = os.path.dirname(os.path.abspath(__file__))
    local_env = _load_env_file(os.path.join(script_dir, ".env"))
    base_url = local_env.get("JIRA_BASE_URL")
    email = local_env.get("JIRA_EMAIL")
    token = local_env.get("JIRA_API_TOKEN")
    if base_url and email and token:
        print("[jira_credentials] Usando credenciais de Jira/.env.")
        return base_url.rstrip("/"), email, token

    print("[jira_credentials] Usando credenciais default (fallback final).")
    return default_base_url.rstrip("/"), default_email, default_token
