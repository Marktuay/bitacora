# Bitácora KM 1.4.2

Corrección del estado **Guardada · pendiente de envío**.

- El botón **Sincronizar** ejecuta el envío inmediatamente; ya no se limita a programar WorkManager.
- Al abrir la aplicación se intenta enviar automáticamente cualquier gestión local pendiente.
- La gestión (datos y fotos) ya no queda bloqueada por una cola GPS que tarde en vaciarse.
- Si todavía hay posiciones GPS pendientes, la gestión llega al servidor con estado interno `gps_pending` y la distancia se finaliza después, cuando la cola GPS llega a cero.
- El usuario ve **Gestión recibida · GPS terminando** en lugar de una gestión invisible.
- Se agrega un endpoint móvil de finalización GPS que congela la distancia solo cuando corresponde.
- La actualización conserva los recorridos y fotos existentes en el teléfono.
