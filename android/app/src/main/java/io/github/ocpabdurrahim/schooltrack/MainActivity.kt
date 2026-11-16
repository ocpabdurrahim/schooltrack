package io.github.ocpabdurrahim.schooltrack

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import io.github.ocpabdurrahim.schooltrack.data.Emulators
import io.github.ocpabdurrahim.schooltrack.ui.SchoolTrackApp
import io.github.ocpabdurrahim.schooltrack.ui.SchoolTrackTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Emulators.wireIfRequested()
        // Android 15 draws every app edge to edge whether it asks to or not, so
        // this says so out loud and then pads for it.
        enableEdgeToEdge()
        setContent {
            SchoolTrackTheme {
                // safeDrawing is the status bar, the gesture bar AND THE
                // KEYBOARD. Without it the app keeps its full height when the
                // keyboard opens, the field being typed into stays underneath,
                // and no amount of scrolling reaches it -- which is exactly what
                // happened. Padding here shrinks the app instead, and Compose's
                // own text fields scroll themselves into what is left.
                Surface(
                    modifier = Modifier.fillMaxSize().safeDrawingPadding(),
                    color = MaterialTheme.colorScheme.background,
                ) { SchoolTrackApp() }
            }
        }
    }
}
