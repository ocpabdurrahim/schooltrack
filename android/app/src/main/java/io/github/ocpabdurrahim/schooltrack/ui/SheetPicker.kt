package io.github.ocpabdurrahim.schooltrack.ui

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import io.github.ocpabdurrahim.schooltrack.data.SHEET_MIME_TYPES
import io.github.ocpabdurrahim.schooltrack.data.readSheetFile
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** The name a file manager shows for a document, for telling the person what was read. */
private fun displayName(context: Context, uri: Uri): String {
    runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { c -> if (c.moveToFirst()) return c.getString(0) ?: "" }
    }
    return uri.lastPathSegment?.substringAfterLast('/').orEmpty()
}

/**
 * Picks a spreadsheet and hands back its text, for a paste box to hold.
 *
 * Chosen, read, shown — never saved. A file is only a faster way to type, and
 * what was read belongs on the screen where it can be corrected first.
 */
@Composable
fun rememberSheetPicker(
    onText: (name: String, text: String) -> Unit,
    onProblem: (String) -> Unit,
): () -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            try {
                val name = displayName(context, uri)
                val bytes = withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                } ?: throw IllegalArgumentException("That file could not be opened.")
                val text = readSheetFile(name, bytes)
                if (text.isBlank()) {
                    onProblem("There is nothing in ${name.ifBlank { "that file" }}.")
                } else {
                    onText(name, text)
                }
            } catch (e: Exception) {
                onProblem(e.message ?: "That file could not be read.")
            }
        }
    }
    return remember(launcher) { { launcher.launch(SHEET_MIME_TYPES) } }
}
