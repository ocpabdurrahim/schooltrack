package io.github.ocpabdurrahim.schooltrack.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.google.firebase.auth.FirebaseAuth
import io.github.ocpabdurrahim.schooltrack.data.ALL_COLLECTIONS
import io.github.ocpabdurrahim.schooltrack.data.ARMED_FOR_MINUTES
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.Leftover
import io.github.ocpabdurrahim.schooltrack.data.ResetMode
import io.github.ocpabdurrahim.schooltrack.data.confirms
import io.github.ocpabdurrahim.schooltrack.data.leftoverList
import io.github.ocpabdurrahim.schooltrack.data.planFor
import io.github.ocpabdurrahim.schooltrack.data.stillThere
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/** The backup as text, in the shape tools/reset-school.mjs --restore reads. */
private fun asJson(value: Any?): Any? = when (value) {
    is Map<*, *> -> JSONObject().also { o ->
        value.forEach { (k, v) -> o.put(k.toString(), asJson(v) ?: JSONObject.NULL) }
    }
    is List<*> -> JSONArray().also { a -> value.forEach { a.put(asJson(it) ?: JSONObject.NULL) } }
    else -> value
}

/**
 * Empty the school and start another one — the Compose twin of
 * web/src/pages/ResetSchool.tsx.
 *
 * The most dangerous screen in the app, so it is built the way the script in
 * tools/ is, and in the same order:
 *
 *   1. Show what would go, counted from the database, before anything.
 *   2. Save the whole school first — every collection, not only the ones
 *      being cleared — wherever the phone's file picker is pointed.
 *   3. Make the school's own name be typed. Not "yes".
 *   4. Only then arm the fifteen-minute window the rules need, delete, and
 *      shut the window again.
 *
 * The backup is not a flag. The wipe does not begin until the file has been
 * written, because a reset without an undo is one slip away from a school's
 * records being gone.
 */
