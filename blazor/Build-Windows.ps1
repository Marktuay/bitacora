param([string]$Destination = "$PSScriptRoot\dist\BitacoraKM")
$ErrorActionPreference = 'Stop'
$Repo = Split-Path $PSScriptRoot -Parent
Push-Location $Repo
try {
  node --version
  dotnet --version
  # npm en Windows puede ignorar el lockfile con --prefix absoluto.
  # Ejecutar desde la carpeta con package-lock.json para garantizar reproducibilidad.
  Push-Location (Join-Path $PSScriptRoot 'engine')
  try {
    npm ci --omit=dev
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron preparar las dependencias.' }
  } finally { Pop-Location }
  node "$PSScriptRoot\prepare.mjs"
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la aplicación.' }
  dotnet publish "$PSScriptRoot\Bitacora.Web" -c Release -r win-x64 --self-contained true -o $Destination
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar la versión Windows.' }
  Copy-Item "$PSScriptRoot\Start-Bitacora.ps1" $Destination
  Copy-Item "$PSScriptRoot\Configurar-Bitacora.ps1" $Destination
  Copy-Item "$PSScriptRoot\Backup-Bitacora.ps1" $Destination
  Copy-Item "$PSScriptRoot\Install-StartupTask.ps1" $Destination
  Write-Host "Preparado: $Destination"
} finally { Pop-Location }
