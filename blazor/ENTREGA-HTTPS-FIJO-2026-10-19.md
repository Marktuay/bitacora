# Bitácora KM — HTTPS fijo y APK 2.0.4

## Confirmación ya realizada en PC de Auditoría
Dirección comprobada mediante PowerShell con `ok: True`, `database: True`, Traccar configurado y acceso individual activo:
**https://bitacorakmnc26.shares.zrok.io**

## Convertir conexión manual en arranque automático
El enlace actualmente está servido desde una ventana PowerShell con `zrok2 share public ...`. Debe trasladarse a un agente persistente para que se recupere automáticamente al entrar a Windows.

1. Verificar que no haya recorridos transmitiéndose. **En la ventana original donde aparece el enlace zrok**, presionar `Ctrl+C` para terminar la publicación en primer plano. No tocar la ventana de Blazor ni Cloudflare.
2. Descomprimir paquete 2.0.4 y en PowerShell bajo la MISMA cuenta de Windows `AUDITORIA`, ejecutar:
   `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\Activar-HTTPS-Permanente.ps1"`
3. El script reutiliza la tarea `BitacoraKM-HTTPS-Fijo`, la cambia a `zrok2 agent start`, inicia el agente, le delega la publicación del nombre reservado y verifica el endpoint HTTPS (requeridos `ok=True`, `database=True`).
4. Si el nombre permanece ocupado, cerrar correctamente cualquier otra ventana de `zrok2 share` y volver a ejecutar. **No borrar la reserva o la cuenta**.
5. Las tareas de Blazor y zrok arrancan al iniciar sesión Windows. La computadora y su conexión deben permanecer disponibles.
6. Guardar el respaldo de la base fuera del mismo disco, con acceso restringido. No abrir PostgreSQL ni puertos internos a Internet.

## APK 2.0.4
- `Bitacora-KM-PostgreSQL-Operacion-v2.0.4.apk` es actualización firmada compatible con versión 1.4.11/2.0.3; **no desinstalar la anterior**.
- La URL `https://bitacorakmnc26.shares.zrok.io` viene incorporada en la APK; colaboradores no necesitan escribirla.
- La sección técnica del servidor está oculta tanto al abrir como después de iniciar sesión.
- En dispositivos actualizados desde 2.0.2/2.0.3, la APK intenta cambiar automáticamente desde la URL temporal Cloudflare hacia zrok **si no hay recorridos ni GPS pendientes** y el colaborador coincide en PostgreSQL. Si hay gestiones locales pendientes, conserva la URL antigua hasta sincronizarlas.
- El primer acceso con URL nueva puede requerir iniciar sesión otra vez; eso es normal por el cambio de dominio.
- El cliente móvil añade cabecera para evitar la pantalla intermedia zrok en llamadas API; el WebView del navegador de inicio de sesión utiliza User-Agent propio.
- Las APK están compiladas en GitHub con tests y comprobación de firma. Queda pendiente comprobar **físicamente esta versión 2.0.4**, no se asume ese resultado por tests de compilación.

## Corte de datos antes de entregar a otros colaboradores
El servidor PostgreSQL es copia de Supabase obtenida el 19/10/2026. **Las escrituras que ocurrieron después no aparecen solas en PostgreSQL.** Antes de cambiar toda la plantilla, planificar una ventana de corte, drenar GPS pendientes del origen, hacer respaldo y migrar últimos datos a destino independiente/validado, sin sobrescribir los datos piloto. No dejar a las dos bases recibiendo escrituras simultáneamente.

## Limitaciones operativas
zrok conserva el nombre mientras la cuenta/reserva estén vigentes, **pero depende de Internet, del equipo encendido y del servicio externo**, que puede tener límites y cambiar políticas. El agente de tareas actual inicia **al iniciar sesión Windows**; no funciona cuando Windows está apagado o cuando la sesión de AUDITORIA aún no se ha iniciado. La instalación final por Informática deberá asegurar políticas de acceso, monitoreo, recuperación y respaldos.
