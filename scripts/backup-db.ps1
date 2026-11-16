# backup-db.ps1 - Backup do banco de dados do Meu Financeiro (PowerShell).
#
# Exporta o banco `meufinanceiro` com pg_dump para um arquivo SQL com
# carimbo de data/hora, mantendo os N backups mais recentes.
#
# Requisitos:
#   - pg_dump no PATH (ex: C:\Program Files\PostgreSQL\18\bin)
#   - Variáveis de ambiente:
#       $env:PGDATABASE = 'meufinanceiro'   (ou DATABASE_URL)
#       $env:PGUSER, $env:PGPASSWORD, $env:PGHOST, $env:PGPORT
#
# Uso:
#   .\scripts\backup-db.ps1                        # retencao padrao 7
#   .\scripts\backup-db.ps1 -Retention 30 -Dir C:\backups
#
[CmdletBinding()]
param(
  [string]$Dir = "$PSScriptRoot/../backups",
  [int]$Retention = 7
)

$ErrorActionPreference = 'Stop'

if (-not [string]::IsNullOrWhiteSpace($env:DATABASE_URL) -and [string]::IsNullOrWhiteSpace($env:PGDATABASE)) {
  $env:PGDATABASE = ($env:DATABASE_URL -replace '.*/([^/?]*)', '$1')
}

if ([string]::IsNullOrWhiteSpace($env:PGDATABASE)) {
  Write-Error "Defina PGDATABASE (ou DATABASE_URL) antes de executar o backup."
  exit 1
}

$pgdump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgdump) {
  Write-Error "pg_dump nao encontrado no PATH. Adicione C:\Program Files\PostgreSQL\18\bin ao PATH."
  exit 1
}

$backupDir = Resolve-Path $Dir -ErrorAction SilentlyContinue
if (-not $backupDir) {
  $backupDir = New-Item -ItemType Directory -Path $Dir -Force
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupFile = Join-Path $backupDir "meufinanceiro_$timestamp.sql"

Write-Host "[backup] Iniciando backup do banco '$env:PGDATABASE'..."
& $pgdump.Source --verbose --no-owner --no-privileges -f $backupFile

if (Get-Command gzip -ErrorAction SilentlyContinue) {
  & gzip -f $backupFile
  $backupFile = "$backupFile.gz"
}

Write-Host "[backup] Concluido: $backupFile"

# Rotina de retencao: mantem os Retention backups mais recentes.
if ($Retention -gt 0) {
  Write-Host "[backup] Aplicando retencao de $Retention backups..."
  $backups = Get-ChildItem -Path $backupDir -Filter 'meufinanceiro_*.sql*' |
    Sort-Object -Property LastWriteTime -Descending
  $removidos = 0
  for ($i = $Retention; $i -lt $backups.Count; $i++) {
    Write-Host "[backup] Removendo backup antigo: $($backups[$i].FullName)"
    Remove-Item -Path $backups[$i].FullName -Force
    $removidos++
  }
  Write-Host "[backup] $removido backup(s) antigo(s) removido(s)."
}

Write-Host "[backup] Fim."
