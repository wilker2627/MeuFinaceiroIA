$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $root "backend")
Write-Host "Iniciando servidor..." -ForegroundColor Green
npm run dev
