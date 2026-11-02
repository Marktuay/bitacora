# Correcciones 1.3.4

- Traccar vuelve a suministrar las rutas y la distancia mediante sus informes route y summary.
- El enlace saliente permite acceso desde cualquier red sin IP pública, DNS de la empresa ni puertos entrantes.
- La cola temporal es privada y retira las coordenadas después de la confirmación de Traccar. Los errores conservan la cola local del teléfono.
- Se conservan los identificadores existentes, rutas históricas y horarios que cruzan medianoche.
- Los datos insuficientes y las caídas del servidor no sobrescriben la distancia guardada con cero.
- Sesión y permisos se verifican antes de consultar coordenadas. Solo Auditoría puede actualizar la comparación GPS/odómetro.
- Primera instalación: correo, contraseña y selección de colaborador/vehículo; sin código de activación.
- Se ignora la conexión GPS antigua guardada en el teléfono sin borrar ubicaciones pendientes.
- Se conserva Detener GPS dentro del recorrido activo, se retiran controles nativos obsoletos y se corrigen los dos errores de compilación Android.
- Se proporciona un APK de prueba independiente para no afectar la instalación anterior mientras falta su firma original.

## Comprobación

27 pruebas automatizadas. Recorrido real en lectura directa y por enlace saliente: 66 posiciones, 3.607 km y 942.949 segundos. El registro anterior conserva 3.61 km y 4 km de odómetro; no se alteró.

## Prueba en teléfono

Instalar Bitácora KM · Prueba junto a la aplicación anterior, iniciar sesión, asignar colaborador y vehículo, autorizar ubicación y probar un recorrido corto desde datos móviles. Finalizar con fotos y verificar sincronización, mapa, Excel y PDF. Mantener la PC con Traccar encendida y conectada. No borrar datos de la aplicación anterior. La actualización sobre la instalación original requiere recuperar su firma.
