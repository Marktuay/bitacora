package ni.bitacorakm.app

object EvidenceTypes {
    const val MAX_BYTES = 3 * 1024 * 1024
    fun type(bytes: ByteArray): String? = when {
        bytes.size >= 8 && bytes.copyOfRange(0,8).contentEquals(byteArrayOf(137.toByte(),80,78,71,13,10,26,10)) -> "image/png"
        bytes.size >= 3 && bytes[0] == 255.toByte() && bytes[1] == 216.toByte() && bytes[2] == 255.toByte() -> "image/jpeg"
        bytes.size >= 12 && String(bytes,0,4,Charsets.US_ASCII) == "RIFF" && String(bytes,8,4,Charsets.US_ASCII) == "WEBP" -> "image/webp"
        bytes.size >= 5 && String(bytes,0,5,Charsets.US_ASCII) == "%PDF-" -> "application/pdf"
        else -> null
    }
    fun extension(type: String): String = when(type) {
        "image/jpeg" -> "jpg"
        "image/png" -> "png"
        "image/webp" -> "webp"
        "application/pdf" -> "pdf"
        else -> error("Formato no admitido")
    }
}
