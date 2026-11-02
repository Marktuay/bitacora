# Bitácora KM 1.3.7

Al seleccionar un colaborador de la lista entregada por Administración, se completa su vehículo habitual y la placa registrada. Los cuatro vehículos nuevos sin placa muestran «Placa pendiente». La pantalla de selección presenta el vehículo asociado como un campo de lectura; no exige escogerlo de nuevo.

Se completan 19 asociaciones y se agrega NEW CENTURY para Gabriela Blandón, además de BLOKON, CONASER y NEW CENTURY SECURITY. Los nombres e identificadores existentes se conservan. No se alteran recorridos históricos ni asignaciones de teléfonos ya inscritas.

Para actualizar la base existente, aplicar una vez `supabase/company-newcentury.sql` y después `supabase/associate-vehicles.sql`. Este último archivo debe ejecutarse después de cualquier nueva importación del catálogo inicial `supabase/seed.sql`. Las placas pendientes se guardan como NULL; no se inventan placas ni tarifas. El catálogo revisado también queda en `api/_seed.js` y `supabase/associated-vehicles.json`.

La empresa nueva mantiene RLS por dueño de bitácora. La vista de reportes conserva `security_invoker=true` y la función de descarga conserva el control de sesión y las restricciones por fila. Auditoría continúa reservada a la cuenta administradora.

Verificación: 37 pruebas, incluidos los 19 cambios de colaborador, las cuatro empresas, el aislamiento de archivos, descarga Excel/PDF y reintentos móviles. La actualización de Android conserva el identificador y la firma de Prueba 1.3.5/1.3.6.
