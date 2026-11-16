import { describe, expect, it } from 'vitest';
import {
  type Room,
  type RoutineEntry,
  examDates,
  roomIdFor,
  seatOf,
  seatPlan,
  sortRoutine,
  withEntry,
  withRoom,
  withoutEntry,
} from './examops';
import type { StudentDetail } from './people';

/** The same cases exist in android/.../ExamOpsTest.kt. */

const student = (id: string, classId: string, roll: number): StudentDetail => ({
  studentId: id, fullName: `S${id}`, rollNo: roll,
  classId, className: `Class ${classId}`, section: 'A', status: 'A',
});

const room = (name: string, capacity: number): Room => ({
  roomId: name, roomName: name, capacity, columns: 2,
});

describe('sortRoutine', () => {
  it('reads down the page: by date, then by start time', () => {
    const sorted = sortRoutine([
      { classId: '1', subjectId: 'b', subjectName: 'B', date: '2026-12-02', startTime: '10:00', endTime: '12:00' },
      { classId: '1', subjectId: 'c', subjectName: 'C', date: '2026-12-01', startTime: '14:00', endTime: '16:00' },
      { classId: '1', subjectId: 'a', subjectName: 'A', date: '2026-12-01', startTime: '10:00', endTime: '12:00' },
    ]);
    expect(sorted.map((r) => r.subjectName)).toEqual(['A', 'C', 'B']);
  });
});

describe('withEntry and withoutEntry', () => {
  const paper = (subjectId: string, date: string, classId = '1'): RoutineEntry => ({
    classId, subjectId, subjectName: subjectId,
    date, startTime: '10:00', endTime: '13:00',
  });

  it('moves a subject rather than giving it a second sitting', () => {
    const after = withEntry([paper('a', '2026-12-01')], paper('a', '2026-12-05'));
    expect(after).toHaveLength(1);
    expect(after[0].date).toBe('2026-12-05');
  });

  it('keeps the same subject in another class — they are different papers', () => {
    const after = withEntry([paper('a', '2026-12-01', '1')], paper('a', '2026-12-01', '2'));
    expect(after).toHaveLength(2);
  });

  it('adds without disturbing the rest, and comes back sorted', () => {
    const after = withEntry([paper('b', '2026-12-05')], paper('a', '2026-12-01'));
    expect(after.map((r) => r.subjectId)).toEqual(['a', 'b']);
  });

  it('removes only the one paper', () => {
    const after = withoutEntry(
      [paper('a', '2026-12-01'), paper('b', '2026-12-02'), paper('a', '2026-12-01', '2')],
      '1', 'a',
    );
    expect(after.map((r) => `${r.classId}:${r.subjectId}`)).toEqual(['2:a', '1:b']);
  });
});

describe('withRoom', () => {
  it('edits a room in place and sorts the list the way a person numbers rooms', () => {
    const r = (name: string, capacity: number): Room => ({
      roomId: name, roomName: name, capacity, columns: 2,
    });
    const after = withRoom([r('Room 10', 30), r('Room 2', 30)], r('Room 2', 44));
    expect(after.map((x) => x.roomName)).toEqual(['Room 2', 'Room 10']);
    expect(after[0].capacity).toBe(44);
  });
});

describe('examDates', () => {
  it('lists each day once, in order', () => {
    expect(examDates([
      { classId: '1', subjectId: 'a', subjectName: 'A', date: '2026-12-02', startTime: '10:00', endTime: '12:00' },
      { classId: '2', subjectId: 'b', subjectName: 'B', date: '2026-12-01', startTime: '10:00', endTime: '12:00' },
      { classId: '1', subjectId: 'c', subjectName: 'C', date: '2026-12-02', startTime: '14:00', endTime: '16:00' },
    ])).toEqual(['2026-12-01', '2026-12-02']);
  });
});

describe('seatPlan', () => {
  it('does not seat two of the same class next to each other', () => {
    const students = [
      student('1', 'six', 1), student('2', 'six', 2), student('3', 'six', 3),
      student('4', 'seven', 1), student('5', 'seven', 2), student('6', 'seven', 3),
    ];
    const { plans, unseated } = seatPlan(students, [room('Hall', 10)]);
    expect(unseated).toEqual([]);

    const classes = plans[0].seats.map((s) => s.student.classId);
    for (let i = 1; i < classes.length; i++) {
      expect(classes[i]).not.toBe(classes[i - 1]);
    }
  });

  it('keeps roll order within a class, so the plan is the same every print', () => {
    const students = [
      student('3', 'six', 3), student('1', 'six', 1), student('2', 'six', 2),
      student('4', 'seven', 1),
    ];
    const first = seatPlan(students, [room('Hall', 10)]);
    const again = seatPlan(students, [room('Hall', 10)]);
    expect(first.plans[0].seats.map((s) => s.student.studentId))
      .toEqual(again.plans[0].seats.map((s) => s.student.studentId));

    const six = first.plans[0].seats
      .filter((s) => s.student.classId === 'six')
      .map((s) => s.student.rollNo);
    expect(six).toEqual([1, 2, 3]);
  });

  it('falls back to adjacent same-class seats when only one class is left', () => {
    const students = [student('1', 'six', 1), student('2', 'six', 2), student('3', 'six', 3)];
    const { plans, unseated } = seatPlan(students, [room('Hall', 10)]);
    expect(plans[0].seats).toHaveLength(3);
    expect(unseated).toEqual([]);
  });

  it('fills rooms in order and numbers seats from one in each', () => {
    const students = Array.from({ length: 5 }, (_, i) => student(String(i + 1), 'six', i + 1));
    const { plans } = seatPlan(students, [room('A', 2), room('B', 5)]);
    expect(plans.map((p) => p.room.roomName)).toEqual(['A', 'B']);
    expect(plans[0].seats.map((s) => s.seatNo)).toEqual([1, 2]);
    expect(plans[1].seats.map((s) => s.seatNo)).toEqual([1, 2, 3]);
  });

  it('reports anyone who did not fit instead of dropping them', () => {
    const students = Array.from({ length: 4 }, (_, i) => student(String(i + 1), 'six', i + 1));
    const { plans, unseated } = seatPlan(students, [room('A', 2)]);
    expect(plans[0].seats).toHaveLength(2);
    expect(unseated.map((s) => s.studentId)).toEqual(['3', '4']);
  });
});

describe('seatOf', () => {
  it('finds a student for their admit card', () => {
    const students = [student('1', 'six', 1), student('2', 'six', 2), student('3', 'six', 3)];
    const { plans } = seatPlan(students, [room('A', 2), room('B', 5)]);
    expect(seatOf(plans, '3')).toEqual({ roomName: 'B', seatNo: 1 });
    expect(seatOf(plans, 'nobody')).toBeNull();
  });
});

describe('roomIdFor', () => {
  it('makes a readable, stable id', () => {
    expect(roomIdFor('Room 101')).toBe('ROOM_101');
    expect(roomIdFor('  main hall  ')).toBe('MAIN_HALL');
  });
});
