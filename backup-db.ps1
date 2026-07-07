param(
  [int]$RetentionDays = 14,
  [string]$BackupRoot = "./backups"
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dbPath = Join-Path $root "backend/prisma/dev.db"
$backupDir = Join-Path $root $BackupRoot

if (-not (Test-Path $dbPath)) {
  throw "Banco SQLite nao encontrado em $dbPath"
}

if (-not (Test-Path $backupDir)) {
  New-Item -Path $backupDir -ItemType Directory | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dest = Join-Path $backupDir ("dev-$timestamp.db")
Copy-Item -Path $dbPath -Destination $dest -Force

$cutoff = (Get-Date).AddDays(-[Math]::Abs($RetentionDays))
$removed = 0
Get-ChildItem -Path $backupDir -Filter "dev-*.db" -File |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  ForEach-Object {
    Remove-Item -Path $_.FullName -Force
    $removed++
  }

[PSCustomObject]@{
  backupPath = $dest
  retentionDays = $RetentionDays
  removedOldBackups = $removed
  createdAt = (Get-Date).ToString("s")
} | ConvertTo-Json
