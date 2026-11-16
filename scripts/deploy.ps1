# scripts/deploy.ps1 — Implantação do Meu Financeiro com Docker Compose (PowerShell)
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
#   .\scripts\deploy.ps1             # usa .env na raiz do repositório
#   .\scripts\deploy.ps1 .env.prod   # usa outro arquivo de ambiente
#
# Pré-requisitos: Docker Desktop com Docker Compose v2, portas 5432, 3000 e 3001 livres.

$ErrorActionPreference = 'Stop'

$scriptRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $scriptRoot

$envFile = if ($args.Count -gt 0) { $args[0] } else { '.env' }
$timeoutSeconds = 120
$services = @('db', 'api', 'web')

function Log($message) { Write-Host "[deploy] $message" }
function Fail($message) { Write-Host "[deploy][ERRO] $message" -ForegroundColor Red; exit 1 }

# 1. Pré-requisitos
if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'Docker não encontrado. Instale o Docker Desktop e tente novamente.'
}
docker compose version > $null 2>&1 || Fail 'Docker Compose v2 não encontrado (docker compose deve funcionar).'

# 2. Arquivo de ambiente
if (-not (Test-Path $envFile)) {
  if (Test-Path '.env.example') {
    Log ".env não encontrado; copiando de .env.example. Revise e preencha os segredos antes de rodar o deploy novamente."
    Copy-Item '.env.example' $envFile
  } else {
    Fail '.env.example não encontrado na raiz do repositório.'
  }
  Fail "Edite $envFile (JWT_SECRET, ENCRYPTION_KEY, DATABASE_URL etc.) e execute o deploy novamente."
}

# Carrega variáveis do .env no ambiente do processo
Get-Content $envFile | Where-Object { $_.Trim() -and $_.TrimStart() -notmatch '^#' } | ForEach-Object {
  $parts = $_.split('=', 2)
  if ($parts.Count -eq 2) {
    $name = $parts[0].Trim()
    $value = $parts[1].Trim().Trim('"').Trim("'")
    Set-Item -Path "env:$name" -Value $value
  }
}

# 3. Variáveis de ambiente obrigatórias
$requiredVars = @(
  'DATABASE_URL', 'DATABASE_URL_DIRECT', 'JWT_SECRET', 'ENCRYPTION_KEY', 'TOTP_ISSUER',
  'NODE_ENV', 'API_PORT', 'WEB_ORIGIN', 'NEXT_PUBLIC_API_BASE'
)
$placeholders = @('SENHA', 'change-me', 'exemplo', 'SEU_')
$missing = @()
foreach ($var in $requiredVars) {
  $value = [Environment]::GetEnvironmentVariable($var, 'Process')
  if ([string]::IsNullOrEmpty($value) -or ($placeholders | Where-Object { $value -like "*$_*" })) {
    $missing += $var
  }
}
if ($missing.Count -gt 0) {
  Fail "Variáveis obrigatórias ausentes ou com valores de exemplo em '$envFile': $($missing -join ', ')"
}

# 4. Build das imagens
Log 'Construindo imagens (docker compose build)...'
docker compose build

# 5. Sobe os serviços (ordem: db → api → web, via depends_on + health checks)
Log 'Subindo serviços (docker compose up -d)...'
docker compose up -d

# 6. Aguarda health checks de todos os serviços
Log "Aguardando health checks (timeout de ${timeoutSeconds}s por serviço)..."
function Wait-Health([string]$service) {
  $container = "meufinanceiro-$service"
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $status = docker inspect --format '{{.State.Health.Status}}' $container 2>$null
    if ($status -eq 'healthy') {
      Log "$service: saudável"
      return
    }
    if ($status -eq 'unhealthy') {
      Fail "Serviço '$service' está unhealthy. Logs: docker compose logs --tail=50 $service"
    }
    Start-Sleep -Seconds 3
  }
  Fail "Timeout aguardando health check do serviço '$service' (container '$container'). Veja: docker compose logs --tail=50 $service"
}
foreach ($service in $services) {
  Wait-Health $service
}

# 7. Aplica migrations do Prisma na API
Log 'Aplicando migrations do Prisma (docker compose exec api pnpm prisma migrate deploy)...'
docker compose exec -T api pnpm prisma migrate deploy

Log 'Implantação concluída.'
Log 'Web:      http://localhost:3000'
Log 'API:      http://localhost:3001'
Log 'Health:   http://localhost:3001/api/health'
Log 'Postgres: localhost:5432 (banco: meufinanceiro)'
Log 'Logs:     docker compose logs -f'
Log 'Parar:    docker compose down'
