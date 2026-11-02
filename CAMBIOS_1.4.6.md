# Bitácora KM 1.4.6

Traccar sigue capturando y almacenando los puntos. OpenStreetMap/OSRM agrega validación automática de las calles y mejora el cálculo de distancia en recorridos completos y confiables, conservando las posiciones y la medición anterior al ajuste para revisión en el mapa.

- El enlace local permite activar `OSRM_DISTANCE_MODE=validated`. La API usa la distancia ajustada solamente para un resultado completo, confianza mínima 0.9, cobertura GPS continua y distancia coherente con la traza. Los ajustes parciales, ambiguos o fuera de margen no reemplazan la medición GPS.
- La comparación automática al filtrar utiliza el mismo cálculo que la finalización del APK. Abrir el mapa conserva el valor histórico; recalcularlo requiere una acción de revisión explícita.
- La confirmación de cola GPS se guarda en `km_mobile_trips.gps_flushed`. Un teléfono con puntos pendientes no finaliza por el simple vencimiento del temporizador de 90 segundos. Los clientes históricos mantienen la compatibilidad.
- La finalización móvil no sobrescribe una finalización simultánea de auditoría o web.
- El mapa muestra la medición original, el ajuste aceptado y los cortes de cobertura. No se reconstruyen kilómetros sin puntos para igualar el odómetro.
- El APK 1.4.5 continúa siendo compatible; esta actualización cambia la web y el servidor local.

Antes de publicar la web aplicar `supabase/gps-sync-confirmation.sql`. La activación en la PC requiere actualizar el enlace, preparar OSRM e iniciar el servicio local. `deployment/osrm/update-server.cjs` copia únicamente los archivos necesarios y respalda los anteriores; conserva credenciales y datos.

Validación: 90 pruebas locales y comprobaciones de navegador para jefe y colaborador. GitHub Actions ejecuta también un servicio OSRM real con una calle sintética. La precisión en calles de Nicaragua y la operación con pantalla apagada se validan con recorridos físicos después de activar la PC.
