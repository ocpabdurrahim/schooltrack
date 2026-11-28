import { Fragment, useEffect, useState } from 'react';
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
import {
  type Progress, type Weights,
  examSummary, overallPercent, pctText, progressFor, shortPart, signed,
  subjectPercent,
} from '../data/progress';
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

  // The combined percentage is an OPTION, off until it is asked for, so a
  // school that only wants the comparison prints exactly what it printed
  // before. The split is the school's own: many count the half-yearly for 30
  // and the annual for 70, but that is a decision no app should make for them.
  const [combined, setCombined] = useState(false);
  const [earlierShare, setEarlierShare] = useState(30);
  const weights: Weights = { before: earlierShare, after: 100 - earlierShare };

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

  // LANDSCAPE, for the same reason p43 is: the subject table now carries the
  // component marks of two exams, and portrait clips them. Added while the
  // page is open and taken away after, so it cannot leak into another page's
  // printing the way a stylesheet rule would.
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = '@page { size: A4 landscape; margin: 8mm; }';
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

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

        <div style={{
          marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line-soft)',
        }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            marginBottom: combined ? 10 : 0,
          }}>
            <input type="checkbox" checked={combined} style={{ width: 'auto', margin: 0 }}
                   onChange={(e) => setCombined(e.target.checked)} />
            <span>Count a percentage from both exams</span>
          </label>

          {combined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14 }}>{examLabel(earlier)} counts</span>
              <input
                inputMode="numeric"
                value={String(earlierShare)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^\d]/g, '') || 0);
                  setEarlierShare(Math.max(0, Math.min(100, n)));
                }}
                style={{ width: 64, textAlign: 'right' }}
              />
              <span style={{ fontSize: 14 }}>
                % &nbsp;·&nbsp; {examLabel(later)} counts {100 - earlierShare}%
              </span>
            </div>
          )}

          {combined && (
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '8px 0 0' }}>
              Each exam becomes a percentage first and the two are then weighed, so
              the split means what it says even when the papers are out of different
              totals. A subject only one exam marked gets a dash, not a nought.
            </p>
          )}
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
          was={before.find((b) => b.student.studentId === r.student.studentId) ?? null}
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
          weights={combined ? weights : null}
        />
      ))}
    </div>
  );
}

/** "Half Yearly 2026" — short enough for a column heading. */
const examLabel = (e?: Exam) => (e ? `${e.examName} ${e.examYear}` : '—');


/**
 * One student's sheet, laid out like the APEX app's page 43.
 *
 * Three blocks, in this order, because that is the document a school here
 * already knows how to read:
 *
 *   1. who it is - name, roll, class, registration, group, father
 *   2. the subjects, with each exam's COMPONENT marks (MCQ, CQ, Practical,
 *      Written) as well as its total and grade, and the move in the total
 *   3. each exam's own bottom line - total, GPA, grade, position, result
 *
 * The component columns are worked out per student: only the parts they are
 * actually marked in are printed, so a humanities sheet is not padded with
 * empty Practical cells. That is why this prints LANDSCAPE - with the parts
 * of two exams side by side, portrait clips it, which is the same thing that
 * drove p43 to landscape.
 *
 * Nothing in block 3 is recomputed here: every figure is the one that exam's
 * own result sheet printed, so the two documents cannot disagree.
 */
