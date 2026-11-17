import { useEffect, useRef, useState } from 'react';
import { type SchoolClass, listClasses } from '../data/attendance';
import {
  type Exam,
  type Subject,
  excludedBy,
  listExams,
  listSubjects,
  marksForExam,
  saveMarks,
  subjectsForClass,
} from '../data/exams';
import { type Typed, blankTyped } from '../data/markentry';
import {
  type Roster,
  type RosterRow,
  boxNames,
  buildRoster,
  cleanMark,
  enteredLog,
  fieldBad,
  hasEntry,
  lookupRoll,
  markFor,
  nextBox,
  progress,
  resultRowFor,
} from '../data/quickentry';
import { findStudents } from '../data/people';
import { gradeForSubject } from '../data/grading';

/**
 * Quick entry, one subject at a time — the APEX "Quick Mark Entry" page as
 * this app does it.
 *
 * The exam, the section and the subject are chosen once. After that the
 * keyboard does everything: type a roll, the student's name appears, type the
 * marks, and the last Enter saves the row and puts the cursor back in the roll
 * box for the next script. Nothing is clicked between one student and the next.
 *
 * The whole section is read once and held in memory, so the roll lookup is
 * instant — that is the difference between keying in forty scripts and waiting
 * forty times.
 */

/** The single box a paper marked as one mark has, as a name Enter can walk. */
const WHOLE = 'total';

