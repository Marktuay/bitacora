# Bitacora KM - preparar PC Windows como servidor Blazor.
# No modifica PostgreSQL, Traccar, usuarios ni datos historicos.
param(
    [string]$Servidor = "C:\NewCentury\BitacoraKM-Piloto\Servidor",
    [int]$Puerto = 5104,
    [switch]$SinRespaldo
)
$ErrorActionPreference = 'Stop'
$Inicio = Join-Path $Servidor 'Start-Bitacora.ps1'
$Respaldo = Join-Path $Servidor 'Backup-Bitacora.ps1'
$Config = Join-Path $env:LOCALAPPDATA 'NewCentury\BitacoraKM\settings.json'
foreach($Ruta in @($Inicio,$Config)) {
    if(!(Test-Path $Ruta)){throw "Falta archivo necesario: $Ruta. No se hizo ningun cambio."}
}
if(!(Test-Path (Join-Path $Servidor 'Bitacora.Web.exe'))){throw 'No se encontro Bitacora.Web.exe'}
if(!(Test-Path (Join-Path $Servidor 'Engine\node_modules'))){Write-Warning 'Revisar las dependencias locales de Node.js.'}

$Tarea='BitacoraKM-Blazor'
$Existente=Get-ScheduledTask -TaskName $Tarea -ErrorAction SilentlyContinue
if($Existente) {
    $Actual=($Existente.Actions | ForEach-Object { $_.Arguments }) -join ' '
    if($Actual -notmatch 'Start-Bitacora\.ps1' -or $Actual -notmatch ('-Port '+$Puerto)){
        throw "La tarea $Tarea ya existe con otra configuracion. No fue reemplazada. Revisala en el Programador de tareas."
    }
    Write-Host 'Arranque automatico: ya estaba configurado.' -ForegroundColor Green
}else{
    $Identidad=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $ArgsInicio='-NoProfile -ExecutionPolicy Bypass -File "'+$Inicio+'" -Port '+$Puerto
    $Accion=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $ArgsInicio -WorkingDirectory $Servidor
    $Disparador=New-ScheduledTaskTrigger -AtLogOn -User $Identidad
    $Principal=New-ScheduledTaskPrincipal -UserId $Identidad -LogonType Interactive -RunLevel Limited
    $Opciones=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $Tarea -Action $Accion -Trigger $Disparador -Principal $Principal -Settings $Opciones | Out-Null
    Write-Host 'Arranque automatico de Blazor al iniciar sesion: configurado.' -ForegroundColor Green
}
Write-Host 'Nota: este arranque se produce al iniciar sesion en Windows; la PC debe permanecer encendida.'
try {
    $Salud=Invoke-RestMethod -Uri "http://127.0.0.1:$Puerto/api/health" -TimeoutSec 8
    Write-Host ("Blazor: "+$Salud.ok+"; PostgreSQL: "+$Salud.database+"; puerto: "+$Puerto)
}catch{Write-Warning 'Blazor no respondio ahora. La tarea quedo lista para el proximo inicio de sesion.'}

if(!$SinRespaldo) {
    if(!(Test-Path $Respaldo)){throw 'Falta Backup-Bitacora.ps1. Arranque automatico listo, pero respaldo NO realizado.'}
    $PgBin='C:\Program Files\PostgreSQL\18\bin'
    if(!(Test-Path (Join-Path $PgBin 'pg_dump.exe'))){throw 'No se encontro pg_dump de PostgreSQL 18. Arranque listo; respaldo pendiente.'}
    $env:Path="$PgBin;$env:Path"
    $Destino='C:\NewCentury\Respaldos-BitacoraKM'
    New-Item -ItemType Directory -Force -Path $Destino | Out-Null
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Respaldo -Destination $Destino
    if($LASTEXITCODE -ne 0){throw 'Falló el respaldo. No poner en produccion sin copia restaurable.'}
    Write-Host "Copia de seguridad local guardada en: $Destino" -ForegroundColor Green
    Write-Warning 'Guardá otra copia cifrada y protegida fuera del mismo disco. El respaldo incluye credenciales y fotografias.'
}
Write-Host 'Configuracion terminada. No se toco Supabase, Vercel ni el servicio Traccar.'
Write-Warning 'Cloudflare Quick Tunnel sigue siendo temporal: puede cambiar de URL tras reiniciar. No habilitar despliegue masivo sin URL estable y corte final.'
