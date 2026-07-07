param(
  [switch]$SkipBackup,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

function Test-Url200 {
  param(
    [string]$Url,
    [int]$TimeoutSec = 2
  )

  try {
    $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec
    return $res.StatusCode -eq 200
  } catch {
    return $false
  }
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

if (-not $SkipBackup) {
  Write-Host "Criando backup do SQLite..." -ForegroundColor Cyan
  & (Join-Path $root "backup-db.ps1") | Out-Host
}

if ((Test-Url200 -Url "http://localhost:3001/health")) {
  throw "Backend ja responde em http://localhost:3001. Pare a instancia atual antes de subir producao."
}

if ((Test-Url200 -Url "http://localhost:3000")) {
  throw "Frontend ja responde em http://localhost:3000. Pare a instancia atual antes de subir producao."
}

if (-not $SkipBuild) {
  Write-Host "Buildando frontend (next build)..." -ForegroundColor Cyan
  Set-Location $frontendDir
  npm run build
}

Write-Host "Iniciando backend em janela separada..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-ExecutionPolicy', 'Bypass',
  '-Command', "Set-Location '$backendDir'; `$env:NODE_ENV='production'; npm run start"
)

Write-Host "Iniciando frontend em janela separada..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
  '-NoExit',
  '-ExecutionPolicy', 'Bypass',
  '-Command', "Set-Location '$frontendDir'; `$env:NODE_ENV='production'; npm run start"
)

Start-Sleep -Seconds 2

$backendUp = Test-Url200 -Url "http://localhost:3001/health"
$frontendUp = Test-Url200 -Url "http://localhost:3000"

[PSCustomObject]@{
  backend = if ($backendUp) { 'up' } else { 'starting' }
  frontend = if ($frontendUp) { 'up' } else { 'starting' }
  backendUrl = 'http://localhost:3001/health'
  frontendUrl = 'http://localhost:3000'
} | ConvertTo-Json
