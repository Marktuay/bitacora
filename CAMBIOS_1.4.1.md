# Bitácora KM 1.4.1

Corrección de subestimación cuando el teléfono conserva el recorrido pero reporta precisión GPS degradada.

- Mantiene el filtro estricto de 50 m para recorridos normales.
- Si menos del 60 % de los puntos supera ese filtro, activa una recuperación controlada de hasta 200 m de precisión.
- La recuperación sigue rechazando saltos que implican velocidades superiores a 160 km/h y aplica un umbral de ruido proporcional a la precisión.
- El resumen de Traccar solo se acepta si permanece dentro de una banda coherente respecto de la ruta robusta.
- Se exponen métricas de distancia estricta, distancia recuperada y cantidad de puntos para diagnóstico.
- Las distancias ya finalizadas permanecen congeladas; esta versión no altera registros históricos automáticamente.
- Android continúa capturando cada 5 segundos y la versión pasa a 1.4.1.
