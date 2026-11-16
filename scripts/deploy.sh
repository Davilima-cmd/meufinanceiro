#!/usr/bin/env bash
#
# scripts/deploy.sh — Implantação do Meu Financeiro com Docker Compose
#
# O que faz:
#   1. Confirma pré-requisitos (Docker + Docker Compose v2) e arquivo .env
#   2. Valida variáveis de ambiente obrigatórias
#   3. Builda as imagens (db, api, web)
#   4. Sobe os serviços em segundo plano (ordem: db → api → web)
#   5. Aguarda os health checks de todos os serviços
#   6. Aplica as migrations do Prisma na API (prisma migrate deploy)
#
# Uso:
#   ./scripts/deploy.sh             # usa .env na raiz do repositório
#   ./scripts/deploy.sh .env.prod   # usa outro arquivo de ambiente
#
# Pré-requisitos: Docker Desktop com Docker Compose v2, portas 5432, 3000 e 3001 livres.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${1:-.env}"
TIMEOUT_SECONDS=120
SERVICES=(db api web)

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy][ERRO] %s\n' "$*" >&2; exit 1; }

# 1. Pré-requisitos
command -v docker >/dev/null 2>&1 || fail 'Docker não encontrado. Instale o Docker Desktop e tente novamente.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 não encontrado (docker compose deve funcionar).'

# 2. Arquivo de ambiente
if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f .env.example ]]; then
    log ".env não encontrado; copiando de .env.example. Revise e preencha os segredos antes de rodar o deploy novamente."
    cp .env.example "$ENV_FILE"
  else
    fail '.env.example não encontrado na raiz do repositório.'
  fi
  fail "Edite $ENV_FILE (JWT_SECRET, ENCRYPTION_KEY, DATABASE_URL etc.) e execute o deploy novamente."
fi

# shellcheck disable=SC1090
# Safe .env parser: handles spaces, comments, and quoted values without executing code
while IFS='=' read -r key value; do
  key="${key%%#*}"   # strip inline comments
  key="${key%% }"    # trim trailing spaces
  key="${key## }"    # trim leading spaces
  if [[ -z "$key" || "$key" =~ ^# ]]; then
    continue
  fi
  value="${value%%#*}"   # strip inline comments
  value="${value%"""}"
  value="${value#"""}"
  value="${value%% }"
  value="${value## }"
  export "$key=$value"
done < "$ENV_FILE"

# 3. Variáveis de ambiente obrigatórias
REQUIRED_VARS=(
  DATABASE_URL
  DATABASE_URL_DIRECT
  JWT_SECRET
  ENCRYPTION_KEY
  TOTP_ISSUER
  NODE_ENV
  API_PORT
  WEB_ORIGIN
  NEXT_PUBLIC_API_BASE
)
MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  value="${!var:-}"
  if [[ -z "$value" || "$value" == *SENHA* || "$value" == *change-me* || "$value" == *exemplo* || "$value" == *SEU_* ]]; then
    MISSING+=("$var")
  fi
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  fail "Variáveis obrigatórias ausentes ou com valores de exemplo em '$ENV_FILE': ${MISSING[*]}"
fi

# 4. Build das imagens
log 'Construindo imagens (docker compose build)...'
docker compose build

# 5. Sobe os serviços (ordem: db → api → web, via depends_on + health checks)
log 'Subindo serviços (docker compose up -d)...'
docker compose up -d

# 6. Aguarda health checks de todos os serviços
log "Aguardando health checks (timeout de ${TIMEOUT_SECONDS}s por serviço)..."
for service in "${SERVICES[@]}"; do
  container="meufinanceiro-${service}"
  deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))
  while true; do
    now=$(date +%s)
    if [[ $now -ge $deadline ]]; then
      fail "Timeout aguardando health check do serviço '$service' (container '$container'). Veja: docker compose logs --tail=50 $service"
    fi
    status="$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo unknown)"
    case "$status" in
      healthy)
        log "$service: saudável"
        break
        ;;
      unhealthy)
        fail "Serviço '$service' está unhealthy. Logs: docker compose logs --tail=50 $service"
        ;;
      *)
        sleep 3
        ;;
    esac
  done
done

# 7. Aplica migrations do Prisma na API
log 'Aplicando migrations do Prisma (docker compose exec api pnpm prisma migrate deploy)...'
docker compose exec -T api pnpm prisma migrate deploy

log 'Implantação concluída.'
log 'Web:      http://localhost:3000'
log 'API:      http://localhost:3001'
log 'Health:   http://localhost:3001/api/health'
log 'Postgres: localhost:5432 (banco: meufinanceiro)'
log 'Logs:     docker compose logs -f'
log 'Parar:    docker compose down'
