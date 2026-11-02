param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
$DataDir=Join-Path $env:LOCALAPPDATA 'NewCentury\BitacoraKM'
$Settings=Get-Content (Join-Path $DataDir 'settings.json') -Raw | ConvertFrom-Json
if (!(Get-Command pg_dump -ErrorAction SilentlyContinue)) { throw 'Agregá la carpeta bin de PostgreSQL al PATH para usar pg_dump.' }
$Stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$Backup=Join-Path $Destination "BitacoraKM-$Stamp"
New-Item -ItemType Directory -Path $Backup | Out-Null
$Identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $Backup /inheritance:r /grant:r "$($Identity):(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron restringir los permisos del respaldo.' }
# Keep credentials out of process arguments and logs.
$Db=[Uri]$Settings.DATABASE_URL
$UserPass=$Db.UserInfo.Split(':',2)
$env:PGHOST=$Db.Host; $env:PGPORT=$Db.Port; $env:PGDATABASE=$Db.AbsolutePath.TrimStart('/'); $env:PGUSER=[Uri]::UnescapeDataString($UserPass[0]); $env:PGPASSWORD=[Uri]::UnescapeDataString($UserPass[1])
try {
  pg_dump --format=custom --file (Join-Path $Backup 'bitacora.dump')
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo respaldar la base.' }
  Copy-Item $DataDir (Join-Path $Backup 'private') -Recurse
} finally { foreach ($Key in @('PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD')) { Remove-Item "Env:$Key" -ErrorAction SilentlyContinue } }
Write-Host "Respaldo creado: $Backup"
