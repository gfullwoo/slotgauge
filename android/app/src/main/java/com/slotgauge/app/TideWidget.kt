package com.slotgauge.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.Locale
import java.util.concurrent.TimeUnit

/** Shared behaviour for both widget sizes: draw from the cache, refresh in the background. */
abstract class TideWidget : AppWidgetProvider() {
    abstract val wide: Boolean

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        for (id in ids) render(context, manager, id, wide)
        if (TideData.isStale(TideData.load(context))) refreshNow(context)
    }

    override fun onEnabled(context: Context) {
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "tide-refresh", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<TideRefreshWorker>(30, TimeUnit.MINUTES).build())
        refreshNow(context)
    }

    override fun onDisabled(context: Context) {
        // only stop the periodic refresh once no widget of either size is left
        val m = AppWidgetManager.getInstance(context)
        val any = m.getAppWidgetIds(ComponentName(context, TideWidgetSmall::class.java)).isNotEmpty() || m.getAppWidgetIds(ComponentName(context, TideWidgetWide::class.java)).isNotEmpty()
        if (!any) WorkManager.getInstance(context).cancelUniqueWork("tide-refresh")
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) renderAll(context)
    }

    companion object {
        const val ACTION_REFRESH = "com.slotgauge.app.REFRESH"

        fun refreshNow(context: Context) {
            WorkManager.getInstance(context).enqueueUniqueWork("tide-refresh-once", ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<TideRefreshWorker>().build())
        }

        fun renderAll(context: Context) {
            val m = AppWidgetManager.getInstance(context)
            m.getAppWidgetIds(ComponentName(context, TideWidgetSmall::class.java)).forEach { render(context, m, it, false) }
            m.getAppWidgetIds(ComponentName(context, TideWidgetWide::class.java)).forEach { render(context, m, it, true) }
        }

        private fun open(context: Context, url: String, code: Int): PendingIntent {
            val i = Intent(context, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            return PendingIntent.getActivity(context, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        fun render(context: Context, manager: AppWidgetManager, id: Int, wide: Boolean) {
            val v = RemoteViews(context.packageName, if (wide) R.layout.widget_wide else R.layout.widget_small)
            val tide = TideData.load(context)
            val ph = tide?.let { TideData.phase(it) }
            if (tide == null || ph == null) {
                v.setTextViewText(R.id.phase, context.getString(R.string.tide))
                v.setTextViewText(R.id.next, context.getString(if (tide == null) R.string.loading else R.string.no_data))
                v.setViewVisibility(R.id.arrow, android.view.View.INVISIBLE)
                v.setInt(R.id.wave, "setColorFilter", ContextCompat.getColor(context, R.color.brand))
            } else {
                val color = ContextCompat.getColor(context, if (ph.rising) R.color.brand else R.color.falling)
                v.setViewVisibility(R.id.arrow, android.view.View.VISIBLE)
                v.setImageViewResource(R.id.arrow, if (ph.rising) R.drawable.ic_arrow_up else R.drawable.ic_arrow_down)
                v.setInt(R.id.arrow, "setColorFilter", color)
                v.setInt(R.id.wave, "setColorFilter", color)
                v.setTextViewText(R.id.phase, context.getString(if (ph.rising) R.string.rising else R.string.falling))
                val next = ph.next
                v.setTextViewText(R.id.next, if (next != null) "${context.getString(if (next.high) R.string.high else R.string.low)} ${TideData.fmtTime(next.ms, tide.station.tz)}" else "")
                val desc = String.format(Locale.US, "%s tide at %s%s", context.getString(if (ph.rising) R.string.rising else R.string.falling), TideData.niceName(tide.station.name), ph.height?.let { String.format(Locale.US, ", about %.1f ft", it) } ?: "")
                v.setContentDescription(R.id.root, desc)
                if (wide) v.setTextViewText(R.id.station, TideData.niceName(tide.station.name))
            }
            v.setOnClickPendingIntent(R.id.root, open(context, "${TideData.SITE}/#tides", 1))
            if (wide) v.setOnClickPendingIntent(R.id.mic, open(context, "${TideData.SITE}/?voice=1", 2))
            manager.updateAppWidget(id, v)
        }
    }
}

class TideWidgetSmall : TideWidget() { override val wide = false }
class TideWidgetWide : TideWidget() { override val wide = true }
