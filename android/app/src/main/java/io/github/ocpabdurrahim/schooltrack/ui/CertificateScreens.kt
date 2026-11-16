package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.CONDUCTS
import io.github.ocpabdurrahim.schooltrack.data.DocumentType
import io.github.ocpabdurrahim.schooltrack.data.DocumentsRepository
import io.github.ocpabdurrahim.schooltrack.data.FeesRepository
import io.github.ocpabdurrahim.schooltrack.data.IssuedDocument
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.StudentDetail
import io.github.ocpabdurrahim.schooltrack.data.cardCode
import io.github.ocpabdurrahim.schooltrack.data.qrBitmap
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ===========================================================================
// issue a certificate, and the register

@Composable
fun CertificatesScreen(
    email: String,
    onOpen: (String) -> Unit,
    onBack: () -> Unit,
    docs: DocumentsRepository = remember { DocumentsRepository() },
    people: PeopleRepository = remember { PeopleRepository() },
    fees: FeesRepository = remember { FeesRepository() },
) {
    val scope = rememberCoroutineScope()
    var search by remember { mutableStateOf("") }
    var found by remember { mutableStateOf<List<StudentDetail>>(emptyList()) }
    var student by remember { mutableStateOf<StudentDetail?>(null) }

    var type by remember { mutableStateOf(DocumentType.TESTIMONIAL) }
    var issueDate by remember { mutableStateOf(fees.todayDate()) }
    var dateOfLeaving by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var conduct by remember { mutableStateOf(CONDUCTS.first()) }
    var remarks by remember { mutableStateOf("") }

    var register by remember { mutableStateOf<List<IssuedDocument>>(emptyList()) }
    var busy by remember { mutableStateOf(true) }
    var problem by remember { mutableStateOf("") }

    suspend fun load() {
        register = try {
            docs.list()
        } catch (_: Exception) {
            problem = "Could not read the register. Only the head and the office may."
            emptyList()
        }
        busy = false
    }

    LaunchedEffect(Unit) { load() }

    LaunchedEffect(search) {
        if (search.trim().length < 2) { found = emptyList(); return@LaunchedEffect }
        delay(250)
        // students who have LEFT are included: a transfer certificate is
        // usually asked for after they have gone
        found = try {
            people.findStudents(null, search, includeLeft = true).take(8)
        } catch (_: Exception) {
            emptyList()
        }
    }

    AdminScaffold(
        "Certificates",
        student?.let { it.fullName + " · " + it.className + " " + it.section }
            ?: "Find the student first",
        onBack,
    ) {
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Field("Name, roll or student number", search) { search = it }
                found.forEach { s ->
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable { student = s; search = ""; found = emptyList() }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            s.fullName + "  ·  " + s.className + " " + s.section +
                                if (s.status != "A") "  ·  left" else "",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        Text("choose", color = MaterialTheme.colorScheme.primary)
                    }
                    HorizontalDivider()
                }
                Problem(problem)
            }
        }

        if (student != null) {
            Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Issue", style = MaterialTheme.typography.titleMedium)
                    Picker(
                        "Certificate",
                        DocumentType.entries.map { it.name to it.label },
                        type.name,
                    ) { type = DocumentType.valueOf(it) }
                    Field("Issue date (YYYY-MM-DD)", issueDate) { issueDate = it }

                    if (type == DocumentType.TRANSFER) {
                        Field("Date of leaving (YYYY-MM-DD)", dateOfLeaving) { dateOfLeaving = it }
                        Field("Reason", reason) { reason = it }
                    } else {
                        Picker("Conduct", CONDUCTS.map { it to it }, conduct) { conduct = it }
                    }
                    Field("Remarks", remarks) { remarks = it }

                    Button(
                        enabled = !busy,
                        onClick = {
                            val s = student ?: return@Button
                            if (type == DocumentType.TRANSFER && dateOfLeaving.isBlank()) {
                                problem = "A transfer certificate needs the date the student left."
                                return@Button
                            }
                            busy = true; problem = ""
                            scope.launch {
                                try {
                                    onOpen(
                                        docs.issue(
                                            type = type,
                                            student = s,
                                            issueDate = issueDate,
                                            issuedBy = email,
                                            dateOfLeaving = dateOfLeaving.ifBlank { null }
                                                .takeIf { type == DocumentType.TRANSFER },
                                            reason = reason.ifBlank { null }
                                                .takeIf { type == DocumentType.TRANSFER },
                                            conduct = conduct.takeIf { type != DocumentType.TRANSFER },
                                            remarks = remarks.ifBlank { null },
                                        ),
                                    )
                                } catch (_: Exception) {
                                    problem = "That was refused. Only the head or the office " +
                                        "may issue a certificate."
                                    busy = false
                                }
                            }
                        },
                        modifier = Modifier.padding(top = 12.dp),
                    ) { Text("Issue " + type.label.lowercase()) }

                    Text(
                        "The certificate is recorded with a serial number before it is " +
                            "printed, and the student's class and parents' names are copied " +
                            "onto it as they are today.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                }
            }
        }

        Card(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            Column(Modifier.padding(16.dp)) {
                Text(
                    if (busy) "Working…" else "Register · " + register.size + " issued",
                    style = MaterialTheme.typography.titleMedium,
                )
                if (!busy && register.isEmpty()) Text("Nothing has been issued yet.")
                register.forEach { d ->
                    Row(
                        Modifier.fillMaxWidth().clickable { onOpen(d.serialNo) }
                            .padding(vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(d.serialNo, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                d.studentName + "  ·  " + d.type.label + "  ·  " + d.issueDate,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text("open", color = MaterialTheme.colorScheme.primary)
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}

// ===========================================================================
// one issued certificate

@Composable
fun CertificateScreen(
    serialNo: String,
    onBack: () -> Unit,
    docs: DocumentsRepository = remember { DocumentsRepository() },
    admin: AdminRepository = remember { AdminRepository() },
) {
    var d by remember { mutableStateOf<IssuedDocument?>(null) }
    var schoolName by remember { mutableStateOf("") }
    var headTeacher by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(serialNo) {
        admin.getSettings()?.let { schoolName = it.instituteName; headTeacher = it.headTeacher.orEmpty() }
        d = try {
            docs.get(serialNo) ?: run { problem = "No certificate $serialNo."; null }
        } catch (_: Exception) {
            problem = "Could not read that certificate."
            null
        }
    }

    AdminScaffold(d?.type?.label ?: "Certificate", serialNo, onBack) {
        Problem(problem)
        d?.let { doc ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    if (schoolName.isNotEmpty()) {
                        Text(schoolName, style = MaterialTheme.typography.titleLarge)
                    }
                    Text(doc.type.label.uppercase(), style = MaterialTheme.typography.labelLarge)
                    HorizontalDivider(Modifier.padding(vertical = 10.dp))

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Serial", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(doc.serialNo, fontWeight = FontWeight.Bold)
                    }
                    Row(
                        Modifier.fillMaxWidth().padding(top = 4.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Date", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(doc.issueDate)
                    }

                    HorizontalDivider(Modifier.padding(vertical = 10.dp))

                    Text(
                        when (doc.type) {
                            DocumentType.TRANSFER ->
                                "This is to certify that " + doc.studentName + ", son/daughter of " +
                                    (doc.fatherName ?: "—") + " and " + (doc.motherName ?: "—") +
                                    ", was a student of this institution in " + doc.classLabel +
                                    ", roll " + doc.rollNo + ". He/She left this institution on " +
                                    (doc.dateOfLeaving ?: "—") +
                                    (doc.reason?.let { " on account of $it" } ?: "") +
                                    ". All dues to the institution have been paid."
                            DocumentType.TESTIMONIAL ->
                                "This is to certify that " + doc.studentName + ", son/daughter of " +
                                    (doc.fatherName ?: "—") + " and " + (doc.motherName ?: "—") +
                                    ", was a student of this institution in " + doc.classLabel +
                                    ", roll " + doc.rollNo + ". According to the records of this " +
                                    "institution, conduct was " + (doc.conduct ?: "—") + "."
                            DocumentType.CHARACTER ->
                                "This is to certify that " + doc.studentName + ", a student of " +
                                    doc.classLabel + " of this institution, bears a " +
                                    (doc.conduct?.lowercase() ?: "good") + " moral character."
                        },
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.padding(top = 4.dp),
                    )

                    if (!doc.remarks.isNullOrBlank()) {
                        Text(
                            doc.remarks!!,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 10.dp),
                        )
                    }

                    Text(
                        headTeacher.ifBlank { "Head teacher" },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 28.dp),
                    )
                    Text(
                        "Printing is on the web app — a certificate wants a sheet of paper, " +
                            "not a phone.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
            }
        }
    }
}

// ===========================================================================
// one student's ID card, for checking a card that will not scan

@Composable
fun IdCardScreen(
    studentId: String,
    onBack: () -> Unit,
    people: PeopleRepository = remember { PeopleRepository() },
    admin: AdminRepository = remember { AdminRepository() },
) {
    var student by remember { mutableStateOf<StudentDetail?>(null) }
    var schoolName by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(studentId) {
        schoolName = admin.getSettings()?.instituteName.orEmpty()
        student = try {
            people.getStudent(studentId)
        } catch (_: Exception) {
            problem = "Could not read that student."
            null
        }
    }

    val code = cardCode(studentId)
    val bitmap = remember(code) { runCatching { qrBitmap(code, 512) }.getOrNull() }

    AdminScaffold("ID card", student?.fullName ?: studentId, onBack) {
        Problem(problem)
        student?.let { s ->
            Card(Modifier.fillMaxWidth()) {
                Column(
                    Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    if (schoolName.isNotEmpty()) {
                        Text(schoolName, style = MaterialTheme.typography.titleMedium)
                    }
                    Text(s.fullName, style = MaterialTheme.typography.headlineSmall)
                    Text(
                        s.className + " - " + s.section + "  ·  Roll " + s.rollNo,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    bitmap?.let {
                        Image(
                            bitmap = it.asImageBitmap(),
                            contentDescription = code,
                            modifier = Modifier.padding(top = 16.dp).size(220.dp),
                        )
                    }
                    Text(
                        code,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    Text(
                        "This is what the printed card carries. Hold a card that will not " +
                            "scan beside this one to see whether the card or the scanner is " +
                            "at fault. The cards themselves are printed from the web app.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
            }
        }
    }
}
