# Verificación de la migración · 17/10/2026

Referencia: código `901bbec2b78080d3a73f4e7cae7f10f853680c55` y estructura real de la base obtenida en modo de solo lectura. No se modificó producción ni se usaron recorridos reales como registros de prueba.

## Resultado comprobado en este entorno

| Verificación | Resultado | Evidencia |
| --- | --- | --- |
| Compilación ASP.NET Core / Blazor .NET 10 | Correcta, 0 advertencias y 0 errores | `dotnet build blazor/Bitacora.Web` |
| Publicación Windows x64 autocontenida | Compilada | `dotnet publish ... -r win-x64 --self-contained true` |
| Tablas y campos PostgreSQL | 22 tablas originales y todos sus campos | Suite `adapter.test.cjs` |
| Funciones, filtros, parámetros, permisos y sesiones | 10 pruebas aprobadas | Suite `adapter.test.cjs` |
| Copia de datos, usuarios, contraseñas y soportes | 2 pruebas aprobadas, incluidas comparación completa de filas y reversión | Suite `migration.test.cjs` |
| Flujos HTTP completos mediante Blazor | 10 grupos aprobados | Suite `end-to-end.cjs` |
| Navegador en PC y celular | 1 grupo aprobado con Chromium real, 1440×1000 y 390×844 | Suite `end-to-end.cjs` |

**Total de la suite nueva: 12 pruebas de base/migración y 11 grupos de flujo completo aprobados.** Las comprobaciones SQL usan PostgreSQL mediante PGlite/WASM, sin simular las consultas ni sus restricciones. La conexión `pg` a un servidor PostgreSQL Windows todavía no se ha probado.

Los flujos cubiertos fueron:

1. Ingreso con contraseña, rechazo de contraseña incorrecta, sesión del administrador sin elegir colaborador, protección contra solicitudes de otro sitio y cierre/invalidez de sesiones.
2. Las 13 pantallas Razor y sus rutas de acceso anteriores.
3. Catálogos, fotos inicial/final, guardado y cálculo del odómetro, rechazo de kilómetros negativos y aprobación en las cuatro empresas.
4. Restricción de jefes por empresa y área, colaboradores por asignación y rechazo de accesos a otro empleado.
5. Descargas Excel y PDF. Los tres roles obtienen las mismas celdas Excel; se verifican las 12 columnas, vehículo completo, observaciones, totales, colaborador y nombre del jefe. También se extrajo texto del PDF de prueba para comprobar identificación y firmas.
6. Rendición del vale con su número y fecha documental, conservando la fórmula y el período de recorridos.
7. Inscripción móvil y reintentos sin duplicar la asignación ni el token.
8. Cola PostgreSQL, entrega a un Traccar de prueba, envío móvil repetido sin duplicar recorridos, confirmación GPS, segmentos de mapa y permisos sobre el recorrido.
9. Alta de un colaborador con vehículo y cuenta; repetición del alta sin duplicados; consulta restringida de permisos de jefes.
10. Correo de recuperación mediante un servidor SMTP de prueba, enlace de un solo uso, cambio de contraseña e invalidación de sesiones anteriores.
11. Ingreso desde navegador, menú lateral, reporte, panel de aprobación y vista móvil sin desbordamiento de los filtros. Se corrigió únicamente ese desbordamiento en una hoja de estilo adicional.

## Situación de las pruebas originales

En la primera referencia se ejecutaron 135 pruebas: 133 aprobaron y dos tenían expectativas desactualizadas. Mientras se preparaba esta migración, el repositorio recibió correcciones hasta `901bbec2b78080d3a73f4e7cae7f10f853680c55`. Se incorporaron esas actualizaciones, incluido el APK 1.4.11 y la eliminación de textos de rendimiento. **Las 137 pruebas de la referencia actualizada aprobaron.**

- `tests/report-comparison.test.cjs`: esperaba `printTitlesRow = '7:7'`, pero el generador actual no establece esa propiedad.
- `tests/road-match-api.test.cjs`: esperaba la diferencia GPS `-0.77`, pero el código actual guarda `-0.772`.

La propia referencia actualizada corrigió esas dos expectativas: no repetir encabezados de tabla en páginas finales de rendición/firmas y respetar la precisión GPS de tres decimales que ya se guardaba. No se cambió la fórmula ni el generador para hacer pasar esas pruebas.

## Pendiente del lunes

No se declara todavía equivalencia total en producción. Faltan estas comprobaciones en el equipo real:

- Verificar la versión del PostgreSQL instalado, crear la base dedicada y ejecutar la conexión `pg` y la copia final de registros/soportes.
- Cotejar conteos, UUID, fotografías, jefes y permisos con la base real; verificar nombres y firmas reales.
- Validar el arranque y respaldo/restauración en Windows. Se compiló un ejecutable Windows, pero no se ejecutó aquí en Windows.
- Configurar HTTPS y comprobar acceso desde PC, red local y datos móviles.
- Probar Traccar existente y un recorrido físico, incluida pantalla apagada, pérdida de señal, envío posterior y preservación del histórico.
- Configurar el SMTP real.
- Generar y firmar el APK con la nueva dirección. Su preparación de fuente se comprobó, pero no se compiló ni instaló un APK nuevo. El APK anterior tiene la dirección de Vercel fijada en el código.

La arquitectura entregada es **Blazor con motor auxiliar Node.js local y PostgreSQL directo**. No es una reescritura integral del motor en C#. Se conserva ese motor para reducir diferencias en reportes, GPS y reglas durante el cambio de infraestructura.
