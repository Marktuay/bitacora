# ENTREGA A INFORMÁTICA — TRANSICIÓN SIN INTERRUMPIR LA BITÁCORA KM
## Versión piloto y límites

La aplicación actualmente utilizada (origen Supabase/Vercel, y Traccar de origen) **debe continuar operando** hasta que termine una migración final y se apruebe el corte. La versión Blazor/PostgreSQL constituye un ambiente independiente. **No son dos bases sincronizadas automáticamente**.

### Ambiente A. Trabajo actual
- Colaboradores, jefes y Auditoría continúan usando la Bitácora actual desde la PC del trabajo y los teléfonos ya configurados.
- No cambiar DNS, URL de la APK original ni credenciales de la base original; no desinstalar APK de producción.
- No borrar registros ni desconectar Traccar mientras se preparan respaldos.

### Ambiente B. Instalación y pruebas de Informática
1. Instalar Node.js 24, PostgreSQL compatible, Traccar (o acceso al mismo Traccar durante pruebas controladas), OSRM Nicaragua y HTTPS con dominio/certificado estable.
2. Extraer `Servidor/` del paquete compilado en un directorio protegido; no sobrescribir una instalación operativa.
3. Crear una base destino completamente NUEVA y VACÍA. No utilizar ninguna base preexistente ni una base de pruebas con registros.
4. Ejecutar `Configurar-Bitacora.ps1` con contraseñas entregadas por canal privado y propia configuración. Si se configura antes de migrar, verificar que `Engine/migrate.cjs init` creó tablas; no cargar cuentas de ejemplo en el destino.
5. Preparar seguridad (HTTPS, firewall, acceso remoto, SMTP, ACL de carpetas, copias restaurables, Traccar 8082/5055 y OSRM 5000 en red local; evitar exponer puertos de datos a Internet).
6. Confirmar que el servidor Blazor responde `/api/health` y que el mapa, login, aprobación, GPS, fotos y exportaciones funcionan con datos sintéticos en un ambiente de laboratorio separado.

## Etapa 1 — Ensayo de migración en ambiente temporal
- Obtener de manera privada y temporal `SOURCE_DATABASE_URL` (base Supabase original), `SOURCE_API_URL` y `SOURCE_SERVICE_KEY` para descargar soportes de Storage. No enviarlas por chat, correo o repositorio.
- Crear un ambiente ENSAYO con **otra base nueva y vacía**. La migración existente solo acepta origen a destino vacío y hace una copia consistente de las tablas.
- Ejecutar `Engine/migrate.cjs init` en ENSAYO. Luego `Engine/migrate.cjs copy` con variables `DATABASE_URL` (ensayo), `SOURCE_DATABASE_URL`, `SOURCE_API_URL`, `SOURCE_SERVICE_KEY`, `BITACORA_DATA_DIR`.
- Verificar `migration-verification.json`, conteos de las 22 tablas,  usuarios, identidades, asignaciones, soportes y SHA-256, fechas, kilómetros, reportes y permisos. **No enviar una sola fila de prueba al origen.**
- Migrar y validar **aparte** la base e historial de Traccar y la correspondencia entre dispositivos, usuarios y `km_gps_credentials`. La copia SQL+Storage no transporta por sí sola las posiciones históricas almacenadas dentro de Traccar.
- Medir tamaño/tiempo de copia y dimensionar disco; la tabla de trabajos de retransmisión puede ser grande.
- No usar el resultado de ENSAYO como base oficial ni sumar manualmente filas nuevas: el procedimiento oficial exige destino vacío.

## Etapa 2 — Corte definitivo cuando Informática confirme aceptación
1. Aprobar fecha y hora de corte. Dar aviso a colaboradores/jefes y suspender inicios de nuevos viajes durante la ventana.
2. Antes de cerrar, completar viajes iniciados y comprobar **0 gestiones y 0 posiciones pendientes en los teléfonos**; cotejar trabajos `queued`/`processing` de retransmisión y `gps_flushed` en origen. **Si hay pendientes, NO cortar.**
3. Suspender escrituras al sistema anterior solo durante el corte final (modo mantenimiento real, no simplemente cerrar el navegador); pausar transmisores únicamente tras drenar colas y respaldar datos. Registrar última fecha/ID y total de filas.
4. Crear backup restaurable de origen: PostgreSQL, Storage, Traccar (base GPS y configuración), más inventario de llaves y mapping de dispositivos. Conservar origen intacto.
5. Limpiar el destino mediante **base nueva** (no ejecutar borrados de tablas con usuarios activos) e inicializar esquema. Ejecutar una nueva copia completa con `migrate.cjs copy`. La herramienta **no implementa migración incremental**.
6. Comparar el origen congelado con destino: 22 tablas, cuentas, roles/permisos, fechas, kilómetros, fotografías/documentos, SHA-256, aprobaciones, Traccar histórico y colas de retransmisión. Resolver diferencias antes de abrir nuevo sistema.
7. Cambiar DNS/HTTPS a URL estable, actualizar APK con la **firma de producción original** para conservar datos del usuario y cambiar endpoint sin reinstalar. La APK piloto `.prueba` **no** sustituye la de producción.
8. Ejecutar pruebas de extremo a extremo con usuario, jefe y auditor en PC + Android. Registrar acta de aceptación y habilitar escritura exclusivamente en la instalación oficial.
9. Conservar origen en solo lectura para consulta y reversión durante un periodo de observación acordado. Después del corte, **no usar dos sistemas que admitan escritura simultáneamente**.

## Matriz de comprobación antes de aceptar
- Login y cambio de clave; roles: admin, jefe limitado por área, colaborador; los colaboradores no abren mapa detallado.
- 22 tablas y cuentas trasladadas, reconciliación de conteos, duplicados, llaves foráneas, bitácoras por empresa, fotografías, reportes.
- La cola GPS original no debe contener posiciones que solo se encuentren en teléfonos o sistemas no trasladados.
- Traccar histórico y vinculación de dispositivos funcionando, recepción GPS con pantalla apagada y conexión móvil.
- OSRM Nicaragua opcional para diagnóstico; nunca sustituye distancias oficiales por estimación parcial.
- PDF/Excel mantienen encabezados, colaboradores, jefes, vehículos y observaciones, y firmas requieren revisión de responsable.
- HTTPS y respaldos verificables; restauración de prueba; eventos de acceso y auditoría revisados.
- Temperatura/consumo de batería y tiempo de sincronización medidos con teléfono real.

## Observaciones técnicas relevantes
- El ZIP público del piloto contiene servidor Windows autohospedado y APK de pruebas; no incluye un servidor PostgreSQL, la base histórica del usuario ni credenciales.
- La conexión de Traccar está configurada localmente por cada instalación. Mantener su historial requiere restauración de su base y revisión de IDs de dispositivos.
- La copia `migrate.cjs copy` conserva cuentas/contraseñas bcrypt y metadatos; **no conserva sesiones**: usuarios volverán a entrar.
- Los soportes se copian desde Storage a disco privado; la ruta del destino debe tener respaldo y políticas ACL.
- El túnel aleatorio de pruebas `.trycloudflare.com` no ofrece dirección permanente y no debe quedar en la APK oficial.
- El sistema es autohospedado y no requiere Vercel/Supabase después del corte; evaluar costos propios de hardware, red, dominio y respaldos.
- **No apagar ni desactivar el ambiente anterior hasta firmar el acta de aceptación.**
