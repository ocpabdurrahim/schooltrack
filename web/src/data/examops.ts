/**
 * Exam operations: the routine, the rooms, the seat plan and the admit card.
 *
 * None of this needs a new collection. The routine lives on the exam document
 * and the rooms in settings, both of which already have rules — a new
 * collection would mean a rules change and a deploy for what is, in the end,
 * a printed timetable.
 */
import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { SCHOOL_ID, db } from '../firebase';
import type { StudentDetail } from './people';

const school = () => doc(db, 'schools', SCHOOL_ID);

export type RoutineEntry = {
  classId: string;
  subjectId: string;
  subjectName: string;
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:MM
  endTime: string;
  roomId?: string;
};

export type Room = {
  roomId: string;
  roomName: string;
  capacity: number;
  columns: number;     // benches across, for the printed plan
};

// ---------------------------------------------------------------------------
// routine — stored on exams/{examId}.routine

export async function getRoutine(examId: string): Promise<RoutineEntry[]> {
  const snap = await getDoc(doc(school(), 'exams', examId));
  return snap.exists() ? ((snap.data().routine ?? []) as RoutineEntry[]) : [];
}

export async function saveRoutine(examId: string, routine: RoutineEntry[]) {
  await setDoc(
    doc(school(), 'exams', examId),
    { routine: sortRoutine(routine), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/**
 * A subject sits once. Setting it again MOVES the paper rather than adding a
 * second sitting — an exam with Bangla on two mornings is never what was meant.
 */
export function withEntry(routine: RoutineEntry[], entry: RoutineEntry): RoutineEntry[] {
  return sortRoutine([
    ...routine.filter((r) => !(r.classId === entry.classId && r.subjectId === entry.subjectId)),
    entry,
  ]);
}

export function withoutEntry(
  routine: RoutineEntry[],
  classId: string,
  subjectId: string,
): RoutineEntry[] {
  return sortRoutine(
    routine.filter((r) => !(r.classId === classId && r.subjectId === subjectId)),
  );
}

/**
 * Set one paper, in a transaction.
 *
 * The routine is a single array on one document, so writing a copy held in the
 * screen's memory would silently drop whatever was added in between — two quick
 * clicks, or two people setting the routine at once, and a paper vanishes. The
 * document is re-read and merged inside the transaction instead, which retries
 * on conflict. The merge itself is `withEntry`, so it is tested on both clients.
 */
export async function setPaper(examId: string, entry: RoutineEntry): Promise<RoutineEntry[]> {
  const ref = doc(school(), 'exams', examId);
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = withEntry((snap.data()?.routine ?? []) as RoutineEntry[], entry);
    tx.set(ref, { routine: next, updatedAt: serverTimestamp() }, { merge: true });
    return next;
  });
}

export async function dropPaper(
  examId: string,
  classId: string,
  subjectId: string,
): Promise<RoutineEntry[]> {
  const ref = doc(school(), 'exams', examId);
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = withoutEntry((snap.data()?.routine ?? []) as RoutineEntry[], classId, subjectId);
    tx.set(ref, { routine: next, updatedAt: serverTimestamp() }, { merge: true });
    return next;
  });
}

/** By date then start time: a routine is read down the page, not by subject. */
export const sortRoutine = (routine: RoutineEntry[]) =>
  [...routine].sort((a, b) =>
    a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

export const routineFor = (routine: RoutineEntry[], classId: string) =>
  sortRoutine(routine.filter((r) => r.classId === classId));

/** The distinct exam days, in order — one seat plan per day. */
export const examDates = (routine: RoutineEntry[]) =>
  [...new Set(routine.map((r) => r.date))].sort();

// ---------------------------------------------------------------------------
// rooms — stored in settings/rooms

export async function listRooms(): Promise<Room[]> {
  try {
    const snap = await getDoc(doc(school(), 'settings', 'rooms'));
    return snap.exists() ? ((snap.data().rooms ?? []) as Room[]) : [];
  } catch {
    return [];
  }
}

export async function saveRooms(rooms: Room[]) {
  await setDoc(
    doc(school(), 'settings', 'rooms'),
    { rooms, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/** A room name is its identity, so saving it again edits it in place. */
export function withRoom(rooms: Room[], room: Room): Room[] {
  return [...rooms.filter((r) => r.roomId !== room.roomId), room]
    .sort((a, b) => a.roomName.localeCompare(b.roomName, undefined, { numeric: true }));
}

/** Same reasoning as setPaper: one array, one document, so read it inside the
 *  transaction rather than trusting the copy on screen. */
export async function saveRoom(room: Room): Promise<Room[]> {
  const ref = doc(school(), 'settings', 'rooms');
  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = withRoom((snap.data()?.rooms ?? []) as Room[], room);
    tx.set(ref, { rooms: next, updatedAt: serverTimestamp() }, { merge: true });
    return next;
  });
}

export const roomIdFor = (name: string) =>
  name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// ---------------------------------------------------------------------------
// seat plan

export type Seat = {
  seatNo: number;
  student: StudentDetail;
};

export type RoomPlan = {
  room: Room;
  seats: Seat[];
};

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
export function seatPlan(
  students: StudentDetail[],
  rooms: Room[],
): { plans: RoomPlan[]; unseated: StudentDetail[] } {
  const byClass = new Map<string, StudentDetail[]>();
  for (const s of [...students].sort((a, b) => a.rollNo - b.rollNo)) {
    byClass.set(s.classId, [...(byClass.get(s.classId) ?? []), s]);
  }

  // round-robin over the classes, largest first so the big class is spread out
  const queues = [...byClass.values()].sort((a, b) => b.length - a.length);
  const order: StudentDetail[] = [];
  let placed = 0;
  const total = students.length;
  let i = 0;
  while (placed < total) {
    const queue = queues[i % queues.length];
    if (queue.length) {
      const next = queue.shift()!;
      // avoid putting the same class in adjacent seats where another is free
      if (order.length && order[order.length - 1].classId === next.classId) {
        const other = queues.find((q) => q.length && q[0].classId !== next.classId);
        if (other) {
          order.push(other.shift()!);
          queue.unshift(next);
          placed++;
          i++;
          continue;
        }
      }
      order.push(next);
      placed++;
    }
    i++;
  }

  const plans: RoomPlan[] = [];
  let cursor = 0;
  for (const room of rooms) {
    if (cursor >= order.length) break;
    const seats = order.slice(cursor, cursor + room.capacity)
      .map((student, index) => ({ seatNo: index + 1, student }));
    cursor += seats.length;
    plans.push({ room, seats });
  }

  return { plans, unseated: order.slice(cursor) };
}

/** Where one student sits, for their admit card. */
export function seatOf(
  plans: RoomPlan[],
  studentId: string,
): { roomName: string; seatNo: number } | null {
  for (const plan of plans) {
    const seat = plan.seats.find((s) => s.student.studentId === studentId);
    if (seat) return { roomName: plan.room.roomName, seatNo: seat.seatNo };
  }
  return null;
}
