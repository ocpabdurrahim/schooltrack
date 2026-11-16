package io.github.ocpabdurrahim.schooltrack.data

import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions

/**
 * Exam operations — the Kotlin twin of web/src/data/examops.ts.
 *
 * The routine, the rooms, the seat plan and the admit card. None of it needs a
 * new collection: the routine lives on the exam document and the rooms in
 * settings, both of which already have rules. A new collection would mean a
 * rules change and a deploy for what is, in the end, a printed timetable.
 *
 * Every pure function here has the same test cases as the TypeScript one
 * (ExamOpsTest.kt / examops.test.ts), because a seat plan that differs between
 * the phone and the web is worse than no seat plan at all.
 */

data class RoutineEntry(
    val classId: String,
    val subjectId: String,
    val subjectName: String,
    val date: String,        // yyyy-MM-dd
    val startTime: String,   // HH:mm
    val endTime: String,
    val roomId: String? = null,
)

data class Room(
    val roomId: String,
    val roomName: String,
    val capacity: Int,
    val columns: Int,        // benches across, for the printed plan
)

data class Seat(val seatNo: Int, val student: StudentDetail)

data class RoomPlan(val room: Room, val seats: List<Seat>)

data class SeatPlan(val plans: List<RoomPlan>, val unseated: List<StudentDetail>)

/** By date then start time: a routine is read down the page, not by subject. */
fun sortRoutine(routine: List<RoutineEntry>): List<RoutineEntry> =
    routine.sortedWith(compareBy({ it.date }, { it.startTime }))

fun routineFor(routine: List<RoutineEntry>, classId: String): List<RoutineEntry> =
    sortRoutine(routine.filter { it.classId == classId })

/** The distinct exam days, in order — one seat plan per day. */
fun examDates(routine: List<RoutineEntry>): List<String> =
    routine.map { it.date }.distinct().sorted()

/**
 * A subject sits once. Setting it again MOVES the paper rather than adding a
 * second sitting — an exam with Bangla on two mornings is never what was meant.
 */
fun withEntry(routine: List<RoutineEntry>, entry: RoutineEntry): List<RoutineEntry> =
    sortRoutine(
        routine.filterNot { it.classId == entry.classId && it.subjectId == entry.subjectId } +
            entry,
    )

fun withoutEntry(
    routine: List<RoutineEntry>,
    classId: String,
    subjectId: String,
): List<RoutineEntry> =
    sortRoutine(routine.filterNot { it.classId == classId && it.subjectId == subjectId })

/** A room name is its identity, so saving it again edits it in place. */
fun withRoom(rooms: List<Room>, room: Room): List<Room> =
    (rooms.filterNot { it.roomId == room.roomId } + room)
        .sortedWith(compareBy(NUMERIC_NAMES) { it.roomName })

/** "Room 2" before "Room 10" — the way a person numbers rooms. */
private val NUMERIC_NAMES = Comparator<String> { a, b ->
    val chunks = Regex("\\d+|\\D+")
    val left = chunks.findAll(a).map { it.value }.toList()
    val right = chunks.findAll(b).map { it.value }.toList()
    var i = 0
    var verdict = 0
    while (verdict == 0 && i < minOf(left.size, right.size)) {
        val x = left[i]
        val y = right[i]
        verdict = if (x.first().isDigit() && y.first().isDigit()) {
            x.trimStart('0').padStart(20, '0').compareTo(y.trimStart('0').padStart(20, '0'))
        } else {
            x.compareTo(y, ignoreCase = true)
        }
        i++
    }
    if (verdict != 0) verdict else left.size - right.size
}

fun roomIdFor(name: String): String =
    name.trim().uppercase().replace(Regex("[^A-Z0-9]+"), "_").trim('_')

/**
 * Seats students across the rooms for one exam day.
 *
 * TWO STUDENTS OF THE SAME CLASS ARE NOT SEATED NEXT TO EACH OTHER while any
 * other class still has someone waiting — they are sitting the same paper, and
 * a seat plan that lines them up in a row is the one thing an invigilator will
 * not forgive. The classes are interleaved round-robin, in roll order within
 * each class, so the plan is also the same every time it is printed.
 *
 * Returns the rooms used and anyone who did not fit, which is better than
 * silently dropping a student off the end of the last bench.
 */
