Traccar Client SDK v1.0.11, commit d8d67db5cb00aa1a7048bc0d8ae08fa63a83221c.
Código fuente Apache-2.0 incorporado para compilar como módulo :core.
APK piloto 1.2.0 compilado. La prueba en teléfono físico está pendiente; ver docs/INFORMATICA.md.
Modificaciones Bitácora KM: contador público de posiciones pendientes; omisión del identificador secreto en el registro de arranque. Se conservan LICENSE y avisos originales.
Se solicita ACCESS_COARSE_LOCATION junto con ACCESS_FINE_LOCATION para compatibilidad con Android 12+, y se comprueba el permiso realmente concedido.
Referencia: https://developer.android.com/develop/sensors-and-location/location/permissions/runtime

Android 11+: se agregó una explicación en español y acceso a los ajustes para conceder ubicación en segundo plano. La cancelación devuelve el control al formulario. Se conserva el control explícito de inicio y detención.

Versión 1.3.0: Config.uploadToken y cabecera X-Device-Token para recepción HTTPS privada; los mensajes de error no incluyen direcciones ni credenciales. Logo New Century proporcionado por el usuario.
