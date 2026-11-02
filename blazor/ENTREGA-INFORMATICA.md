# Bitácora KM — entrega técnica de piloto (18-10-2026)

## Alcance
Esta entrega corresponde exclusivamente a la aplicación Bitácora KM y a su migración a infraestructura PostgreSQL autohospedada.

- Web: Blazor static SSR sobre ASP.NET Core 10 y motor local Node.js 24.
- Base de datos: PostgreSQL autohospedado; no conectar a Supabase ni Vercel.
- GPS: servicio Traccar instalado localmente, con cola durable PostgreSQL.
- OSRM: imagen autohospedada y calles Nicaragua; estimación solo de diagnóstico.
- Android: APK de **prueba** `ni.bitacorakm.app.prueba`; no instalar sobre la producción.
- Reportes: PDF/Excel, firmas y estado de aprobación. La tabla Bitácoras no muestra columna Acción ni acceso directo al mapa; la revisión autorizada sí.

## Resultados ya observados por el usuario
18-10-2026, usuario sintético BLOKON:
- Casa → Gasolinera: 2.590 km GPS; 2.0 km odómetro; 92/93 puntos útiles.
- Gasolinera → Casa: 2.740 km GPS; 3.0 km odómetro; 109/110 puntos útiles.
- Total GPS: 5.330 km, odómetro: 5.0 km. Las rutas de ida y regreso fueron **distintas**.
- OSRM produjo estimaciones *parciales* y no reemplazó las distancias.
- El mapa web recuperó sus teselas después de ajustar `Referrer-Policy`.

## Cambios de la versión optimizada de prueba
- El envío no espera 18 segundos para que Traccar termine de subir los puntos antes de enviar el comprobante; la app conserva colas locales, reintentos y confirma los GPS posteriormente.
- Alta precisión con lectura GPS cada 8 s (antes 5 s) y sin bloqueo de CPU permanente. Sigue utilizando servicio de ubicación Android en primer plano y fotos obligatorias al inicio/final.
- Los puntos de salida y llegada se solicitan explícitamente; los horarios son automáticos.
- Los kilómetros GPS calculados y los recorridos históricos **no se recalculan automáticamente** por OSRM. El resultado de calles parciales se rotula como diagnóstico no comparable.
- El cambio de frecuencia/batería es un ajuste preliminar, **pendiente de prueba física** con pantalla apagada y monitorización del calor/batería y cobertura.

## Requisitos en servidor oficial
1. Windows x64 con Node.js 24, PostgreSQL existente y puertos adecuados. El ejecutable de Blazor incluye su propio runtime .NET.
2. Traccar Server operativo con acceso local a HTTP 8082 y recepción GPS 5055. No mezclar datos con servidor de la PC personal.
3. OSRM con mapa Nicaragua y HTTP 127.0.0.1:5000; para el piloto el contenedor usa Docker Linux/WSL. Si cambia de equipo, debe transferirse el mapa procesado o reprocesarse.
4. HTTPS **estable**, accesible por teléfonos en datos móviles. El túnel aleatorio `.trycloudflare.com` es solo provisional: cambiará y no es solución de producción.
5. Configuración y secretos propios del servidor oficial. **No copiar** el `settings.json` ni contraseñas de la PC personal; inicializar la nueva instalación y usar procedimiento de migración validado.
6. Base PostgreSQL exclusiva de Bitácora KM, sin sobrescribir datos de otras instalaciones. Probar restauración de respaldo, reinicios, permisos, cola de recorridos y soporte fotográfico.
7. Para entregar la APK de producción es imprescindible URL HTTPS final y **firma de actualización de la APK productiva**. La APK de prueba tiene identificador aislado y no migra automáticamente los datos de la app productiva.

## Puesta en marcha
- Extraer el contenido de `Servidor`, ejecutar `Configurar-Bitacora.ps1` solo en instalación nueva y con la base nueva vacía.
- Para la PC de pruebas **conservar la configuración existente** en `%LOCALAPPDATA%\NewCentury\BitacoraKM`.
- Iniciar Blazor con `Start-Bitacora.ps1 -Port <puerto libre>`, garantizando que Traccar no ocupe ese puerto.
- Antes de la migración definitiva: copiar datos desde origen con el procedimiento `blazor/README.md`, cotejar soportes, usuarios y permisos, bloquear escrituras en origen para copia final.
- Mantener servicio de Traccar, su información histórica, PostgreSQL y OSRM respaldados; monitorear disco y rendimiento.

## Criterios para cerrar la aceptación
- Una prueba de viaje nuevo de >5 minutos, incluyendo pantalla apagada, conserva inicio/fin GPS, hora automática, fotos, cola y kilometraje.
- Comprobar los estados `queued`, `gps_pending` y `synced` y que el último confirme recepción real sin perder información offline.
- Medir tiempo de envío después del cambio y comparar temperatura/batería y cobertura con la versión anterior.
- Confirmar los accesos y aprobaciones en PC/celular, descargas Excel/PDF y visibilidad restringida del mapa.
- Contar con DNS/HTTPS definitivo antes de distribuir la APK final. 

## Límites de esta entrega
La compilación y pruebas de código no equivalen a validar el rendimiento térmico en un teléfono real ni a desplegar el servidor oficial. El servidor final, su HTTPS, sus credenciales y el cambio de infraestructura serán responsabilidad del departamento de Informática.
