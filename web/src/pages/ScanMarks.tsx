import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { type SchoolClass, listClasses } from '../data/attendance';
import {
  type Exam,
  type ResultRow,
  type Subject,
  listExams,
  listSubjects,
  saveMarks,
  sitsSubject,
  subjectsForClass,
} from '../data/exams';
import { type StudentDetail, findStudents } from '../data/people';
import { partsAndTotal } from '../data/markentry';
import { getIntegrations, saveIntegrations } from '../data/integrations';
import { listModels, modelsToTry, rankVisionModels, readSheets } from '../data/gemini';
import { type SheetShot, fileToSheetShot, sheetSizeLabel } from '../data/sheetphoto';
import {
  type Chosen,
  type ScanRead,
  checkScan,
  matchComponent,
} from '../data/scanmarks';

/**
 * Reading a photographed mark sheet into the grid.
 *
 * The flow is deliberately four separate steps with a person at the end of
 * each: say what the sheet IS, photograph it, read it, then look at what was
 * read before any of it is saved. Nothing here writes until the Save button,
 * and that button uses the same saveMarks() the typed grid has always used.
 *
 * What is NOT done here: believing the reader. Every row is checked against
 * the subject's own parts and against the total the teacher wrote, and rows
 * that do not survive are shown with their problem and left out of the save.
 * See scanmarks.ts, which is where all of that lives and is tested.
 */
