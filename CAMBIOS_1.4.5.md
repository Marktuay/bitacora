# Bitácora KM 1.4.5

- Mantiene el servicio GPS en primer plano aunque Android tenga desactivada la visualización de notificaciones. Evita degradar el rastreo a un servicio ordinario en segundo plano.
- Crea el canal de notificación al recrear el servicio, incluido el reinicio automático.
- El mapa identifica las mediciones incompletas y muestra los cortes de cobertura separados de la ruta registrada. Indica duración y separación recta entre los extremos, sin sumarlos como distancia medida.
- Recupera únicamente cortes locales con al menos dos puntos intermedios, extremos precisos, continuidad temporal y geometría coherente. Conserva la advertencia de precisión degradada y no añade tramos sin lecturas.
- Al filtrar, completa automáticamente el GPS faltante y actualiza comparación y totales. Si un recorrido recién recibido todavía está sincronizando, espera y vuelve a consultar sin exigir otro clic. El mapa es un enlace de consulta. Los valores ya finalizados se conservan; las escrituras automáticas respetan colaborador/empresa y no pisan una finalización simultánea.
- Conserva Traccar como motor, los registros, los valores históricos, los permisos y la tabla común de revisión e impresión.
- No agrega kilómetros para igualar el odómetro ni reconstruye calles con la descripción del recorrido.

Validación: 77 pruebas aprobadas, compilación web y pruebas de cobertura y reproducción de la nueva prueba con los puntos originales. Se requiere un recorrido físico para comprobar el comportamiento con pantalla apagada en cada teléfono.
