import { useEffect, useMemo, useState } from 'react';
import { type SchoolSettings, getSettings } from '../data/admin';
import { type Exam, listExams } from '../data/exams';
import {
  type Room,
  type RoutineEntry,
  examDates,
  getRoutine,
  listRooms,
  seatPlan,
} from '../data/examops';
import { type StudentDetail, findStudents } from '../data/people';

/**
 * The seat plan for one exam day. APEX p42.
 *
 * Only the classes that actually have a paper that day are seated — seating a
 * class that is not sitting would hand the invigilator a sheet of empty chairs.
 */
export default function SeatPlan() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [school, setSchool] = useState<SchoolSettings | null>(null);

  const [examId, setExamId] = useState('');
  const [routine, setRoutine] = useState<RoutineEntry[]>([]);
  const [date, setDate] = useState('');
  const [students, setStudents] = useState<StudentDetail[]>([]);

  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    Promise.all([listExams(), listRooms(), getSettings()])
      .then(([e, r, s]) => {
        setExams(e); setRooms(r); setSchool(s);
        setExamId(e[0]?.examId ?? '');
      })
      .catch(() => setProblem('Could not read the exams.'))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!examId) return;
    setBusy(true);
    getRoutine(examId)
      .then((r) => {
        setRoutine(r);
        const days = examDates(r);
        setDate((d) => (days.includes(d) ? d : days[0] ?? ''));
      })
      .catch(() => setProblem('Could not read the routine.'))
      .finally(() => setBusy(false));
  }, [examId]);

  const days = useMemo(() => examDates(routine), [routine]);

  // the classes sitting a paper on the chosen day
  const sitting = useMemo(
    () => [...new Set(routine.filter((r) => r.date === date).map((r) => r.classId))],
    [routine, date],
  );

  useEffect(() => {
    if (!sitting.length) { setStudents([]); return; }
    let live = true;
    setBusy(true);
    Promise.all(sitting.map((classId) => findStudents(classId, '')))
      .then((lists) => { if (live) setStudents(lists.flat()); })
      .catch(() => { if (live) setProblem('Could not read the students.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [sitting.join('|')]);

  const { plans, unseated } = useMemo(
    () => seatPlan(students, rooms),
    [students, rooms],
  );

  const exam = exams.find((e) => e.examId === examId);

  /**
   * What is being sat, as the invigilator needs it: the subject AND whose it
   * is. Two classes sitting the same paper would otherwise read "Bangla,
   * Bangla", which says nothing about who is in the room.
   */
  const papers = useMemo(() => {
    const label = (classId: string) => {
      const s = students.find((st) => st.classId === classId);
      return s ? `${s.className} - ${s.section}` : classId;
    };
    const bySubject = new Map<string, string[]>();
    for (const r of routine.filter((x) => x.date === date)) {
      bySubject.set(r.subjectName, [...(bySubject.get(r.subjectName) ?? []), label(r.classId)]);
    }
    return [...bySubject.entries()]
      .map(([subject, classNames]) => `${subject} (${classNames.join(', ')})`);
  }, [routine, date, students]);

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Seat plan</h1>
        <h2>{exam ? `${exam.examName} ${exam.examYear}` : 'Pick an exam'}</h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="ex">Exam</label>
            <select id="ex" value={examId} onChange={(e) => setExamId(e.target.value)}>
              {exams.map((e) => (
                <option key={e.examId} value={e.examId}>{e.examName} {e.examYear}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor="dt">Exam day</label>
            <select id="dt" value={date} onChange={(e) => setDate(e.target.value)}>
              {days.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {!days.length && (
          <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
            This exam has no routine yet — set the papers first and the exam days
            will appear here.
          </p>
        )}
        {!rooms.length && (
          <div className="err">
            There are no rooms yet. Add them on the routine page; the plan needs
            somewhere to seat the students.
          </div>
        )}
        {unseated.length > 0 && (
          <div className="err">
            {unseated.length} student{unseated.length === 1 ? '' : 's'} did not fit
            in the rooms: {unseated.map((s) => `${s.className}-${s.section} roll ${s.rollNo}`).join(', ')}.
            Add a room or more seats.
          </div>
        )}
        {problem && <div className="err">{problem}</div>}
        {busy && <p>Working…</p>}

        <button onClick={() => window.print()} disabled={!plans.length}>
          Print {plans.length} room{plans.length === 1 ? '' : 's'}
        </button>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
          Two students of the same class are never seated side by side while
          another class still has someone waiting.
        </p>
      </div>

      {plans.map((plan) => {
        const rows: typeof plan.seats[] = [];
        const across = Math.max(1, plan.room.columns);
        for (let i = 0; i < plan.seats.length; i += across) {
          rows.push(plan.seats.slice(i, i + across));
        }
        return (
          <div className="card" key={plan.room.roomId}>
            <div className="print-sheet" style={{ breakAfter: 'page', pageBreakAfter: 'always' }}>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>
                  {school?.instituteName ?? 'School'}
                </div>
                <div style={{ fontWeight: 600 }}>
                  SEAT PLAN — {plan.room.roomName.toUpperCase()}
                </div>
                <div style={{ fontSize: 13 }}>
                  {exam ? `${exam.examName} ${exam.examYear} · ` : ''}{date}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {papers.join(' · ')}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((seat) => (
                        <td key={seat.seatNo} style={{
                          border: '1px solid var(--line)', padding: '6px 8px',
                          width: `${Math.floor(100 / across)}%`, verticalAlign: 'top',
                        }}>
                          <div style={{ fontWeight: 700 }}>Seat {seat.seatNo}</div>
                          <div>{seat.student.fullName}</div>
                          <div style={{ color: 'var(--muted)' }}>
                            {seat.student.className} - {seat.student.section} · Roll {seat.student.rollNo}
                          </div>
                        </td>
                      ))}
                      {row.length < across && (
                        <td colSpan={across - row.length}
                            style={{ border: '1px solid var(--line)' }} />
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{
                display: 'flex', justifyContent: 'space-between', marginTop: 40, fontSize: 12,
              }}>
                <div style={{ borderTop: '1px solid #000', paddingTop: 4, minWidth: 160 }}>
                  Invigilator
                </div>
                <div style={{ borderTop: '1px solid #000', paddingTop: 4, minWidth: 160,
                              textAlign: 'right' }}>
                  {school?.headTeacher ?? 'Head teacher'}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {!busy && !plans.length && days.length > 0 && rooms.length > 0 && (
        <div className="card">
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            No students in the sections sitting on {date}.
          </p>
        </div>
      )}
    </div>
  );
}