fun seatPlan(students: List<StudentDetail>, rooms: List<Room>): SeatPlan {
    val byClass = LinkedHashMap<String, MutableList<StudentDetail>>()
    for (s in students.sortedBy { it.rollNo }) {
        byClass.getOrPut(s.classId) { mutableListOf() }.add(s)
    }

    // round-robin over the classes, largest first so the big class is spread out
    val queues = byClass.values.sortedByDescending { it.size }.map { ArrayDeque(it) }
    val order = mutableListOf<StudentDetail>()
    val total = students.size
    var placed = 0
    var i = 0
    while (placed < total) {
        val queue = queues[i % queues.size]
        if (queue.isNotEmpty()) {
            val next = queue.removeFirst()
            // avoid putting the same class in adjacent seats where another is free
            if (order.isNotEmpty() && order.last().classId == next.classId) {
                val other = queues.firstOrNull {
                    it.isNotEmpty() && it.first().classId != next.classId
                }
                if (other != null) {
                    order.add(other.removeFirst())
                    queue.addFirst(next)
                    placed++
                    i++
                    continue
                }
            }
            order.add(next)
            placed++
        }
        i++
    }

    val plans = mutableListOf<RoomPlan>()
    var cursor = 0
    for (room in rooms) {
        if (cursor >= order.size) break
        val seats = order.subList(cursor, minOf(cursor + room.capacity, order.size))
            .mapIndexed { index, student -> Seat(index + 1, student) }
        cursor += seats.size
        plans.add(RoomPlan(room, seats))
    }

    return SeatPlan(plans, order.drop(cursor))
}

/** Where one student sits, for their admit card. */
fun seatOf(plans: List<RoomPlan>, studentId: String): Pair<String, Int>? {
    for (plan in plans) {
        val seat = plan.seats.firstOrNull { it.student.studentId == studentId }
        if (seat != null) return plan.room.roomName to seat.seatNo
    }
    return null
}

class ExamOpsRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) {
    private fun school() = db.collection("schools").document(SCHOOL_ID)
    private fun examRef(examId: String) = school().collection("exams").document(examId)
    private fun roomsRef() = school().collection("settings").document("rooms")

    @Suppress("UNCHECKED_CAST")
    private fun readRoutine(data: Map<String, Any?>?): List<RoutineEntry> =
        (data?.get("routine") as? List<Map<String, Any?>> ?: emptyList()).map {
            RoutineEntry(
                classId = it["classId"] as? String ?: "",
                subjectId = it["subjectId"] as? String ?: "",
                subjectName = it["subjectName"] as? String ?: "",
                date = it["date"] as? String ?: "",
                startTime = it["startTime"] as? String ?: "",
                endTime = it["endTime"] as? String ?: "",
                roomId = it["roomId"] as? String,
            )
        }

    private fun RoutineEntry.toMap() = mapOf(
        "classId" to classId,
        "subjectId" to subjectId,
        "subjectName" to subjectName,
        "date" to date,
        "startTime" to startTime,
        "endTime" to endTime,
        "roomId" to roomId,
    )

    @Suppress("UNCHECKED_CAST")
    private fun readRooms(data: Map<String, Any?>?): List<Room> =
        (data?.get("rooms") as? List<Map<String, Any?>> ?: emptyList()).map {
            Room(
                roomId = it["roomId"] as? String ?: "",
                roomName = it["roomName"] as? String ?: "",
                capacity = (it["capacity"] as? Number)?.toInt() ?: 0,
                columns = (it["columns"] as? Number)?.toInt() ?: 1,
            )
        }

    private fun Room.toMap() = mapOf(
        "roomId" to roomId,
        "roomName" to roomName,
        "capacity" to capacity,
        "columns" to columns,
    )

    suspend fun getRoutine(examId: String): List<RoutineEntry> =
        readRoutine(examRef(examId).get().await().data)

    /**
     * Set one paper, in a transaction.
     *
     * The routine is a single array on one document, so writing a copy held in
     * the screen's memory would silently drop whatever was added in between —
     * two quick taps, or the office and a teacher at once, and a paper
     * vanishes. The document is re-read and merged inside the transaction,
     * which retries on conflict.
     */
    suspend fun setPaper(examId: String, entry: RoutineEntry): List<RoutineEntry> {
        val ref = examRef(examId)
        return db.runTransaction { tx ->
            val next = withEntry(readRoutine(tx.get(ref).data), entry)
            tx.set(
                ref,
                mapOf("routine" to next.map { it.toMap() },
                      "updatedAt" to FieldValue.serverTimestamp()),
                SetOptions.merge(),
            )
            next
        }.await()
    }

    suspend fun dropPaper(
        examId: String,
        classId: String,
        subjectId: String,
    ): List<RoutineEntry> {
        val ref = examRef(examId)
        return db.runTransaction { tx ->
            val next = withoutEntry(readRoutine(tx.get(ref).data), classId, subjectId)
            tx.set(
                ref,
                mapOf("routine" to next.map { it.toMap() },
                      "updatedAt" to FieldValue.serverTimestamp()),
                SetOptions.merge(),
            )
            next
        }.await()
    }

    /** A teacher may read the rooms; only the head may change them. A refusal
     *  here is normal for a guardian, so it reads as "no rooms set up". */
    suspend fun listRooms(): List<Room> =
        try {
            readRooms(roomsRef().get().await().data)
        } catch (e: Exception) {
            emptyList()
        }

    suspend fun saveRoom(room: Room): List<Room> {
        val ref = roomsRef()
        return db.runTransaction { tx ->
            val next = withRoom(readRooms(tx.get(ref).data), room)
            tx.set(
                ref,
                mapOf("rooms" to next.map { it.toMap() },
                      "updatedAt" to FieldValue.serverTimestamp()),
                SetOptions.merge(),
            )
            next
        }.await()
    }
}
