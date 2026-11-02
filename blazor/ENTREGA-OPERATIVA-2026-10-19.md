# Bitácora KM — entrega operativa 2.0.3 (19/10/2026)

## Equipo que presta el servicio mientras Informática migra
- PC de trabajo: C:\NewCentury\BitacoraKM-Piloto\Servidor
- Blazor / ASP.NET Core 10: http://127.0.0.1:5104
- Node.js 24: motor interno de API, reportes y GPS
- PostgreSQL local: base bitacora_km_blazor (no tocar bases de otros proyectos)
- Traccar local: 8082 (HTTP) / 5055 (recepción)
- Fotos y configuración privada: %LOCALAPPDATA%\NewCentury\BitacoraKM

## APK y actualización
- **Bitacora-KM-PostgreSQL-Operacion-v2.0.3.apk:** firma y aplicación compatibles con la APK 1.4.11. Actualiza en el mismo teléfono sin desinstalar. Requiere sincronizar primero los recorridos y puntos GPS pendientes.
- **Bitacora-KM-PostgreSQL-Prueba-v2.0.3.apk:** identificador separado `.prueba`, para ensayos sin reemplazar la APK que utilizan los demás.
- La dirección HTTPS se guarda en el propio teléfono y puede modificarse sin recompilar. El panel técnico queda oculto después de iniciar sesión para los colaboradores. **En teléfonos nuevos, mientras no exista una dirección estable preconfigurada, se necesita configurar el servidor una primera vez.**
- Instalar la nueva APK **no migra ni modifica** la base Supabase. No distribuir hasta el cambio controlado.
- El cambio de infraestructura posterior a Informática puede requerir reconfigurar la URL en dispositivos; no obliga a reescribir el GPS o los reportes.

## Preparación de la PC
1. Mantener PostgreSQL 18, Traccar, Node.js y Blazor instalados. No repetir migración ni inicialización.
2. Extraer `Preparar-PC-Servidor.ps1` del paquete de entrega, abrir PowerShell como Administrador y ejecutar:
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Preparar-PC-Servidor.ps1"`
3. El script **no cierra ni reinicia Blazor actualmente activo**; programa arranque de Blazor en puerto 5104 al próximo inicio de sesión Windows y crea un respaldo privado en `C:\NewCentury\Respaldos-BitacoraKM`.
4. Conservar una **segunda copia protegida fuera de la PC/disco** y probar su restauración. El respaldo contiene archivos privados, contraseñas de configuración y fotografías: solo responsables autorizados.
5. La tarea de Blazor se dispara **al iniciar sesión**, no antes del inicio de Windows. Se debe conservar la PC encendida y conectada a Internet.

## Acceso HTTPS: límite que impide distribución definitiva
- La dirección actual `.trycloudflare.com` pertenece a un **Cloudflare Quick Tunnel temporal** sin garantía de disponibilidad, que puede cambiar tras reiniciar la PC, el proceso o el túnel.
- Se necesita **un endpoint HTTPS estable bajo control de la empresa o de un proveedor reservado** para instalar a todos los colaboradores sin volver a configurar la URL. Cloudflare Quick Tunnel no cumple esto por sí solo.
- No se exponen PostgreSQL (5432), Traccar (5055/8082) ni el puerto interno Blazor a Internet; solo el acceso web mediante un proxy/túnel con HTTPS y autenticación.

## Integridad de los datos en el corte final
- La copia realizada el 19/10/2026 fue exitosa: 22 tablas, 16 cuentas, 459 soportes y 188124 filas en el instante de lectura. **No hay sincronización incremental** desde Supabase.
- Los nuevos registros posteriores a la copia siguen en Supabase. Antes de distribuir, hay que fijar un momento de corte, comprobar colas móviles GPS pendientes = 0, detener escrituras en origen y hacer una **nueva migración completa a una base de destino NUEVA y VACÍA**, sin borrar la copia ya probada.
- Verificar conteos, fechas, roles, gestiones, kilómetros y soportes contra el origen congelado; actualizar el destino de Blazor solo tras la aceptación.
- No permitir escrituras simultáneas en la base anterior y la nueva. Mantener la instalación anterior como respaldo de lectura.
- El historial original de posiciones del servidor Traccar no se reconstruye automáticamente a partir de la copia PostgreSQL; conservar Traccar y su base por separado.

## Criterio de entrega
La APK se compila y verifica en GitHub (tests Android, firma compatible e identidad del APK; compilación de operación no depurable). La conexión y autenticación de la 2.0.2 anterior con el equipo Windows ya se observaron; la versión 2.0.3 y el envío de un nuevo recorrido desde esa compilación no se han probado físicamente.

Para operar con todos los colaboradores restan: HTTPS fijo, corte íntegro de datos, confirmación de sincronización y aceptación por Informática/Auditoría. No declarar "producción terminada" hasta completar estos puntos.
