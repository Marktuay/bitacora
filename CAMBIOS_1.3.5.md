# Bitácora KM 1.3.5

- Nuevo botón **Descargar mi bitácora** dentro de Android. Elige Excel o PDF, primer corte (1 al 15), segundo corte (16 al cierre) o fechas desde/hasta.
- La descarga utiliza el colaborador asignado al teléfono y la sesión individual. Empresa y colaborador no se reciben desde los campos de descarga; los permisos del servidor siguen aplicándose.
- Android abre su selector para guardar el archivo y limita el tamaño a 25 MB. Los recorridos activos y borradores se conservan.
- Solo se incluyen las gestiones sincronizadas. El formulario lo indica y no elimina ni altera gestiones pendientes.
- La web ofrece el mismo acceso y selecciona el corte actual como valor inicial.
- La nueva variante de prueba usa `ni.bitacorakm.app.prueba` y una firma privada estable. Se instala junto a las versiones anteriores. La firma y su contraseña están fuera del repositorio y cifradas como secretos de compilación. El APK con identificador original todavía requiere recuperar su firma anterior para actualizar esa instalación.

Verificación: pruebas existentes de generación de Excel/PDF y permisos; compilación web; compilación y análisis Android; prueba del selector con meses de 28, 29, 30 y 31 días y fechas personalizadas; comprobación en producción con una cuenta individual y rechazo de bitácoras ajenas. La instalación y el selector de almacenamiento se deben confirmar en el teléfono.
