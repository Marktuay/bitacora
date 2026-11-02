# Bitácora KM 1.4.3 — precisión y trazabilidad GPS

La ruta filtrada de Traccar era reemplazada por su resumen bruto cuando ambos quedaban dentro de un margen amplio. Eso volvía a sumar ruido ya descartado. Ahora los recorridos con cobertura precisa usan la distancia de los puntos filtrados. La recuperación por precisión degradada se conserva dentro de sus validaciones y se identifica como dato por revisar.

- Orden determinista y eliminación de posiciones duplicadas por hora del fix, conservando la más precisa.
- Dos puntos separados por un corte largo no generan una distancia medida a partir del resumen bruto.
- Diagnóstico visible del inicio/final sin señal, separación entre puntos, distancia filtrada y resumen bruto.
- Android conserva todos los puntos que recibe en un lote, no solamente el último; mantiene captura cada cinco segundos.
- Los puntos solicitados al iniciar y cerrar usan la misma cola persistente de Traccar para reintentar sin internet.
- El inicio requiere un fix reciente y preciso. Si el cierre no consigue un fix adecuado, conserva la gestión y avisa. El formulario muestra precisión y antigüedad del último punto durante el recorrido.
- Odómetro independiente del cálculo GPS; los valores guardados siguen estables al abrir el mapa.

Validación: 61 pruebas web y compilación. Reproducción de siete recorridos reales: Andrew Oficina Bolonia → Bodega CED arroja 17.712 km filtrados frente a 18.578 km brutos. Alejandro: un recorrido no contiene puntos; los puntos existentes no permiten garantizar la distancia que falta. Los 34.73 y 57.73 km previamente confirmados por Julio se conservan guardados; no se aplica recálculo masivo del historial.

La precisión física y continuidad con pantalla apagada requieren una prueba en los teléfonos con el APK actualizado. Esta versión no calibra GPS contra el odómetro ni inventa coordenadas ausentes.
