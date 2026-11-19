package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.Cells
import io.github.ocpabdurrahim.schooltrack.data.ClassRow
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.StudentRow
import io.github.ocpabdurrahim.schooltrack.data.blankGrid
import io.github.ocpabdurrahim.schooltrack.data.clipboardCells
import io.github.ocpabdurrahim.schooltrack.data.gridToList
import io.github.ocpabdurrahim.schooltrack.data.parseStudentRows
import io.github.ocpabdurrahim.schooltrack.data.pasteInto
import io.github.ocpabdurrahim.schooltrack.data.prepareStudentRows
import io.github.ocpabdurrahim.schooltrack.data.removeRow
import io.github.ocpabdurrahim.schooltrack.data.setCell
import io.github.ocpabdurrahim.schooltrack.data.studentColumn
import io.github.ocpabdurrahim.schooltrack.data.underColumns
import io.github.ocpabdurrahim.schooltrack.data.withSpareRows
import kotlinx.coroutines.launch

private enum class RowState { READY, STOPPED, SAVED, FAILED }

private data class Shown(
    val row: StudentRow,
    val state: RowState,
    val studentId: String = "",
)

/**
 * The form's columns, in the order the office reads them off a register.
 *
 * The keys are the headings the list parser already understands, so the grid
 * is a nicer way to TYPE the list and not a second way to interpret it.
 */
private val COLUMNS = listOf(
    SheetColumn("roll", "Roll", 52.dp, numeric = true),
    SheetColumn("name", "Name", 168.dp),
    SheetColumn("father", "Father", 150.dp),
    SheetColumn("mother", "Mother", 150.dp),
    SheetColumn("mobile", "Mobile", 130.dp, numeric = true),
    SheetColumn("dob", "Date of birth", 118.dp),
    SheetColumn("reg no", "Reg no", 110.dp),
    SheetColumn("group", "Group", 120.dp),
    SheetColumn("religion", "Religion", 100.dp),
    SheetColumn("sex", "Sex", 70.dp),
    SheetColumn("blood", "Blood", 80.dp),
)

private val HEADINGS = COLUMNS.map { it.key }