function Report({
  result, was, progress, earlier, later, school, weights,
}: {
  result: StudentResult;
  /** The same student in the earlier exam, or null if they did not sit it. */
  was: StudentResult | null;
  progress: Progress;
  earlier?: Exam;
  later?: Exam;
  school: SchoolSettings | null;
  /** Null when the combined percentage is switched off. */
  weights: Weights | null;
}) {
  const { student } = result;
  const p = progress;
  const labels = p.partLabels;

  // the components, plus Total and Grade, under each exam's heading
  const span = labels.length + 2;

  const sumWas = examSummary(
    was?.tabulation ?? null, was?.merit.total ?? null, p.positionBefore,
  );
  const sumNow = examSummary(result.tabulation, result.merit.total, p.positionAfter);

  const bd = { border: '1px solid #000', padding: '3px 4px' } as const;
  const bdC = { ...bd, textAlign: 'center' } as const;

  /** A figure as the sheet prints it. A dash is "not sat", never a nought. */
  const num = (n: number | null | undefined) =>
    (n === null || n === undefined || !Number.isFinite(n) ? '—' : String(n));

  /** p43's arrows: the direction reads before the number does. */
  const changeCell = (n: number | null) => {
    if (n === null) return <span style={{ color: 'var(--muted)' }}>&#8212;</span>;
    if (n > 0) return <span style={{ color: '#0a730a', fontWeight: 700 }}>&#9650; +{n}</span>;
    if (n < 0) return <span style={{ color: '#c00000', fontWeight: 700 }}>&#9660; {n}</span>;
    return <span style={{ color: '#666' }}>0</span>;
  };

  const bio = (label: string, value: string | number | null | undefined) => (
    <td style={{ padding: '2px 4px' }}>
      <strong>{label}:</strong>{' '}
      {value === null || value === undefined || value === '' ? '—' : value}
    </td>
  );

  const rows = [
    { name: examLabel(earlier), s: sumWas },
    { name: examLabel(later), s: sumNow },
  ];

  return (
    <div className="card print-page">
      <div className="print-sheet prog-box">
        <div className="pr-head" style={{
          textAlign: 'center', borderBottom: '1px solid #000', paddingBottom: 8,
        }}>
          <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25 }}>
            {school?.instituteName ?? 'School'}
          </div>
          {school?.sessionLabel && (
            <div style={{ fontSize: 12.5, marginTop: 2 }}>
              Session: {school.sessionLabel}
            </div>
          )}
          <div style={{
            fontSize: 16, fontWeight: 700, letterSpacing: 1, marginTop: 6,
          }}>
            PROGRESS REPORT
          </div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>
            {examLabel(earlier)} &nbsp;vs&nbsp; {examLabel(later)}
          </div>
          {weights && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              Combined percentage counts {examLabel(earlier)} {weights.before}% and{' '}
              {examLabel(later)} {weights.after}%
            </div>
          )}
        </div>

        <table className="pr-bio" style={{ width: '100%', marginTop: 8, fontSize: 13 }}>
          <tbody>
            <tr>{bio('Name', student.fullName)}{bio('Roll', student.rollNo)}</tr>
            <tr>
              {bio('Class', student.className + ' - ' + student.section)}
              {bio('Reg No', student.regNo)}
            </tr>
            <tr>{bio('Group', student.groupName)}{bio('Father', student.fatherName)}</tr>
          </tbody>
        </table>

        <table className="pr-subj" style={{
          width: '100%', marginTop: 10, borderCollapse: 'collapse', fontSize: 11.5,
        }}>
          <thead>
            <tr style={{ background: '#eee' }}>
              <th rowSpan={2} style={bd}>Subject</th>
              <th rowSpan={2} style={bdC}>Full</th>
              <th colSpan={span} style={bdC}>{examLabel(earlier)}</th>
              <th colSpan={span} style={bdC}>{examLabel(later)}</th>
              <th rowSpan={2} style={bdC}>Change</th>
              {weights && <th rowSpan={2} style={bdC}>Combined</th>}
            </tr>
            <tr style={{ background: '#eee' }}>
              {[0, 1].map((side) => (
                <Fragment key={side}>
                  {labels.map((l) => (
                    <th key={side + '-' + l} style={bdC}>{shortPart(l)}</th>
                  ))}
                  <th style={bdC}>Total</th>
                  <th style={bdC}>Grade</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {p.subjects.map((s) => (
              <tr key={s.subjectId}>
                <td style={bd}>{s.subjectName}</td>
                <td style={bdC}>{s.fullMarks}</td>

                {labels.map((l) => (
                  <td key={'b-' + l} style={bdC}>{num(s.partsBefore[l])}</td>
                ))}
                <td style={bdC}>{num(s.before)}</td>
                <td style={bdC}>{s.beforeLetter || '—'}</td>

                {labels.map((l) => (
                  <td key={'a-' + l} style={bdC}>{num(s.partsAfter[l])}</td>
                ))}
                <td style={bdC}>{num(s.after)}</td>
                <td style={bdC}>{s.afterLetter || '—'}</td>

                <td style={bdC}>{changeCell(s.change)}</td>
                {weights && (
                  <td style={bdC}>{pctText(subjectPercent(s, weights))}</td>
                )}
              </tr>
            ))}
            {p.subjects.length === 0 && (
              <tr>
                <td
                  colSpan={span * 2 + 3 + (weights ? 1 : 0)}
                  style={{ ...bdC, color: 'var(--bad)', padding: 8 }}
                >
                  No results for this student in either exam.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <table className="pr-sum" style={{
          width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 12.5,
        }}>
          <thead>
            <tr style={{ background: '#eee' }}>
              <th style={bd}>Exam</th>
              <th style={bdC}>Total Marks</th>
              <th style={bdC}>GPA</th>
              <th style={bdC}>Grade</th>
              <th style={bdC}>Position</th>
              <th style={bdC}>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td style={bd}>{row.name}</td>
                <td style={bdC}>{num(row.s.total)}</td>
                <td style={bdC}>{gpaText(row.s.gpa)}</td>
                <td style={bdC}>{row.s.letter}</td>
                <td style={bdC}>{num(row.s.position)}</td>
                <td style={bdC}>{row.s.result}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 12,
          marginTop: 8, fontSize: 12.5, flexWrap: 'wrap',
        }}>
          <span>
            GPA {gpaText(p.gpaBefore)} &rarr; {gpaText(p.gpaAfter)}
            {p.gpaChange !== null && (
              <strong style={{
                marginLeft: 6,
                color: p.gpaChange > 0 ? '#0a730a'
                  : p.gpaChange < 0 ? '#c00000' : '#666',
              }}>
                {signed(p.gpaChange, 2)}
              </strong>
            )}
            {weights && (
              <strong style={{ marginLeft: 14 }}>
                Combined: {pctText(overallPercent(p, weights))}
              </strong>
            )}
          </span>
          <span style={{ color: 'var(--muted)' }}>
            A dash means the subject was not sat in both exams, so there is
            nothing to compare.
          </span>
        </div>

        <div className="pr-sign" style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 30, fontSize: 12.5,
        }}>
          {['Guardian', 'Class Teacher', school?.headTeacher ?? 'Head Teacher'].map((who) => (
            <div key={who} style={{
              borderTop: '1px solid #000', paddingTop: 4, width: 180, textAlign: 'center',
            }}>
              {who}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
