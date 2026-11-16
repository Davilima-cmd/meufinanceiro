#!/usr/bin/env bash
#
# scripts/deploy-azure.sh — publica a API (NestJS) no Azure.
#
# Alvos suportados:
#   - Azure Container Apps (recomendado): escala a zero, tem free tier com
#     creditos mensais e suporta containers com health probes.
#   - Azure App Service (plano Free/F1): mais simples, mas sem escala.
#
# Pre-requisitos:
#   - Azure CLI logado:  az login
#   - Docker:             docker version
#   - ACR criado:         az acr create ... (ou use o registro existente)
#   - Variaveis:          ver .env.production.example
#
# Uso:
#   ./scripts/deploy-azure.sh container-apps
#   ./scripts/deploy-azure.sh app-service

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TARGET="${1:-container-apps}"
ENV_FILE="${ENV_FILE:-.env.production}"

# --- leitura de variaveis do arquivo de ambiente ---
set -a
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
set +a

: "${AZURE_RESOURCE_GROUP:?defina AZURE_RESOURCE_GROUP no .env.production}"
: "${AZURE_LOCATION:?defina AZURE_LOCATION no .env.production}"
: "${ACR_NAME:?defina ACR_NAME no .env.production}"
: "${IMAGE_TAG:?defina IMAGE_TAG no .env.production}"

log()  { printf '[azure] %s\n' "$*"; }
fail() { printf '[azure][ERRO] %s\n' "$*" >&2; exit 1; }

command -v az >/dev/null 2>&1 || fail 'Azure CLI (az) nao encontrado.'
command -v docker >/dev/null 2>&1 || fail 'Docker nao encontrado.'
az account show >/dev/null 2>&1 || fail 'Execute: az login'

log "Build da imagem da API (tag $IMAGE_TAG)..."
docker build -f apps/api/Dockerfile.prod -t "$ACR_NAME.azurecr.io/meufinanceiro-api:$IMAGE_TAG" .

log "Publicando no ACR..."
az acr login --name "$ACR_NAME"
docker push "$ACR_NAME.azurecr.io/meufinanceiro-api:$IMAGE_TAG"

case "$TARGET" in
  container-apps)
    : "${CONTAINER_APP_NAME:?defina CONTAINER_APP_NAME para container-apps}"
    log "Atualizando o Container App $CONTAINER_APP_NAME..."
    az containerapp update \
      --name "$CONTAINER_APP_NAME" \
      --resource-group "$AZURE_RESOURCE_GROUP" \
      --image "$ACR_NAME.azurecr.io/meufinanceiro-api:$IMAGE_TAG" >/dev/null
    log "Container App atualizado."
    ;;
  app-service)
    : "${APP_SERVICE_NAME:?defina APP_SERVICE_NAME para app-service}"
    log "Atualizando o App Service $APP_SERVICE_NAME..."
    az webapp deploy \
      --name "$APP_SERVICE_NAME" \
      --resource-group "$AZURE_RESOURCE_GROUP" \
      --type zip \
      --src-path ./dist-web >/dev/null 2>&1 || \
      log 'Use o GitHub Actions (workflow de deploy) para o App Service.'
    ;;
  *)
    fail "Alvo desconhecido: $TARGET (use container-apps ou app-service)"
    ;;
esac

log "Aplique as migrations do Prisma com o pooler/direto de .env.production:"
log "  pnpm --filter @meufinanceiro/api exec prisma migrate deploy"
