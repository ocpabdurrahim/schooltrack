import { useEffect, useState } from 'react';
import { type ClassRow, listAllClasses } from '../data/admin';
import {
  type Exam,
  type Subject,
  listExams,
  listSubjects,
  periodLabelFor,
  saveExam,
  saveSubject,
} from '../data/exams';
import { currentYear } from '../data/fees';
import type { Component } from '../data/grading';

const blankExam = { examName: '', examYear: currentYear(), published: false, sortOrder: 0 };
const blankSubject = {
  subjectName: '', subjectCode: '', classNames: [] as string[],
  fullMarks: 100, isOptional: false, sortOrder: 0,
  components: [] as Component[], combineGroup: '',
};

/**
 * The patterns a Bangladeshi secondary school actually uses, so setting up
 * twenty subjects is four clicks each rather than typing nine numbers.
 *
 * The pass mark on each part is its own, not a share of the subject's: a
 * paper can total 68 out of 100 and still be F because the MCQ pass is 10.
 * English carries pass 0 because those papers have no part-level pass — the
 * subject's own 33% is the only bar.
 */
const PART_PATTERNS: { label: string; components: Component[] }[] = [
  { label: 'One mark, no parts', components: [] },
  {
    label: 'CQ 70 + MCQ 30',
    components: [{ name: 'CQ', max: 70, pass: 23 }, { name: 'MCQ', max: 30, pass: 10 }],
  },
  {
    label: 'CQ 50 + MCQ 25 + Practical 25',
    components: [
      { name: 'CQ', max: 50, pass: 17 },
      { name: 'MCQ', max: 25, pass: 8 },
      { name: 'PRACTICAL', max: 25, pass: 8 },
    ],
  },
  {
    label: 'CQ 25 + MCQ 25 (out of 50)',
    components: [{ name: 'CQ', max: 25, pass: 8 }, { name: 'MCQ', max: 25, pass: 8 }],
  },
  { label: 'Written 100', components: [{ name: 'WRITTEN', max: 100, pass: 0 }] },
];

