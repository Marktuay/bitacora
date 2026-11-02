# Bitácora KM 1.3.9

Corrección del cálculo de distancia GPS en Auditoría.

- El kilometraje validado deja de tomar directamente `distance` del reporte resumen de Traccar.
- La distancia se recalcula a partir de las posiciones del mismo recorrido que alimentan el mapa.
- Se descartan posiciones con precisión superior a 50 m, saltos que implican más de 160 km/h, marcas de tiempo repetidas o fuera de orden y tramos con vacíos de señal mayores de 120 s.
- Se aplica un umbral de 5 a 25 m según la precisión reportada para evitar sumar deriva GPS cuando el teléfono está detenido.
- Se conserva `summary_distance_km` como dato de diagnóstico, pero no se usa como distancia definitiva en Auditoría.
- Al volver a pulsar **Recorrido GPS** sobre un registro histórico, el panel recalcula y reemplaza `km_traccar` y `difference_km` sin alterar el odómetro capturado.
