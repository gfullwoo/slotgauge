package com.slotgauge.app

import android.app.Application

/** Records any uncaught crash so MainActivity can show it (no adb needed while testing). */
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            try {
                val trace = android.util.Log.getStackTraceString(e)
                getSharedPreferences("crash", MODE_PRIVATE).edit().putString("last", "${e::class.java.name}: ${e.message}\n$trace").apply()
            } catch (_: Exception) {}
            prev?.uncaughtException(t, e)
        }
    }
}
