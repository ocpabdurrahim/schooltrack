package io.github.ocpabdurrahim.schooltrack.update

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import androidx.core.content.IntentCompat
import io.github.ocpabdurrahim.schooltrack.SchoolTrackApp

/** Receives PackageInstaller's verdict on an update this app started. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val updater = (context.applicationContext as SchoolTrackApp).updater
        updater.onInstallResult(
            status = intent.getIntExtra(
                PackageInstaller.EXTRA_STATUS,
                PackageInstaller.STATUS_FAILURE,
            ),
            message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE),
            confirm = IntentCompat.getParcelableExtra(
                intent,
                Intent.EXTRA_INTENT,
                Intent::class.java,
            ),
        )
    }
}

/**
 * Runs in the NEW version straight after an update: tidies the download away.
 *
 * The old APK is thirty-five megabytes of a school's phone, and nothing else
 * will ever delete it.
 */
class UpdatedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        (context.applicationContext as SchoolTrackApp).updater.cleanup()
    }
}
