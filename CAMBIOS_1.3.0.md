# Bitácora KM 1.3.0 — nube y New Century

## Cambios
- Logo original New Century, enviado por Jorge, en ícono Android y encabezado de la aplicación; colores azul y rojo.
- Sesión individual con Supabase Auth, cookies HttpOnly y renovación. Se eliminan los PIN compartidos de las pantallas de auditoría, reportes y administración de teléfonos.
- Panel Accesos: el administrador asigna empresa/colaborador al correo de cada persona, genera contraseña inicial y revoca permisos. No envía correos.
- Reportes Excel/PDF conservan formato, datos y firmas. Colaboradores solo descargan sus registros; administradores conservan filtros de auditoría.
- GPS directo de Android hacia traccar-ingest en Supabase mediante credencial propia. La ruta de recepción anterior sigue admitiendo teléfonos antiguos, guardando en Supabase cuando GPS_PROVIDER=supabase.
- Vista de recorridos con calles OpenStreetMap, línea GPS sin marcadores, distancia, duración y advertencia de calidad. No une vacíos de señal ni aprueba automáticamente.
- La opción Conectar a la nube cambia el servidor validando la identidad del teléfono y conserva las fotos, borradores y colas pendientes.

## Conservación de la versión anterior
El ZIP original fue conservado sin modificaciones. Se mantienen empresa, colaborador, vehículo, origen/destino, motivo, odómetros, fotos, documentos, reportes, revisión y trabajo sin conexión.

## Publicación en el mismo Vercel
Proyecto: prj_mTmJvnUeELvkvWxnluTX2VKD5eUg. Dominio: https://bitacora-km.vercel.app.
Las variables privadas deben permanecer en Vercel; no incluirlas en el paquete ni en Git.
El código viene enlazado al proyecto existente. Publicar primero una vista previa con las variables Supabase del proyecto. Verificar acceso y exportaciones antes de publicar en producción.
Publicada el 30/09/2026 por Vercel Drop en el mismo proyecto. Despliegue dpl_CDV1uiX1wqhmBEZkXy8i4B89ZTzR, estado READY, versión 1.3.0.
El dominio principal permite llegar al inicio de sesión de Bitácora KM sin sesión de Vercel. Se conservó la protección existente de Vercel.

## Administrador inicial
Se creó y verificó la cuenta de Jorge (jorge.mayorga4@gmail.com) con app_metadata.bitacora_role = "admin". Su contraseña está en un archivo privado separado. No se envió correo. Las demás cuentas se asignan desde Accesos. No usar user_metadata para permisos.

## Android
La actualización piloto debe usar la misma firma androiddebugkey que la versión 1.2.0. No desinstalar la app ni borrar sus datos; instalar como actualización.
El código de versión pasa de 2 a 3. El keystore permanece separado del código.
BITACORA_PILOT_KEYSTORE permite usar la firma piloto al compilar assembleDebug. Para distribución institucional se conservan las variables BITACORA_KEYSTORE y BITACORA_STORE_PASSWORD del proyecto original.

## Verificación
14 pruebas automatizadas: formularios completos de las tres empresas, fotos y PDF, reintentos sin duplicación, recorridos nocturnos, reportes de más de 500 filas, permisos y recepción GPS con falla temporal.
6 comprobaciones contra Supabase: inicio de sesión real, aislamiento de bitácoras y descargas, Excel/PDF reales, acceso a GPS, revocación inmediata y rechazo de peticiones de otro sitio. Solo se usaron cuentas sintéticas, eliminadas al finalizar.
Pasaron también las seis comprobaciones de acceso y descargas contra la versión pública de Vercel. Las cuentas sintéticas fueron eliminadas; se conserva la cuenta administradora y los datos originales. La prueba física de inicio → GPS → cierre → mapa desde el teléfono queda pendiente de instalar el APK y conectar el teléfono a la nube.

Los archivos supabase/cloud-snapshot son una referencia de las funciones ya desplegadas. No son un script de migración completo ni deben ejecutarse automáticamente; los permisos y tablas ya se crearon en Supabase durante esta sesión.

APK 1.3.0 compilado y firmado con la misma firma del piloto 1.2.0. Alineación y contenido del APK verificados. Lint: 0 errores, 27 advertencias. Se verificaron visualmente el logo y el inicio de sesión en el navegador remoto; Reportes redirige correctamente al ingreso. No se acredita prueba física de esta versión en el teléfono.
