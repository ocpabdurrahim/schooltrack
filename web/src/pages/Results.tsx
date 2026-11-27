import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { type SchoolSettings, getSettings } from '../data/admin';
import { type SchoolClass, listClasses } from '../data/attendance';
import { shortGroup } from '../data/groups';
import {
  type Exam,
  type StudentResult,
  type Subject,
  gradeDistribution,
  listExams,
  listSubjects,
  marksForExam,
  meritOrder,
  publishExam,
  sheetFor,
  subjectStats,
  sheetColumns,
  subjectsForClass,
  totalMarks,
} from '../data/exams';
import { type SubjectGrade, type SubjectMark, gpaText } from '../data/grading';
import { cellText, partsTitle } from '../data/cellparts';
import { shortName, shortNames } from '../data/shortnames';
import { layout, slot } from '../data/tabsheet';
import { subjectRank } from '../data/subjectorder';
import { findStudents } from '../data/people';

type View = 'tabulation' | 'sheet' | 'merit';

/**
 * Two sheets over one set of marks.
 *
 *   TABULATION — the working grid: every subject's mark and grade, the total,
 *   GPA, grade and position, with subject statistics at the foot. Printed
 *   landscape because a section with eight subjects will not fit portrait.
 *
 *   RESULT SHEET — what goes on the noticeboard: merit order, GPA, grade,
 *   passed or failed, with the grade distribution at the foot.
 *
 *   MERIT LIST — the ranked notice, and the one sheet that shows WHY each
 *   position was given: the figures the chain in merit.ts actually used, in
 *   the order it used them, so a tie can be answered for at the counter
 *   rather than taken on trust.
 *
 * Neither stores anything. Correct a mark and both correct themselves.
 */
/**
 * One mark on the tabulation sheet, in two tiers.
 *
 * Upper tier: the parts, small — CQ, MCQ, Practical, in the order the paper is
 * marked in. Lower tier: the subject total and its letter. The split is what
 * makes an F explicable on the sheet itself, because the reason is always a
 * part: 60 in CQ and 8 in MCQ is 68 out of 100 and still F, the MCQ pass mark
 * being 10. The failing part is the one in bold, so the eye lands on it.
 *
 * Four things look alike here and must not: a mark, a mark not entered yet, a
 * subject half entered (the two Bangla papers are one subject out of 200), and
 * a paper this student does not sit at all. See cellparts.ts, which decides
 * all four and is twinned with the phone.
 *
 * The cell does not name its subject. A slot column is headed with the
 * subjects it holds — PHY/CIV — and the stream beside the student's name says
 * which of them this row is.
 */
function Mark({ cell }: { cell?: SubjectMark & SubjectGrade }) {
  if (!cell) {
    return (
      <td style={{ padding: '5px 4px', textAlign: 'center', color: 'var(--line)' }}>·</td>
    );
  }
  const t = cellText(cell);
  return (
    <td className="tier" style={{ padding: '3px 4px' }} title={partsTitle(cell)}>
      {/* The parts. A blank line where a paper has none, so that the totals
          across a row stay on one line and the sheet reads as a grid. */}
      {/*
        A space between the parts, so that the cell's TEXT is "71 59" and not
        "7159" — to anything that reads it rather than looks at it, and to
        anyone who copies a row out of the sheet.

        It is not there to let the line wrap: the print rules size this line
        to fit its column and forbid wrapping outright, because a cell that
        wraps is a three-line row and a sheet half as dense again.
      */}
      <div className="tier-parts">
        {t.parts.length === 0 ? '\u00a0' : t.parts.map((p, i) => (
          <span
            key={p.label + i}
            className={`${p.failed ? 'bad' : ''}${p.opensPaper ? ' gap' : ''}`}
          >
            {i > 0 ? ' ' : ''}{p.text}
          </span>
        ))}
      </div>
      <div
        className={`tier-main${t.parts.length ? ' split' : ''}${t.letter === 'F' ? ' bad' : ''}`}
        style={{ color: t.provisional ? 'var(--muted)' : undefined }}
      >
        {t.main}
        {t.letter && <span className="letter"> {t.letter}</span>}
      </div>
    </td>
  );
}

