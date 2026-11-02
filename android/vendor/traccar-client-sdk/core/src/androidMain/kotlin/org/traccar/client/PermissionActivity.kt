package org.traccar.client

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.result.contract.ActivityResultContracts
import kotlinx.coroutines.CompletableDeferred

class PermissionActivity : ComponentActivity() {

    private val requestForeground = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (!hasPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)) {
            finishWith(false)
        } else {
            maybeRequestBackground()
        }
    }

    private val requestBackground = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        finishWith(granted)
    }

    private val openSettings = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        finishWith(hasPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) &&
            hasPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        onBackPressedDispatcher.addCallback(this) { finishWith(false) }
        if (pending == null) { finish(); return }
        if (savedInstanceState != null) return
        requestForeground.launch(foregroundPermissions().toTypedArray())
    }

    private fun maybeRequestBackground() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            !hasPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        ) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                AlertDialog.Builder(this)
                    .setTitle("Ubicación durante el recorrido")
                    .setMessage("Para conservar el recorrido con la pantalla apagada, abrí Permisos → Ubicación y elegí «Permitir todo el tiempo», con ubicación precisa. El GPS se detiene al finalizar el recorrido o al tocar Detener GPS.")
                    .setPositiveButton("Abrir ajustes") { _, _ ->
                        openSettings.launch(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
                    }
                    .setNegativeButton("Ahora no") { _, _ -> finishWith(false) }
                    .setOnCancelListener { finishWith(false) }
                    .show()
            } else requestBackground.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        } else {
            finishWith(true)
        }
    }

    private fun finishWith(granted: Boolean) {
        pending?.complete(granted)
        pending = null
        finish()
    }

    companion object {
        @Volatile
        var pending: CompletableDeferred<Boolean>? = null
    }
}