export default function Exams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [exam, setExam] = useState<typeof blankExam & { examId?: string }>({ ...blankExam });
  const [subject, setSubject] = useState<typeof blankSubject & { subjectId?: string }>({ ...blankSubject });
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  const load = async () => {
    const [e, s, c] = await Promise.all([listExams(), listSubjects(), listAllClasses()]);
    setExams(e);
    setSubjects(s);
    setClasses(c.filter((x) => x.active !== false));
    setBusy(false);
  };

  useEffect(() => {
    load().catch(() => { setProblem('Could not read the exams.'); setBusy(false); });
  }, []);

  const classNames = [...new Set(classes.map((c) => c.className))];

  async function doSaveExam() {
    if (!exam.examName.trim()) { setProblem('An exam needs a name.'); return; }
    setBusy(true); setProblem('');
    try {
      await saveExam(exam);
      setExam({ ...blankExam });
      await load();
    } catch {
      setProblem('That save was refused. Only an administrator may set up exams.');
      setBusy(false);
    }
  }

  async function doSaveSubject() {
    if (!subject.subjectName.trim()) { setProblem('A subject needs a name.'); return; }
    if (!subject.classNames.length) { setProblem('Tick at least one class that sits this subject.'); return; }
    setBusy(true); setProblem('');
    try {
      await saveSubject({
        ...subject,
        combineGroup: subject.combineGroup.trim().toUpperCase() || null,
      });
      setSubject({ ...blankSubject, sortOrder: (subjects.at(-1)?.sortOrder ?? 0) + 1 });
      await load();
    } catch {
      setProblem('That save was refused. Only an administrator may set up subjects.');
      setBusy(false);
    }
  }

  const toggleClass = (name: string) =>
    setSubject({
      ...subject,
      classNames: subject.classNames.includes(name)
        ? subject.classNames.filter((n) => n !== name)
        : [...subject.classNames, name],
    });

  return (
    <div className="wrap">
      <div className="card">
        <h1>Exams and subjects</h1>
        <h2>What is examined, and who sits what</h2>
        {problem && <div className="err">{problem}</div>}
      </div>

      <div className="card">
        <h2>Exams</h2>
        {exams.map((e) => (
          <div className="row" key={e.examId}>
            <span style={{ color: 'var(--ink)' }}>
              {e.examName} {e.examYear}
              {e.sortOrder > 0 && (
                <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 13 }}>#{e.sortOrder}</span>
              )}
              {e.published && <span className="pill" style={{ marginLeft: 8 }}>published</span>}
            </span>
            <span>
              <code style={{ color: 'var(--muted)', marginRight: 12 }}>{e.periodLabel}</code>
              <button className="link" onClick={() => { setExam(e); setProblem(''); }}>edit</button>
            </span>
          </div>
        ))}
        {!busy && exams.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            No exams yet. Add one — marks cannot be entered until an exam exists.
          </p>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="en">Exam name</label>
            <input id="en" placeholder="Half Yearly Exam" value={exam.examName}
                   onChange={(e) => setExam({ ...exam, examName: e.target.value })} />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label htmlFor="ey">Year</label>
            <input id="ey" value={exam.examYear}
                   onChange={(e) => setExam({ ...exam, examYear: e.target.value })} />
          </div>
          <div style={{ flex: '1 1 110px' }}>
            <label htmlFor="eo">Order in the year</label>
            <input id="eo" type="number" min={0} value={exam.sortOrder}
                   onChange={(e) => setExam({ ...exam, sortOrder: Number(e.target.value) || 0 })} />
          </div>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
          The order decides how the exams line up on a parent's results report:
          1 for the first exam of the year, 2 for the next. The name cannot do
          it — "Annual" sorts before "Half yearly" alphabetically but comes
          after it in the year. Left at 0, the report falls back to that
          alphabetical order and does not call it progress.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
          Period label: <code>{periodLabelFor(exam.examName || 'EXAM', exam.examYear)}</code> —
          the same text the fee module uses, so an exam fee and its exam match.
        </p>
        <button onClick={doSaveExam} disabled={busy}>
          {exam.examId ? 'Save exam' : 'Add exam'}
        </button>
        {exam.examId && (
          <button className="link" style={{ marginLeft: 14 }}
                  onClick={() => setExam({ ...blankExam })}>cancel</button>
        )}
      </div>

      <div className="card">
        <h2>Subjects</h2>
        {subjects.map((s) => (
          <div className="row" key={s.subjectId}>
            <span style={{ color: 'var(--ink)' }}>
              {s.subjectName}
              {s.isOptional && <span className="pill" style={{ marginLeft: 8 }}>4th subject</span>}
            </span>
            <span>
              <span style={{ color: 'var(--muted)', marginRight: 12 }}>
                {(s.classNames ?? []).join(', ') || 'no class'} · {s.fullMarks} marks
                {s.components?.length
                  ? ` · ${s.components.map((c) => `${c.name} ${c.max}`).join(' + ')}`
                  : ''}
                {s.combineGroup ? ` · with ${s.combineGroup}` : ''}
              </span>
              <button className="link" onClick={() => { setSubject(s as never); setProblem(''); }}>edit</button>
            </span>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="sn">Subject</label>
            <input id="sn" placeholder="Mathematics" value={subject.subjectName}
                   onChange={(e) => setSubject({ ...subject, subjectName: e.target.value })} />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label htmlFor="sc">Code</label>
            <input id="sc" placeholder="109" value={subject.subjectCode}
                   onChange={(e) => setSubject({ ...subject, subjectCode: e.target.value })} />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label htmlFor="fm">Full marks</label>
            <input id="fm" type="number" value={subject.fullMarks}
                   onChange={(e) => setSubject({ ...subject, fullMarks: Number(e.target.value) })} />
          </div>
        </div>

        <label>Classes that sit it</label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {classNames.map((n) => (
            <label key={n} style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
              <input type="checkbox" style={{ width: 'auto' }}
                     checked={subject.classNames.includes(n)}
                     onChange={() => toggleClass(n)} />
              {n}
            </label>
          ))}
        </div>

        <label htmlFor="pat" style={{ marginTop: 12 }}>Marked in parts</label>
        <select
          id="pat"
          value={JSON.stringify(subject.components ?? [])}
          onChange={(e) => {
            const components = JSON.parse(e.target.value) as Component[];
            setSubject({
              ...subject,
              components,
              fullMarks: components.length
                ? components.reduce((t, c) => t + c.max, 0)
                : subject.fullMarks,
            });
          }}
        >
          {PART_PATTERNS.map((pt) => (
            <option key={pt.label} value={JSON.stringify(pt.components)}>{pt.label}</option>
          ))}
          {!PART_PATTERNS.some(
            (pt) => JSON.stringify(pt.components) === JSON.stringify(subject.components ?? []),
          ) && (
            <option value={JSON.stringify(subject.components ?? [])}>
              {(subject.components ?? []).map((c) => `${c.name} ${c.max}`).join(' + ')} (as set)
            </option>
          )}
        </select>

        {(subject.components ?? []).length > 0 && (
          <div style={{ marginTop: 8 }}>
            {(subject.components ?? []).map((c, i) => (
              <div key={c.name} style={{
                display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6,
              }}>
                <strong style={{ flex: '0 1 120px' }}>{c.name}</strong>
                <label htmlFor={`cmax-${i}`} style={{ margin: 0 }}>out of</label>
                <input
                  id={`cmax-${i}`} type="number" style={{ flex: '0 1 90px' }} value={c.max}
                  onChange={(e) => {
                    const components = (subject.components ?? []).map(
                      (x, j) => (j === i ? { ...x, max: Number(e.target.value) } : x),
                    );
                    setSubject({
                      ...subject,
                      components,
                      fullMarks: components.reduce((t, x) => t + x.max, 0),
                    });
                  }} />
                <label htmlFor={`cpass-${i}`} style={{ margin: 0 }}>pass at</label>
                <input
                  id={`cpass-${i}`} type="number" style={{ flex: '0 1 90px' }} value={c.pass}
                  onChange={(e) => setSubject({
                    ...subject,
                    components: (subject.components ?? []).map(
                      (x, j) => (j === i ? { ...x, pass: Number(e.target.value) } : x),
                    ),
                  })} />
              </div>
            ))}
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0' }}>
              Full marks follow the parts: {subject.fullMarks} in total. A part below its own
              pass mark fails the whole subject, however high the total comes to.
            </p>
          </div>
        )}

        <label htmlFor="cg" style={{ marginTop: 12 }}>Graded together with</label>
        <input
          id="cg" placeholder="BAN" value={subject.combineGroup ?? ''}
          onChange={(e) => setSubject({ ...subject, combineGroup: e.target.value })} />
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0 0' }}>
          Papers given the same tag become ONE subject on the marksheet — put BAN on both
          Bangla papers and they are graded as a single subject out of 200, the way the
          board counts them. Leave it empty for a paper that stands on its own.
        </p>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={subject.isOptional}
                 onChange={(e) => setSubject({ ...subject, isOptional: e.target.checked })} />
          Optional (4th subject)
        </label>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0 0' }}>
          An optional subject only ever helps: points above 2.00 are added to the total,
          it is not counted in the average, and failing it does not fail the student.
        </p>

        <button onClick={doSaveSubject} disabled={busy}>
          {subject.subjectId ? 'Save subject' : 'Add subject'}
        </button>
        {subject.subjectId && (
          <button className="link" style={{ marginLeft: 14 }}
                  onClick={() => setSubject({ ...blankSubject })}>cancel</button>
        )}
      </div>
    </div>
  );
}
