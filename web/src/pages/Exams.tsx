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

const blankExam = { examName: '', examYear: currentYear(), published: false };
const blankSubject = {
  subjectName: '', subjectCode: '', classNames: [] as string[],
  fullMarks: 100, isOptional: false, sortOrder: 0,
};

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
      await saveSubject(subject);
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
        </div>
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
