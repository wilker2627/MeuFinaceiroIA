$ErrorActionPreference = 'Stop'

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw "[SMOKE FAIL] $Message"
  }
}

Write-Host "[1/5] Verificando health publico..."
$health = Invoke-RestMethod -Method Get -Uri "http://localhost:3001/health"
Assert-True ($health.status -eq 'ok') "Health publico nao retornou status ok"

Write-Host "[2/5] Criando tenant de teste..."
$email = "smoke+" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + "@mail.com"
$regBody = @{ name = "Smoke Tenant"; email = $email; password = "12345678" } | ConvertTo-Json
$register = Invoke-RestMethod -Method Post -Uri "http://localhost:3001/api/auth/register" -ContentType "application/json" -Body $regBody
Assert-True (-not [string]::IsNullOrWhiteSpace($register.token)) "Registro nao retornou token"
$token = $register.token

Write-Host "[3/5] Consultando resumo protegido..."
$summary = Invoke-RestMethod -Method Get -Uri "http://localhost:3001/api/dashboard/summary" -Headers @{ Authorization = "Bearer $token" }
Assert-True ($null -ne $summary.currentMonth) "Resumo nao retornou currentMonth"

Write-Host "[4/5] Consultando diagnostico detalhado..."
$diag = Invoke-RestMethod -Method Get -Uri "http://localhost:3001/api/dashboard/system/health" -Headers @{ Authorization = "Bearer $token" }
Assert-True ($diag.status -in @('ok', 'degraded')) "Diagnostico retornou status invalido"
Assert-True ($null -ne $diag.whatsapp.repairAudit) "Diagnostico sem repairAudit"
Assert-True ($null -ne $diag.whatsapp.repairLimit) "Diagnostico sem repairLimit"

Write-Host "[5/5] Simulando compra..."
$simBody = @{ amount = 399; description = "Smoke purchase" } | ConvertTo-Json
$sim = Invoke-RestMethod -Method Post -Uri "http://localhost:3001/api/dashboard/simulate-purchase" -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body $simBody
Assert-True ($null -ne $sim.message) "Simulacao nao retornou mensagem"

$result = [PSCustomObject]@{
  health = $health.status
  diagStatus = $diag.status
  repairLimitUsed = $diag.whatsapp.repairLimit.used
  repairLimitRemaining = $diag.whatsapp.repairLimit.remaining
  simulationCanAfford = $sim.canAfford
}

Write-Host "[SMOKE PASS]" -ForegroundColor Green
$result | ConvertTo-Json
