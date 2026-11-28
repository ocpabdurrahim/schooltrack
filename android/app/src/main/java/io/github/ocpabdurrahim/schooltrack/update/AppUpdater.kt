package io.github.ocpabdurrahim.schooltrack.update

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.edit
import androidx.core.content.pm.PackageInfoCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import io.github.ocpabdurrahim.schooltrack.BuildConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Keeps the phone's copy up to date from the app's own GitHub releases.
 *
 * It downloads a newer APK and accepts it ONLY if it is this app, signed with
 * the same key, and carries a higher version code — three checks, because the
 * thing being installed is a program with a school's records behind it and
 * the file came off the internet. Then it installs through PackageInstaller
 * while the app is in the background: on Android 12+ an app may update itself
 * without a tap, and a teacher halfway through a register should not have the
 * app replaced under them in either case.
 *
 * It never installs anything a person did not end up with anyway: the same
 * APK, from the same place, that would otherwise arrive on a cable.
 */
class AppUpdater(
    private val context: Context,
    private val scope: CoroutineScope,
) {
    private val prefs = context.getSharedPreferences("updates", Context.MODE_PRIVATE)
    private val dir = File(context.noBackupFilesDir, "updates")
    private val lock = Mutex()

    private val _state = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val state: StateFlow<UpdateState> = _state

    /** "1.5.1" for both "1.5.1" and a test build's "1.5.1-debug". */
    val currentVersion: String = BuildConfig.VERSION_NAME.substringBefore('-')

    /** Off switch, for a school that would rather be asked. On by default. */
    var autoUpdate: Boolean
        get() = prefs.getBoolean(KEY_AUTO, true)
        set(value) = prefs.edit { putBoolean(KEY_AUTO, value) }

    @Volatile private var installing = false

    /** Android showed its own confirmation; don't start another install. */
    @Volatile private var awaitingUser = false
    private var backgroundJob: Job? = null

    /** Whether Android lets this app install APKs ("Install unknown apps"). */
    fun canInstall(): Boolean =
        Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()

    /**
     * Looks for a newer release and downloads it.
     *
     * An automatic run checks at most every few hours and does nothing at all
     * when the school has turned updates off; [userAsked] always checks, and
     * is what the button in Setup calls.
     */
    suspend fun checkAndDownload(userAsked: Boolean = false) {
        if (!lock.tryLock()) return
        try {
            if (!userAsked) {
                if (!autoUpdate) return
                val since = System.currentTimeMillis() - prefs.getLong(KEY_LAST_CHECK, 0)
                if (since < MIN_CHECK_INTERVAL) {
                    restoreDownloaded()
                    return
                }
            }
            _state.value = UpdateState.Checking
            val release = withContext(Dispatchers.IO) { fetchLatest() }
            val now = System.currentTimeMillis()
            prefs.edit { putLong(KEY_LAST_CHECK, now) }
            if (release == null || Versions.compare(release.version, currentVersion) <= 0) {
                _state.value = UpdateState.UpToDate(now)
                cleanup()
                return
            }
            Log.i(TAG, "Downloading " + release.version)
            val file = withContext(Dispatchers.IO) { downloadVerified(release) }
            _state.value = UpdateState.Ready(release, file)
            if (autoUpdate && !isForeground()) install(release, file)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Update check failed", e)
            _state.value = UpdateState.Failed(e.message ?: e.javaClass.simpleName)
        } finally {
            lock.unlock()
        }
    }

    /** Installs the waiting update now — the "Install" button. */
    fun installNow() {
        val ready = _state.value as? UpdateState.Ready ?: return
        install(ready.release, ready.file)
    }

    fun onAppForeground() {
        awaitingUser = false
        backgroundJob?.cancel()
    }

    /**
     * Put down: a waiting update installs a little later.
     *
     * A little later, not at once — somebody stepping out to the camera and
     * straight back should not find the app restarting.
     */
    fun onAppBackground() {
        val ready = _state.value as? UpdateState.Ready ?: return
        if (installing || awaitingUser || !autoUpdate) return
        backgroundJob?.cancel()
        backgroundJob = scope.launch {
            delay(BACKGROUND_DELAY)
            if (!isForeground()) install(ready.release, ready.file)
        }
    }

    /** Deletes downloads for versions that are now installed (or older). */
    fun cleanup() {
        dir.listFiles()?.forEach { f ->
            if (!f.name.endsWith(".apk") || Versions.compare(versionOf(f), currentVersion) <= 0) {
                f.delete()
            }
        }
    }

    // ---- checking and downloading ------------------------------------------

    private fun fetchLatest(): ReleaseInfo? {
        val conn = URL(BuildConfig.UPDATE_API_URL).openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 15_000
        conn.setRequestProperty("Accept", "application/vnd.github+json")
        conn.setRequestProperty("User-Agent", "SchoolTrack-Android/" + currentVersion)
        try {
            return when (val code = conn.responseCode) {
                200 -> ReleaseParser.parse(conn.inputStream.bufferedReader().readText())
                404 -> null // no releases yet, which is not a fault
                else -> error("GitHub answered $code")
            }
        } finally {
            conn.disconnect()
        }
    }

    private fun restoreDownloaded() {
        if (_state.value is UpdateState.Ready) return
        val newest = dir
            .listFiles { f -> f.name.startsWith(PREFIX) && f.name.endsWith(".apk") }
            ?.maxWithOrNull { a, b -> Versions.compare(versionOf(a), versionOf(b)) } ?: return
        if (Versions.compare(versionOf(newest), currentVersion) > 0 && isGenuineUpdate(newest)) {
            _state.value = UpdateState.Ready(
                ReleaseInfo(versionOf(newest), "", newest.length(), null, ""),
                newest,
            )
        }
    }

    private fun versionOf(f: File) = f.name.removePrefix(PREFIX).removeSuffix(".apk")

    private fun downloadVerified(release: ReleaseInfo): File {
        dir.mkdirs()
        val target = File(dir, PREFIX + release.version + ".apk")
        if (target.exists() && isGenuineUpdate(target)) return target

        val partial = File(dir, "download.part")
        val digest = MessageDigest.getInstance("SHA-256")
        val conn = URL(release.apkUrl).openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 30_000
        conn.instanceFollowRedirects = true
        conn.setRequestProperty("User-Agent", "SchoolTrack-Android/" + currentVersion)
        try {
            check(conn.responseCode == 200) { "Download failed (" + conn.responseCode + ")" }
            val total = if (release.size > 0) release.size else conn.contentLengthLong
            var done = 0L
            var lastReport = 0L
            conn.inputStream.use { input ->
                partial.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        output.write(buffer, 0, n)
                        digest.update(buffer, 0, n)
                        done += n
                        if (total > 0 && done - lastReport > 256 * 1024) {
                            lastReport = done
                            _state.value =
                                UpdateState.Downloading(release, done.toFloat() / total)
                        }
                    }
                }
            }
        } finally {
            conn.disconnect()
        }

        val sha = digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xFF) }
        if (release.sha256 != null && sha != release.sha256) {
            partial.delete()
            error("The download was damaged; it will be tried again")
        }
        target.delete()
        check(partial.renameTo(target)) { "Could not save the update" }
        if (!isGenuineUpdate(target)) {
            target.delete()
            error("That file is not a newer SchoolTrack signed with the same key")
        }
        return target
    }

    /**
     * This app, a higher version code, and EXACTLY the same signing
     * certificate.
     *
     * The signature check is the one that matters: Android would refuse to
     * install a differently-signed APK over this one anyway, but by then the
     * file has been downloaded and the user has been asked to install
     * something. Better to find out before any of that.
     */
    @Suppress("DEPRECATION")
    private fun isGenuineUpdate(apk: File): Boolean {
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= 28) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            PackageManager.GET_SIGNATURES
        }
        val archive = pm.getPackageArchiveInfo(apk.path, flags) ?: return false
        if (archive.packageName != context.packageName) return false
        val installed = pm.getPackageInfo(context.packageName, flags)
        if (PackageInfoCompat.getLongVersionCode(archive) <=
            PackageInfoCompat.getLongVersionCode(installed)
        ) {
            return false
        }
        val mine = signers(installed)
        return mine.isNotEmpty() && signers(archive) == mine
    }

    @Suppress("DEPRECATION")
    private fun signers(info: PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= 28) {
            info.signingInfo?.apkContentsSigners
        } else {
            info.signatures
        }
        return signatures.orEmpty().map { sig ->
            MessageDigest.getInstance("SHA-256").digest(sig.toByteArray())
                .joinToString("") { "%02x".format(it.toInt() and 0xFF) }
        }.toSet()
    }

    // ---- installing ---------------------------------------------------------

    private fun install(release: ReleaseInfo, file: File) {
        if (installing) return
        installing = true
        _state.value = UpdateState.Installing(release)
        try {
            val installer = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(
                PackageInstaller.SessionParams.MODE_FULL_INSTALL,
            ).apply {
                setAppPackageName(context.packageName)
                setSize(file.length())
                // Android 12+: an app updating ITSELF may do so without asking.
                if (Build.VERSION.SDK_INT >= 31) {
                    setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
                }
            }
            val sessionId = installer.createSession(params)
            installer.openSession(sessionId).use { session ->
                session.openWrite("base.apk", 0, file.length()).use { out ->
                    file.inputStream().use { it.copyTo(out) }
                    session.fsync(out)
                }
                val callback = Intent(context, InstallResultReceiver::class.java)
                    .putExtra(EXTRA_VERSION, release.version)
                // Mutable: Android puts the result into this intent.
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                    (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                session.commit(
                    PendingIntent.getBroadcast(context, sessionId, callback, flags).intentSender,
                )
            }
            Log.i(TAG, "Install of " + release.version + " committed")
        } catch (e: Exception) {
            Log.w(TAG, "Install failed", e)
            installing = false
            _state.value = UpdateState.Failed("Could not install the update: " + e.message)
        }
    }

    /** Called by [InstallResultReceiver] with PackageInstaller's verdict. */
    fun onInstallResult(status: Int, message: String?, confirm: Intent?) {
        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                installing = false
                restoreDownloaded()
                if (confirm == null) return
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                // Only while the app is in front: throwing an install screen
                // at somebody using another app is what a bad app does.
                val foreground = ProcessLifecycleOwner.get().lifecycle.currentState
                    .isAtLeast(Lifecycle.State.STARTED)
                if (foreground && runCatching { context.startActivity(confirm) }.isSuccess) {
                    awaitingUser = true
                }
            }
            // The process is about to be replaced; there is nothing to say.
            PackageInstaller.STATUS_SUCCESS -> Unit
            else -> {
                installing = false
                _state.value = UpdateState.Failed(message ?: "The update was not installed")
            }
        }
    }

    private suspend fun isForeground(): Boolean = withContext(Dispatchers.Main) {
        ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
    }

    companion object {
        const val EXTRA_VERSION = "io.github.ocpabdurrahim.schooltrack.update.VERSION"
        private const val TAG = "SchoolTrackUpdate"
        private const val PREFIX = "SchoolTrack-"
        private const val KEY_LAST_CHECK = "lastCheck"
        private const val KEY_AUTO = "autoUpdate"
        private const val MIN_CHECK_INTERVAL = 6 * 60 * 60 * 1000L
        private const val BACKGROUND_DELAY = 20_000L
    }
}
