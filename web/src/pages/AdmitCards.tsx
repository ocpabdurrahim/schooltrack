import { useEffect, useMemo, useState } from 'react';
import { type SchoolSettings, getSettings } from '../data/admin';
import { type SchoolClass, listClasses } from '../data/attendance';
import { type Exam, listExams } from '../data/exams';
import {
  type Room,
  type RoutineEntry,
  examDates,
  getRoutine,
  listRooms,
  routineFor,
  seatOf,
  seatPlan,
} from '../data/examops';
import { type StudentDetail, findStudents } from '../data/people';

/**
 * Printable admit cards. APEX p40.
 *
 * Each card carries the student's own routine and, for every exam day, the room
 * and seat the seat plan gives them — the two things a child is turned away at
 * the hall door for not knowing. Both are computed from the same functions the
 * seat plan page prints, so a card can never disagree with the plan on the wall.
 */
export default function AdmitCards() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [school, setSchool] = useState<SchoolSettings | null>(null);

  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [routine, setRoutine] = useState<RoutineEntry[]>([]);
  const [byClass, setByClass] = useState<Record<string, StudentDetail[]>>({});

  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    Promise.all([listExams(), listClasses(), listRooms(), getSettings()])
      .then(([e, c, r, s]) => {
        setExams(e); setClasses(c); setRooms(r); setSchool(s);
        setExamId(e[0]?.examId ?? '');
        setClassId(c[0]?.classId ?? '');
      })
      .catch(() => setProblem('Could not read the exams.'))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!examId) return;
    getRoutine(examId).then(setRoutine).catch(() => setProblem('Could not read the routine.'));
  }, [examId]);

  // every class with a paper in this exam, because the seat plan interleaves
  // them — a card cannot be printed from one section alone
  const examClasses = useMemo(
    () => [...new Set(routine.map((r) => r.classId))].sort(),
    [routine],
  );

  useEffect(() => {
    const wanted = [...new Set([...examClasses, classId])].filter(Boolean);
    if (!wanted.length) return;
    let live = true;
    setBusy(true);
    Promise.all(wanted.map(async (id) => [id, await findStudents(id, '')] as const))
      .then((pairs) => { if (live) setByClass(Object.fromEntries(pairs)); })
      .catch(() => { if (live) setProblem('Could not read the students.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [examClasses.join('|'), classId]);

  /** One seat plan per exam day, exactly as the seat plan page builds it. */
  const seatsByDate = useMemo(() => {
    const out: Record<string, ReturnType<typeof seatPlan>['plans']> = {};
    for (const date of examDates(routine)) {
      const sitting = [...new Set(routine.filter((r) => r.date === date).map((r) => r.classId))];
      const students = sitting.flatMap((id) => byClass[id] ?? []);
      out[date] = seatPlan(students, rooms).plans;
    }
    return out;
  }, [routine, byClass, rooms]);

  const exam = exams.find((e) => e.examId === examId);
  const section = classes.find((c) => c.classId === classId);
  const students = byClass[classId] ?? [];
  const mine = routineFor(routine, classId);

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Admit cards</h1>
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
            <label htmlFor="cl">Section</label>
            <select id="cl" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </div>
        </div>

        {!mine.length && (
          <div className="err">
            This section has no papers in this exam. Set the routine first — a card
            with no subjects on it is worse than no card.
          </div>
        )}
        {!rooms.length && mine.length > 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            No rooms are set up, so the cards will print without a room and seat.
          </p>
        )}
        {problem && <div className="err">{problem}</div>}
        {busy && <p>Working…</p>}

        <button onClick={() => window.print()} disabled={!students.length || !mine.length}>
          Print {students.length} card{students.length === 1 ? '' : 's'}
        </button>
      </div>

      {mine.length > 0 && students.map((s) => (
        <div className="card" key={s.studentId}>
          <div className="print-sheet" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
            <div style={{
              border: '1px solid #000', borderRadius: 6, padding: '6mm',
            }}>
              <div style={{ textAlign: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {school?.instituteName ?? 'School'}
                </div>
                {school?.eiin && <div style={{ fontSize: 11 }}>EIIN {school.eiin}</div>}
                <div style={{ fontWeight: 700, marginTop: 4 }}>
                  ADMIT CARD{exam ? ` — ${exam.examName.toUpperCase()} ${exam.examYear}` : ''}
                </div>
              </div>

              <table style={{ width: '100%', fontSize: 13, marginBottom: 10 }}>
                <tbody>
                  <tr>
                    <td style={{ width: '18%', color: 'var(--muted)' }}>Name</td>
                    <td style={{ width: '32%', fontWeight: 700 }}>{s.fullName}</td>
                    <td style={{ width: '18%', color: 'var(--muted)' }}>Class</td>
                    <td>{s.className} - {s.section}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--muted)' }}>Roll</td>
                    <td style={{ fontWeight: 700 }}>{s.rollNo}</td>
                    <td style={{ color: 'var(--muted)' }}>Reg no</td>
                    <td>{s.regNo || '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--muted)' }}>Father</td>
                    <td>{s.fatherName || '—'}</td>
                    <td style={{ color: 'var(--muted)' }}>Student no</td>
                    <td>{s.studentId}</td>
                  </tr>
                </tbody>
              </table>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #000', textAlign: 'left' }}>
                    <th style={{ padding: '4px 3px' }}>Date</th>
                    <th style={{ padding: '4px 3px' }}>Day</th>
                    <th style={{ padding: '4px 3px' }}>Subject</th>
                    <th style={{ padding: '4px 3px' }}>Time</th>
                    <th style={{ padding: '4px 3px' }}>Room</th>
                    <th style={{ padding: '4px 3px' }}>Seat</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((r) => {
                    const seat = seatOf(seatsByDate[r.date] ?? [], s.studentId);
                    return (
                      <tr key={r.subjectId} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '4px 3px' }}>{r.date}</td>
                        <td style={{ padding: '4px 3px' }}>
                          {new Date(`${r.date}T00:00:00Z`).toLocaleDateString('en-GB', {
                            weekday: 'short', timeZone: 'UTC',
                          })}
                        </td>
                        <td style={{ padding: '4px 3px' }}>{r.subjectName}</td>
                        <td style={{ padding: '4px 3px' }}>{r.startTime}–{r.endTime}</td>
                        <td style={{ padding: '4px 3px' }}>{seat?.roomName ?? '—'}</td>
                        <td style={{ padding: '4px 3px' }}>{seat?.seatNo ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-end', marginTop: 34, fontSize: 11,
              }}>
                <div style={{ borderTop: '1px solid #000', paddingTop: 3, minWidth: 140 }}>
                  Student signature
                </div>
                <div style={{ borderTop: '1px solid #000', paddingTop: 3, minWidth: 140,
                              textAlign: 'right' }}>
                  {school?.headTeacher ?? 'Head teacher'}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}

      {!busy && mine.length > 0 && students.length === 0 && (
        <div className="card">
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            No students in {section?.displayName ?? 'this section'}.
          </p>
        </div>
      )}
    </div>
  );
}
