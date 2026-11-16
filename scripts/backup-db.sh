#!/usr/bin/env bash
#
# backup-db.sh - Backup do banco de dados do Meu Financeiro.
#
# Exporta o banco `meufinanceiro` com pg_dump para um arquivo SQL com
# carimbo de data/hora, mantendo os N backups mais recentes.
#
# Requisitos:
#   - pg_dump no PATH (Windows: C:\Program Files\PostgreSQL\18\bin)
#   - Variáveis de ambiente (copie apps/api/.env.example para apps/api/.env):
#       DATABASE_URL   ex: postgresql://meufinanceiro:senha@localhost:5432/meufinanceiro
#       PGUSER / PGPASSWORD / PGHOST / PGPORT / PGDATABASE (alternativa ao DATABASE_URL)
#
# Uso:
#   ./scripts/backup-db.sh                 # backup padrão (retencao 7)
#   ./scripts/backup-db.sh --retention 30  # mantem os 30 mais recentes
#   ./scripts/backup-db.sh --dir /caminho/backups
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION="${RETENTION:-7}"
PGDUMP="${PGDUMP:-pg_dump}"

# Caminho nativo do Windows para ferramentas nativas (pg_dump, gzip),
# pois caminhos MSYS (/c/...) nao sao entendidos por pg_dump no Windows.
if command -v cygpath >/dev/null 2>&1; then
  BACKUP_DIR_WIN="$(cygpath -w "$BACKUP_DIR")"
elif [ -n "${MSYSTEM:-}" ]; then
  BACKUP_DIR_WIN="$(cd "$BACKUP_DIR" && pwd -W)"
else
  BACKUP_DIR_WIN="$BACKUP_DIR"
fi

usage() {
  echo "Uso: $0 [--dir <diretorio>] [--retention <n>]" >&2
  echo "  --dir       Diretorio de destino dos backups (padrao: <repo>/backups)" >&2
  echo "  --retention Quantidade de backups mais recentes a manter (padrao: 7)" >&2
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) BACKUP_DIR="$2"; shift 2 ;;
    --retention) RETENTION="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Opcao desconhecida: $1" >&2; usage ;;
  esac
done

mkdir -p "$BACKUP_DIR"

if [ -z "${PGDATABASE:-}" ] && [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: defina PGDATABASE (ou DATABASE_URL) antes de executar o backup." >&2
  echo "  Exemplo: export PGDATABASE=meufinanceiro PGUSER=postgres PGPASSWORD=senha PGHOST=localhost PGPORT=5432" >&2
  exit 1
fi

# Extrai o nome do banco de DATABASE_URL quando PGDATABASE nao estiver definido.
if [ -z "${PGDATABASE:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
  export PGDATABASE
  PGDATABASE="$(printf '%s' "$DATABASE_URL" | sed -n 's#.*/\([^/?]*\)#\1#p')"
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR_WIN/meufinanceiro_$TIMESTAMP.sql"

echo "[backup] Iniciando backup do banco '${PGDATABASE:-meufinanceiro}'..."
"$PGDUMP" --verbose --no-owner --no-privileges -f "$BACKUP_FILE"

# Compacta para economizar espaco.
if command -v gzip >/dev/null 2>&1; then
  gzip -f "$BACKUP_FILE"
  BACKUP_FILE="$BACKUP_FILE.gz"
fi

echo "[backup] Concluido: $BACKUP_FILE"

# Rotina de retencao: remove backups mais antigos que o limite, mantendo os mais recentes.
if [ "$RETENTION" -gt 0 ] 2>/dev/null; then
  echo "[backup] Aplicando retencao de $RETENTION backups..."
  mapfile -t BACKUPS < <(ls -1 "$BACKUP_DIR"/meufinanceiro_*.sql* 2>/dev/null | sort -r)
  if [ "${#BACKUPS[@]}" -gt "$RETENTION" ]; then
    for old in "${BACKUPS[@]:$RETENTION}"; do
      echo "[backup] Removendo backup antigo: $old"
      rm -f "$old"
    done
  fi
fi

echo "[backup] Fim."
