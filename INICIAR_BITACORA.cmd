@echo off
setlocal
title Bitacora KM - Servidor local
cd /d "%~dp0"
set "BKM_HOME=%~dp0"
if exist "%BKM_HOME%runtime\node.exe" goto iniciar
echo Primera ejecucion: descargando Node.js desde su sitio oficial.
echo La descarga se verifica antes de usarla. No cierre esta ventana.
powershell.exe -NoProfile -Command "$ErrorActionPreference='Stop'; $zip=Join-Path $env:BKM_HOME 'node-runtime.zip'; $tmp=Join-Path $env:BKM_HOME 'node-runtime-temp'; $runtime=Join-Path $env:BKM_HOME 'runtime'; Invoke-WebRequest -UseBasicParsing -Uri 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip' -OutFile $zip; if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLower() -ne '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541') { throw 'La descarga no coincide con el SHA-256 oficial.' }; Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force; New-Item -ItemType Directory -Path $runtime -Force | Out-Null; Copy-Item -LiteralPath (Join-Path $tmp 'node-v24.21.0-win-x64\node.exe') -Destination $runtime; Copy-Item -LiteralPath (Join-Path $tmp 'node-v24.21.0-win-x64\LICENSE') -Destination $runtime; Remove-Item -LiteralPath $zip; Remove-Item -LiteralPath $tmp -Recurse"
if errorlevel 1 goto error
:iniciar
"%BKM_HOME%runtime\node.exe" "%BKM_HOME%scripts\windows-launcher.mjs"
if errorlevel 1 goto error
goto fin
:error
echo.
echo No se pudo iniciar. Conserve el mensaje de esta ventana para revisarlo.
echo Si Windows o la empresa bloquean la ejecucion, consulte con Informatica.
pause
:fin
endlocal
