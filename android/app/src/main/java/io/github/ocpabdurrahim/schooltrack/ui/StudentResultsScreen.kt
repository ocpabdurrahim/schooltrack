package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.Exam
import io.github.ocpabdurrahim.schooltrack.data.ExamsRepository
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.ResultLine
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.Tabulation
import io.github.ocpabdurrahim.schooltrack.data.MAX_GPA
import io.github.ocpabdurrahim.schooltrack.data.gpaText
import io.github.ocpabdurrahim.schooltrack.data.resultLines
import io.github.ocpabdurrahim.schooltrack.data.sheetFor
import kotlin.math.max

/**
 * Every exam a child has sat — the Compose twin of the web's StudentResults
 * page, and the results report a parent opens.
 *
 * A PARENT SEES PUBLISHED EXAMS ONLY, the same rule the student screen follows:
 * a result still being entered is a number that is going to move, and a parent
 * reading it has no way of knowing that.
 *
 * Progress runs oldest first, because that is the direction a parent reads it,
 * and the per-subject marks are here too — "where did she lose it?" answered
 * without opening four separate report cards.
 */
@Composable
fun StudentResultsScreen(
    studentId: String,
    isGuardian: Boolean,
    onOpenReport: (String) -> Unit,
    onBack: () -> Unit,
    people: PeopleRepository = remember { PeopleRepository() },
    examsRepo: ExamsRepository = remember { ExamsRepository() },
) {
    var student by remember { mutableStateOf<StudentDetail?>(null) }
    var results by remember { mutableStateOf<List<Pair<Exam, Tabulation>>>(emptyList()) }
    var problem by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(true) }

    LaunchedEffect(studentId) {
        busy = true
        val s = try {
            people.getStudent(studentId)
        } catch (_: Exception) {
            problem = "Those records could not be read."
            null
        }
        student = s

        if (s != null) {
            results = try {
                val exams = examsRepo.listExams()
                val subjects = examsRepo.listSubjects()
                val marks = examsRepo.marksForStudent(studentId)
                exams.mapNotNull { exam ->
                    if (marks.none { it.examId == exam.examId }) return@mapNotNull null
                    if (isGuardian && !exam.published) return@mapNotNull null
                    exam to sheetFor(listOf(s), subjects, marks, exam.examId).first().tabulation
                }
            } catch (_: Exception) {
                problem = "Those results could not be read."
                emptyList()
            }
        }
        busy = false
    }

    val lines = resultLines(results)
    val byExam = results.associate { it.first.examId to it.second }

    AdminScaffold(
        title = "Results report",
        subtitle = student?.let { "${it.fullName} · ${it.className} - ${it.section} · Roll ${it.rollNo}" },
        onBack = onBack,
    ) {
        Problem(problem)

        if (busy) {
            Text("Loading…", Modifier.padding(top = 12.dp), color = Muted)
            return@AdminScaffold
        }

        if (lines.isEmpty()) {
            Sheet {
                Text("Nothing published yet", style = MaterialTheme.typography.titleMedium)
                Text(
                    if (isGuardian) {
                        "No exam results have been published for this student yet. They appear " +
                            "here as soon as the school publishes each exam."
                    } else {
                        "This student has no marks entered for any exam yet."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = Muted,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            return@AdminScaffold
        }

        Sheet {
            lines.forEach { line ->
                Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "${line.examName} ${line.examYear}",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            marksText(line),
                            style = MaterialTheme.typography.bodySmall,
                            color = Muted,
                        )
                    }
                    Text(
                        gpaText(line.gpa),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (line.letter == "F") Bad else Green,
                    )
                    Spacer(Modifier.width(10.dp))
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(if (line.letter == "F") BadSoft else GreenSoft)
                            .padding(horizontal = 9.dp, vertical = 3.dp),
                    ) {
                        Text(
                            line.letter,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (line.letter == "F") Bad else GreenDeep,
                        )
                    }
                }
                HorizontalDivider(color = LineSoft)
            }

            if (lines.size > 1) {
                Text(
                    "GPA BY EXAM",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                    color = Muted,
                    modifier = Modifier.padding(top = 16.dp, bottom = 8.dp),
                )
                Row(
                    Modifier.fillMaxWidth().height(110.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    lines.forEach { line ->
                        Column(
                            Modifier.weight(1f),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Bottom,
                        ) {
                            Text(
                                gpaText(line.gpa),
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = InkSoft,
                            )
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    // out of 5, not out of the best of the set:
                                    // scaling to the best turns a 4.83 against
                                    // a 4.17 into a cliff
                                    .height((max(6.0, (line.gpa ?: 0.0) / MAX_GPA * 72)).dp)
                                    .clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
                                    .background(if (line.letter == "F") Bad else Green),
                            )
                            Text(
                                line.examName.take(8),
                                style = MaterialTheme.typography.labelSmall,
                                color = InkSoft,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                            Text(
                                line.examYear,
                                style = MaterialTheme.typography.labelSmall,
                                color = Muted,
                            )
                        }
                    }
                }
            }
        }

        lines.forEach { line ->
            val tabulation = byExam[line.examId] ?: return@forEach
            Sheet {
                Text(
                    "${line.examName} ${line.examYear}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    "GPA ${gpaText(line.gpa)} (${line.letter}) · ${marksText(line)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (line.letter == "F") Bad else Muted,
                    modifier = Modifier.padding(bottom = 8.dp),
                )

                tabulation.subjects.forEach { graded ->
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            graded.mark.subjectName + if (graded.mark.isOptional) " (optional)" else "",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            when {
                                graded.mark.absent -> "absent"
                                graded.mark.marks == null -> "—"
                                else -> "${trim(graded.mark.marks!!)} / ${trim(graded.mark.fullMarks)}"
                            },
                            style = MaterialTheme.typography.bodyMedium,
                            color = Muted,
                        )
                        Spacer(Modifier.width(12.dp))
                        Text(
                            graded.grade.letter,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (graded.grade.letter == "F") Bad else InkSoft,
                        )
                    }
                }

                if (line.failed.isNotEmpty()) {
                    Text(
                        "Failed: " + line.failed.joinToString(", "),
                        style = MaterialTheme.typography.bodySmall,
                        color = Bad,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }

                if (line.published) {
                    androidx.compose.material3.TextButton(
                        onClick = { onOpenReport(line.examId) },
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                    ) { Text("Full progress report") }
                }
            }
        }

        Text(
            "How the grade is worked out: one F in a compulsory subject fails the exam whatever " +
                "the other marks are, and the optional subject only ever helps — points above 2.00 " +
                "are added, and failing it costs nothing. A total is shown only once every " +
                "subject's mark is in, so a part-entered exam cannot read as a poor one.",
            style = MaterialTheme.typography.bodySmall,
            color = Muted,
            modifier = Modifier.padding(top = 14.dp),
        )
    }
}

private fun marksText(line: ResultLine): String =
    if (line.obtained == null) {
        "marks not all in"
    } else {
        "${trim(line.obtained!!)} / ${trim(line.outOf)}" +
            (line.percent?.let { " · ${trim(it)}%" } ?: "")
    }

/** 80.0 reads as 80; 42.5 stays 42.5. */
private fun trim(n: Double): String =
    if (n == n.toLong().toDouble()) n.toLong().toString() else n.toString()

@Composable
private fun Sheet(content: @Composable ColumnScopeAlias.() -> Unit) {
    Card(
        Modifier.fillMaxWidth().padding(top = 10.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Line),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(Modifier.padding(14.dp), content = content)
    }
}

private typealias ColumnScopeAlias = androidx.compose.foundation.layout.ColumnScope
