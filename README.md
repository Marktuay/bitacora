# Bitácora KM 1.4.6 · New Century

Actualización de la aplicación existente de BLOKON, CONASER y NEW CENTURY SECURITY. Conserva catálogos, registros, fotos y colas locales.

## Conexión desde cualquier red

El teléfono usa https://bitacora-km.vercel.app. No necesita estar en la red de la oficina, una IP pública ni acceso al dominio empresarial. La PC con Traccar abre una conexión saliente hacia una cola privada de Supabase y atiende las solicitudes. Traccar sigue almacenando las posiciones y calculando los kilómetros.

Supabase mantiene usuarios, catálogos, bitácoras y archivos. Las dos tablas nuevas del enlace no admiten acceso desde clientes anónimos ni usuarios autenticados: solamente el servidor. Las coordenadas pendientes se retiran de la cola después de que Traccar confirma la recepción. Si la PC está apagada o falla internet, el teléfono conserva los puntos para reintento y la API devuelve 503, sin confirmar una entrega inexistente.

## Servidor Windows

Aplicar una sola vez `supabase/traccar-relay.sql`. Ejecutar `deployment/traccar-relay-worker.cjs` con Node 24 y `--settings <archivo JSON privado>`. El archivo contiene SUPABASE_URL, SUPABASE_SECRET_KEY, TRACCAR_USER y TRACCAR_PASSWORD; los endpoints locales predeterminados son 127.0.0.1:8082 y 127.0.0.1:5055. No guardar credenciales en este repositorio ni en el APK.

En Vercel dejar vacías TRACCAR_BASE_URL y TRACCAR_INGEST_URL para usar el enlace saliente. BITACORA_GPS_PROVIDER predetermina traccar. La variable antigua GPS_PROVIDER se ignora para evitar que una configuración anterior vuelva a usar Supabase para calcular recorridos. El puente `deployment/traccar-gateway.cjs` es una alternativa opcional para instalaciones con acceso HTTPS directo.

La PC con Traccar debe permanecer encendida y conectada. El enlace vuelve a intentarlo tras cortes de internet.

La validación automática por calles con OpenStreetMap/OSRM se prepara en la misma PC, sin cuotas por consultas. El modo validado incorpora ajustes completos y confiables al cálculo GPS de recorridos nuevos; conserva las posiciones originales, la medición antes del ajuste y los kilómetros históricos guardados. Ver [instalación y activación local](deployment/osrm/README.md). Está desactivado hasta instalar OSRM y configurar el enlace local.

## Android y acceso

El teléfono inicia sesión con correo y contraseña antes de elegir colaborador y vehículo, sin código de activación. Cada cuenta ve sus asignaciones autorizadas. Se bloquea cambiar de colaborador con un recorrido activo, gestiones o posiciones pendientes.

El APK principal 1.4.5 usa el identificador ni.bitacorakm.app y la misma firma del piloto 1.4.4; permite actualizarlo conservando su almacenamiento. El APK de verificación usa ni.bitacorakm.app.prueba para pruebas separadas. Si Android rechaza la firma de una instalación anterior distinta, no desinstalarla: revisar primero la firma y las gestiones pendientes.

## Verificación

90 pruebas automatizadas; compilación web; compilación y análisis Android en GitHub Actions. El complemento OSRM se verifica con respuestas simuladas y un servicio OSRM real en CI: separación de cortes, rechazo de ajustes dudosos, caída del servicio y conservación de la distancia GPS. Su instalación real en la PC y la prueba física desde datos móviles con pantalla apagada quedan pendientes de validar en esos equipos.

## Desarrollo

Node 24; `npm ci`, `npm test`, `npm run build`. Variables privadas según `.env.example`. Android: `./gradlew :app:assembleDebug :app:lintDebug :app:assembleVerification :app:lintVerification`. Definir BITACORA_PILOT_KEYSTORE con una ruta privada si se dispone de la firma original. No incluir keystores en Git.

## Descarga individual 1.3.5

El botón Descargar mi bitácora en Android permite elegir Excel/PDF, mes y corte o fechas desde/hasta. Utiliza la sesión y el colaborador asignado al teléfono. Incluye únicamente las gestiones sincronizadas y abre el selector de almacenamiento de Android. Ver CAMBIOS_1.3.5.md.