/**
 * A whole section typed in at once — the Compose twin of the web's "Add many
 * students".
 *
 * The single form is right for one student and wrong for forty, which is what
 * January is. This is a grid because the register the office copies from is a
 * grid and the file the list arrives in is a grid; a box of text asks somebody
 * to hold eleven columns in their head and shows nothing when they lose
 * count.
 *
 * The grid is only a way of typing. What was typed goes to the same
 * parseStudentRows the paste box used, and each row is saved through the same
 * saveStudent as the single form, so the student numbers, the rules and the
 * audit stamp are identical on both clients.
 *
 * It shows the reading before it writes anything on purpose: a bulk import
 * that saves first and reports afterwards leaves someone deleting forty
 * records by hand, and this app does not delete students at all.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun StudentsBatchScreen(
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
    admin: AdminRepository = remember { AdminRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
) {
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var classes by remember { mutableStateOf<List<ClassRow>>(emptyList()) }
    var classId by remember { mutableStateOf("") }
    var cells by remember { mutableStateOf(blankGrid(8, COLUMNS.size)) }
    var fromFile by remember { mutableStateOf("") }
    var rows by remember { mutableStateOf<List<Shown>?>(null) }
    var taken by remember { mutableStateOf(0) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }
    var done by remember { mutableStateOf(false) }

    // Typing in the form is the one thing that must never be answered with a
    // stale reading. Every change drops it, the same as the web.
    fun edited(next: Cells) {
        cells = next; fromFile = ""; rows = null; done = false
    }

    LaunchedEffect(Unit) {
        try {
            classes = admin.listAllClasses()
            classId = classes.firstOrNull { it.active }?.classId.orEmpty()
        } catch (_: Exception) {
            problem = "Could not read the sections."
        }
        busy = false
    }

    val pickFile = rememberSheetPicker(
        onText = { name, loaded ->
            // Into the grid, where it can be looked at and corrected, rather
            // than into a box of text where a wrong column is invisible until
            // it saves.
            val lines = clipboardCells(loaded)
            if (lines.isEmpty()) {
                problem = "There is nothing in $name."
            } else {
                cells = withSpareRows(underColumns(lines, HEADINGS, ::studentColumn))
                fromFile = name; rows = null; done = false; problem = ""
            }
        },
        onProblem = { problem = it; fromFile = "" },
    )

    val section = classes.firstOrNull { it.classId == classId }
    val ready = rows?.count { it.state == RowState.READY } ?: 0
    val stopped = rows?.count { it.state == RowState.STOPPED } ?: 0
    val saved = rows?.count { it.state == RowState.SAVED } ?: 0

    fun read() {
        if (classId.isBlank()) { problem = "Pick a section first."; return }
        problem = ""; done = false; busy = true
        scope.launch {
            try {
                // The rolls already in use, so a clash can be named before
                // anything is written. Only the students still studying count:
                // a roll left behind by someone who has gone is free again.
                val here = people.findStudents(classId, "")
                taken = here.size
                // The parser counts lines in the text it was handed, and
                // gridToList puts a heading line at the top of that text — so
                // line 2 is the row the person can see numbered 1. Pointing
                // them at the wrong row is worse than not pointing at all.
                val parsed = prepareStudentRows(
                    parseStudentRows(gridToList(HEADINGS, cells)),
                    here.map { it.rollNo },
                ).map { it.copy(line = it.line - 1) }
                rows = if (parsed.isEmpty()) {
                    problem = "Nothing has been filled in yet."
                    null
                } else {
                    parsed.map {
                        Shown(it, if (it.problem.isEmpty()) RowState.READY else RowState.STOPPED)
                    }
                }
            } catch (_: Exception) {
                problem = "Could not read this section. Only the head or the office " +
                    "may add students."
            }
            busy = false
        }
    }

    // ---------------------------------------------------------------------
    // The reading, once it exists, takes the whole screen.
    //
    // On a phone it is one or the other: filling the form in, or looking at
    // what was understood. Stacking them, as the web can, puts the list that
    // matters below a grid that is taller than the screen.
    val shown = rows
    if (shown != null) {
        BatchReview(
            shown = shown,
            section = section?.displayName.orEmpty(),
            taken = taken,
            ready = ready,
            stopped = stopped,
            saved = saved,
            busy = busy,
            done = done,
            problem = problem,
            onBack = { rows = null; problem = "" },
            onOpen = onOpen,
            onStartAnother = {
                cells = blankGrid(8, COLUMNS.size)
                rows = null; done = false; fromFile = ""; problem = ""
            },
            onSave = {
                busy = true; problem = ""
                scope.launch {
                    val out = shown.toMutableList()
                    var stop = false
                    for (i in out.indices) {
                        if (stop || out[i].state != RowState.READY) continue
                        val r = out[i].row
                        try {
                            // One at a time, deliberately: each save takes the
                            // next student number from the counter, and a
                            // counter read in parallel hands out the same
                            // number twice.
                            val id = admin.saveStudent(
                                StudentDetail(
                                    studentId = "",
                                    fullName = r.fullName,
                                    rollNo = r.rollNo ?: 0L,
                                    regNo = r.regNo.ifBlank { null },
                                    classId = classId,
                                    className = "",
                                    section = "",
                                    groupName = r.groupName.ifBlank { null },
                                    religion = r.religion.ifBlank { null },
                                    gender = r.gender.ifBlank { null },
                                    dob = r.dob.ifBlank { null },
                                    fatherName = r.fatherName.ifBlank { null },
                                    motherName = r.motherName.ifBlank { null },
                                    bloodGroup = r.bloodGroup.ifBlank { null },
                                    mobileNo = r.mobileNo.ifBlank { null },
                                    status = "A",
                                ),
                                classes,
                            )
                            out[i] = out[i].copy(state = RowState.SAVED, studentId = id)
                        } catch (_: Exception) {
                            // Stop at the first refusal. Carrying on would pile
                            // up forty identical failures and bury the one line
                            // that says why.
                            out[i] = out[i].copy(state = RowState.FAILED)
                            problem = "That save was refused, so the rest were left " +
                                "alone. Only the head or the office may add students."
                            stop = true
                        }
                        rows = out.toList()
                    }
                    rows = out.toList()
                    done = !stop
                    busy = false
                }
            },
        )
        return
    }

    // ---------------------------------------------------------------------
    // The form.
    //
    // Its own layout rather than AdminScaffold's single scroll: the headings
    // have to stay over their columns while the rows move, and the grid has
    // to be a list of its own so a section of eighty is as cheap to show as
    // one of eight.
    //
    // Everything except the title and the button is INSIDE that list, the
    // headings as a sticky header. A section picker and a file button pinned
    // above it cost nothing until the keyboard opens, and then they take the
    // whole grid with them: the first build of this screen left no rows on
    // screen at all while somebody was typing in one.
    val across = rememberScrollState()

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth().padding(top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Add many students", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onBack) { Text("Back") }
        }

        LazyColumn(Modifier.weight(1f).fillMaxWidth()) {
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(horizontal = 14.dp, vertical = 6.dp)) {
                        Picker(
                            "Section",
                            classes.filter { it.active }.map { it.classId to it.displayName },
                            classId,
                        ) { classId = it; rows = null; done = false }

                        OutlinedButton(
                            onClick = pickFile,
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 6.dp),
                        ) {
                            Text(
                                if (fromFile.isBlank()) {
                                    "Fill the form from an Excel or CSV file"
                                } else {
                                    "Read from $fromFile — choose another"
                                },
                            )
                        }

                        // The short version, up here where it is read before the form
                        // is touched. The fuller note sits under the rows, which on a
                        // phone is a screen away.
                        Text(
                            "A row a student, a column a field. Only the name is needed — leave " +
                                "Roll empty and the next free number is given out.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Muted,
                        )

                        SheetGridActions(
                            enabled = !busy,
                            onPaste = {
                                val text = clipboard.getText()?.text.orEmpty()
                                if (text.isBlank()) {
                                    problem = "There is nothing on the clipboard."
                                } else {
                                    problem = ""
                                    edited(withSpareRows(pasteInto(cells, 0, 0, text)))
                                }
                            },
                            onClear = { edited(blankGrid(8, COLUMNS.size)) },
                        )
                    }
                }
            }
            stickyHeader {
                // On the page's own colour, or the rows would show through it
                // as they slide under.
                Column(Modifier.background(Canvas)) {
                    SheetHeadings(COLUMNS, across)
                    HorizontalDivider(color = Line)
                }
            }
            itemsIndexed(cells) { r, row ->
                SheetRow(
                    number = r + 1,
                    row = row,
                    columns = COLUMNS,
                    scroll = across,
                    enabled = !busy,
                    onCell = { col, value ->
                        // Typing in the last row makes another, so the form
                        // never runs out underneath somebody.
                        edited(withSpareRows(setCell(cells, r, col, value)))
                    },
                    onBlock = { col, text ->
                        edited(withSpareRows(pasteInto(cells, r, col, text)))
                    },
                    onRemove = { edited(withSpareRows(removeRow(cells, r))) },
                )
            }
            item {
                Column(Modifier.padding(top = 10.dp, bottom = 24.dp)) {
                    SheetGridHelp()
                    Text(
                        "Only the name is needed. Leave Roll empty and the next free " +
                            "number in the section is given out, after the highest one " +
                            "already there. A date like 05/03/2012 is read as 5 March.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Muted,
                        modifier = Modifier.padding(top = 6.dp),
                    )
                }
            }
        }

        Column(Modifier.fillMaxWidth().padding(bottom = 16.dp)) {
            Problem(problem)
            Button(
                enabled = !busy,
                onClick = { read() },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            ) { Text(if (busy) "Reading…" else "Read the list") }
        }
    }
}

/**
 * What the app understood, before a single student is written.
 *
 * Deliberately a screen of its own and not a card under the grid: this is the
 * last look anybody gets, and on a phone a list below a form eleven columns
 * wide is a list nobody scrolls to.
 */
