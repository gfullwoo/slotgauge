package com.slotgauge.app

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

/** Fetches fresh predictions from slotgauge.com and redraws every widget. */
class TideRefreshWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        val ok = TideData.refresh(applicationContext) != null
        TideWidget.renderAll(applicationContext)
        return if (ok) Result.success() else if (runAttemptCount < 3) Result.retry() else Result.failure()
    }
}
