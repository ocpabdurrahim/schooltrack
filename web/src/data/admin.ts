/**
 * Everything that WRITES people and reference data.
 *
 * Nothing here deletes. A student leaves (status I), a member loses access
 * (active false), a class is retired (active false): the register, the
 * receipts and the attendance history all point at these documents, and a
 * hard delete would leave the history pointing at nothing.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { SCHOOL_ID, db } from '../firebase';
import type { StudentDetail } from './people';

const school = () => doc(db, 'schools', SCHOOL_ID);

/** The rules require updatedAt == request.time on every write (`stamped()`). */
const stamp = <T extends object>(data: T) => ({ ...data, updatedAt: serverTimestamp() });

/** Drops undefined so a merge never erases a good value with nothing. */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== ''),
  ) as T;
}

// ---------------------------------------------------------------------------
// school settings

export type SchoolSettings = {
  instituteName: string;
  sessionLabel?: string;
  address?: string;
  eiin?: string;
  headTeacher?: string;
  weekendDays: string[];
};

export const DEFAULT_SETTINGS: SchoolSettings = {
  instituteName: 'My School',
  weekendDays: ['FRI', 'SAT'],
};

export async function getSettings(): Promise<SchoolSettings | null> {
  try {
    const snap = await getDoc(doc(school(), 'settings', 'school'));
    return snap.exists() ? (snap.data() as SchoolSettings) : null;
  } catch {
    return null;   // a guardian may not read settings; the caller copes
  }
}

export async function saveSettings(s: SchoolSettings) {
  await setDoc(doc(school(), 'settings', 'school'), stamp(clean(s)), { merge: true });
}

// ---------------------------------------------------------------------------
// ids
//
// Student and staff numbers come from counters/{name}, in a transaction, so two
// people adding students at once cannot land on the same number. The rules let
// a counter move only forwards and only by one, which is why this reads and
// writes it rather than trusting the client's arithmetic.

async function nextNumber(counter: 'students' | 'staff'): Promise<string> {
  const ref = doc(school(), 'counters', counter);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = snap.exists() ? (snap.data().next as number) : 1;
    tx.set(ref, { next: next + 1 }, { merge: true });
    return String(next);
  });
}

/** class ids are readable rather than numeric: class-6-a, class-10-science. */
export const classIdFor = (className: string, section: string) =>
  `${className}-${section}`.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// ---------------------------------------------------------------------------
// classes

export type ClassRow = {
  classId: string;
  className: string;
  section: string;
  displayName: string;
  sortOrder: number;
  active: boolean;
};

export async function listAllClasses(): Promise<ClassRow[]> {
  const snap = await getDocs(query(collection(school(), 'classes'), orderBy('sortOrder')));
  return snap.docs.map((d) => ({ classId: d.id, ...(d.data() as Omit<ClassRow, 'classId'>) }));
}

export async function saveClass(c: Omit<ClassRow, 'displayName'> & { displayName?: string }) {
  const displayName = c.displayName?.trim() || `${c.className} - ${c.section}`;
  await setDoc(
    doc(school(), 'classes', c.classId),
    stamp(clean({
      className: c.className.trim(),
      section: c.section.trim(),
      displayName,
      sortOrder: c.sortOrder,
      active: c.active,
    })),
    { merge: true },
  );
}

// ---------------------------------------------------------------------------
// students

export type StudentInput = Omit<StudentDetail, 'studentId'> & { studentId?: string };

/**
 * Creates or updates one student.
 *
 * className and section are written onto the student as well as classId. That
 * is deliberate duplication: the register, the ID card and every list show the
 * class beside the name, and this saves a second read per row.
 */
export async function saveStudent(input: StudentInput, classes: ClassRow[]): Promise<string> {
  const cls = classes.find((c) => c.classId === input.classId);
  const studentId = input.studentId ?? (await nextNumber('students'));

  await setDoc(
    doc(school(), 'students', studentId),
    stamp(clean({
      fullName: input.fullName.trim(),
      rollNo: Number(input.rollNo) || 0,
      regNo: input.regNo,
      classId: input.classId,
      className: cls?.className ?? input.className,
      section: cls?.section ?? input.section,
      groupName: input.groupName,
      religion: input.religion,
      gender: input.gender,
      dob: input.dob,
      fatherName: input.fatherName,
      motherName: input.motherName,
      bloodGroup: input.bloodGroup,
      mobileNo: input.mobileNo,
      status: input.status ?? 'A',
    })),
    { merge: true },
  );

  return studentId;
}

// ---------------------------------------------------------------------------
// staff

export type StaffRow = {
  staffId: string;
  fullName: string;
  designation?: string;
  mobileNo?: string;
  staffStatus: 'ACTIVE' | 'ON_LEAVE' | 'LEFT';
  joinDate?: string;
};

export async function listStaff(): Promise<StaffRow[]> {
  const snap = await getDocs(query(collection(school(), 'staff'), orderBy('fullName')));
  return snap.docs.map((d) => ({ staffId: d.id, ...(d.data() as Omit<StaffRow, 'staffId'>) }));
}

export async function saveStaff(s: Omit<StaffRow, 'staffId'> & { staffId?: string }) {
  const staffId = s.staffId ?? (await nextNumber('staff'));
  await setDoc(
    doc(school(), 'staff', staffId),
    stamp(clean({
      fullName: s.fullName.trim(),
      designation: s.designation,
      mobileNo: s.mobileNo,
      staffStatus: s.staffStatus,
      joinDate: s.joinDate,
    })),
    { merge: true },
  );
  return staffId;
}

// ---------------------------------------------------------------------------
// who may sign in
//
// members/{email} and guardians/{email} are the app's own access control and
// are never mirrored from anywhere. The email IS the document id, lower case,
// because that is what the rules compare against request.auth.token.email.

export type MemberRow = {
  email: string;
  name: string;
  role: 'ADMIN' | 'TEACHER' | 'ACCOUNTS' | 'OFFICE';
  active: boolean;
};

export type GuardianRow = {
  email: string;
  name: string;
  studentIds: string[];
  active: boolean;
};

export async function listMembers(): Promise<MemberRow[]> {
  const snap = await getDocs(query(collection(school(), 'members'), orderBy('name')));
  return snap.docs.map((d) => ({ email: d.id, ...(d.data() as Omit<MemberRow, 'email'>) }));
}

export async function saveMember(m: MemberRow) {
  const email = m.email.trim().toLowerCase();
  await setDoc(
    doc(school(), 'members', email),
    stamp({ email, name: m.name.trim(), role: m.role, active: m.active, deleted: false }),
    { merge: true },
  );
}

export async function listGuardians(): Promise<GuardianRow[]> {
  const snap = await getDocs(query(collection(school(), 'guardians'), orderBy('name')));
  return snap.docs.map((d) => ({ email: d.id, ...(d.data() as Omit<GuardianRow, 'email'>) }));
}

export async function saveGuardian(g: GuardianRow) {
  const email = g.email.trim().toLowerCase();
  await setDoc(
    doc(school(), 'guardians', email),
    stamp({
      email,
      name: g.name.trim(),
      studentIds: g.studentIds,
      active: g.active,
    }),
    { merge: true },
  );
}

/**
 * An account that can sign in but holds neither record sees "no access".
 * Nothing here creates the Firebase Auth account itself — that is the person's
 * own sign-up, and granting access is a separate, deliberate act.
 */
