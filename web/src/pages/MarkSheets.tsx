import { Fragment, useEffect, useState } from 'react';
import { type SchoolClass, listClasses } from '../data/attendance';
import { type SchoolSettings, getSettings } from '../data/admin';
import {
  type Exam,
  type StudentResult,
  type Subject,
  type ResultRow,
  listExams,
  listSubjects,
  marksForExam,
  sheetFor,
} from '../data/exams';
import { gpaText } from '../data/grading';
import { type UnitLine, markSheet, partColumns, sheetTotal } from '../data/marksheet';
import { type StudentDetail, findStudents } from '../data/people';

/**
 * Every student's mark sheet for one exam, ready to print.
 *
 * Two shapes, because a school hands out two. The BRIEF sheet is what goes
 * home in a child's bag: one line per subject, the mark and the grade. The
 * DETAILED sheet is what the office keeps and what a teacher is asked to
 * justify: the same subjects with every part shown, CQ, MCQ and Practical
 * side by side, because that is where a disputed mark lives — and because a
 * part below its own pass mark fails the subject however high the total, which
 * is impossible to argue about if nobody can see the parts.
 *
 * One sheet per page. A section of forty prints in one go.
 */

type Shape = 'detailed' | 'brief';

export default function MarkSheets() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [school, setSchool] = useState<SchoolSettings | null>(null);

  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [shape, setShape] = useState<Shape>('detailed');
  const [only, setOnly] = useState('');          // a roll, to print one sheet

  const [marks, setMarks] = useState<ResultRow[]>([]);
  const [rows, setRows] = useState<StudentResult[]>([]);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    Promise.all([listExams(), listSubjects(), listClasses(), getSettings()])
      .then(([e, s, c, settings]) => {
        setExams(e);
        setSubjects(s);
        setClasses(c);
        setSchool(settings);
        setExamId(e[0]?.examId ?? '');
        setClassId(c[0]?.classId ?? '');
      })
      .catch(() => setProblem('Could not read the exams.'))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!examId || !classId) { setRows([]); return; }
    let live = true;
    setBusy(true);
    Promise.all([findStudents(classId, ''), marksForExam(examId, classId)])
      .then(([roll, got]) => {
        if (!live) return;
        setMarks(got);
        setRows(sheetFor(roll, subjects, got, examId));
        setProblem('');
      })
      .catch(() => { if (live) setProblem('Could not read that section.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [examId, classId, subjects]);

  const exam = exams.find((e) => e.examId === examId);
  const section = classes.find((c) => c.classId === classId);

  const wanted = only.trim()
    ? rows.filter((r) => String(r.student.rollNo) === only.trim())
    : rows;

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Mark sheets</h1>
        <h2>
          One per student, ready to print
          {exam ? ` · ${exam.examName} ${exam.examYear}` : ''}
          {section ? ` · ${section.displayName}` : ''}
        </h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="msx">Exam</label>
            <select id="msx" value={examId} onChange={(e) => setExamId(e.target.value)}>
              {exams.map((e) => (
                <option key={e.examId} value={e.examId}>
                  {e.examName} {e.examYear}{e.published ? '' : ' (not published)'}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="mscl">Section</label>
            <select id="mscl" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.displayName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '2 1 220px' }}>
            <label htmlFor="mssh">Sheet</label>
            <select id="mssh" value={shape}
                    onChange={(e) => setShape(e.target.value as Shape)}>
              <option value="detailed">Detailed — every part, CQ, MCQ, Practical</option>
              <option value="brief">Brief — one line per subject</option>
            </select>
          </div>
          <div style={{ flex: '0 1 130px' }}>
            <label htmlFor="msr">One roll only</label>
            <input id="msr" inputMode="numeric" placeholder="all" value={only}
                   onChange={(e) => setOnly(e.target.value.replace(/[^\d]/g, ''))} />
          </div>
        </div>

        <button onClick={() => window.print()} disabled={busy || !wanted.length}
                style={{ marginTop: 12 }}>
          Print {wanted.length} sheet{wanted.length === 1 ? '' : 's'}
        </button>

        {exam && !exam.published && (
          <p style={{ color: 'var(--warn)', fontSize: 13, marginBottom: 0 }}>
            This exam is not published, so these marks are not final and parents cannot
            see them yet.
          </p>
        )}
        {problem && <div className="err">{problem}</div>}
        {!busy && !wanted.length && (
          <div className="err">
            {only.trim() ? `No roll ${only.trim()} in this section.` : 'No students here yet.'}
          </div>
        )}
      </div>

      {wanted.map((r) => (
        <Sheet
          key={r.student.studentId}
          shape={shape}
          student={r.student}
          result={r}
          exam={exam}
          school={school}
          lines={markSheet(subjects, r.student, marks.filter((m) => m.studentId === r.student.studentId))}
          outOf={rows.length}
        />
      ))}
    </div>
  );
}

function Sheet({
  shape, student, result, exam, school, lines, outOf,
}: {
  shape: Shape;
  student: StudentDetail;
  result: StudentResult;
  exam?: Exam;
  school: SchoolSettings | null;
  lines: UnitLine[];
  outOf: number;
}) {
  const columns = shape === 'detailed' ? partColumns(lines) : [];
  const total = sheetTotal(lines);
  const t = result.tabulation;

  const mark = (v: number | null, absent: boolean) =>
    (absent ? 'abs' : v === null ? '—' : String(v));

  return (
    <div className="card print-page">
      <div className="print-sheet">
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{school?.instituteName ?? 'School'}</div>
          {school?.address && <div style={{ fontSize: 12.5 }}>{school.address}</div>}
          <div style={{ marginTop: 6, fontWeight: 600 }}>
            MARK SHEET — {exam ? `${exam.examName.toUpperCase()} ${exam.examYear}` : ''}
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
          {student.regNo && <span>Reg {student.regNo}</span>}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid var(--line)', textAlign: 'left' }}>
              <th style={{ padding: '5px 4px' }}>Subject</th>
              {columns.map((c) => (
                <th key={c} style={{ padding: '5px 4px', textAlign: 'right' }}>
                  {c === 'PRACTICAL' ? 'Prac.' : c === 'WRITTEN' ? 'Written' : c}
                </th>
              ))}
              <th style={{ padding: '5px 4px', textAlign: 'right' }}>Marks</th>
              <th style={{ padding: '5px 4px', textAlign: 'right' }}>Out of</th>
              <th style={{ padding: '5px 4px', textAlign: 'right' }}>Point</th>
              <th style={{ padding: '5px 4px', textAlign: 'center' }}>Grade</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((u) => {
              const split = shape === 'detailed' && u.papers.length > 1;
              return (
                <Fragment key={u.unitId}>
                  {shape === 'detailed' && u.papers.map((p) => (
                    <tr key={p.subjectId} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      <td style={{ padding: '5px 4px', paddingLeft: split ? 14 : 4 }}>
                        {p.subjectName}
                      </td>
                      {columns.map((c) => (
                        <td key={c} style={{
                          padding: '5px 4px', textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: u.failedParts.includes(c) ? 'var(--bad)' : undefined,
                        }}>
                          {c in p.parts ? mark(p.parts[c], p.absent) : ''}
                        </td>
                      ))}
                      <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                        {mark(p.marks, p.absent)}
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'right', color: 'var(--muted)' }}>
                        {p.fullMarks}
                      </td>
                      {!split && (
                        <>
                          <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                            {u.letter === '-' ? '—' : u.point.toFixed(2)}
                          </td>
                          <td style={{
                            padding: '5px 4px', textAlign: 'center', fontWeight: 700,
                            color: u.letter === 'F' ? 'var(--bad)' : undefined,
                          }}>
                            {u.letter}
                          </td>
                        </>
                      )}
                      {split && <><td /><td /></>}
                    </tr>
                  ))}

                  {/* The graded subject. For a pair of papers it is a line of
                      its own, because the grade belongs to the 200, not to
                      either paper. */}
                  {(shape === 'brief' || split) && (
                    <tr key={`${u.unitId}-unit`} style={{
                      borderBottom: '1px solid var(--line)',
                      fontWeight: split ? 600 : undefined,
                    }}>
                      <td style={{ padding: '5px 4px' }}>
                        {u.unitName}{u.isOptional ? ' (optional)' : ''}
                      </td>
                      {columns.map((c) => <td key={c} />)}
                      <td style={{
                        padding: '5px 4px', textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: u.marks === null && u.soFar !== null ? 'var(--muted)' : undefined,
                      }}>
                        {u.absent ? 'abs'
                          : u.marks !== null ? u.marks
                            : u.soFar !== null ? `(${u.soFar})` : '—'}
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'right', color: 'var(--muted)' }}>
                        {u.fullMarks}
                      </td>
                      <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                        {u.letter === '-' ? '—' : u.point.toFixed(2)}
                      </td>
                      <td style={{
                        padding: '5px 4px', textAlign: 'center', fontWeight: 700,
                        color: u.letter === 'F' ? 'var(--bad)' : undefined,
                      }}>
                        {u.letter}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
              <td style={{ padding: '6px 4px' }}>Total</td>
              {columns.map((c) => <td key={c} />)}
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                {total.obtained ?? '—'}
              </td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{total.outOf}</td>
              <td style={{ padding: '6px 4px', textAlign: 'right' }}>{gpaText(t.gpa)}</td>
              <td style={{ padding: '6px 4px', textAlign: 'center' }}>{t.letter}</td>
            </tr>
          </tfoot>
        </table>

        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 10, fontSize: 13.5 }}>
          <span>GPA <strong>{gpaText(t.gpa)}</strong></span>
          <span>Grade <strong>{t.letter}</strong></span>
          {result.position !== null && (
            <span>Position <strong>{result.position}</strong> of {outOf}</span>
          )}
          {t.failed.length > 0 && (
            <span style={{ color: 'var(--bad)' }}>Failed {t.failed.join(', ')}</span>
          )}
          {t.incomplete && (
            <span style={{ color: 'var(--muted)' }}>
              marks not all in — no GPA until they are
            </span>
          )}
        </div>

        {lines.some((u) => u.failedParts.length > 0) && (
          <p style={{ color: 'var(--bad)', fontSize: 12.5, margin: '8px 0 0' }}>
            {lines.filter((u) => u.failedParts.length)
              .map((u) => `${u.unitName}: ${u.failedParts.join(' and ')} below the pass mark`)
              .join(' · ')} — the subject is F however high the total.
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 38 }}>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 12.5 }}>
            Class teacher
          </div>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 12.5 }}>
            {school?.headTeacher ?? 'Head teacher'}
          </div>
        </div>
      </div>
    </div>
  );
}
