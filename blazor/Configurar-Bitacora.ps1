$ErrorActionPreference='Stop'
function Read-Secret([string]$Prompt) {
  $Secure=Read-Host $Prompt -AsSecureString
  return [System.Net.NetworkCredential]::new('', $Secure).Password
}
$DataDir=Join-Path $env:LOCALAPPDATA 'NewCentury\BitacoraKM'
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
if (Test-Path (Join-Path $DataDir 'settings.json')) { throw 'Ya existe una configuración. Conservála; no se reemplazó.' }
$DbHost=Read-Host 'Servidor PostgreSQL [127.0.0.1]'; if (!$DbHost) { $DbHost='127.0.0.1' }
$DbPort=Read-Host 'Puerto PostgreSQL [5432]'; if (!$DbPort) { $DbPort='5432' }
$DbName=Read-Host 'Nombre de una base NUEVA y vacía [bitacora_km_blazor]'; if (!$DbName) { $DbName='bitacora_km_blazor' }
$DbUser=Read-Host 'Usuario PostgreSQL'
$DbPassword=Read-Secret 'Contraseña PostgreSQL'
$PublicUrl=Read-Host 'Dirección HTTPS definitiva para PC y teléfonos (o http://localhost:5080 para prueba local)'
$Uri=[Uri]$PublicUrl
if (!$Uri.IsAbsoluteUri -or ($Uri.Scheme -ne 'https' -and $Uri.Host -notin @('localhost','127.0.0.1'))) { throw 'Usá HTTPS para el acceso desde teléfonos.' }
$TraccarUser=Read-Host 'Usuario de Traccar'
$TraccarPassword=Read-Secret 'Contraseña de Traccar'
$Connection='postgresql://'+[Uri]::EscapeDataString($DbUser)+':'+[Uri]::EscapeDataString($DbPassword)+'@'+$DbHost+':'+$DbPort+'/'+[Uri]::EscapeDataString($DbName)
$Settings=@{DATABASE_URL=$Connection;BITACORA_PUBLIC_URL=$PublicUrl.TrimEnd('/');TRACCAR_BASE_URL='http://127.0.0.1:8082';TRACCAR_INGEST_URL='http://127.0.0.1:5055';TRACCAR_USER=$TraccarUser;TRACCAR_PASSWORD=$TraccarPassword}
[System.IO.File]::WriteAllText((Join-Path $DataDir 'settings.json'), ($Settings | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
# Protect private configuration, photo evidence, and the session-signing key.
$Identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $DataDir /inheritance:r /grant:r "$($Identity):(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron restringir los permisos de la carpeta privada.' }
$env:DATABASE_URL=$Connection
try {
  node "$PSScriptRoot\Engine\migrate.cjs" init
  if ($LASTEXITCODE -ne 0) { throw 'La base no se preparó. Revisá que exista y esté vacía.' }
} finally { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue; $DbPassword=$null; $TraccarPassword=$null; $Settings=$null }
Write-Host 'Configuración guardada. Falta copiar los datos y soportes antes de habilitar el acceso.'
