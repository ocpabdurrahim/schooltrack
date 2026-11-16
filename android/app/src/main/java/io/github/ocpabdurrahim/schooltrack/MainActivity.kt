package io.github.ocpabdurrahim.schooltrack

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import io.github.ocpabdurrahim.schooltrack.data.Emulators
import io.github.ocpabdurrahim.schooltrack.ui.SchoolTrackApp
import io.github.ocpabdurrahim.schooltrack.ui.SchoolTrackTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Emulators.wireIfRequested()
        setContent {
            SchoolTrackTheme {
                Surface(color = MaterialTheme.colorScheme.background) { SchoolTrackApp() }
            }
        }
    }
}
