$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Verificando backend em http://localhost:3001/health..." -ForegroundColor Cyan

$backendOk = $false
try {
	$health = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3001/health" -TimeoutSec 2
	if ($health.StatusCode -eq 200) {
		$backendOk = $true
	}
} catch {
	$backendOk = $false
}

if (-not $backendOk) {
	Write-Host "Backend offline. Iniciando backend em nova janela..." -ForegroundColor Yellow
	Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $root "start-backend.ps1")
} else {
	Write-Host "Backend online." -ForegroundColor Green
}

$frontendOk = $false
try {
	$frontendHealth = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000" -TimeoutSec 2
	if ($frontendHealth.StatusCode -eq 200) {
		$frontendOk = $true
	}
} catch {
	$frontendOk = $false
}

if ($frontendOk) {
	Write-Host "Frontend ja esta em execucao em http://localhost:3000" -ForegroundColor Green
	return
}

Set-Location (Join-Path $root "frontend")
Write-Host "Instalando dependencias do frontend..." -ForegroundColor Cyan
npm install
Write-Host "Iniciando dashboard..." -ForegroundColor Green
npm run dev
