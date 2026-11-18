package io.github.ocpabdurrahim.schooltrack.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import io.github.ocpabdurrahim.schooltrack.data.AttendanceRepository
import io.github.ocpabdurrahim.schooltrack.data.ScanOutcome
import io.github.ocpabdurrahim.schooltrack.data.ScanRepository
import io.github.ocpabdurrahim.schooltrack.data.Status
import io.github.ocpabdurrahim.schooltrack.data.playError
import io.github.ocpabdurrahim.schooltrack.data.playSuccess
import io.github.ocpabdurrahim.schooltrack.data.setSoundOn
import io.github.ocpabdurrahim.schooltrack.data.soundOn
import java.util.concurrent.Executors
import kotlinx.coroutines.launch

@Composable
fun ScanScreen(
    email: String,
    onBack: () -> Unit,
    scans: ScanRepository = remember { ScanRepository() },
    attendance: AttendanceRepository = remember { AttendanceRepository() },
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val today = remember { attendance.todayInDhaka() }
    val pending by scans.pending.collectAsState()

    var granted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        granted = it
    }
    LaunchedEffect(Unit) { if (!granted) ask.launch(Manifest.permission.CAMERA) }

    var outcome by remember { mutableStateOf<ScanOutcome?>(null) }
    // Remembered per device, not per account: the gate phone wants the bell,
    // the head's own phone in a quiet office may not.
    var sound by remember { mutableStateOf(soundOn(context)) }
    var roster by remember { mutableStateOf("") }
    var lastCode by remember { mutableStateOf("") }
    var lastAt by remember { mutableStateOf(0L) }

    fun handle(code: String) {
        // A camera decodes the same card many times a second; without this one
        // student would be "already marked" a dozen times per visit.
        val now = System.currentTimeMillis()
        if (code == lastCode && now - lastAt < 2500) return
        lastCode = code
        lastAt = now
        scope.launch {
            val got = scans.scan(code, classId = null, date = today, email = email)
            outcome = got
            // The sound IS the answer at a gate: nobody is looking at the
            // screen with a queue of children pushing past.
            if (sound) {
                if (got is ScanOutcome.Refused) playError() else playSuccess()
            }
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Scan at the gate", style = MaterialTheme.typography.headlineSmall)
            androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
            TextButton(onClick = onBack) { Text("Back") }
        }
        Text(
            today + "  ·  whole school",
            style = MaterialTheme.typography.bodyMedium,
        )

        Row(
            Modifier.fillMaxWidth().padding(top = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Bell on a scan", style = MaterialTheme.typography.bodyMedium)
            androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
            Switch(
                checked = sound,
                onCheckedChange = {
                    sound = it
                    setSoundOn(context, it)
                    if (it) playSuccess()   // so the choice is heard, not just read
                },
            )
        }

        if (pending > 0) {
            Text(
                pending.toString() + " mark(s) waiting to reach the server — keep the app open",
                color = MaterialTheme.colorScheme.tertiary,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 6.dp),
            )
        }

        MessageCard(outcome)

        if (granted) {
            CameraPreview(
                onCode = ::handle,
                // clipToBounds: the camera view paints outside its layout box
                // on some devices, covering the message above it.
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp)
                    .height(300.dp)
                    .clipToBounds(),
            )
        } else {
            Text(
                "Camera permission is needed to read cards. Attendance can still " +
                    "be taken by hand from the register.",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 16.dp),
            )
            Button(onClick = { ask.launch(Manifest.permission.CAMERA) }, modifier = Modifier.padding(top = 8.dp)) {
                Text("Allow camera")
            }
        }

        Button(
            onClick = {
                scope.launch {
                    roster = "Downloading…"
                    roster = try {
                        scans.warmRoster().toString() + " students available offline"
                    } catch (_: Exception) {
                        "Could not download the roster — try again with a connection."
                    }
                }
            },
            modifier = Modifier.padding(top = 16.dp),
        ) { Text("Download roster for offline use") }

        if (roster.isNotEmpty()) {
            Text(roster, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp))
        }
        Text(
            "A card can only be read without a signal if that student has been " +
                "downloaded at least once.",
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

@Composable
private fun MessageCard(outcome: ScanOutcome?) {
    val (text, colour) = when (outcome) {
        null -> "Hold a card up to the camera." to Color(0xFFEEF0F4)
        is ScanOutcome.Marked -> {
            val who = outcome.student.fullName + " (" + outcome.student.className + " - " +
                outcome.student.section + ", Roll " + outcome.student.rollNo + ")"
            val what = if (outcome.status == Status.L) " — LATE" else " — Present"
            val queued = if (outcome.queued) "  ·  saved, will sync" else ""
            (who + what + queued) to Color(0xFFE6F4EA)
        }
        is ScanOutcome.Already ->
            (outcome.student.fullName + " was already marked.") to Color(0xFFFFF4E5)
        is ScanOutcome.Refused -> outcome.message to Color(0xFFFDECEA)
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = colour),
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
    ) {
        Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
            Text(text, style = MaterialTheme.typography.titleMedium)
        }
    }
}

@OptIn(ExperimentalGetImage::class)
@Composable
private fun CameraPreview(onCode: (String) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val executor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember { BarcodeScanning.getClient() }

    // LifecycleCameraController binds the camera itself. ProcessCameraProvider
    // would hand back a Guava ListenableFuture, which is not on the compile
    // classpath -- not worth pulling Guava in merely to wait for a camera.
    val controller = remember {
        LifecycleCameraController(context).apply {
            cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
            setEnabledUseCases(CameraController.IMAGE_ANALYSIS)
            setImageAnalysisAnalyzer(executor) { proxy ->
                val image = proxy.image
                if (image == null) {
                    proxy.close()
                } else {
                    scanner.process(
                        InputImage.fromMediaImage(image, proxy.imageInfo.rotationDegrees),
                    ).addOnSuccessListener { codes ->
                        codes.firstOrNull { it.format == Barcode.FORMAT_QR_CODE }
                            ?.rawValue?.let(onCode)
                    }.addOnCompleteListener { proxy.close() }
                }
            }
        }
    }

    DisposableEffect(lifecycleOwner) {
        controller.bindToLifecycle(lifecycleOwner)
        onDispose {
            controller.unbind()
            executor.shutdown()
            scanner.close()
        }
    }

    androidx.compose.ui.viewinterop.AndroidView(
        modifier = modifier,
        factory = { ctx ->
            PreviewView(ctx).also {
                // ORDER MATTERS: the mode must be chosen BEFORE the controller
                // attaches, or the surface already exists and the setting is
                // ignored. COMPATIBLE renders through a TextureView; the
                // default SurfaceView draws in its own window, ON TOP of the
                // Compose content -- it was covering the result message and the
                // queue indicator, the two things the operator actually reads.
                it.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                it.controller = controller
            }
        },
    )
}
