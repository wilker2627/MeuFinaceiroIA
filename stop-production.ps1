param(
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

$ports = @(3000, 3001)
$connections = @()

foreach ($port in $ports) {
  $portConnections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($portConnections) {
    $connections += $portConnections
  }
}

$processIds = $connections |
  Select-Object -ExpandProperty OwningProcess -Unique |
  Where-Object { $_ -gt 0 }

$stopped = @()
$failed = @()

foreach ($processId in $processIds) {
  try {
    $proc = Get-Process -Id $processId -ErrorAction Stop

    if ($WhatIf) {
      $stopped += [PSCustomObject]@{
        pid = $proc.Id
        name = $proc.ProcessName
        mode = 'whatif'
      }
      continue
    }

    Stop-Process -Id $proc.Id -Force -ErrorAction Stop
    $stopped += [PSCustomObject]@{
      pid = $proc.Id
      name = $proc.ProcessName
      mode = 'stopped'
    }
  } catch {
    $failed += [PSCustomObject]@{
      pid = $processId
      error = $_.Exception.Message
    }
  }
}

[PSCustomObject]@{
  targetPorts = $ports
  foundProcesses = $processIds.Count
  stoppedProcesses = $stopped
  failedProcesses = $failed
  dryRun = [bool]$WhatIf
} | ConvertTo-Json -Depth 6
