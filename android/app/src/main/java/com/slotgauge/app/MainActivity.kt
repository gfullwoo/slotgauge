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
        val prefs = TideData.prefs(this)
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!granted && !prefs.getBoolean("askedLocation", false)) {
            prefs.edit().putBoolean("askedLocation", true).apply()
            askLocation.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
        } else launchSite()
    }

    private fun launchSite() {
        val url: Uri = intent?.data?.takeIf { it.host == getString(R.string.host) } ?: Uri.parse("${TideData.SITE}/?source=android")
        startActivity(Intent(this, LauncherActivity::class.java).setAction(Intent.ACTION_VIEW).setData(url))
        finish()
    }
}
