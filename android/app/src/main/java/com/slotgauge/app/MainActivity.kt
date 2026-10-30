package com.slotgauge.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.google.androidbrowserhelper.trusted.LauncherActivity

/**
 * Launcher and link handler. On first run it asks for location (so the widgets can pick the nearest
 * tide station), then hands the URL to the Trusted Web Activity which shows slotgauge.com full-screen.
 */
class MainActivity : ComponentActivity() {
    private val askLocation = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        TideWidget.refreshNow(this)
        launchSite()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val crash = getSharedPreferences("crash", MODE_PRIVATE)
        val last = crash.getString("last", null)
        if (last != null) { // show the previous crash once, with a copy button, then carry on
            crash.edit().remove("last").apply()
            android.app.AlertDialog.Builder(this).setTitle("SlotGauge crashed last time")
                .setMessage(last.take(4000))
                .setPositiveButton("Copy") { _, _ -> (getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager).setPrimaryClip(android.content.ClipData.newPlainText("crash", last)); start() }
                .setNegativeButton("Continue") { _, _ -> start() }
                .setOnCancelListener { start() }.show()
            return
        }
        start()
    }

    private fun start() {
        val prefs = TideData.prefs(this)
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!granted && !prefs.getBoolean("askedLocation", false)) {
            prefs.edit().putBoolean("askedLocation", true).apply()
            askLocation.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
        } else launchSite()
    }

    private fun launchSite() {
        val url: Uri = intent?.data?.takeIf { it.host == getString(R.string.host) } ?: Uri.parse("${TideData.SITE}/?source=android")
        try {
            startActivity(Intent(this, LauncherActivity::class.java).setAction(Intent.ACTION_VIEW).setData(url))
        } catch (e: Exception) {
            // Trusted Web Activity unavailable (no compatible browser?) — open in the default browser instead
            startActivity(Intent(Intent.ACTION_VIEW, url).addCategory(Intent.CATEGORY_BROWSABLE))
        }
        finish()
    }
}