@Composable
private fun BatchReview(
    shown: List<Shown>,
    section: String,
    taken: Int,
    ready: Int,
    stopped: Int,
    saved: Int,
    busy: Boolean,
    done: Boolean,
    problem: String,
    onBack: () -> Unit,
    onOpen: (String) -> Unit,
    onSave: () -> Unit,
    onStartAnother: () -> Unit,
) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("The reading", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onBack, enabled = !busy) { Text("Back to the form") }
        }

        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    "${shown.size} line(s) read" +
                        (if (section.isNotBlank()) "  ·  $section" else "") +
                        if (taken > 0) "  ·  $taken already in this section" else "",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    listOfNotNull(
                        if (saved > 0) "$saved saved" else "$ready ready to save",
                        if (stopped > 0) "$stopped need fixing" else null,
                    ).joinToString("  ·  "),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (stopped > 0) Bad else Muted,
                    modifier = Modifier.padding(top = 4.dp),
                )

                shown.forEach { s ->
                    Row(
                        Modifier.fillMaxWidth().padding(top = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(
                            s.row.rollNo?.toString() ?: "—",
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.width(34.dp),
                        )
                        Column(Modifier.weight(1f)) {
                            Text(
                                s.row.fullName.ifBlank { "(no name)" },
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                            val also = listOf(
                                s.row.fatherName, s.row.motherName, s.row.mobileNo,
                                s.row.dob, s.row.bloodGroup, s.row.groupName, s.row.regNo,
                            ).filter { it.isNotBlank() }.joinToString(" · ")
                            if (also.isNotEmpty()) {
                                Text(also, style = MaterialTheme.typography.bodySmall, color = Muted)
                            }
                            when (s.state) {
                                RowState.STOPPED -> Text(
                                    "Row ${s.row.line}: ${s.row.problem}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Bad,
                                )
                                RowState.FAILED -> Text(
                                    "refused",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Bad,
                                )
                                RowState.SAVED -> Text(
                                    "saved as ${s.studentId}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Green,
                                )
                                RowState.READY -> if (s.row.note.isNotEmpty()) {
                                    Text(
                                        s.row.note,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = Muted,
                                    )
                                }
                            }
                        }
                    }
                    HorizontalDivider(color = LineSoft, modifier = Modifier.padding(top = 8.dp))
                }

                if (stopped > 0) {
                    Text(
                        "The $stopped row(s) in red will be left out. Go back to the form, " +
                            "correct them and read the list again.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Muted,
                        modifier = Modifier.padding(top = 10.dp),
                    )
                }

                if (!done) {
                    Button(
                        enabled = !busy && ready > 0,
                        onClick = onSave,
                        modifier = Modifier.padding(top = 12.dp),
                    ) { Text(if (busy) "Saving…" else "Save $ready student(s)") }
                }

                if (done) {
                    Text(
                        "$saved student(s) added to $section. They are in the register now, " +
                            "so reading this same list again would add them a second time.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Green,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = onStartAnother,
                            modifier = Modifier.padding(top = 10.dp),
                        ) { Text("Start another list") }
                        shown.firstOrNull { it.state == RowState.SAVED }?.let { first ->
                            Button(
                                onClick = { onOpen(first.studentId) },
                                modifier = Modifier.padding(top = 10.dp),
                            ) { Text("Open the first") }
                        }
                    }
                }

                Problem(problem)
            }
        }
    }
}
