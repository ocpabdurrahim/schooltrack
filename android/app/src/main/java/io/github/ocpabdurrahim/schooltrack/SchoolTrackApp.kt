package io.github.ocpabdurrahim.schooltrack

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import io.github.ocpabdurrahim.schooltrack.update.AppUpdater
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * The application itself, which exists for one thing: the updater has to
 * outlive any one screen.
 *
 * It watches whether the app is in front, because that is when an update must
 * NOT install — replacing the program under a teacher halfway through a
 * register would lose the marks they were typing. Put the app down for twenty
 * seconds and the new version goes on instead.
 */
class SchoolTrackApp : Application() {
    private val scope = CoroutineScope(SupervisorJob())

    val updater: AppUpdater by lazy { AppUpdater(this, scope) }

    override fun onCreate() {
        super.onCreate()
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                updater.onAppForeground()
                // Opening the app is the check: a school's phone is opened
                // every morning, which is often enough to need no alarm, no
                // background worker and no extra permission.
                scope.launch { updater.checkAndDownload() }
            }

            override fun onStop(owner: LifecycleOwner) = updater.onAppBackground()
        })
    }
}