export default function ScanMarks() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  const [examId, setExamId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const [students, setStudents] = useState<StudentDetail[]>([]);
  const [shots, setShots] = useState<SheetShot[]>([]);
  const [read, setRead] = useState<ScanRead | null>(null);

  const [busy, setBusy] = useState(true);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState('');
  const [note, setNote] = useState('');
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([listExams(), listSubjects(), listClasses(), getIntegrations()])
      .then(([e, s, c, keys]) => {
        setExams(e);
        setSubjects(s);
        setClasses(c);
        setExamId(e.find((x) => !x.published)?.examId ?? e[0]?.examId ?? '');
        setClassId(c[0]?.classId ?? '');
        setHasKey(keys.geminiApiKey !== '');
      })
      .catch(() => setProblem('Could not load the exams and sections.'))
      .finally(() => setBusy(false));
  }, []);

  const exam = exams.find((e) => e.examId === examId);
  const section = classes.find((c) => c.classId === classId);
  const className = students[0]?.className ?? section?.className ?? '';
  const classSubjects = className ? subjectsForClass(subjects, className) : subjects;
  const subject = classSubjects.find((s) => s.subjectId === subjectId);

  const sitters = useMemo(
    () => (subject ? students.filter((s) => sitsSubject(subject, s)) : students),
    [students, subject],
  );

  useEffect(() => {
    if (!classId) return;
    let live = true;
    setBusy(true);
    findStudents(classId, '')
      .then((roll) => { if (live) { setStudents(roll); setProblem(''); } })
      .catch(() => { if (live) setProblem('Could not read the section.'); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [classId]);

  useEffect(() => {
    if (!classSubjects.length) { setSubjectId(''); return; }
    if (!classSubjects.some((s) => s.subjectId === subjectId)) {
      setSubjectId(classSubjects[0].subjectId);
    }
  }, [className, subjects]);

  // A change of what the sheet is supposed to be invalidates the reading of
  // it: the header check is against these three, and a stale pass would be
  // the most dangerous thing on the page.
  useEffect(() => { setRead(null); setNote(''); }, [examId, classId, subjectId]);

  const components = subject?.components ?? [];

  const chosen: Chosen | null = subject && section
    ? {
      sectionName: section.displayName ?? `${section.className} - ${section.section}`,
      className: section.className,
      subjectName: subject.subjectName,
      examName: exam?.examName ?? '',
      fullMarks: subject.fullMarks,
      components,
    }
    : null;

  const checked = useMemo(
    () => (read && chosen
      ? checkScan(read, sitters.map((s) => ({
        studentId: s.studentId, rollNo: s.rollNo, fullName: s.fullName,
      })), chosen)
      : null),
    [read, sitters, chosen],
  );

  const stopped = checked?.findings.some((f) => f.level === 'STOP') ?? false;

  async function addPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setProblem(''); setNote('');
    try {
      const added = await Promise.all(files.map(fileToSheetShot));
      setShots((was) => [...was, ...added]);
      setRead(null);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That photograph could not be read.');
    }
  }

  /** Works out which model to spend the key on, once, and remembers it. */
  /**
   * Which models to try, best first.
   *
   * More than one, because the best model on an account is also the busiest:
   * a sheet should step around "experiencing high demand" rather than ask the
   * teacher to come back later.
   */
  async function modelsFor(apiKey: string, stored: string, list: string[]): Promise<string[]> {
    const remembered = modelsToTry(stored, list);
    // One model and no runners-up is what a key saved before fallbacks looks
    // like. Rather than make somebody go and re-save it, the list is filled in
    // here, once — the cost is a single extra call the first time.
    if (remembered.length > 1) return remembered;
    const ranked = rankVisionModels(await listModels(apiKey));
    if (!ranked.length) {
      throw new Error('This key has no model on it that can read a picture.');
    }
    // A teacher may not write here; that is fine, it is only a cache.
    saveIntegrations({ geminiModel: stored || ranked[0], geminiModels: ranked }).catch(() => {});
    // The model already shown on Setup stays first; the rest are the fallbacks.
    return modelsToTry(stored, ranked);
  }

  async function readIt() {
    if (!chosen || shots.length === 0) return;
    setReading(true); setProblem(''); setNote('');
    try {
      const keys = await getIntegrations();
      if (!keys.geminiApiKey) {
        setHasKey(false);
        throw new Error('No Gemini key is set up yet.');
      }
      const models = await modelsFor(keys.geminiApiKey, keys.geminiModel, keys.geminiModels);
      const got = await readSheets(
        keys.geminiApiKey, models, shots.map((s) => ({ mimeType: s.mimeType, base64: s.base64 })),
        components.map((c) => c.name),
      );
      setRead(got);
      if (got.rows.length === 0) {
        setProblem('Nothing written was found on that photograph.');
      }
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That sheet could not be read.');
    }
    setReading(false);
  }

  /** A correction on screen goes back into what was read, and is re-checked. */
  function setCell(index: number, column: string, text: string) {
    setRead((prev) => {
      if (!prev) return prev;
      const value = text.trim() === '' ? null : Number(text);
      if (value !== null && !Number.isFinite(value)) return prev;
      return {
        ...prev,
        rows: prev.rows.map((r, i) => {
          if (i !== index) return r;
          const values: Record<string, number | null> = {};
          // Whatever column used to stand for this one is dropped, so a "Prac"
          // read off the paper cannot sit beside the PRACTICAL just corrected.
          for (const [k, v] of Object.entries(r.values)) {
            const same = column === 'Total'
              ? k.trim().toUpperCase() === 'TOTAL'
              : matchComponent(k, components)?.name === column;
            if (!same) values[k] = v;
          }
          values[column] = value;
          return { ...r, values };
        }),
      };
    });
  }

  function setRoll(index: number, text: string) {
    setRead((prev) => prev && {
      ...prev,
      rows: prev.rows.map((r, i) => (i === index
        ? { ...r, roll: text.trim() === '' ? null : Number(text) }
        : r)),
    });
  }

  async function save() {
    if (!checked || !subject || !exam) return;
    if (exam.published) {
      setProblem('That exam is published. Unpublish it first if a mark must be corrected.');
      return;
    }
    const ready = checked.rows.filter((r) => r.problem === '' && r.studentId !== null);
    if (!ready.length) return;

    setBusy(true); setProblem(''); setNote('');
    try {
      // ONLY the rows that were read and survived. A student who is not on
      // this sheet is not touched at all — their marks may already be in from
      // another sheet, and a blank here does not mean they got nothing.
      const rows: ResultRow[] = ready.map((r) => {
        const s = sitters.find((x) => x.studentId === r.studentId)!;
        const { parts, marks } = partsAndTotal(subject, {
          marks: r.marks, parts: r.parts, absent: false,
        });
        return {
          examId, studentId: s.studentId, subjectId: subject.subjectId,
          subjectName: subject.subjectName,
          marks, parts, absent: false,
          classId, rollNo: s.rollNo,
          fullMarks: subject.fullMarks,
          isOptional: subject.isOptional,
        };
      });
      await saveMarks(rows);
      setNote(`${rows.length} mark${rows.length === 1 ? '' : 's'} saved from the sheet.`);
      setRead(null);
      setShots([]);
    } catch {
      setProblem('That save was refused. Only a teacher or the head may enter marks.');
    }
    setBusy(false);
  }

  const ready = checked?.rows.filter((r) => r.problem === '' && r.studentId !== null).length ?? 0;

  return (
    <div className="wrap">
      <div className="card">
        <h1>Scan a mark sheet</h1>
        <p className="muted">
          Photograph the filled-in sheet and the marks are read off it.
          Nothing is saved until you have looked at what was read.
        </p>

        {hasKey === false && (
          <p className="warn">
            No Gemini key has been set up yet, so nothing can be read.
            An admin can paste one in on <Link to="/setup">Setup</Link>.
          </p>
        )}

        <div className="row3">
          <label>
            Exam
            <select value={examId} onChange={(e) => setExamId(e.target.value)}>
              {exams.map((e) => (
                <option key={e.examId} value={e.examId}>
                  {e.examName} {e.examYear}{e.published ? ' (published)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Section
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.displayName ?? `${c.className} - ${c.section}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Subject
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {classSubjects.map((s) => (
                <option key={s.subjectId} value={s.subjectId}>
                  {s.subjectName}{s.isOptional ? ' (4th)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="muted small">
          {subject && (components.length
            ? `${subject.subjectName} is marked ${components.map((c) => `${c.name} out of ${c.max}`).join(' + ')}.`
            : `${subject.subjectName} is marked as one mark out of ${subject.fullMarks}.`)}
          {' '}{sitters.length} student{sitters.length === 1 ? '' : 's'} sit it.
        </p>
      </div>

      <div className="card">
        <h2>The photograph</h2>
        <p className="muted small">
          One picture of the whole sheet, taken square on in good light. If the
          sheet runs to more than one page, add them all before reading — they
          are read together.
        </p>

        {/*
          Two ways in, because one input cannot be both. `capture` sends a
          phone straight to its camera and takes the gallery away with it, so
          on its own it refuses a sheet photographed ten minutes ago. It is
          also ignored on a desktop, where the second button is the only one
          that means anything.
        */}
        <div className="btn-row">
          <label className="btn">
            Take a photograph
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={addPhotos}
              style={{ display: 'none' }}
            />
          </label>
          <label className="btn ghost">
            Choose a photograph
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={addPhotos}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {shots.length > 0 && (
          <div className="shots">
            {shots.map((s, i) => (
              <figure key={i} className="shot">
                <img src={s.preview} alt={`Sheet ${i + 1}`} />
                <figcaption>
                  {s.width}×{s.height} · {sheetSizeLabel(s.base64)}
                  <button
                    type="button"
                    className="link"
                    onClick={() => { setShots((w) => w.filter((_, j) => j !== i)); setRead(null); }}
                  >
                    remove
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        <div className="actions">
          <button
            type="button"
            onClick={readIt}
            disabled={reading || busy || shots.length === 0 || !chosen || hasKey === false}
          >
            {reading ? 'Reading…' : `Read ${shots.length || ''} sheet${shots.length === 1 ? '' : 's'}`}
          </button>
        </div>

        {problem && <p className="bad">{problem}</p>}
        {note && <p className="good">{note}</p>}
      </div>

      {checked && (
        <div className="card">
          <h2>What was read</h2>

          {checked.findings.map((f, i) => (
            <p key={i} className={f.level === 'STOP' ? 'bad' : 'warn'}>
              {f.level === 'STOP' ? 'Stop: ' : 'Check: '}{f.message}
            </p>
          ))}

          {read && (
            <p className="muted small">
              The sheet reads: {read.header.exam || '—'} {read.header.year},
              class {read.header.className || '—'}, {read.header.subject || '—'}.
            </p>
          )}

          <p className="muted small">
            {checked.rows.length} row{checked.rows.length === 1 ? '' : 's'} had something
            written on them. {ready} will be saved
            {checked.held > 0 && `, ${checked.held} held back below`}.
            {' '}A total is only a check — what gets stored is the parts.
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table className="scan">
              <thead>
                <tr>
                  <th>Roll</th>
                  <th>Student</th>
                  {components.map((c) => <th key={c.name}>{c.name}<span className="of"> /{c.max}</span></th>)}
                  {components.length === 0 && <th>Mark</th>}
                  <th>Total written</th>
                  <th>Adds up to</th>
                  <th>Problem</th>
                </tr>
              </thead>
              <tbody>
                {checked.rows.map((r) => (
                  <tr key={r.index} className={r.problem ? 'held' : ''}>
                    <td>
                      <input
                        type="number"
                        className="tiny"
                        value={r.rollNo ?? ''}
                        onChange={(e) => setRoll(r.index, e.target.value)}
                      />
                    </td>
                    <td>{r.studentName || <span className="muted">—</span>}</td>
                    {components.map((c) => (
                      <td key={c.name}>
                        <input
                          type="number"
                          className="tiny"
                          value={r.parts[c.name] ?? ''}
                          onChange={(e) => setCell(r.index, c.name, e.target.value)}
                        />
                      </td>
                    ))}
                    {components.length === 0 && (
                      <td>
                        <input
                          type="number"
                          className="tiny"
                          value={r.marks}
                          onChange={(e) => setCell(r.index, 'Total', e.target.value)}
                        />
                      </td>
                    )}
                    <td>
                      <input
                        type="number"
                        className="tiny"
                        value={r.written ?? ''}
                        onChange={(e) => setCell(r.index, 'Total', e.target.value)}
                      />
                    </td>
                    <td className={r.written !== null && r.computed !== r.written ? 'bad' : ''}>
                      {r.computed ?? '—'}
                    </td>
                    <td className="small">
                      {r.problem ? <span className="bad">{r.problem}</span> : null}
                      {!r.problem && r.note ? <span className="muted">{r.note}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="actions">
            <button type="button" onClick={save} disabled={busy || stopped || ready === 0}>
              {stopped
                ? 'Cannot save this sheet'
                : `Save ${ready} mark${ready === 1 ? '' : 's'}`}
            </button>
            <Link className="btn ghost" to="/marks">Type them in instead</Link>
          </div>
          {exam?.published && (
            <p className="warn">
              That exam is published. Unpublish it before a mark can be changed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
