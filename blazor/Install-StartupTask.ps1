$ErrorActionPreference='Stop'
$TaskName='BitacoraKM-Blazor'
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { throw 'Ya existe la tarea de Bitácora Blazor. No se reemplazó.' }
$Launch=Join-Path $PSScriptRoot 'Start-Bitacora.ps1'
if (!(Test-Path (Join-Path $PSScriptRoot 'Bitacora.Web.exe'))) { throw 'Ejecutá este script desde la carpeta publicada.' }
$Identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$Action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -File `"$Launch`"" -WorkingDirectory $PSScriptRoot
$Trigger=New-ScheduledTaskTrigger -AtLogOn -User $Identity
$Principal=New-ScheduledTaskPrincipal -UserId $Identity -LogonType Interactive -RunLevel Limited
$Settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings | Out-Null
Write-Host 'Bitácora Blazor iniciará al ingresar a Windows con esta cuenta. La PC y Traccar deben permanecer encendidos.'
