import { useEffect, useState } from 'react';
import { type SchoolClass, listClasses } from '../data/attendance';
import { type SchoolSettings, getSettings } from '../data/admin';
import {
  type Exam,
  type StudentResult,
  type Subject,
  listExams,
  listSubjects,
  marksForExam,
  sheetFor,
} from '../data/exams';
import { gpaText } from '../data/grading';
import { type Progress, progressFor, signed } from '../data/progress';
import { findStudents } from '../data/people';

/**
 * One student, two exams, side by side — a sheet per student, ready to print.
 *
 * The result sheet answers "how did the class do". A parent at a desk asks
 * the other question: is my child doing better than last time? Two columns of
 * marks and the difference spelled out, so nobody has to subtract eleven
 * pairs of numbers in their head at a counter with a queue behind them.
 *
 * The arithmetic is progress.ts, twinned with the phone. What is here is the
 * sheet: who to compare, and how it prints.
 */
export default function ProgressReport() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [school, setSchool] = useState<SchoolSettings | null>(null);

  const [beforeId, setBeforeId] = useState('');
  const [afterId, setAfterId] = useState('');
  const [classId, setClassId] = useState('');
  const [only, setOnly] = useState('');            // a roll, to print one sheet

  const [before, setBefore] = useState<StudentResult[]>([]);
  const [after, setAfter] = useState<StudentResult[]>([]);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    Promise.all([listExams(), listSubjects(), listClasses(), getSettings()])
      .then(([e, s, c, settings]) => {
        setExams(e); setSubjects(s); setClasses(c); setSchool(settings);
        // listExams is newest first, so the later exam is the first of them
        // and the earlier one the next: the pair a school usually wants.
        setAfterId(e[0]?.examId ?? '');
        setBeforeId(e[1]?.examId ?? e[0]?.examId ?? '');
        setClassId(c[0]?.classId ?? '');
      })
      .catch(() => setProblem('Could not read the exams.'))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!beforeId || !afterId || !classId) { setBefore([]); setAfter([]); return; }
    let live = true;
    setBusy(true);
    (async () => {
      try {
        const [roll, wasMarks, nowMarks] = await Promise.all([
          findStudents(classId, ''),
          marksForExam(beforeId, classId),
          marksForExam(afterId, classId),
        ]);
        if (!live) return;
        // Ranked within each exam separately — a position only means anything
        // against the students who sat the same papers on the same day.
        setBefore(sheetFor(roll, subjects, wasMarks, beforeId));
        setAfter(sheetFor(roll, subjects, nowMarks, afterId));
        setProblem('');
      } catch {
        if (live) setProblem('Could not read that section.');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [beforeId, afterId, classId, subjects]);

  const earlier = exams.find((e) => e.examId === beforeId);
  const later = exams.find((e) => e.examId === afterId);
  const section = classes.find((c) => c.classId === classId);
  const same = beforeId === afterId;

  const wanted = (only.trim()
    ? after.filter((r) => String(r.student.rollNo) === only.trim())
    : after);

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Progress report</h1>
        <h2>
          Two exams side by side, one sheet per student
          {section ? ` · ${section.displayName}` : ''}
        </h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="pgb">Earlier exam</label>
            <select id="pgb" value={beforeId} onChange={(e) => setBeforeId(e.target.value)}>
              {exams.map((e) => (
                <option key={e.examId} value={e.examId}>
                  {e.examName} {e.examYear}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="pga">Later exam</label>
            <select id="pga" value={afterId} onChange={(e) => setAfterId(e.target.value)}>
              {exams.map((e) => (
                <option key={e.examId} value={e.examId}>
                  {e.examName} {e.examYear}{e.published ? '' : ' (not published)'}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="pgc">Section</label>
            <select id="pgc" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '0 1 130px' }}>
            <label htmlFor="pgr">One roll only</label>
            <input id="pgr" inputMode="numeric" placeholder="all" value={only}
                   onChange={(e) => setOnly(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
        </div>

        <button onClick={() => window.print()}
                disabled={busy || same || !wanted.length}
                style={{ marginTop: 12 }}>
          Print {wanted.length} report{wanted.length === 1 ? '' : 's'}
        </button>

        {same && (
          <p style={{ color: 'var(--warn)', fontSize: 14, marginBottom: 0 }}>
            Pick two <strong>different</strong> exams. An exam compared with itself
            has nothing to report.
          </p>
        )}
        {problem && <p className="err">{problem}</p>}
        {!busy && !same && wanted.length === 0 && (
          <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
            {only.trim() ? `No roll ${only.trim()} in this section.` : 'No students here yet.'}
          </p>
        )}
      </div>

      {!same && wanted.map((r) => (
        <Report
          key={r.student.studentId}
          result={r}
          progress={progressFor(
            before.find((b) => b.student.studentId === r.student.studentId)?.tabulation ?? null,
            r.tabulation,
            {
              before: before.find((b) => b.student.studentId === r.student.studentId)?.position,
              after: r.position,
            },
          )}
          earlier={earlier}
          later={later}
          school={school}
        />
      ))}
    </div>
  );
}

/** "Half Yearly 2026" — short enough for a column heading. */
const examLabel = (e?: Exam) => (e ? `${e.examName} ${e.examYear}` : '—');

function Report({
  result, progress, earlier, later, school,
}: {
  result: StudentResult;
  progress: Progress;
  earlier?: Exam;
  later?: Exam;
  school: SchoolSettings | null;
}) {
  const { student } = result;
  const p = progress;

  /** A mark as the sheet prints it. A dash is "not sat", never a nought. */
  const mark = (n: number | null) => (n === null ? '—' : String(n));

  /** Green up, red down, and nothing at all for a figure that cannot move. */
  const moved = (n: number | null) => ({
    color: n === null || n === 0 ? 'var(--muted)'
      : n > 0 ? 'var(--accent)' : 'var(--bad)',
    fontWeight: n !== null && n !== 0 ? 600 : 400,
  } as const);

  const verdict = p.verdict === 'better' ? 'Improved'
    : p.verdict === 'worse' ? 'Slipped'
      : p.verdict === 'same' ? 'Held steady'
        : 'Not complete';

  return (
    <div className="card print-page">
      <div className="print-sheet">
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{school?.instituteName ?? 'School'}</div>
          {school?.address && <div style={{ fontSize: 12.5 }}>{school.address}</div>}
          <div style={{ marginTop: 6, fontWeight: 600 }}>PROGRESS REPORT</div>
          <div style={{ fontSize: 13 }}>
            {examLabel(earlier)} &nbsp;→&nbsp; {examLabel(later)}
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 14,
          borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)',
          padding: '8px 0', marginBottom: 10,
        }}>
          <span><strong>{student.fullName}</strong></span>
          <span>Roll {student.rollNo}</span>
          <span>{student.className} - {student.section}</span>
          {student.groupName && <span>{student.groupName}</span>}
        </div>

        <table className="ruled" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid var(--line)', textAlign: 'left' }}>
              <th style={{ padding: '5px 4px' }}>Subject</th>
              <th style={{ padding: '5px 4px', textAlign: 'right' }}>{examLabel(earlier)}</th>
              <th style={{ padding: '5px 4px', textAlign: 'right' }}>{examLabel(later)}</th>
              <th style={{ padding: '5px 4px', textAlign: 'right' }}>Change</th>
            </tr>
          </thead>
          <tbody>
            {p.subjects.map((s) => (
              <tr key={s.subjectId} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                <td style={{ padding: '5px 4px' }}>
                  {s.subjectName}
                  <span style={{ color: 'var(--muted)' }}> /{s.fullMarks}</span>
                </td>
                <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                  {mark(s.before)}
                  {s.beforeLetter && (
                    <span style={{ color: 'var(--muted)' }}> {s.beforeLetter}</span>
                  )}
                </td>
                <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                  {mark(s.after)}
                  {s.afterLetter && (
                    <span style={{ color: 'var(--muted)' }}> {s.afterLetter}</span>
                  )}
                </td>
                <td style={{ padding: '5px 4px', textAlign: 'right', ...moved(s.change) }}>
                  {signed(s.change)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 600 }}>
              <td style={{ padding: '6px 4px' }}>Total</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{mark(p.totalBefore)}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{mark(p.totalAfter)}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right', ...moved(p.totalChange) }}>
                {signed(p.totalChange)}
              </td>
            </tr>
            <tr style={{ fontWeight: 600 }}>
              <td style={{ padding: '6px 4px' }}>GPA</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{gpaText(p.gpaBefore)}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{gpaText(p.gpaAfter)}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right', ...moved(p.gpaChange) }}>
                {signed(p.gpaChange, 2)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '6px 4px' }}>Position in the section</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                {p.positionBefore ?? '—'}
              </td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                {p.positionAfter ?? '—'}
              </td>
              {/* Up the list is a smaller number, so progress.ts turns the
                  sign over before it gets here: +5 means five places better. */}
              <td style={{ padding: '6px 4px', textAlign: 'right', ...moved(p.positionChange) }}>
                {p.positionChange === null ? '—'
                  : p.positionChange === 0 ? 'same'
                    : `${signed(p.positionChange)} place${Math.abs(p.positionChange) === 1 ? '' : 's'}`}
              </td>
            </tr>
          </tfoot>
        </table>

        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 12,
          marginTop: 12, fontSize: 14,
        }}>
          <span>
            <strong style={moved(p.gpaChange)}>{verdict}</strong>
            {p.verdict === 'unknown' && (
              <span style={{ color: 'var(--muted)' }}>
                {' '}— one of the two exams has marks still to come
              </span>
            )}
          </span>
          <span style={{ color: 'var(--muted)' }}>
            A dash means the subject was not sat in both exams, so there is nothing
            to compare.
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 44 }}>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
            Class teacher
          </div>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
            Guardian
          </div>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
            {school?.headTeacher ?? 'Head teacher'}
          </div>
        </div>
      </div>
    </div>
  );
}
