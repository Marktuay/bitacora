# Registro de colaboradores, permisos de jefes y estados de aprobación

El administrador habilita al jefe en `/jefes.html`, indicando su correo y una sola empresa. Puede cambiar o quitar ese permiso. El jefe no puede habilitar otros jefes ni obtener el permiso de administrador.

En `/colaboradores.html`, administrador y jefe registran nombre, área, cargo opcional y correo corporativo o personal. Pueden registrar un vehículo nuevo con placa pendiente o asociar uno disponible de la misma empresa. El alta guarda empleado, asociación de vehículo y acceso individual en una transacción; repetir la misma solicitud no duplica el registro. Una cuenta nueva recibe contraseña inicial para entregarla personalmente; una cuenta existente conserva la suya. No se envían correos automáticamente.

Los jefes registran, habilitan cuentas, consultan fotos y GPS, revisan y aprueban únicamente dentro de su empresa. Los permisos se comprueban en cada petición contra la cuenta actual, incluyendo revocaciones durante una sesión abierta. Los colaboradores mantienen acceso a sus propias bitácoras y no pueden aprobar gestiones.

Al filtrar por colaborador, mes/corte o fechas, el reporte muestra la columna Estado y un resumen de aprobaciones. Se puede consultar todas las gestiones, solo aprobadas o sin aprobar. Excel, PDF e impresión incluyen el estado de cada fila. Los totales corresponden a las gestiones del filtro seleccionado. El APK 1.3.8 utiliza los mismos servicios de descarga; esta actualización web no requiere reemplazarlo.

La migración `supabase/employee-registration.sql` habilita el registro atómico desde el servidor privado. La tabla y la función de registro no tienen permisos para clientes anónimos ni usuarios autenticados. Los permisos de jefe se almacenan en `app_metadata`, que el colaborador no puede editar.

Verificación: 48 pruebas automatizadas, compilación web, prueba de extremo a extremo con Supabase y cuentas temporales, revisión visual del PDF y de las pantallas. Las cuentas y gestiones de prueba se retiran al terminar. No se modifican las bitácoras reales.
