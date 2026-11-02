# Bitacora KM: sustituye launcher zrok temporal por agente zrok2 persistente.
# Ejecutar en la misma cuenta de Windows que habilito zrok2.
# IMPORTANTE: antes presionar CTRL+C en ventana del share zrok2 que esta abierta.
# No reinicia Blazor, Traccar, PostgreSQL, no borra el nombre reservado ni toca datos.
$ErrorActionPreference='Stop'
$Name='bitacorakmnc26'
$Port=5104
$Url="https://$Name.shares.zrok.io"
$Exe=Join-Path $env:LOCALAPPDATA 'NewCentury\Zrok\zrok2.exe'
$TaskName='BitacoraKM-HTTPS-Fijo'
if(!(Test-Path $Exe)){ throw 'No se encontro zrok2.exe instalado en esta cuenta.' }
$Task=Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$Health=Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 12
if(!$Health.ok -or !$Health.database){throw 'Blazor y PostgreSQL no responden en el puerto 5104.'}
Write-Host 'Configurando el agente zrok2 al iniciar sesion en Windows...'
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$Action=New-ScheduledTaskAction -Execute $Exe -Argument 'agent start' -WorkingDirectory (Split-Path $Exe)
Set-ScheduledTask -TaskName $TaskName -Action $Action | Out-Null
Start-ScheduledTask -TaskName $TaskName
$Ready=$false
for($i=0;$i -lt 12;$i++){
    Start-Sleep -Seconds 2
    & $Exe agent status *> $null
    if($LASTEXITCODE -eq 0){$Ready=$true;break}
}
if(!$Ready){throw 'El agente no inicio. Revisa la tarea BitacoraKM-HTTPS-Fijo.'}
Write-Host 'Agente zrok2 funcionando.' -ForegroundColor Green
Write-Host "Registrando el nombre reservado $Name en el agente..."
& $Exe share public "http://127.0.0.1:$Port" -n "public:$Name" --headless
if($LASTEXITCODE -ne 0){
    throw 'No se pudo publicar. Asegurate de cerrar con CTRL+C la ventana anterior de zrok2 share y vuelve a ejecutar este script.'
}
$HttpsOk=$false
for($i=0;$i -lt 12;$i++){
    Start-Sleep -Seconds 5
    try{
        $External=Invoke-RestMethod "$Url/api/health" -Headers @{'skip_zrok_interstitial'='true'} -TimeoutSec 10
        if($External.ok -eq $true -and $External.database -eq $true){$HttpsOk=$true;break}
    }catch{}
    Write-Host "Esperando HTTPS ($($i+1)/12)..."
}
if(!$HttpsOk){throw 'La reserva existe, pero HTTPS no respondio. No distribuyas la APK.'}
Write-Host "HTTPS FIJO Y AGENTE ACTIVOS: $Url" -ForegroundColor Green
Write-Host 'La tarea BitacoraKM-HTTPS-Fijo inicia el agente al iniciar sesion Windows.'
Write-Warning 'No borres el nombre reservado de zrok. Mantene la PC encendida y evita desactivar la cuenta.'
