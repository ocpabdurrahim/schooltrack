package io.github.ocpabdurrahim.schooltrack.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.ocpabdurrahim.schooltrack.data.AdminRepository
import io.github.ocpabdurrahim.schooltrack.data.CONDUCTS
import io.github.ocpabdurrahim.schooltrack.data.DocumentType
import io.github.ocpabdurrahim.schooltrack.data.DocumentsRepository
import io.github.ocpabdurrahim.schooltrack.data.FeesRepository
import io.github.ocpabdurrahim.schooltrack.data.IssuedDocument
import io.github.ocpabdurrahim.schooltrack.data.PeopleRepository
import io.github.ocpabdurrahim.schooltrack.data.SchoolSettings
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
    var school by remember { mutableStateOf<SchoolSettings?>(null) }
    var problem by remember { mutableStateOf("") }

    LaunchedEffect(studentId) {
        school = admin.getSettings()
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
            Column(
                Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                IdCardFront(s, school)
                IdCardBack(s, school, code, bitmap?.asImageBitmap())
            }

            Text(
                "This is the card the web app prints, at the size it prints it: 54 x 86 mm, " +
                    "the size a lanyard holder takes. The photo box is filled in before " +
                    "lamination. Hold a card that will not scan beside the code above to see " +
                    "whether the card or the scanner is at fault.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 16.dp),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// The card itself.
//
// The twin of the printed card in web/src/pages/IdCards.tsx, down to the
// proportions: CR80 PORTRAIT, 54 x 86 mm. The colours are written out rather
// than taken from the theme because this is a picture of a physical object --
// it must look the same in dark mode as the card in the child's hand does.

private val CARD_INK = Color(0xFF10261E)
private val CARD_ACCENT = Color(0xFF0F6B4A)
private val CARD_ACCENT_2 = Color(0xFF15855C)
private val CARD_SOFT = Color(0xFFEEF5F1)
private val CARD_HAIR = Color(0xFFC3D5CC)
private val CARD_FAINT = Color(0xFF9FB3AA)
private val CARD_NOTE = Color(0xFF405249)

/** 54 x 86 mm. Width over height, which is what aspectRatio wants. */
private const val CARD_RATIO = 54f / 86f

@Composable
private fun CardFace(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier
            .width(260.dp)
            .aspectRatio(CARD_RATIO)
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White)
            .border(1.dp, CARD_HAIR, RoundedCornerShape(14.dp)),
        content = content,
    )
}

@Composable
private fun CardRow(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, fontSize = 9.sp, color = CARD_FAINT)
        Text(value, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, color = CARD_INK)
    }
}

@Composable
private fun IdCardFront(s: StudentDetail, school: SchoolSettings?) {
    CardFace {
        Column(
            Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(listOf(CARD_ACCENT, CARD_ACCENT_2)))
                .padding(horizontal = 8.dp, vertical = 9.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                school?.instituteName ?: "School",
                color = Color.White, fontWeight = FontWeight.Bold,
                fontSize = 13.sp, lineHeight = 15.sp, textAlign = TextAlign.Center,
            )
            Text(
                listOfNotNull(
                    school?.eiin?.let { "EIIN $it" } ?: "STUDENT IDENTITY CARD",
                    school?.sessionLabel,
                ).joinToString("  ·  ").uppercase(),
                color = Color.White.copy(alpha = 0.92f),
                fontSize = 7.sp, letterSpacing = 0.8.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        Column(
            Modifier.weight(1f).fillMaxWidth().padding(horizontal = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Box(
                Modifier
                    .size(width = 76.dp, height = 90.dp)
                    .border(1.dp, CARD_HAIR, RoundedCornerShape(5.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text("PHOTO", fontSize = 8.sp, letterSpacing = 1.6.sp, color = CARD_FAINT)
            }

            Text(
                s.fullName,
                fontSize = 15.sp, fontWeight = FontWeight.Bold, color = CARD_INK,
                lineHeight = 17.sp, textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 9.dp),
            )
            Text(
                s.className + " - " + s.section,
                color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.SemiBold,
                modifier = Modifier
                    .padding(top = 5.dp)
                    .clip(RoundedCornerShape(50))
                    .background(CARD_ACCENT)
                    .padding(horizontal = 9.dp, vertical = 2.dp),
            )

            Column(Modifier.fillMaxWidth().padding(top = 9.dp)) {
                HorizontalDivider(color = CARD_HAIR)
                CardRow("Roll", s.rollNo.toString())
                s.regNo?.takeIf { it.isNotBlank() }?.let { CardRow("Reg", it) }
                s.groupName?.takeIf { it.isNotBlank() }?.let { CardRow("Group", it) }
                s.dob?.takeIf { it.isNotBlank() }?.let { CardRow("Date of birth", it) }
                s.bloodGroup?.takeIf { it.isNotBlank() }?.let { CardRow("Blood", it) }
            }
        }

        Text(
            cardCode(s.studentId),
            modifier = Modifier.fillMaxWidth().background(CARD_SOFT).padding(vertical = 6.dp),
            textAlign = TextAlign.Center, fontSize = 9.sp, letterSpacing = 1.4.sp,
            fontFamily = FontFamily.Monospace, color = CARD_INK,
        )
    }
}

@Composable
private fun IdCardBack(
    s: StudentDetail,
    school: SchoolSettings?,
    code: String,
    qr: ImageBitmap?,
) {
    CardFace {
        Text(
            school?.instituteName ?: "School",
            modifier = Modifier.fillMaxWidth().background(CARD_SOFT).padding(vertical = 7.dp),
            textAlign = TextAlign.Center, fontSize = 9.sp,
            fontWeight = FontWeight.SemiBold, color = CARD_INK,
        )

        Column(
            Modifier.weight(1f).fillMaxWidth().padding(horizontal = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            qr?.let {
                Image(bitmap = it, contentDescription = code, modifier = Modifier.size(124.dp))
            }
            Text(
                code,
                fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp,
                fontFamily = FontFamily.Monospace, color = CARD_INK,
                modifier = Modifier.padding(top = 6.dp),
            )
            Text(
                buildString {
                    append("Scan at the gate to mark attendance.")
                    s.fatherName?.takeIf { it.isNotBlank() }?.let { append("\nFather: " + it) }
                    s.mobileNo?.takeIf { it.isNotBlank() }?.let { append("\nMobile: " + it) }
                    school?.address?.takeIf { it.isNotBlank() }?.let { append("\n" + it) }
                    append("\nIf found, please return it to the school office.")
                },
                fontSize = 8.sp, lineHeight = 12.sp, color = CARD_NOTE,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 7.dp),
            )
        }

        Column(
            Modifier.fillMaxWidth().padding(bottom = 13.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            HorizontalDivider(Modifier.width(96.dp), color = CARD_INK)
            Text(
                school?.headTeacher ?: "Head teacher",
                fontSize = 8.sp, color = CARD_FAINT,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
    }
}
