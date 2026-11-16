import { useEffect, useState } from 'react';
import { type SchoolSettings, getSettings } from '../data/admin';
import { type SchoolClass, listClasses } from '../data/attendance';
import { type Exam, type Subject, listExams, listSubjects, subjectsForClass } from '../data/exams';
import {
  type Room,
  type RoutineEntry,
  dropPaper,
  getRoutine,
  listRooms,
  roomIdFor,
  saveRoom,
  setPaper,
  sortRoutine,
} from '../data/examops';

/** The exam timetable, and the rooms the seat plan will use. APEX p39 and p41. */
export default function Routine() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [school, setSchool] = useState<SchoolSettings | null>(null);

  const [examId, setExamId] = useState('');
  const [routine, setRoutine] = useState<RoutineEntry[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('13:00');

  const [roomName, setRoomName] = useState('');
  const [capacity, setCapacity] = useState(30);
  const [columns, setColumns] = useState(2);

  const [busy, setBusy] = useState(true);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');

  useEffect(() => {
    Promise.all([listExams(), listSubjects(), listClasses(), listRooms(), getSettings()])
      .then(([e, s, c, r, set]) => {
        setExams(e); setSubjects(s); setClasses(c); setRooms(r); setSchool(set);
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

  const exam = exams.find((e) => e.examId === examId);
  const section = classes.find((c) => c.classId === classId);
  const className = section?.displayName.split(' - ')[0] ?? '';
  const classSubjects = className ? subjectsForClass(subjects, className) : subjects;

  useEffect(() => {
    if (classSubjects.length && !classSubjects.some((s) => s.subjectId === subjectId)) {
      setSubjectId(classSubjects[0].subjectId);
    }
  }, [classId, subjects]);

  async function addEntry() {
    const subject = classSubjects.find((s) => s.subjectId === subjectId);
    if (!subject || !date) { setProblem('Pick a subject and a date.'); return; }
    setBusy(true); setProblem(''); setNote('');
    try {
      // the transaction re-reads and merges, so a second quick click cannot
      // overwrite the paper the first one just set
      setRoutine(await setPaper(examId, {
        classId, subjectId, subjectName: subject.subjectName,
        date, startTime, endTime,
      }));
      setNote(`${subject.subjectName} set for ${date}.`);
    } catch {
      setProblem('That was refused. Only an administrator may set the routine.');
    }
    setBusy(false);
  }

  async function removeEntry(entry: RoutineEntry) {
    setBusy(true);
    try {
      setRoutine(await dropPaper(examId, entry.classId, entry.subjectId));
    } catch {
      setProblem('That change was refused.');
    }
    setBusy(false);
  }

  async function addRoom() {
    if (!roomName.trim()) { setProblem('A room needs a name.'); return; }
    setBusy(true); setProblem('');
    try {
      setRooms(await saveRoom({
        roomId: roomIdFor(roomName), roomName: roomName.trim(), capacity, columns,
      }));
      setRoomName('');
    } catch {
      setProblem('That was refused. Only an administrator may change the rooms.');
    }
    setBusy(false);
  }

  const forClass = sortRoutine(routine.filter((r) => r.classId === classId));

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Exam routine</h1>
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
        {problem && <div className="err">{problem}</div>}
        {note && <div style={{ color: 'var(--accent)', fontSize: 14 }}>{note}</div>}
      </div>

      <div className="card no-print">
        <h2>Set a paper</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 180px' }}>
            <label htmlFor="su">Subject</label>
            <select id="su" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {classSubjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>{s.subjectName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="dt">Date</label>
            <input id="dt" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 110px' }}>
            <label htmlFor="st">From</label>
            <input id="st" type="time" value={startTime}
                   onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 110px' }}>
            <label htmlFor="et">To</label>
            <input id="et" type="time" value={endTime}
                   onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <button onClick={addEntry} disabled={busy || !classSubjects.length}>Set paper</button>
        {classSubjects.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
            {className || 'This section'} sits no subjects yet. Tick it on the
            subjects under Exams first — otherwise there is nothing to timetable.
          </p>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
            Setting a subject again moves it rather than adding a second sitting.
          </p>
        )}
      </div>

      <div className="card">
        <div className="print-sheet">
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{school?.instituteName ?? 'School'}</div>
            <div style={{ fontWeight: 600 }}>
              EXAM ROUTINE{exam ? ` — ${exam.examName.toUpperCase()} ${exam.examYear}` : ''}
            </div>
            <div style={{ fontSize: 13 }}>{section?.displayName}</div>
          </div>

          {forClass.length === 0 && (
            <p style={{ color: 'var(--muted)', margin: 0 }}>
              No papers set for this section yet.
            </p>
          )}

          {forClass.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 4px' }}>Date</th>
                  <th style={{ padding: '6px 4px' }}>Day</th>
                  <th style={{ padding: '6px 4px' }}>Subject</th>
                  <th style={{ padding: '6px 4px' }}>Time</th>
                  <th style={{ padding: '6px 4px' }} className="no-print" />
                </tr>
              </thead>
              <tbody>
                {forClass.map((r) => (
                  <tr key={r.subjectId} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '6px 4px' }}>{r.date}</td>
                    <td style={{ padding: '6px 4px' }}>
                      {new Date(`${r.date}T00:00:00Z`).toLocaleDateString('en-GB', {
                        weekday: 'long', timeZone: 'UTC',
                      })}
                    </td>
                    <td style={{ padding: '6px 4px' }}>{r.subjectName}</td>
                    <td style={{ padding: '6px 4px' }}>{r.startTime} – {r.endTime}</td>
                    <td style={{ padding: '6px 4px' }} className="no-print">
                      <button className="link" onClick={() => removeEntry(r)}>remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {forClass.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 48 }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
                {school?.headTeacher ?? 'Head teacher'}
              </div>
            </div>
          )}
        </div>
        <button className="no-print" onClick={() => window.print()}
                disabled={!forClass.length}>Print routine</button>
      </div>

      <div className="card no-print">
        <h2>Rooms</h2>
        {rooms.map((r) => (
          <div className="row" key={r.roomId}>
            <span style={{ color: 'var(--ink)' }}>{r.roomName}</span>
            <span>{r.capacity} seats · {r.columns} across</span>
          </div>
        ))}
        {rooms.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            No rooms yet — the seat plan needs at least one.
          </p>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 180px' }}>
            <label htmlFor="rn">Room</label>
            <input id="rn" placeholder="Room 101" value={roomName}
                   onChange={(e) => setRoomName(e.target.value)} />
          </div>
          <div style={{ flex: '1 1 110px' }}>
            <label htmlFor="cap">Seats</label>
            <input id="cap" type="number" value={capacity}
                   onChange={(e) => setCapacity(Number(e.target.value))} />
          </div>
          <div style={{ flex: '1 1 110px' }}>
            <label htmlFor="col">Across</label>
            <input id="col" type="number" value={columns}
                   onChange={(e) => setColumns(Number(e.target.value))} />
          </div>
        </div>
        <button onClick={addRoom} disabled={busy}>Save room</button>
      </div>
    </div>
  );
}
