# Continuar Bitácora KM desde chat normal

Última actualización: 17/10/2026, hora de Nicaragua.

## Objetivo y situación del usuario

Jorge Mayorga quiere conservar el diseño, estructura y funciones de su Bitácora KM y dejar la dependencia de Vercel y Supabase. La PC servidor, donde ya existe PostgreSQL y Traccar, estará apagada hasta el lunes 19/10/2026. Quiere empezar a probar en su PC personal y continuar con instrucciones paso a paso en el chat normal. Todavía no ha confirmado qué tiene instalado en esa PC.

El sistema de taller es un proyecto independiente. No mezclarlos.

## Dónde está guardado el trabajo

- Repositorio privado: https://github.com/jorgemayorga4-lgtm/bitacora-km
- Rama de migración: migration/blazor-postgresql-2026-10-17
- PR de borrador: https://github.com/jorgemayorga4-lgtm/bitacora-km/pull/35
- Commit de implementación antes de este punto de continuidad: 5cf35d4938ad20238588be30f4d1107134dec483
- Fuente original incorporada hasta: 901bbec2b78080d3a73f4e7cae7f10f853680c55, incluido APK 1.4.11.
- Instrucciones: blazor/README.md
- Evidencia y límites de pruebas: blazor/VERIFICACION.md

El PR sigue separado de main y no se ha instalado la migración en producción.

## Qué se preparó

1. Las 13 pantallas actuales se sirven con Blazor static SSR / ASP.NET Core 10.
2. Se conserva el motor de reglas, reportes y GPS como servicio auxiliar Node.js 24 local. NO es una reescritura integral en C#.
3. PostgreSQL se consulta directamente mediante pg. La operación de esta copia no depende de las API de Supabase.
4. Se obtuvo la estructura real de 22 tablas, restricciones, índices y funciones SQL en modo de solo lectura.
5. Autenticación local que conserva UUID, contraseñas bcrypt y metadatos de permisos al migrar; las sesiones antiguas no se copian.
6. Fotos y documentos privados en disco, con enlaces temporales firmados.
7. Cola GPS durable en PostgreSQL y enlace local con Traccar, preservando las reglas de cálculo y reintentos.
8. Scripts para preparar la aplicación, configuración Windows, arranque, tarea al iniciar sesión, respaldo y copia de datos.
9. Preparación de fuente Android para la nueva dirección HTTPS, sin borrar sus datos.
10. Corrección adicional de desbordamiento de filtros en celular.

Se compiló un ejecutable Windows x64 autocontenido en el entorno de trabajo. NO hay un instalador binario descargable publicado en el PR. El código y las instrucciones están guardados de forma persistente en GitHub; no asumir que los archivos temporales de este entorno seguirán disponibles al cambiar de chat.

## Pruebas realizadas

- 137/137 pruebas del código original actualizado.
- 12/12 pruebas nuevas de base y migración.
- 11/11 grupos de flujo completo a través de Blazor, incluidos navegador PC/celular, permisos, recorridos, fotos, aprobaciones, reportes, vales y recuperación por correo.
- Compilación Blazor sin errores ni advertencias y publicación Windows x64.
- PostgreSQL probado mediante PGlite/WASM, no mediante el servidor PostgreSQL Windows del usuario.
- Traccar y SMTP simulados para las pruebas; no se enviaron correos reales ni se insertaron registros de prueba en producción.
- Se compararon las celdas Excel de administrador, jefe y colaborador; se comprobó texto e identificación en PDF.
- La compilación Windows no se ejecutó en Windows en este entorno.

## Punto exacto para seguir en la PC personal

Se le pidió abrir Windows + X -> Terminal / Windows PowerShell y ejecutar:

```powershell
node --version
Get-ChildItem "C:\Program Files\PostgreSQL" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
```

Falta recibir el resultado. Empezar por ahí y avanzar de un paso a la vez.

Para compilar desde el código fuente en esa PC se requieren .NET SDK 10, Node.js 24 y PostgreSQL. Si se le facilita una versión Windows ya publicada y autocontenida, no necesita instalar el SDK .NET para ejecutarla. No confundir los requisitos de compilación con los de ejecución.

No se ha instalado nada en la PC personal desde este chat. La instalación PostgreSQL de la PC servidor no equivale a tenerlo instalado en la PC personal.

Si el chat normal no tiene acceso al repositorio privado, pedir el ZIP de ESTA rama descargado desde su cuenta de GitHub o los archivos específicos necesarios. No pedir contraseñas ni claves por el chat. No asumir acceso remoto a sus computadoras.

## Orden de trabajo recomendado

1. Confirmar las instalaciones en la PC personal.
2. Obtener el código de la rama de migración, preparar una copia y una base dedicada de prueba.
3. Preparar dependencias y compilar/publicar según blazor/README.md. No usar la base del taller.
4. Para pruebas personales usar datos sintéticos; la creación de la estructura no crea usuarios ni datos de demostración automáticamente. Las fixtures de blazor/engine/tests son exclusivamente para la suite automatizada.
5. Revisar ingreso, menú, registro, fotos, aprobaciones y Excel/PDF.
6. El lunes, comprobar PostgreSQL y Traccar en la PC servidor, preparar la base destino nueva y efectuar la copia final de datos y fotos.
7. Comprobar HTTPS y acceso desde teléfonos/red local/datos móviles.
8. Validar GPS físico, pantalla apagada, sincronización e histórico.
9. Configurar SMTP real.
10. Generar y firmar el APK con la dirección nueva y la misma firma de la aplicación instalada.

## Precauciones concretas de continuidad

- No fusionar el PR ni sustituir producción como si la instalación ya estuviera terminada.
- No afirmar equivalencia total en el equipo real hasta completar esas pruebas.
- El APK actual apunta a bitacora-km.vercel.app: dejar Vercel requiere actualizar esa dirección.
- No desinstalar el APK ni borrar datos/colas pendientes. Conservar la misma firma y applicationId.
- La migración conserva Traccar y su base existente; no mueve sus posiciones históricas a otro Traccar.
- La copia requiere una base destino nueva y vacía, conserva IDs y verifica soportes. La copia final debe coordinarse con la detención de nuevas escrituras en la versión anterior.
- El acceso desde datos móviles no queda resuelto solamente por instalar PostgreSQL: falta definir dirección HTTPS y conectividad del servidor.
- El inicio automático preparado es al iniciar sesión en Windows; no se ha validado todavía en la PC real.
