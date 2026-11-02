# Ajuste gratuito por calles · Bitácora KM

OpenStreetMap y OSRM permiten comparar el recorrido GPS con las calles de Nicaragua sin una clave de Google ni cobros por consultas. OSRM debe ejecutarse en la misma PC que el enlace Traccar. Se descargan los mapas públicos; las coordenadas de los colaboradores se procesan localmente. No se utiliza el servidor público de demostración.

La distancia por calles es **una estimación calculada a partir de los puntos registrados**. Con el modo validado de la versión 1.4.6, se incorpora automáticamente al cálculo GPS de los recorridos nuevos únicamente cuando el ajuste es completo y confiable. El mapa conserva la medición anterior al ajuste y muestra las calles en verde. Los valores históricos finalizados se conservan hasta un recálculo explícito del revisor. No recupera posiciones que el teléfono dejó de registrar. Traccar sigue capturando y almacenando el GPS.

## Preparación en la PC Windows

1. Descargar y extraer el código 1.4.6 desde el repositorio. Detener únicamente el enlace de Bitácora KM, conservando Traccar encendido. Desde la carpeta nueva ejecutar `node deployment/osrm/update-server.cjs --project "C:\ruta\bitacora-km" --settings "C:\ruta\bitacora-km\private\local-server.json"`, usando las rutas reales del servidor existente. Este comando respalda y reemplaza solo los archivos del enlace; conserva credenciales, datos y Traccar. La actualización web por sí sola no actualiza el programa de la PC.
2. Usar Ubuntu en WSL2 con Docker Engine y el complemento Compose. No hace falta Docker Desktop. Si no están instalados, seguir las guías oficiales de [WSL](https://learn.microsoft.com/windows/wsl/install) y [Docker Engine para Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Informática puede hacer esta preparación. La PC necesita espacio y memoria para procesar el mapa; el script comprueba que Docker esté disponible antes de descargarlo.
3. Desde Ubuntu/WSL2, ubicarse en la carpeta del proyecto y ejecutar:

   ```bash
   bash deployment/osrm/prepare.sh
   ```

   La descarga y preparación inicial pueden tardar varios minutos. El script no instala dependencias, no modifica Traccar ni toca su base de datos. OSRM se publica únicamente en `127.0.0.1:5000` dentro del entorno donde corre Docker. No abrir ese puerto en el router o firewall. En Windows, WSL2 normalmente permite acceder al servidor por localhost; el siguiente paso lo comprueba antes de activar nada.

4. Desde Windows, con Node 24, ejecutar:

   ```powershell
   node deployment/osrm/activate.cjs --settings private/local-server.json
   ```

   Si el enlace usa otro archivo privado, indicar su ruta. Esta comprobación no envía coordenadas: consulta la raíz del servicio local. Solo después de comprobar OSRM agrega `OSRM_URL` y `OSRM_DISTANCE_MODE=validated` al archivo existente y crea una copia de respaldo privada, sin imprimir claves. Reiniciar el enlace Traccar.

5. Abrir un recorrido reciente con puntos cada 30 segundos o menos. La página mostrará «GPS validado por calles», medición antes del ajuste y una línea verde si el ajuste completo supera los controles. Si el GPS ya estaba finalizado, se conserva hasta que el revisor elija Recalcular GPS final. Si falta señal o el ajuste es ambiguo, se conserva la ruta GPS y no se inventa una ruta.

## Operación

El contenedor reinicia con Docker, pero Docker/WSL2 también debe estar iniciado después de reiniciar Windows. Verificar esto antes de usarlo en producción. Para iniciar nuevamente:

```bash
docker compose -f deployment/osrm/compose.yaml up -d
```

Para mantener solo la comparación visual, cambiar `OSRM_DISTANCE_MODE` a `estimate`. Para desactivar el complemento, retirar `OSRM_URL` del archivo privado y reiniciar el enlace; luego `docker compose -f deployment/osrm/compose.yaml stop`. El mapa preparado queda disponible para volver a activarlo. Para actualizar mapas, detener el servicio, respaldar la carpeta `data` y preparar una carpeta nueva antes de sustituirla.

Se requieren al menos tres observaciones continuas por tramo, precisión declarada de hasta 50 m, intervalos de hasta 30 s, velocidad plausible, confianza OSRM de al menos 0.8 para mostrar la estimación y 0.9 para incorporarla al cálculo y desplazamiento al ajustar dentro de un margen controlado. Los cortes de cobertura se separan antes de consultar OSRM. La confianza es un filtro del modelo, no una garantía de exactitud. Ajustes parciales se identifican como parciales. Si el servicio tarda o falla, el GPS continúa funcionando.

Los mapas pueden omitir caminos privados, accesos y cambios recientes. Validar varios viajes conocidos y comprobar la captura con pantalla apagada antes de usar el resultado ajustado para decisiones de pago. El APK 1.4.5 continúa siendo compatible; este complemento se instala en el servidor.

Fuentes: [OSRM y servicio Match](https://github.com/Project-OSRM/osrm-backend), [imagen fijada 26.4.1](https://github.com/project-osrm/osrm-backend/pkgs/container/osrm-backend/805730432?tag=26.4.1-debian), [mapa Nicaragua](https://download.geofabrik.de/central-america/nicaragua.html). Datos © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). El software y mapas no cobran por consultas; la operación usa los recursos de la PC existente.
