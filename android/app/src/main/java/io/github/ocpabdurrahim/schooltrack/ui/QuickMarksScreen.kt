package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * Quick entry — two forms over the same marks, because the paper arrives in
 * two shapes. The twin of web/src/pages/QuickMarks.tsx.
 *
 * A bundle of scripts for one subject is keyed in BY SUBJECT: pick the subject
 * once, then roll, marks, done, roll, marks, done. That is the form the office
 * lives in, and the one the school's own APEX page works this way.
 *
 * A single marksheet for one child — a late sitter, a correction, a transfer
 * in — is keyed in BY STUDENT: every subject at once, with the real GPA under
 * it before anything is saved.
 *
 * Which form is open is the only thing this file decides. Neither form knows
 * about the other.
 */
@Composable
fun QuickMarksScreen(onBack: () -> Unit) {
    var bySubject by remember { mutableStateOf(true) }

    AdminScaffold(
        "Quick entry",
        if (bySubject) {
            "One subject, roll after roll"
        } else {
            "One student, every subject"
        },
        onBack,
    ) {
        Row(
            Modifier.fillMaxWidth().padding(bottom = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FilterChip(
                selected = bySubject,
                onClick = { bySubject = true },
                label = { Text("By subject") },
            )
            FilterChip(
                selected = !bySubject,
                onClick = { bySubject = false },
                label = { Text("By student") },
            )
        }

        if (bySubject) QuickBySubjectBody() else QuickByStudentBody()
    }
}
