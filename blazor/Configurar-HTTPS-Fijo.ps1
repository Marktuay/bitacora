# Configura una direccion HTTPS reservada para Bitacora KM SIN dominio propio.
# REQUIERE una cuenta gratuita en https://myzrok.io/ y su token (NO compartir).
# No modifica PostgreSQL, Traccar, Blazor ni el tunel Cloudflare actual.
param(
    [string]$Nombre = "bitacorakmnc26",
    [int]$Puerto = 5104
)
$ErrorActionPreference = 'Stop'
if($Nombre -notmatch '^[a-z0-9-]{5,32}$') {
    throw 'Usa un nombre con 5-32 caracteres: letras minusculas, numeros o guiones.'
}
$Base = Join-Path $env:LOCALAPPDATA 'NewCentury\Zrok'
$Exe = Join-Path $Base 'zrok2.exe'
$Zip = Join-Path $Base 'zrok2-windows.tar.gz'
New-Item -ItemType Directory -Force -Path $Base | Out-Null

if(!(Test-Path $Exe)) {
    Write-Host 'Descargando cliente oficial zrok2 para Windows...'
    $Release = Invoke-RestMethod -Uri 'https://api.github.com/repos/openziti/zrok/releases/latest'
    $Asset = $Release.assets | Where-Object { $_.name -match '^zrok_[0-9.]+_windows_amd64\.tar\.gz$' } | Select-Object -First 1
    if(!$Asset) { throw 'No se encontro el archivo zrok2 Windows en la version oficial. No se instalo nada.' }
    Invoke-WebRequest -Uri $Asset.browser_download_url -OutFile $Zip
    & tar -xf $Zip -C $Base zrok2.exe
    if($LASTEXITCODE -ne 0 -or !(Test-Path $Exe)){throw 'No se pudo extraer el cliente zrok2.'}
    Remove-Item $Zip -Force
}
& $Exe version
if($LASTEXITCODE -ne 0){throw 'El cliente zrok2 no funciona en este Windows.'}
$Salud = Invoke-RestMethod -Uri "http://127.0.0.1:$Puerto/api/health" -TimeoutSec 10
if(!$Salud.ok -or !$Salud.database){throw 'Blazor o PostgreSQL no responden en el puerto indicado.'}

Write-Host 'Vas a vincular esta PC con tu cuenta de myzrok.io.'
Write-Host 'No pegues el token en ChatGPT. La ventana siguiente pide el token como contrasena.'
 $Cred = Get-Credential -UserName 'zrok-account-token' -Message 'Pega el token de myzrok.io en la casilla CONTRASENA'
if(!$Cred){throw 'Se cancelo la configuracion.'}
$Token = $Cred.GetNetworkCredential().Password
try{
    if(!$Token){throw 'Token vacio.'}
    & $Exe enable $Token
    if($LASTEXITCODE -ne 0){throw 'No se pudo activar zrok en esta PC.'}
}finally{$Token=$null;$Cred=$null}
& $Exe create name -n public $Nombre
if($LASTEXITCODE -ne 0) {
    throw "No se pudo reservar el nombre '$Nombre'. Si ya esta ocupado elegi otro con -Nombre 'otro-nombre'. No hay que modificar la APK."
}

# Proceso supervisado por el Programador de tareas al iniciar sesion Windows.
# Permanece activo mientras haya usuario iniciado y conexion a Internet.
$Launcher = Join-Path $Base 'Iniciar-HTTPS-Fijo.ps1'
$LauncherText = @'
param([string]$Nombre,[int]$Puerto)
$ErrorActionPreference = "Continue"
$Exe = Join-Path $env:LOCALAPPDATA "NewCentury\Zrok\zrok2.exe"
while($true) {
    & $Exe share public "http://127.0.0.1:$Puerto" -n "public:$Nombre" --headless
    Start-Sleep -Seconds 30
}
'@
[System.IO.File]::WriteAllText($Launcher,$LauncherText,[System.Text.UTF8Encoding]::new($false))
$TaskName='BitacoraKM-HTTPS-Fijo'
if(Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue){
    throw "La tarea $TaskName ya existe. No la reemplazo ni creo un proceso duplicado."
}
$Identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$Args='-NoProfile -ExecutionPolicy Bypass -File "'+$Launcher+'" -Nombre '+$Nombre+' -Puerto '+$Puerto
$Action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $Args -WorkingDirectory $Base
$Trigger=New-ScheduledTaskTrigger -AtLogOn -User $Identity
$Principal=New-ScheduledTaskPrincipal -UserId $Identity -LogonType Interactive -RunLevel Limited
$Settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host ''
Write-Host "Direccion RESERVADA (fija mientras conserves la cuenta y reserva):" -ForegroundColor Green
Write-Host "https://$Nombre.share.zrok.io" -ForegroundColor Cyan
Write-Host "Al iniciar sesion en Windows: arranca zrok y conserva el MISMO nombre." -ForegroundColor Green
Write-Warning 'No distribuir APK todavia: probar HTTPS y resolver el corte final desde Supabase.'

$Url = "https://$Nombre.share.zrok.io"
$Ready = $false
for($i=0; $i -lt 8; $i++){
  Start-Sleep -Seconds 5
  try {
    $Response = Invoke-RestMethod -Uri "$Url/api/health" -Headers @{skip_zrok_interstitial='true'} -TimeoutSec 10
    if($Response.ok -and $Response.database){ $Ready = $true; break }
  }catch{ Write-Host 'Esperando HTTPS del servidor...' }
}
if($Ready){ Write-Host "HTTPS FUNCIONANDO: $Url" -ForegroundColor Green }
else{ Write-Warning 'Nombre reservado pero HTTPS no verificado. Revisa la tarea BitacoraKM-HTTPS-Fijo.' }
Write-Warning 'El proveedor gratuito tiene limites y no garantiza condiciones futuras ni disponibilidad.'
