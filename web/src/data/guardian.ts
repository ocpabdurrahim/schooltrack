import { type AttendanceSummary, type StudentDetail, attendanceFor, getStudent, startOfMonth } from './people';

export type Child = { student: StudentDetail; month: AttendanceSummary };

/**
 * The children this guardian may see.
 *
 * The list comes from THEIR OWN guardians/{email} document — never from a
 * field on the student — so the only way to widen it is for an administrator
 * to edit that document (data-model.md §2). The rules enforce the same thing
 * independently; this function would simply be refused if it asked for more.
 *
 * One missing child does not break the page: a student who has been removed
 * is skipped rather than failing the whole list.
 */
export async function myChildren(studentIds: string[]): Promise<Child[]> {
  const found = await Promise.all(
    studentIds.map(async (id) => {
      try {
        const student = await getStudent(id);
        if (!student) return null;
        const month = await attendanceFor(id, startOfMonth());
        return { student, month };
      } catch {
        return null;
      }
    }),
  );
  return found.filter((c): c is Child => c !== null);
}
