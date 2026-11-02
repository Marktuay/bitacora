# Bitácora KM · migración independiente a Blazor y PostgreSQL

Esta versión parte del código `901bbec2b78080d3a73f4e7cae7f10f853680c55`, del 17 de octubre de 2026. Se prepara aparte de la aplicación en uso para validar la migración de Bitácora KM.

## Qué se implementó

- Las 13 pantallas actuales se convierten en componentes Razor y se sirven con **Blazor static SSR / ASP.NET Core 10**. Se conservan su estructura HTML, CSS, menú y scripts de interacción.
- El motor existente de reglas, Excel/PDF y GPS se ejecuta como **servicio auxiliar Node.js 24 local**, iniciado y detenido por la aplicación .NET. Esta primera migración no es una reescritura integral de ese motor en C#.
- El motor usa **PostgreSQL directamente**, por medio de `pg`. No necesita Vercel, las API de Supabase, Supabase Auth ni Supabase Storage para funcionar.
- Se mantienen las 22 tablas reales de la base actual, sus campos, restricciones, índices, funciones y relaciones. Los usuarios se guardan localmente con su UUID, contraseña bcrypt y metadatos de permisos. Las sesiones se reemplazan por sesiones locales.
- Las fotografías y documentos se guardan en una carpeta privada del servidor; se abren mediante enlaces firmados que vencen en 15 minutos.
- La cola GPS durable pasa a PostgreSQL local. El enlace con Traccar utiliza las mismas reglas de reintento, confirmación y cálculo del código original. OSRM sigue siendo un dato de diagnóstico y no reemplaza el kilometraje histórico.

Se retuvieron los nombres `auth.users` y `auth.uid()` para mantener las relaciones y funciones SQL existentes. Aquí pertenecen a la base local: no implican una conexión a Supabase.

## Preparar el código

Requisitos de compilación: .NET SDK 10 y Node.js 24. PostgreSQL recomendado para destino: 17, igual a la versión mayor actual. No reinstalar el PostgreSQL que ya está en la PC; comprobar su versión el lunes.

Desde la raíz del repositorio:

```powershell
npm ci --prefix blazor/engine
node blazor/prepare.mjs
dotnet build blazor/Bitacora.Web
```

`prepare.mjs` toma las pantallas y el motor del repositorio y produce `EngineRuntime` y los componentes Razor. No modifica la aplicación original. Si cambia una sección crítica de la fuente, detiene la preparación para revisar la adaptación.

Para publicar Windows x64:

```powershell
.\blazor\Build-Windows.ps1
```

El resultado en `blazor/dist/BitacoraKM` incluye el runtime .NET. En el servidor se necesita Node.js 24, el PostgreSQL existente y Traccar. La aplicación web no tiene tarifas por colaborador ni dependencia de los servicios anteriores; el acceso a internet, dominio y la infraestructura se gestionan por separado.

## Instalación del lunes

1. Crear una **base nueva y vacía**, por ejemplo `bitacora_km_blazor`, en el PostgreSQL existente. No utilizar ninguna base existente ni sobrescribir instalaciones anteriores.
2. Ejecutar `Configurar-Bitacora.ps1` desde la carpeta publicada. Solicita los accesos sin mostrarlos y guarda la configuración en `%LOCALAPPDATA%\NewCentury\BitacoraKM` con permisos restringidos.
3. Copiar datos y archivos con `Engine/migrate.cjs copy`, definiendo en esa consola las variables `DATABASE_URL` (destino), `SOURCE_DATABASE_URL`, `SOURCE_API_URL`, `SOURCE_SERVICE_KEY` y `BITACORA_DATA_DIR`. No guardar claves en el repositorio, un chat ni los scripts. Borrarlas de la consola al terminar.
4. La copia usa una transacción de solo lectura en origen y una transacción en destino. Rechaza un destino con datos, conserva los UUID, coteja tipos y campos, verifica conteos y guarda SHA-256 de cada soporte. Ante un fallo revierte las filas de destino. Un archivo ya copiado solo se reutiliza si tiene exactamente el mismo contenido.
5. El archivo privado `migration-verification.json` registra conteos y verificación de soportes. No contiene contraseñas. Las sesiones de Supabase no se copian: los usuarios vuelven a ingresar con su correo y contraseña.
6. Ejecutar `Start-Bitacora.ps1`. La dirección de prueba en el servidor es `http://localhost:5080`.
   Después de validar el inicio manual, `Install-StartupTask.ps1` prepara el arranque al iniciar sesión en Windows, con tres reintentos ante fallos. No reemplaza las tareas existentes de Traccar.
7. Preparar la dirección **HTTPS definitiva** y el acceso desde la red y desde datos móviles. `Caddyfile` incluye la configuración del proxy, pero falta completar el nombre real y la conectividad del servidor. Una PC apagada no puede atender a teléfonos.
8. Configurar SMTP para conservar la recuperación por correo. No se manda ningún correo real durante la preparación; las pruebas usan un servidor SMTP simulado.
9. Para la puesta en servicio, hacer la copia final con las escrituras de la versión anterior detenidas, cotejar datos y fotos, y después cambiar el acceso. Una copia realizada mientras siguen entrando registros no incluye las escrituras posteriores a su instantánea.

La copia no cambia la configuración de Traccar ni transfiere sus posiciones históricas a otro servidor: debe seguir usando el mismo Traccar y su base. Los campos GPS ya guardados en las bitácoras sí se copian.

## Teléfonos y APK

La web Blazor funciona en el navegador de PC y teléfono. El navegador no sustituye las capacidades Android para GPS en segundo plano y recorridos sin conexión.

El APK actual tiene `https://bitacora-km.vercel.app` fijado en su código. Para dejar Vercel completamente, necesita una actualización con la nueva dirección. Preparación, una vez definida la URL HTTPS:

```powershell
node blazor/prepare-android.mjs https://DIRECCION-REAL-DEL-SERVIDOR
```

El script produce una copia Android en `blazor/AndroidRuntime`, conserva `applicationId`, configuración y archivos locales, y cambia la dirección del servidor. No genera ni firma un APK todavía. Compilar con **la misma firma del APK instalado** y validar la actualización en un teléfono de prueba. No desinstalar la aplicación ni borrar sus datos. Confirmar la sincronización de los recorridos pendientes antes del cambio definitivo.

## Verificación

La suite nueva comprueba la estructura y funciones SQL con un motor PostgreSQL compilado a WASM (PGlite), el acceso HTTP a través de la aplicación Blazor real, la transferencia de datos y soportes, los permisos, reportes y flujo GPS con un Traccar de prueba. No es una prueba en el PostgreSQL Windows ni una medición física con un teléfono.

```powershell
node --test blazor/engine/tests/*.test.cjs
node blazor/engine/tests/end-to-end.cjs
```

La segunda orden requiere haber preparado y compilado la aplicación. Usa `dotnet` del PATH o `BITACORA_DOTNET`. La prueba visual usa Playwright cuando se define `BITACORA_PLAYWRIGHT` con la ruta de ese paquete y existe Chromium.

Los datos de prueba son sintéticos. Las pruebas no insertan registros en la base de producción. Ver `VERIFICACION.md` para los resultados y límites concretos.

## Respaldo

`Backup-Bitacora.ps1 -Destination RUTA` crea un `pg_dump` y copia configuración, clave de sesiones y soportes privados. La carpeta de respaldo contiene información confidencial y debe quedar con acceso restringido. Para un respaldo coordinado, detener escrituras mientras se ejecuta. La restauración debe probarse en una base separada antes de depender del respaldo.