@Composable
fun ResetSchoolScreen(
    onBack: () -> Unit,
    repo: AdminRepository = remember { AdminRepository() },
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    var mode by remember { mutableStateOf(ResetMode.RECORDS) }
    var counts by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var schoolName by remember { mutableStateOf("") }
    var typed by remember { mutableStateOf("") }
    var backedUp by remember { mutableStateOf("") }
    var done by remember { mutableStateOf<List<String>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var finished by remember { mutableStateOf(false) }
    var left by remember { mutableStateOf<List<Leftover>>(emptyList()) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            schoolName = repo.getSettings()?.instituteName.orEmpty()
            counts = repo.countCollections(ALL_COLLECTIONS)
        } catch (_: Exception) {
            problem = "Could not read the school. Only an administrator may do this."
        }
        busy = false
    }

    val plan = planFor(mode)
    val going = plan.clear.sumOf { counts[it] ?: 0 }
    val staying = plan.keep.sumOf { counts[it] ?: 0 }

    // The phone's own file picker, so the backup lands wherever the person
    // keeps things — Drive, Downloads, an SD card — rather than inside the
    // app, where uninstalling would take it with them.
    val save = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true; problem = ""
        scope.launch {
            try {
                val projectId = com.google.firebase.FirebaseApp.getInstance().options.projectId ?: ""
                val backup = repo.backupEverything(ALL_COLLECTIONS, projectId)
                val text = (asJson(backup) as JSONObject).toString(2)
                withContext(Dispatchers.IO) {
                    context.contentResolver.openOutputStream(uri)?.use {
                        it.write(text.toByteArray())
                    } ?: throw IllegalStateException("could not write there")
                }
                @Suppress("UNCHECKED_CAST")
                val kept = (backup["collections"] as Map<String, List<Any?>>)
                    .values.sumOf { it.size }
                backedUp = "$kept document(s) saved"
            } catch (_: Exception) {
                problem = "The backup could not be written, so nothing was deleted."
            }
            busy = false
        }
    }

    val ready = backedUp.isNotBlank() && confirms(typed, schoolName) && going > 0

    AdminScaffold(
        "Start a new school",
        "Empties this school so another can be set up in it",
        onBack,
    ) {
        if (finished) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(
                        "Done. ${done.size} collection(s) cleared, and every one of them " +
                            "counted again and found empty. Your sign-in, the school's " +
                            "name and the Gemini key are untouched, so you can set the " +
                            "school up again from Setup. The backup you saved is the only " +
                            "copy of what was here.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Green,
                    )
                    done.forEach {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = Muted)
                    }
                }
            }
            return@AdminScaffold
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Picker(
                    "How much",
                    listOf(
                        ResetMode.RECORDS.name to
                            "The records — students, marks, attendance, money",
                        ResetMode.ALL.name to "Everything — a blank school",
                    ),
                    mode.name,
                ) { mode = ResetMode.valueOf(it); typed = "" }

                Text(
                    if (mode == ResetMode.RECORDS) {
                        "Keeps the classes, subjects, fee rates, holidays and staff."
                    } else {
                        "Keeps nothing but your sign-in, the school's name and the Gemini key."
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = Muted,
                    modifier = Modifier.padding(top = 6.dp),
                )

                HorizontalDivider(Modifier.padding(vertical = 10.dp), color = LineSoft)

                (plan.clear + plan.keep).sorted().forEach { name ->
                    val clearing = name in plan.clear
                    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
                        Text(
                            name,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            (counts[name] ?: 0).toString(),
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.width(44.dp),
                        )
                        Text(
                            if (clearing) "cleared" else "kept",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (clearing) Bad else Muted,
                            modifier = Modifier.width(60.dp),
                        )
                    }
                }

                Text(
                    "$going document(s) would be deleted and $staying kept. This cannot be " +
                        "undone except from the backup." +
                        if ("counters" in plan.clear) {
                            " Student, staff and receipt numbering starts again at 1."
                        } else {
                            ""
                        },
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text("1 · Save the backup", style = MaterialTheme.typography.titleMedium)
                Text(
                    "The whole school, including what is being kept. It is the same format " +
                        "the reset-school.mjs script restores from. Nothing can be deleted " +
                        "until this is done.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Muted,
                    modifier = Modifier.padding(top = 4.dp),
                )
                OutlinedButton(
                    enabled = !busy,
                    onClick = {
                        val stamp = java.time.Instant.now().toString()
                            .replace(":", "-").replace(".", "-").take(19)
                        save.launch("schooltrack-backup-$stamp.json")
                    },
                    modifier = Modifier.padding(top = 10.dp),
                ) { Text(if (busy && backedUp.isBlank()) "Reading…" else "Save the backup") }
                if (backedUp.isNotBlank()) {
                    Text(
                        backedUp,
                        color = Green,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }

                Text(
                    "2 · Type the school's name",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 18.dp),
                )
                Text(
                    if (schoolName.isNotBlank()) "Exactly: $schoolName"
                    else "This school has no name set, so it cannot be emptied from here.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Muted,
                )
                Field("The school's name", typed) { typed = it }

                Text(
                    "3 · Empty it",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 18.dp),
                )
                Text(
                    "Deleting is otherwise impossible in this database. Pressing this opens a " +
                        "$ARMED_FOR_MINUTES-minute window in which an administrator may " +
                        "delete, and shuts it again as soon as the work is finished.",
                    style = MaterialTheme.typography.bodySmall,
                    color = Muted,
                    modifier = Modifier.padding(top = 4.dp),
                )

                Row(
                    Modifier.padding(top = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Button(
                        enabled = !busy && ready,
                        onClick = {
                            busy = true; problem = ""; done = emptyList(); left = emptyList()
                            scope.launch {
                                try {
                                    repo.armReset(FirebaseAuth.getInstance().currentUser?.email ?: "")
                                    repo.clearCollections(plan.clear) { name, removed ->
                                        done = done + "$name — $removed"
                                    }

                                    // COUNTED AGAIN, from the database. A loop
                                    // that finished without throwing has shown
                                    // only that nothing threw: a batch refused
                                    // because the window ran out leaves records
                                    // the new school starts with and nobody is
                                    // expecting.
                                    counts = repo.countCollections(ALL_COLLECTIONS)
                                    left = stillThere(counts, plan.clear)
                                    finished = left.isEmpty()
                                } catch (_: Exception) {
                                    problem = "Some of it was refused and the rest was left " +
                                        "alone. The window may have run out — read the list, " +
                                        "then start again."
                                }
                                // Always, even after a failure: the window is
                                // meant to be shut.
                                runCatching { repo.disarmReset() }
                                busy = false
                            }
                        },
                    ) {
                        Text(
                            if (busy && backedUp.isNotBlank()) "Emptying…"
                            else "Empty ${schoolName.ifBlank { "this school" }}",
                        )
                    }
                }

                if (left.isNotEmpty()) {
                    Text(
                        "Not finished. " + leftoverList(left) +
                            (if (left.size == 1) " is" else " are") + " still there. Nothing " +
                            "is wrong with what WAS cleared — the rest was refused, most " +
                            "likely because the $ARMED_FOR_MINUTES-minute window ran out. " +
                            "Press the button again: the backup you took still covers " +
                            "everything, and clearing what is already empty costs nothing.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Bad,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                }

                if (!ready && !busy) {
                    Text(
                        when {
                            backedUp.isBlank() -> "Save the backup first."
                            going == 0 -> "There is nothing to delete."
                            else -> "Type the school's name exactly to enable this."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = Muted,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }

                done.forEach {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = Muted)
                }
                Problem(problem)
            }
        }
    }
}
