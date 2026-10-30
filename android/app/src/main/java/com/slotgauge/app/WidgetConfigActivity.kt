package com.slotgauge.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ListView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.doAfterTextChanged
import java.util.concurrent.Executors

/** Widget settings: follow the phone's location, or pin the widget to any NOAA station (search by name). */
class WidgetConfigActivity : AppCompatActivity() {
    private val exec = Executors.newSingleThreadExecutor()
    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID
    private var results: List<TideData.Station> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_config)
        widgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        setResult(Activity.RESULT_CANCELED)

        val q = findViewById<EditText>(R.id.search)
        val list = findViewById<ListView>(R.id.results)
        val status = findViewById<TextView>(R.id.status)
        val current = TideData.manualStation(this)
        status.text = if (current == null) getString(R.string.following_location) else getString(R.string.pinned_to, TideData.niceName(current.name))

        findViewById<Button>(R.id.useLocation).setOnClickListener {
            TideData.setManualStation(this, null)
            done()
        }
        q.doAfterTextChanged { text ->
            val s = text?.toString()?.trim() ?: ""
            if (s.length < 2) return@doAfterTextChanged
            exec.execute {
                val r = TideData.search(s)
                runOnUiThread {
                    results = r
                    list.adapter = object : ArrayAdapter<TideData.Station>(this, android.R.layout.simple_list_item_2, android.R.id.text1, r) {
                        override fun getView(position: Int, convertView: android.view.View?, parent: android.view.ViewGroup): android.view.View {
                            val v = super.getView(position, convertView, parent)
                            val st = r[position]
                            v.findViewById<TextView>(android.R.id.text1).text = TideData.niceName(st.name)
                            v.findViewById<TextView>(android.R.id.text2).text = listOfNotNull(st.state.ifEmpty { null }, if (st.reference) null else getString(R.string.highs_lows_only)).joinToString(" · ")
                            return v
                        }
                    }
                }
            }
        }
        list.setOnItemClickListener { _, _, pos, _ ->
            TideData.setManualStation(this, results[pos])
            done()
        }
    }

    private fun done() {
        TideData.prefs(this).edit().remove("tide").apply() // force a fetch for the new station
        TideWidget.refreshNow(this)
        if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) setResult(Activity.RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        finish()
    }
}
