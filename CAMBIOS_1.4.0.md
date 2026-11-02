# Bitácora KM 1.4.0

Corrección integral del registro de distancia GPS.

- El APK toma posiciones cada 5 segundos durante un recorrido activo.
- Se solicita un punto GPS inmediato al iniciar y otro justo antes de detener el recorrido.
- Una gestión no se publica al servidor hasta que la cola local de posiciones GPS haya terminado de enviarse.
- El servidor calcula y guarda una distancia GPS definitiva una sola vez cuando el teléfono confirma que no quedan posiciones pendientes.
- Abrir **Recorrido GPS** ya no vuelve a recalcular ni reemplazar una distancia ya finalizada.
- El mapa puede seguir consultando los puntos para mostrarlos, pero la cifra final guardada permanece estable.
- El cálculo usa la ruta filtrada para eliminar deriva y saltos. El resumen de Traccar solo se acepta cuando está dentro de una banda coherente respecto de la ruta filtrada; diferencias grandes se descartan.
- El detalle del recorrido muestra puntos recibidos, puntos útiles, descartados y cortes de señal para distinguir un GPS confiable de uno incompleto.
- La versión Android pasa a 1.4.0.
