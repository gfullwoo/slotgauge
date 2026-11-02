package com.slotgauge.app

import com.google.androidbrowserhelper.locationdelegation.LocationDelegationExtraCommandHandler

/**
 * Lets Chrome hand geolocation requests to this app instead of asking for a separate site permission.
 *
 * Without this, a Trusted Web Activity has two unrelated permissions: the Android one this app requests
 * on first run, and Chrome's own per-site permission for slotgauge.com. Granting the first did nothing for
 * navigator.geolocation, so the site appeared permanently blocked and the app fell back to a state picker
 * — not the behaviour anyone expects from a location-aware app.
 *
 * With the handler registered, Chrome routes the page's location requests through the Android permission,
 * so one ordinary "Allow location" prompt at install time is all the user ever sees.
 */
class DelegationService : com.google.androidbrowserhelper.trusted.DelegationService() {
    override fun onCreate() {
        super.onCreate()
        registerExtraCommandHandler(LocationDelegationExtraCommandHandler())
    }
}
