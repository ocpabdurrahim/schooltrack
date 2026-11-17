import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type ClassRow, listAllClasses, saveStudent } from '../data/admin';
import { type StudentRow, parseStudentRows, prepareStudentRows } from '../data/batch';
import { SHEET_ACCEPT, readSheetFile } from '../data/sheet';
import { findStudents } from '../data/people';

type Shown = StudentRow & { state: 'ready' | 'stopped' | 'saved' | 'failed'; studentId?: string };

const EXAMPLE = `1\tAyesha Khatun\tKarim Mia\tFatema Begum\t01711000000
2\tRakib Hasan\tJashim Uddin\tSalma Akter\t01811000000`;

/**
 * A whole section typed in at once.
 *
 * The single form is right for one student and wrong for forty, which is what
 * January is. This page reads a pasted list, shows exactly what it understood,
 * and only then saves — through the same saveStudent the single form uses, so
 * the student numbers, the rules and the audit stamp are identical.
 *
 * It shows the reading before it writes anything on purpose. A bulk import that
 * saves first and reports afterwards leaves someone deleting forty records by
 * hand, and this app does not delete students at all.
 */
export default function StudentsBatch() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState('');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Shown[] | null>(null);
  const [taken, setTaken] = useState<number[] | null>(null);
  const [fromFile, setFromFile] = useState('');
  const [busy, setBusy] = useState(true);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    listAllClasses()
      .then((cs) => {
        setClasses(cs);
        const first = cs.find((c) => c.active !== false);
        if (first) setClassId(first.classId);
      })
      .catch(() => setProblem('Could not read the sections.'))
      .finally(() => setBusy(false));
  }, []);

  const section = classes.find((c) => c.classId === classId);

  /**
   * A chosen file only fills the box. It is still read, shown and corrected
   * like anything typed in — a file that saves itself is a file nobody checked.
   */
  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';           // so the same file can be chosen again
    if (!file) return;
    setProblem(''); setRows(null); setDone(false); setFromFile('');
    try {
      const loaded = await readSheetFile(file);
      if (!loaded.trim()) { setProblem(`There is nothing in ${file.name}.`); return; }
      setText(loaded);
      setFromFile(file.name);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That file could not be read.');
    }
  }

  async function read() {
    if (!classId) { setProblem('Pick a section first.'); return; }
    setProblem(''); setReading(true); setDone(false);
    try {
      // The rolls already in use, so a clash can be named before anything is
      // written. Only the students still studying count: a roll left behind by
      // someone who has gone is free to use again.
      const here = await findStudents(classId, '');
      const rolls = here.map((s) => s.rollNo);
      setTaken(rolls);
      const parsed = prepareStudentRows(parseStudentRows(text), rolls);
      if (parsed.length === 0) { setProblem('There is nothing in the box.'); setRows(null); return; }
      setRows(parsed.map((r) => ({ ...r, state: r.problem ? 'stopped' : 'ready' })));
    } catch {
      setProblem('Could not read this section. Only the head or the office may add students.');
    } finally {
      setReading(false);
    }
  }

  async function save() {
    if (!rows) return;
    setBusy(true); setProblem('');
    const out = [...rows];
    for (let i = 0; i < out.length; i += 1) {
      const r = out[i];
      if (r.state !== 'ready') continue;
      try {
        // One at a time, deliberately: each save takes the next student number
        // from the counter, and a counter read in parallel hands out the same
        // number twice.
        const id = await saveStudent({
          fullName: r.fullName,
          rollNo: r.rollNo ?? 0,
          classId,
          className: '',
          section: '',
          regNo: r.regNo,
          groupName: r.groupName,
          religion: r.religion,
          gender: r.gender,
          dob: r.dob,
          fatherName: r.fatherName,
          motherName: r.motherName,
          bloodGroup: r.bloodGroup,
          mobileNo: r.mobileNo,
          status: 'A',
        }, classes);
        out[i] = { ...r, state: 'saved', studentId: id };
      } catch {
        // Stop at the first refusal. Carrying on would pile up forty identical
        // failures and bury the one line that says why.
        out[i] = { ...r, state: 'failed' };
        setRows([...out]);
        setProblem(
          'That save was refused, so the rest were left alone. Only the head or the '
          + 'office may add students.',
        );
        setBusy(false);
        return;
      }
      setRows([...out]);
    }
    setRows(out);
    setDone(true);
    setBusy(false);
  }

  const ready = rows?.filter((r) => r.state === 'ready').length ?? 0;
  const stopped = rows?.filter((r) => r.state === 'stopped').length ?? 0;
  const saved = rows?.filter((r) => r.state === 'saved').length ?? 0;
  const noted = rows?.filter((r) => r.note && r.state !== 'stopped').length ?? 0;

  return (
    <div className="wrap">
      <div className="card">
        <h1>Add many students</h1>
        <h2>
          One student a line, pasted out of a list
          {' · '}<Link to="/students/new">add one at a time instead</Link>
          {' · '}<Link to="/students">all students</Link>
        </h2>

        <label htmlFor="cls">Section</label>
        <select id="cls" value={classId} onChange={(e) => { setClassId(e.target.value); setRows(null); }}>
          <option value="">— pick a section —</option>
          {classes.filter((c) => c.active !== false).map((c) => (
            <option key={c.classId} value={c.classId}>{c.displayName}</option>
          ))}
        </select>

        <label htmlFor="file">A file, if you have one</label>
        <input id="file" type="file" accept={SHEET_ACCEPT} onChange={pickFile} />
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0 0' }}>
          An Excel file (.xlsx) or a CSV. The first sheet is read, into the box
          below, where it can be corrected before anything is saved. An old .xls
          has to be saved again as .xlsx or CSV first.
        </p>

        <label htmlFor="list">
          The list
          {fromFile && <span style={{ color: 'var(--accent)' }}> · read from {fromFile}</span>}
        </label>
        <textarea
          id="list"
          className="mono"
          rows={10}
          value={text}
          placeholder={EXAMPLE}
          onChange={(e) => { setText(e.target.value); setFromFile(''); }}
        />

        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0' }}>
          Columns separated by tabs (what a paste out of Excel gives), by commas,
          or by two spaces. Without a heading line, a list that starts with a
          number is read as <strong>roll, name, father, mother, mobile, date of
          birth</strong>, and one that starts with a name as <strong>name,
          father, mother, mobile, date of birth</strong> — rolls are then given
          out after the highest one in the section. A column of names on their
          own works. To use another order, put a heading line at the top naming
          the columns: <em>name, father, mobile, blood, group, reg no, sex, dob</em>.
          A date like 05/03/2012 is read as 5 March.
        </p>

        <button onClick={read} disabled={reading || busy}>
          {reading ? 'Reading…' : 'Read the list'}
        </button>
        {problem && <div className="err">{problem}</div>}
      </div>

      {rows && (
        <div className="card">
          <h2>
            {rows.length} line{rows.length === 1 ? '' : 's'} read
            {' · '}{section?.displayName}
            {taken !== null && taken.length > 0 && ` · ${taken.length} already in this section`}
          </h2>

          {/* capped, not full width: one lone tile stretched across the card
              reads as a headline rather than a count */}
          <div className="tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 200px))' }}>
            <div className="tile">
              <div className="tile-value">{saved || ready}</div>
              <div className="tile-label">{saved ? 'saved' : 'ready to save'}</div>
            </div>
            {stopped > 0 && (
              <div className="tile">
                <div className="tile-value" style={{ color: 'var(--bad)' }}>{stopped}</div>
                <div className="tile-label">need fixing</div>
              </div>
            )}
            {noted > 0 && (
              <div className="tile">
                <div className="tile-value">{noted}</div>
                <div className="tile-label">worth a look</div>
              </div>
            )}
          </div>

          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table className="sheet">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>Line</th>
                  <th style={{ width: 54 }}>Roll</th>
                  <th>Name</th>
                  <th>Father</th>
                  <th>Mother</th>
                  <th>Mobile</th>
                  <th>Also</th>
                  <th>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} style={r.state === 'stopped' ? { background: 'var(--bad-soft)' } : undefined}>
                    <td style={{ color: 'var(--muted)' }}>{r.line}</td>
                    <td>{r.rollNo ?? '—'}</td>
                    <td>{r.fullName || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td>{r.fatherName}</td>
                    <td>{r.motherName}</td>
                    <td>{r.mobileNo}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 13 }}>
                      {[r.dob, r.gender === 'M' ? 'male' : r.gender === 'F' ? 'female' : '',
                        r.bloodGroup, r.groupName, r.religion, r.regNo].filter(Boolean).join(' · ')}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      {r.state === 'saved' && (
                        <Link to={`/students/${r.studentId}`}>saved as {r.studentId}</Link>
                      )}
                      {r.state === 'failed' && <span style={{ color: 'var(--bad)' }}>refused</span>}
                      {r.state === 'stopped' && <span style={{ color: 'var(--bad)' }}>{r.problem}</span>}
                      {r.state === 'ready' && r.note && (
                        <span style={{ color: 'var(--muted)' }}>{r.note}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {stopped > 0 && (
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>
              The {stopped === 1 ? 'red line' : `${stopped} red lines`} will be
              left out. Correct them in the box above and read the list again.
            </p>
          )}

          {!done && (
            <button onClick={save} disabled={busy || ready === 0}>
              {busy ? 'Saving…' : `Save ${ready} student${ready === 1 ? '' : 's'}`}
            </button>
          )}

          {done && (
            <>
              <p style={{ marginTop: 14, marginBottom: 0 }}>
                <strong className="good">
                  {saved} student{saved === 1 ? '' : 's'} added to {section?.displayName}.
                </strong>
                {' '}They are in the register now, so reading this same list again
                would add them a second time.
              </p>
              <button onClick={() => { setText(''); setRows(null); setDone(false); }}>
                Start another list
              </button>
              <Link to="/students" style={{ marginLeft: 14, fontSize: 14 }}>all students</Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