export default function QuickBySubject() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  const [examId, setExamId] = useState('');
  const [className, setClassName] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const [roster, setRoster] = useState<Roster>({});
  const [roll, setRoll] = useState('');
  const [open, setOpen] = useState<RosterRow | null>(null);
  const [typed, setTyped] = useState<Typed>(blankTyped());

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const rollBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([listExams(), listSubjects(), listClasses()])
      .then(([e, s, c]) => {
        setExams(e);
        setSubjects(s);
        setClasses(c);
        setExamId(e.find((x) => !x.published)?.examId ?? e[0]?.examId ?? '');
        setClassName(c[0]?.className ?? '');
        setClassId(c[0]?.classId ?? '');
      })
      .catch(() => setProblem('Could not read the exams.'))
      .finally(() => setLoading(false));
  }, []);

  const classNames = [...new Set(classes.map((c) => c.className))];
  const sections = classes.filter((c) => c.className === className);
  const mySubjects = subjectsForClass(subjects, className);
  const exam = exams.find((e) => e.examId === examId);
  const section = classes.find((c) => c.classId === classId);
  const subject = mySubjects.find((s) => s.subjectId === subjectId);

  /**
   * Keep the section and the subject inside the chosen class.
   *
   * Deliberately NOT watching classId or subjectId: this effect sets them, and
   * watching what it sets would have it argue with the operator's own choice.
   */
  useEffect(() => {
    if (sections.length && !sections.some((c) => c.classId === classId)) {
      setClassId(sections[0].classId);
    }
    if (!mySubjects.length) setSubjectId('');
    else if (!mySubjects.some((s) => s.subjectId === subjectId)) {
      setSubjectId(mySubjects[0].subjectId);
    }
  }, [className, classes, subjects]);

  /**
   * The roster and the marks already entered, read once per subject. Every
   * roll typed afterwards is answered from here.
   */
  useEffect(() => {
    if (!examId || !classId || !subjectId) { setRoster({}); return; }
    const want = subjects.find((s) => s.subjectId === subjectId);
    if (!want) return;

    let live = true;
    setBusy(true);
    setOpen(null);
    setRoll('');
    setNote('');
    Promise.all([findStudents(classId, ''), marksForExam(examId, classId)])
      .then(([students, marks]) => {
        if (!live) return;
        setRoster(buildRoster(
          students.map((st) => ({
            studentId: st.studentId,
            rollNo: st.rollNo,
            fullName: st.fullName,
            className: st.className,
            groupName: st.groupName,
            religion: st.religion,
          })),
          want,
          marks,
        ));
        setProblem('');
      })
      .catch(() => { if (live) setProblem('Could not read the roll for that section.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [examId, classId, subjectId, subjects]);

  const boxes = subject && boxNames(subject).length ? boxNames(subject) : [WHOLE];
  const peek = lookupRoll(roster, roll);
  const done = progress(roster);

  /**
   * Focus is moved from an effect, not from the handler that asked for it.
   *
   * The first mark box does not exist in the page until the student has been
   * opened, and an effect is the first moment React guarantees it does. Asking
   * for the focus any earlier silently leaves the cursor in the roll box, and
   * the marks typed next land in the roll — which is exactly what happened
   * when this was written the obvious way.
   */
  const [wantBox, setWantBox] = useState('');
  const [wantRoll, setWantRoll] = useState(0);

  const focusBox = (name: string) => setWantBox(name);
  const backToRoll = () => setWantRoll((n) => n + 1);

  useEffect(() => {
    if (!wantBox) return;
    const el = document.getElementById(`qs-${wantBox}`) as HTMLInputElement | null;
    el?.focus();
    el?.select();
    setWantBox('');
  }, [wantBox]);

  useEffect(() => {
    if (!wantRoll) return;
    rollBox.current?.focus();
    rollBox.current?.select();
  }, [wantRoll]);

  /** Enter or Tab out of the roll box: open that student, or say why not. */
  function commitRoll() {
    const got = lookupRoll(roster, roll);
    if (got.kind === 'blank') { setOpen(null); return; }
    if (got.kind === 'notFound') {
      setOpen(null);
      setProblem(`No roll ${got.roll} in ${section?.displayName ?? 'this section'}.`);
      backToRoll();
      return;
    }
    if (got.kind === 'notTaken') {
      setOpen(null);
      const by = subject ? excludedBy(subject, got.row) : null;
      const why = by === 'religion' ? got.row.religion
        : by === 'group' ? got.row.groupName
          : got.row.className;
      setProblem(`${got.row.fullName} is ${why}, which does not sit ` +
        `${subject?.subjectName ?? 'this subject'}.`);
      backToRoll();
      return;
    }
    setProblem('');
    setNote('');
    setOpen(got.row);
    setTyped(got.row.typed);
    focusBox(boxes[0]);
  }

  const bad = (name: string): boolean => {
    if (!subject) return false;
    const c = subject.components?.find((x) => x.name === name);
    const raw = name === WHOLE ? typed.marks : typed.parts[name] ?? '';
    return fieldBad(c ? c.max : subject.fullMarks, raw);
  };
  const anyBad = boxes.some(bad);

  const setBox = (name: string, raw: string) => {
    const v = cleanMark(raw);
    setTyped((was) => (name === WHOLE
      ? { ...was, marks: v }
      : { ...was, parts: { ...was.parts, [name]: v } }));
  };

  /** Enter walks the boxes, and saves out of the last one. */
  function boxKey(ev: React.KeyboardEvent, name: string) {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    if (bad(name)) {
      setProblem(`That mark is more than ${name === WHOLE ? 'the paper' : name} is out of.`);
      focusBox(name);
      return;
    }
    const next = nextBox(boxes, name);
    if (next) focusBox(next); else save();
  }

  const live = subject ? markFor(subject, typed) : null;
  const grade = live ? gradeForSubject(live) : null;

  async function save() {
    if (!open || !subject || !exam) return;
    if (exam.published) {
      setProblem('That exam is published. Unpublish it first if a mark must be corrected.');
      return;
    }
    if (anyBad) { setProblem('A mark is above what that part is out of.'); return; }

    setBusy(true);
    setProblem('');
    try {
      const row = resultRowFor(examId, classId, subject, open, typed);
      await saveMarks([row]);
      // The roster is the screen's memory of the section: keeping it in step
      // means the entered list and the count below are right without reading
      // the whole section back after every single row.
      setRoster((was) => ({
        ...was,
        [String(open.rollNo)]: {
          ...was[String(open.rollNo)],
          typed,
          stored: hasEntry(row),
          savedAt: Date.now(),
        },
      }));
      setNote(`Saved roll ${open.rollNo} — ${open.fullName}.`);
      setOpen(null);
      setTyped(blankTyped());
      setRoll('');
      backToRoll();
    } catch {
      setProblem('That save was refused. Only a teacher or the head may enter marks.');
    }
    setBusy(false);
  }

  const log = subject ? enteredLog(roster, subject) : [];
  const time = (ms: number | null) => (ms === null
    ? '—'
    : new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  return (
    <>
      <div className="card">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 190px' }}>
            <label htmlFor="bsx">Exam</label>
            <select id="bsx" value={examId} onChange={(e) => setExamId(e.target.value)}>
              {exams.map((e) => (
                <option key={e.examId} value={e.examId}>
                  {e.examName} {e.examYear}{e.published ? ' (published)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <label htmlFor="bscl">Class</label>
            <select id="bscl" value={className} onChange={(e) => setClassName(e.target.value)}>
              {classNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <label htmlFor="bsse">Section</label>
            <select id="bsse" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {sections.map((c) => (
                <option key={c.classId} value={c.classId}>{c.section || c.displayName}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '2 1 190px' }}>
            <label htmlFor="bssu">Subject</label>
            <select id="bssu" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {mySubjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}{s.isOptional ? ' (4th)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!loading && !mySubjects.length && (
          <div className="err">
            No subject is set up for {className || 'this class'} yet — add them under
            Exams and subjects.
          </div>
        )}
        {exam?.published && (
          <div className="err">
            This exam is published. Marks are shown but cannot be saved until it is
            unpublished.
          </div>
        )}
        {subject && (
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0' }}>
            {subject.components?.length
              ? subject.components.map((c) => `${c.name} ${c.max} (pass ${c.pass})`).join(' · ')
              : `one mark out of ${subject.fullMarks}`}
            {subject.combineGroup ? ` · graded with ${subject.combineGroup}` : ''}
            {(subject.groupNames?.length || subject.religions?.length)
              ? ` · ${[...(subject.groupNames ?? []), ...(subject.religions ?? [])]
                  .join(' and ')} only`
              : ''}
            {' · '}<strong>{done.done} of {done.takes}</strong> entered
          </p>
        )}
      </div>

      {subject && (
        <div className="card">
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '0 1 130px' }}>
              <label htmlFor="qs-roll">Roll</label>
              <input
                id="qs-roll" ref={rollBox} className="scan-input" inputMode="numeric"
                value={roll} disabled={busy}
                onChange={(e) => setRoll(cleanMark(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRoll(); } }}
                onBlur={() => { if (roll.trim() && !open) commitRoll(); }} />
            </div>
            <div style={{ flex: '2 1 260px' }}>
              <label>Student</label>
              <div className={
                'scan-msg' +
                (open ? ' scan-ok' : peek.kind === 'notTaken' ? ' scan-late' : '')
              }>
                {open
                  ? `${open.rollNo} · ${open.fullName}`
                  : peek.kind === 'found' || peek.kind === 'notTaken'
                    ? `${peek.row.rollNo} · ${peek.row.fullName} — press Enter`
                    : roll.trim()
                      ? 'press Enter to look the roll up'
                      : 'type a roll'}
              </div>
            </div>
          </div>

          {open && (
            <>
              <div style={{
                display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end',
                marginTop: 14,
              }}>
                {boxes.map((name) => {
                  const c = subject.components?.find((x) => x.name === name);
                  const raw = name === WHOLE ? typed.marks : typed.parts[name] ?? '';
                  return (
                    <div key={name} style={{ flex: '0 1 130px' }}>
                      <label htmlFor={`qs-${name}`}>
                        {c ? `${c.name} /${c.max}` : `out of ${subject.fullMarks}`}
                        {c ? <span style={{ color: 'var(--muted)' }}> pass {c.pass}</span> : null}
                      </label>
                      <input
                        id={`qs-${name}`} className="scan-input" inputMode="decimal"
                        value={raw} disabled={typed.absent || busy}
                        style={{ borderColor: bad(name) ? 'var(--bad)' : undefined }}
                        onChange={(e) => setBox(name, e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => boxKey(e, name)} />
                    </div>
                  );
                })}

                <div style={{ flex: '0 1 120px' }}>
                  <label>Total</label>
                  <div className="scan-msg" style={{ textAlign: 'center' }}>
                    {live?.marks === null || live?.marks === undefined
                      ? '—'
                      : `${live.marks}/${subject.fullMarks}`}
                  </div>
                </div>

                <div style={{ flex: '0 1 92px' }}>
                  <label>Grade</label>
                  <div className={
                    'scan-msg' +
                    (grade?.letter === 'F' ? ' scan-bad' : grade?.letter && grade.letter !== '-'
                      ? ' scan-ok' : '')
                  } style={{ textAlign: 'center' }}>
                    {grade && grade.letter !== '-' ? `${grade.letter} ${grade.point.toFixed(1)}` : '—'}
                  </div>
                </div>

                <label style={{
                  display: 'flex', gap: 7, alignItems: 'center', margin: '0 0 12px',
                  flex: '0 1 110px',
                }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={typed.absent}
                         onChange={(e) => setTyped({ ...typed, absent: e.target.checked })} />
                  absent
                </label>
              </div>

              {grade && grade.failedParts.length > 0 && (
                <div className="err">
                  {grade.failedParts.join(' and ')} below the pass mark — this subject is F
                  however high the total.
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                <button onClick={save} disabled={busy || anyBad || exam?.published}>
                  {busy ? 'Saving…' : 'Save and next roll'}
                </button>
                <button className="ghost" disabled={busy} onClick={() => {
                  setOpen(null); setTyped(blankTyped()); setRoll(''); backToRoll();
                }}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {problem && <div className="err">{problem}</div>}
          {note && <div style={{ color: 'var(--accent)', marginTop: 10 }}>{note}</div>}

          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
            Enter moves to the next box and saves out of the last one, so a bundle of
            scripts goes in without touching the mouse. A blank box is “not entered
            yet”, not a zero.
          </p>
        </div>
      )}

      {subject && log.length > 0 && (
        <div className="card">
          <h2>Entered marks · {subject.subjectName} · {section?.displayName}</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 4px' }}>Roll</th>
                  <th style={{ padding: '6px 4px' }}>Student</th>
                  {(subject.components ?? []).map((c) => (
                    <th key={c.name} style={{ padding: '6px 4px', textAlign: 'right' }}>
                      {c.name}
                    </th>
                  ))}
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '6px 4px', textAlign: 'center' }}>Grade</th>
                  <th style={{ padding: '6px 4px' }}>Entered</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.rollNo} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '6px 4px', fontVariantNumeric: 'tabular-nums' }}>
                      {r.rollNo}
                    </td>
                    <td style={{ padding: '6px 4px' }}>
                      <button className="link" onClick={() => {
                        setRoll(String(r.rollNo));
                        const got = roster[String(r.rollNo)];
                        if (got) {
                          setOpen(got);
                          setTyped(got.typed);
                          setProblem('');
                          focusBox(boxes[0]);
                        }
                      }}>{r.fullName}</button>
                    </td>
                    {(subject.components ?? []).map((c) => (
                      <td key={c.name} style={{
                        padding: '6px 4px', textAlign: 'right',
                        fontVariantNumeric: 'tabular-nums',
                        color: (r.parts[c.name] ?? 0) < c.pass && r.parts[c.name] !== null
                          && r.parts[c.name] !== undefined ? 'var(--bad)' : undefined,
                      }}>
                        {r.parts[c.name] ?? '—'}
                      </td>
                    ))}
                    <td style={{
                      padding: '6px 4px', textAlign: 'right', fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {r.absent ? 'absent' : r.total ?? '—'}
                    </td>
                    <td style={{
                      padding: '6px 4px', textAlign: 'center', fontWeight: 600,
                      color: r.grade.letter === 'F' ? 'var(--bad)' : undefined,
                    }}>
                      {r.grade.letter}
                    </td>
                    <td style={{ padding: '6px 4px', color: 'var(--muted)' }}>
                      {time(r.savedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
            Newest first, so the row just keyed in is at the top. Click a name to open it
            again and correct it.
          </p>
        </div>
      )}
    </>
  );
}
