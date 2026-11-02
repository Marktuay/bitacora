plugins { alias(libs.plugins.androidApplication) }
android {
 namespace = "ni.bitacorakm.app"
 compileSdk = 36
 buildFeatures { buildConfig = true }
 defaultConfig { applicationId = "ni.bitacorakm.app"; minSdk = 24; targetSdk = 36; versionCode = 22; versionName = "1.4.11" }
 defaultConfig { manifestPlaceholders["appLabel"] = "Bitácora KM · NC" }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 signingConfigs {
  getByName("debug") {
   System.getenv("BITACORA_PILOT_KEYSTORE")?.let { storeFile=file(it); storePassword=System.getenv("BITACORA_PILOT_STORE_PASSWORD")?:"android"; keyAlias="androiddebugkey"; keyPassword=storePassword }
  }
  create("release") {
   val keyPath = System.getenv("BITACORA_KEYSTORE")
   if (keyPath != null) {
    storeFile = file(keyPath)
    storePassword = System.getenv("BITACORA_STORE_PASSWORD") ?: error("BITACORA_STORE_PASSWORD no configurada para release corporativo")
    keyAlias = System.getenv("BITACORA_KEY_ALIAS") ?: "bitacora-km"
    keyPassword = System.getenv("BITACORA_KEY_PASSWORD") ?: storePassword
   } else if (System.getenv("BITACORA_PILOT_KEYSTORE") != null) {
    storeFile = file(System.getenv("BITACORA_PILOT_KEYSTORE"))
    storePassword = System.getenv("BITACORA_PILOT_STORE_PASSWORD") ?: "android"
    keyAlias = "androiddebugkey"
    keyPassword = storePassword
   } else {
    println("[ADVERTENCIA-SEGURIDAD] BITACORA_KEYSTORE no configurada. Configure el keystore corporativo oficial de Informatica para firmar el APK de produccion.")
   }
  }
 }
 buildTypes {
  release { isMinifyEnabled=false; signingConfig=signingConfigs.getByName("release") }
  create("verification") {
   initWith(getByName("debug"))
   applicationIdSuffix = ".prueba"
   versionNameSuffix = "-prueba"
   manifestPlaceholders["appLabel"] = "Bitácora KM · Prueba 1.4.11"
   matchingFallbacks.add("debug")
  }
 }
}
dependencies {
 testImplementation("junit:junit:4.13.2")
 testImplementation("org.json:json:20250517")
 implementation(project(":core"))
 implementation("androidx.activity:activity-ktx:1.12.4")
 implementation("androidx.webkit:webkit:1.14.0")
 implementation("androidx.exifinterface:exifinterface:1.4.2")
 implementation("androidx.work:work-runtime-ktx:2.11.1")
 implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
}
