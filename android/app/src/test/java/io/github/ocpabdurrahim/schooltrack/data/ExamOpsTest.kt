package io.github.ocpabdurrahim.schooltrack.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The same cases exist in web/src/data/examops.test.ts. */
class ExamOpsTest {

    private fun student(id: String, classId: String, roll: Long) = StudentDetail(
        studentId = id, fullName = "S$id", rollNo = roll, regNo = null,
        classId = classId, className = "Class $classId", section = "A",
        groupName = null, gender = null, dob = null, fatherName = null,
        motherName = null, bloodGroup = null, mobileNo = null, status = "A",
    )

    private fun room(name: String, capacity: Int) =
        Room(roomId = name, roomName = name, capacity = capacity, columns = 2)

    private fun paper(subjectId: String, date: String, classId: String = "1") = RoutineEntry(
        classId = classId, subjectId = subjectId, subjectName = subjectId,
        date = date, startTime = "10:00", endTime = "13:00",
    )

    @Test
    fun `routine reads down the page by date then start time`() {
        val sorted = sortRoutine(
            listOf(
                RoutineEntry("1", "b", "B", "2026-12-02", "10:00", "12:00"),
                RoutineEntry("1", "c", "C", "2026-12-01", "14:00", "16:00"),
                RoutineEntry("1", "a", "A", "2026-12-01", "10:00", "12:00"),
            ),
        )
        assertEquals(listOf("A", "C", "B"), sorted.map { it.subjectName })
    }

    @Test
    fun `setting a subject again moves it rather than giving it a second sitting`() {
        val after = withEntry(listOf(paper("a", "2026-12-01")), paper("a", "2026-12-05"))
        assertEquals(1, after.size)
        assertEquals("2026-12-05", after[0].date)
    }

    @Test
    fun `the same subject in another class is a different paper`() {
        val after = withEntry(listOf(paper("a", "2026-12-01", "1")), paper("a", "2026-12-01", "2"))
        assertEquals(2, after.size)
    }

    @Test
    fun `adding leaves the rest alone and comes back sorted`() {
        val after = withEntry(listOf(paper("b", "2026-12-05")), paper("a", "2026-12-01"))
        assertEquals(listOf("a", "b"), after.map { it.subjectId })
    }

    @Test
    fun `removing takes only the one paper`() {
        val after = withoutEntry(
            listOf(
                paper("a", "2026-12-01"),
                paper("b", "2026-12-02"),
                paper("a", "2026-12-01", "2"),
            ),
            "1", "a",
        )
        assertEquals(listOf("2:a", "1:b"), after.map { "${it.classId}:${it.subjectId}" })
    }

    @Test
    fun `a room is edited in place and the list sorts the way a person numbers rooms`() {
        val after = withRoom(
            listOf(
                Room("Room 10", "Room 10", 30, 2),
                Room("Room 2", "Room 2", 30, 2),
            ),
            Room("Room 2", "Room 2", 44, 2),
        )
        assertEquals(listOf("Room 2", "Room 10"), after.map { it.roomName })
        assertEquals(44, after[0].capacity)
    }

    @Test
    fun `exam days are listed once each, in order`() {
        val days = examDates(
            listOf(
                RoutineEntry("1", "a", "A", "2026-12-02", "10:00", "12:00"),
                RoutineEntry("2", "b", "B", "2026-12-01", "10:00", "12:00"),
                RoutineEntry("1", "c", "C", "2026-12-02", "14:00", "16:00"),
            ),
        )
        assertEquals(listOf("2026-12-01", "2026-12-02"), days)
    }

    @Test
    fun `two students of the same class are not seated next to each other`() {
        val students = listOf(
            student("1", "six", 1), student("2", "six", 2), student("3", "six", 3),
            student("4", "seven", 1), student("5", "seven", 2), student("6", "seven", 3),
        )
        val (plans, unseated) = seatPlan(students, listOf(room("Hall", 10)))
        assertTrue(unseated.isEmpty())

        val classes = plans[0].seats.map { it.student.classId }
        for (i in 1 until classes.size) {
            assertTrue(
                "seats $i and ${i - 1} are both ${classes[i]}",
                classes[i] != classes[i - 1],
            )
        }
    }

    @Test
    fun `roll order is kept within a class, so the plan is the same every print`() {
        val students = listOf(
            student("3", "six", 3), student("1", "six", 1), student("2", "six", 2),
            student("4", "seven", 1),
        )
        val first = seatPlan(students, listOf(room("Hall", 10)))
        val again = seatPlan(students, listOf(room("Hall", 10)))
        assertEquals(
            first.plans[0].seats.map { it.student.studentId },
            again.plans[0].seats.map { it.student.studentId },
        )

        val six = first.plans[0].seats
            .filter { it.student.classId == "six" }
            .map { it.student.rollNo }
        assertEquals(listOf(1L, 2L, 3L), six)
    }

    @Test
    fun `with only one class left, adjacent same-class seats are allowed`() {
        val students = listOf(student("1", "six", 1), student("2", "six", 2), student("3", "six", 3))
        val (plans, unseated) = seatPlan(students, listOf(room("Hall", 10)))
        assertEquals(3, plans[0].seats.size)
        assertTrue(unseated.isEmpty())
    }

    @Test
    fun `rooms fill in order and seats are numbered from one in each`() {
        val students = (1..5).map { student(it.toString(), "six", it.toLong()) }
        val (plans, _) = seatPlan(students, listOf(room("A", 2), room("B", 5)))
        assertEquals(listOf("A", "B"), plans.map { it.room.roomName })
        assertEquals(listOf(1, 2), plans[0].seats.map { it.seatNo })
        assertEquals(listOf(1, 2, 3), plans[1].seats.map { it.seatNo })
    }

    @Test
    fun `anyone who did not fit is reported rather than dropped`() {
        val students = (1..4).map { student(it.toString(), "six", it.toLong()) }
        val (plans, unseated) = seatPlan(students, listOf(room("A", 2)))
        assertEquals(2, plans[0].seats.size)
        assertEquals(listOf("3", "4"), unseated.map { it.studentId })
    }

    @Test
    fun `a student's seat is found for their admit card`() {
        val students = listOf(student("1", "six", 1), student("2", "six", 2), student("3", "six", 3))
        val (plans, _) = seatPlan(students, listOf(room("A", 2), room("B", 5)))
        assertEquals("B" to 1, seatOf(plans, "3"))
        assertNull(seatOf(plans, "nobody"))
    }

    @Test
    fun `a room id is readable and stable`() {
        assertEquals("ROOM_101", roomIdFor("Room 101"))
        assertEquals("MAIN_HALL", roomIdFor("  main hall  "))
    }
}