/**
 * A column heading that may break after a slash.
 *
 * A slot column is headed with every subject it holds — H.MATH/AGRI, or
 * CHEM/HIST — and the browser treats that as ONE word, so the column is
 * forced as wide as the whole string and seventeen of them run off the right
 * edge of a landscape page. A <wbr> after each slash lets it fall onto a
 * second line instead, which costs a few millimetres of height and saves the
 * column that would otherwise be cropped off the sheet.
 *
 * The names themselves are untouched — they are shortened by shortNames() and
 * stay exactly as they were.
 */
function Head({ text }: { text: string }) {
  const bits = text.split('/');
  return (
    <>
      {bits.map((bit, i) => (
        <Fragment key={i}>
          {bit}
          {i < bits.length - 1 && <>/<wbr /></>}
        </Fragment>
      ))}
    </>
  );
}

export default function Results() {
  const { access } = useAuth();
  const admin = access.kind === 'staff' && access.role === 'ADMIN';

  const [view, setView] = useState<View>('tabulation');
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<StudentResult[]>([]);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    Promise.all([listExams(), listSubjects(), listClasses(), getSettings()])
      .then(([e, s, c, set]) => {
        setExams(e); setSubjects(s); setClasses(c); setSchool(set);
        setExamId(e[0]?.examId ?? '');
        setClassId(c[0]?.classId ?? '');
      })
      .catch(() => setProblem('Could not read the exams.'))
      .finally(() => setBusy(false));
  }, []);

  const exam = exams.find((e) => e.examId === examId);
  const section = classes.find((c) => c.classId === classId);

  useEffect(() => {
    if (!examId || !classId) return;
    let live = true;
    setBusy(true);
    (async () => {
      try {
        const [students, marks] = await Promise.all([
          findStudents(classId, ''),
          marksForExam(examId, classId),
        ]);
        if (live) { setRows(sheetFor(students, subjects, marks, examId)); setProblem(''); }
      } catch {
        if (live) setProblem('Could not build the sheet.');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [examId, classId, subjects]);

  const className = rows[0]?.student.className ?? '';
  const columns = className ? sheetColumns(subjects, className) : [];
  /**
   * The paper a tie is broken on: the first of the school's order, which is
   * Bangla 1st Paper here. Named on the merit list so the figure in that
   * column can be checked against the mark sheet.
   *
   * From the PAPERS, not from `columns`: those are the sheet's columns, where
   * Bangla 1st and 2nd have already been combined into one unit out of 200.
   * The tie is broken on the first paper's own mark, so the heading has to
   * name the first paper and not the unit it ends up inside.
   */
  const tiePaper = className
    ? [...subjectsForClass(subjects, className)]
      .sort((a, b) => subjectRank(a) - subjectRank(b))[0] ?? null
    : null;
  // The sheet's shape comes from the students actually on it: as many group
  // columns as the widest of them needs, and none at all for a class that has
  // not been streamed.
  const shape = layout(rows.map((r) => r.tabulation));
  // Every heading on the sheet is shortened together, so no two columns can
  // come out with the same name however alike the subjects are.
  const heads = shortNames([
    ...shape.common.map((c) => c.subjectName),
    ...shape.religion,
    ...shape.groupSlots.flat(),
    ...shape.optional,
  ]);
  const short = new Map(
    [...shape.common.map((c) => c.subjectName), ...shape.religion,
      ...shape.groupSlots.flat(), ...shape.optional].map((name, i) => [name, heads[i]]),
  );
  /** A slot's heading: the subjects it holds, shortened and joined. */
  const slotHead = (names: string[]) => names.map((n) => short.get(n) ?? n).join('/');
  // The religion column is not a column for the end of the sheet: it is the
  // sixth subject of the school's order, so the common columns are split
  // around it. See Layout.religionAt.
  const commonBefore = shape.common.slice(0, shape.religionAt);
  const commonAfter = shape.common.slice(shape.religionAt);
  const commonShort = (c: { subjectName: string }) => short.get(c.subjectName) ?? c.subjectName;
  // The stream column earns its place only when the slots hold more than one
  // subject each — in an unstreamed class it would be an empty column.
  const streamed = shape.groupSlots.some((names) => names.length > 1);
  /**
   * The sheet is told its own column widths, because a printed tabulation
   * that runs off the page has lost a subject and nobody can tell which.
   *
   * Left to itself the browser gives every column the width of its widest
   * content: one long student name, and the marks at the right-hand end are
   * pushed over the edge of the paper. So the widths are shares of the page
   * instead — the fixed ones for roll, name and the four summary columns, and
   * what is left split evenly between however many subject columns this
   * section turns out to need. They are hints on screen, where the table may
   * still scroll sideways on a phone, and law in print, where the table is
   * laid out fixed and so CANNOT exceed the page.
   */
  const markCols = commonBefore.length + (shape.religion.length ? 1 : 0)
    + commonAfter.length + shape.groupSlots.length + (shape.optional.length ? 1 : 0);
  // Each share is the heading plus its padding -- Grade is the longest of
  // them and was breaking into "Grad e" when it was given the same as GPA.
  const FIXED = { roll: 3.8, name: 11.2, grp: 3.6, total: 4.8, gpa: 4.2, grade: 5.2, pos: 4.6 };
  const fixedTotal = FIXED.roll + FIXED.name + (streamed ? FIXED.grp : 0)
    + FIXED.total + FIXED.gpa + FIXED.grade + FIXED.pos;
  const markWidth = markCols > 0 ? (100 - fixedTotal) / markCols : 0;
  /**
   * Students with no group recorded, in a section that has streams.
   *
   * They are excluded by nothing, so they count as sitting EVERY group paper
   * in the school — eleven of them here. The sheet no longer lets one of
   * them set its width (tabsheet.ts), which is what put seven duplicate
   * columns on the Annual Exam, but their group marks have no column to go
   * in either. The cure is one field on one student, so the page says whose.
   */
  const noGroup = streamed
    ? rows.filter((r) => !(r.student.groupName ?? '').trim())
    : [];
  const complete = rows.filter((r) => !r.tabulation.incomplete).length;
  const passed = rows.filter((r) => (r.tabulation.gpa ?? 0) > 0).length;
  const stats = subjectStats(rows, columns);
  const distribution = gradeDistribution(rows);
  const merit = meritOrder(rows);

  /**
   * A tabulation will not fit portrait, so while one is on screen the page
   * ITSELF is landscape — not only when the Print landscape button is used.
   *
   * It used to be injected for the duration of that button's print and taken
   * out again, which left Ctrl+P, the browser's own menu and "Save as PDF"
   * printing portrait. Seventeen columns squeezed into the width of an A4
   * portrait page leaves each mark column about 45px, the two tiers of
   * numbers no longer fit, and they print ON TOP of each other — measured as
   * sixty overlapping runs of text in the PDF, and none at all in landscape.
   *
   * @page cannot be scoped to an element or switched by a class, so a rule
   * for the whole document is the only way to say it; the effect takes it
   * away again when the sheet is not the thing being looked at.
   */
  useEffect(() => {
    if (view !== 'tabulation') return undefined;
    const style = document.createElement('style');
    style.textContent = '@page { size: A4 landscape; margin: 10mm; }';
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, [view]);

  function print(_landscape: boolean) {
    window.print();
  }

  async function togglePublish() {
    if (!exam) return;
    setBusy(true);
    try {
      await publishExam(exam.examId, !exam.published);
      setExams(await listExams());
    } catch {
      setProblem('That change was refused. Only an administrator may publish a result.');
    }
    setBusy(false);
  }

  const heading = (
    <div style={{ textAlign: 'center', marginBottom: 12 }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{school?.instituteName ?? 'School'}</div>
      <div style={{ fontWeight: 600 }}>
        {view === 'tabulation' ? 'TABULATION SHEET'
          : view === 'merit' ? 'MERIT LIST' : 'RESULT SHEET'}
        {exam ? ` — ${exam.examName.toUpperCase()} ${exam.examYear}` : ''}
      </div>
      <div style={{ fontSize: 13 }}>{section?.displayName}</div>
    </div>
  );

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>
          {view === 'tabulation' ? 'Tabulation sheet'
            : view === 'merit' ? 'Merit list' : 'Result sheet'}
        </h1>
        <h2>
          {exam ? `${exam.examName} ${exam.examYear}` : 'Pick an exam'}
          {section ? ` · ${section.displayName}` : ''}
          {exam?.published && ' · published'}
          {/* People look for "upload results" here, where the results are.
              The marks themselves are entered one subject at a time, and a
              file is read in on that screen. */}
          {' · '}<Link to="/marks">enter or upload marks</Link>
        </h2>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="ex">Exam</label>
            <select id="ex" value={examId} onChange={(e) => setExamId(e.target.value)}>
              {exams.map((e) => (
                <option key={e.examId} value={e.examId}>
                  {e.examName} {e.examYear}{e.published ? ' (published)' : ''}
                </option>
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
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor="vw">Sheet</label>
            <select id="vw" value={view} onChange={(e) => setView(e.target.value as View)}>
              <option value="tabulation">Tabulation (marks and grades)</option>
              <option value="sheet">Result sheet (merit order)</option>
              <option value="merit">Merit list (ranked, with the tie-breaks)</option>
            </select>
          </div>
        </div>

        <button onClick={() => print(view === 'tabulation')}>
          Print {view === 'tabulation' ? 'landscape' : 'portrait'}
        </button>
        {admin && exam && (
          <button style={{ marginLeft: 12, background: exam.published ? 'var(--muted)' : undefined }}
                  onClick={togglePublish} disabled={busy}>
            {exam.published ? 'Unpublish' : 'Publish result'}
          </button>
        )}
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
          Publishing freezes no figure — everything is computed from the marks, so a
          correction corrects both sheets and every progress report. What it does is
          close mark entry and let parents see the result.
        </p>
        {problem && <div className="err">{problem}</div>}
      </div>

      <div className="card">
        <div className="print-sheet">
          {heading}

          <div className="no-print" style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0 }}>
              {busy ? 'Working…'
                : `${rows.length} student${rows.length === 1 ? '' : 's'} · ${complete} complete · ${passed} passed`}
            </h2>
            {!busy && noGroup.length > 0 && (
              <p style={{ color: 'var(--warn)', fontSize: 14, margin: '8px 0 0' }}>
                {noGroup.length === 1 ? 'One student has' : `${noGroup.length} students have`}
                {' '}no group recorded —{' '}
                {noGroup.slice(0, 4).map((r, i) => (
                  <Fragment key={r.student.studentId}>
                    {i > 0 && ', '}
                    <Link to={`/students/${r.student.studentId}`}>{r.student.fullName}</Link>
                  </Fragment>
                ))}
                {noGroup.length > 4 && ` and ${noGroup.length - 4} more`}.
                {' '}With no group they count as sitting <strong>every</strong> group paper,
                so their group marks have no column on this sheet and their result cannot
                be completed. Set the group on the student&rsquo;s page.
              </p>
            )}
          </div>

          {!busy && rows.length > 0 && view === 'tabulation' && (
            <div className="scroll-x">
              <table className="ruled fit" style={{ borderCollapse: 'collapse' }}>
                <colgroup>
                  <col style={{ width: `${FIXED.roll}%` }} />
                  <col style={{ width: `${FIXED.name}%` }} />
                  {streamed && <col style={{ width: `${FIXED.grp}%` }} />}
                  {Array.from({ length: markCols }, (_, i) => (
                    <col key={i} style={{ width: `${markWidth}%` }} />
                  ))}
                  <col style={{ width: `${FIXED.total}%` }} />
                  <col style={{ width: `${FIXED.gpa}%` }} />
                  <col style={{ width: `${FIXED.grade}%` }} />
                  <col style={{ width: `${FIXED.pos}%` }} />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 4px' }}>Roll</th>
                    <th style={{ padding: '6px 4px' }}>Name</th>
                    {streamed && <th style={{ padding: '6px 4px' }}>Grp</th>}
                    {commonBefore.map((c) => (
                      <th key={c.subjectId} style={{ padding: '6px 4px', textAlign: 'center' }}>
                        {commonShort(c)}
                      </th>
                    ))}
                    {shape.religion.length > 0 && (
                      <th style={{ padding: '6px 4px', textAlign: 'center' }}>
                        <Head text={slotHead(shape.religion)} />
                      </th>
                    )}
                    {commonAfter.map((c) => (
                      <th key={c.subjectId} style={{ padding: '6px 4px', textAlign: 'center' }}>
                        {commonShort(c)}
                      </th>
                    ))}
                    {shape.groupSlots.map((names, i) => (
                      <th key={`grp${i}`} style={{ padding: '6px 4px', textAlign: 'center' }}>
                        <Head text={slotHead(names)} />
                      </th>
                    ))}
                    {shape.optional.length > 0 && (
                      <th style={{ padding: '6px 4px', textAlign: 'center' }}>
                        <Head text={`${slotHead(shape.optional)}*`} />
                      </th>
                    )}
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>GPA</th>
                    <th style={{ padding: '6px 4px', textAlign: 'center' }}>Grade</th>
                    {/* The merit position, by the chain in merit.ts — the same
                        number the merit list is ordered by. Headed "Merit"
                        rather than "Pos" because that is the question a
                        teacher is reading the column to answer. */}
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>Merit</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const mine = slot(r.tabulation);
                    return (
                      <tr key={r.student.studentId} style={{ borderBottom: '1px solid var(--line)' }}>
                        <td style={{ padding: '5px 4px' }}>{r.student.rollNo}</td>
                        <td style={{ padding: '5px 4px' }}>
                          <Link to={`/students/${r.student.studentId}`}>{r.student.fullName}</Link>
                        </td>
                        {streamed && (
                          <td style={{ padding: '5px 4px', color: 'var(--muted)' }}>
                            {shortGroup(r.student.groupName)}
                          </td>
                        )}

                        {/* The subjects everybody sits, so the heading says which.
                            A slot holds whichever paper THIS student sits, so its
                            cell has to say which one it is — and the religion slot
                            keeps its place in the order, between the common
                            subjects rather than after them. */}
                        {commonBefore.map((c) => (
                          <Mark
                            key={c.subjectId}
                            cell={mine.common.find((x) => x.subjectId === c.subjectId)}
                          />
                        ))}
                        {shape.religion.length > 0 && <Mark cell={mine.religion ?? undefined} />}
                        {commonAfter.map((c) => (
                          <Mark
                            key={c.subjectId}
                            cell={mine.common.find((x) => x.subjectId === c.subjectId)}
                          />
                        ))}
                        {shape.groupSlots.map((_, i) => (
                          <Mark key={`grp${i}`} cell={mine.group[i]} />
                        ))}
                        {shape.optional.length > 0 && <Mark cell={mine.optional ?? undefined} />}

                        <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                          {totalMarks(r.tabulation) ?? '—'}
                        </td>
                        <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 700 }}>
                          {gpaText(r.tabulation.gpa)}
                        </td>
                        <td style={{
                          padding: '5px 4px', textAlign: 'center',
                          color: r.tabulation.letter === 'F' ? 'var(--bad)' : undefined,
                        }}>
                          {r.tabulation.letter}
                        </td>
                        <td style={{ padding: '5px 4px', textAlign: 'right' }}>
                          {r.position ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
                Each cell is in two tiers: the small numbers above are the parts in the
                order the paper is marked in (CQ, MCQ, Practical — hover a cell to see
                which is which), and below them the subject total and its letter. A part
                in <strong>bold</strong> fell below its own pass mark, which is how a
                subject can total 68 and still be F. A <strong>line</strong> between the
                small numbers divides one paper from the next, where a subject is two
                papers graded as one: Bangla reads 50 22 | 48 20, its CQ and MCQ for each
                paper, and English reads 71 | 59, which is the 1st paper and the 2nd —
                not a CQ and an MCQ. A space divides the parts of one paper; a line
                divides the papers.
                {' '}
                A column headed PHY/CIV holds Physics for the Science rows and Civics for
                the Humanities ones — the <strong>Grp</strong> column beside the name says
                which. * is the 4th subject: it adds to the total, and to the GPA only
                above 2.00. A short dash among the parts is a part not entered; a long dash
                below it means the subject has no total yet, and that student has no GPA
                and no position. A dot is a paper that student does not sit.
                {' '}
                <strong>Merit</strong> is the position on the merit list: GPA first, then
                fewer subjects failed, then total marks, then{' '}
                {tiePaper ? tiePaper.subjectName : 'the first paper of the order'}, then the
                roll — so no two students share a position. Pick{' '}
                <strong>Merit list</strong> above for the figures behind it.
              </p>

              {/* Per-subject statistics, which cannot live in the columns any
                  more: Grp 1 is Physics on one row and History on the next, and
                  a highest mark across the two would mean nothing. */}
              <h2 style={{ marginTop: 18 }}>By subject</h2>
              <table
                className="ruled"
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}
              >
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                    <th style={{ padding: '5px 4px' }}>Subject</th>
                    <th style={{ padding: '5px 4px', textAlign: 'right' }}>Sat</th>
                    <th style={{ padding: '5px 4px', textAlign: 'right' }}>Highest</th>
                    <th style={{ padding: '5px 4px', textAlign: 'right' }}>Lowest</th>
                    <th style={{ padding: '5px 4px', textAlign: 'right' }}>Average</th>
                    <th style={{ padding: '5px 4px', textAlign: 'right' }}>Passed</th>
                    <th style={{ padding: '5px 4px', textAlign: 'right' }}>Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.subjectId} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      <td style={{ padding: '4px' }}>{s.subjectName}</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>
                        {s.passed + s.failed}
                      </td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>{s.highest ?? '—'}</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>{s.lowest ?? '—'}</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>{s.average ?? '—'}</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>{s.passed}</td>
                      <td style={{
                        padding: '4px', textAlign: 'right',
                        color: s.failed ? 'var(--bad)' : undefined,
                      }}>
                        {s.failed}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
                Only the students who sit a subject are counted in its row. A mark not
                entered is ignored; an absence counts as a fail.
              </p>
            </div>
          )}

          {!busy && rows.length > 0 && view === 'sheet' && (
            <>
              <table
                className="ruled"
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}
              >
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 4px' }}>Position</th>
                    <th style={{ padding: '6px 4px' }}>Roll</th>
                    <th style={{ padding: '6px 4px' }}>Name</th>
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>GPA</th>
                    <th style={{ padding: '6px 4px', textAlign: 'center' }}>Grade</th>
                    <th style={{ padding: '6px 4px' }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {merit.map((r) => (
                    <tr key={r.student.studentId} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 4px' }}>{r.position ?? '—'}</td>
                      <td style={{ padding: '6px 4px' }}>{r.student.rollNo}</td>
                      <td style={{ padding: '6px 4px' }}>
                        <Link to={`/students/${r.student.studentId}`}>{r.student.fullName}</Link>
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                        {totalMarks(r.tabulation) ?? '—'}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700 }}>
                        {gpaText(r.tabulation.gpa)}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                        {r.tabulation.letter}
                      </td>
                      <td style={{ padding: '6px 4px' }}>
                        {r.tabulation.incomplete
                          ? <span style={{ color: 'var(--muted)' }}>marks not all in</span>
                          : r.tabulation.letter === 'F'
                            ? <span style={{ color: 'var(--bad)' }}>
                                Failed{r.tabulation.failed.length ? ` — ${r.tabulation.failed.join(', ')}` : ''}
                              </span>
                            : <span style={{ color: 'var(--accent)' }}>Passed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: 18 }}>
                <h2>Summary</h2>
                <div className="row">
                  <span>Appeared</span><span>{rows.length}</span>
                </div>
                <div className="row">
                  <span>Passed</span>
                  <span>
                    {passed}
                    {complete > 0 && (
                      <span style={{ color: 'var(--muted)' }}>
                        {' '}({Math.round((passed / complete) * 100)}% of those complete)
                      </span>
                    )}
                  </span>
                </div>
                {distribution.map((d) => (
                  <div className="row" key={d.letter}>
                    <span>{d.letter}</span><span>{d.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {!busy && rows.length > 0 && view === 'merit' && (
            <>
              <table
                className="ruled"
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}
              >
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 4px' }}>Position</th>
                    <th style={{ padding: '6px 4px' }}>Roll</th>
                    <th style={{ padding: '6px 4px' }}>Name</th>
                    {streamed && <th style={{ padding: '6px 4px' }}>Grp</th>}
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>GPA</th>
                    <th style={{ padding: '6px 4px', textAlign: 'center' }}>Grade</th>
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '6px 4px', textAlign: 'right' }}>Failed</th>
                    {tiePaper && (
                      <th
                        style={{ padding: '6px 4px', textAlign: 'right' }}
                        title={`${tiePaper.subjectName} — the first paper of the school's order`}
                      >
                        {shortName(tiePaper.subjectName)}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {merit.map((r) => (
                    <tr key={r.student.studentId} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 4px', fontWeight: 700 }}>
                        {r.position ?? <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td style={{ padding: '6px 4px' }}>{r.student.rollNo}</td>
                      <td style={{ padding: '6px 4px' }}>
                        <Link to={`/students/${r.student.studentId}`}>{r.student.fullName}</Link>
                        {r.tabulation.incomplete && (
                          <span style={{ color: 'var(--muted)' }}> · marks not all in</span>
                        )}
                      </td>
                      {streamed && (
                        <td style={{ padding: '6px 4px', color: 'var(--muted)' }}>
                          {shortGroup(r.student.groupName)}
                        </td>
                      )}
                      <td style={{
                        padding: '6px 4px', textAlign: 'right', fontWeight: 700,
                        color: r.tabulation.letter === 'F' ? 'var(--bad)' : undefined,
                      }}>
                        {gpaText(r.tabulation.gpa)}
                      </td>
                      <td style={{
                        padding: '6px 4px', textAlign: 'center',
                        color: r.tabulation.letter === 'F' ? 'var(--bad)' : undefined,
                      }}>
                        {r.tabulation.letter}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                        {r.merit.total ?? '—'}
                      </td>
                      {/* The rung that orders the failures. A blank means
                          none, which is every student who passed. */}
                      <td style={{
                        padding: '6px 4px', textAlign: 'right',
                        color: r.merit.failed > 0 ? 'var(--bad)' : 'var(--muted)',
                      }}>
                        {r.merit.failed > 0 ? r.merit.failed : '—'}
                      </td>
                      {tiePaper && (
                        <td style={{ padding: '6px 4px', textAlign: 'right' }}>
                          {r.merit.firstPaper ?? '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
                Position is decided in this order, each step used only when the one
                before it is level: <strong>GPA</strong> highest first; then{' '}
                <strong>fewer subjects failed</strong>, which separates one failing
                student from another and nobody else; then <strong>total marks</strong>;
                then <strong>{tiePaper ? tiePaper.subjectName : 'the first paper'}</strong>;
                and last the <strong>roll</strong>, which is unique, so every position is
                a single name and none is shared. A student whose marks are not all in is
                not ranked — they are not last, they are not finished, and a position
                printed against them now would change when the mark arrives.
              </p>
            </>
          )}

          {!busy && rows.length === 0 && (
            <p style={{ color: 'var(--muted)', margin: 0 }}>No students in this section.</p>
          )}

          {rows.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
                Class teacher
              </div>
              <div style={{ borderTop: '1px solid #000', paddingTop: 4, fontSize: 13 }}>
                {school?.headTeacher ?? 'Head teacher'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
