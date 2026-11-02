param([int]$Port=5080)
$ErrorActionPreference = 'Stop'
$env:BITACORA_DATA_DIR = Join-Path $env:LOCALAPPDATA 'NewCentury\BitacoraKM'
if (!(Test-Path (Join-Path $env:BITACORA_DATA_DIR 'settings.json'))) { throw 'Ejecutá Configurar-Bitacora.ps1 primero.' }
if (!(Get-Command node -ErrorAction SilentlyContinue)) { throw 'Se requiere Node.js 24 en este servidor.' }
$env:ASPNETCORE_ENVIRONMENT='Production'
Set-Location $PSScriptRoot
& "$PSScriptRoot\Bitacora.Web.exe" --urls "http://127.0.0.1:$Port"
if ($LASTEXITCODE -ne 0) { throw 'La aplicación se detuvo. Revisá la salida anterior.' }
