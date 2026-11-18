import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type ClassRow, listAllClasses, saveStudent } from '../data/admin';
import { type Editable, type Update, matchByRoll, parseStudentRows, renames } from '../data/batch';
import { SHEET_ACCEPT, readSheetFile } from '../data/sheet';
import { type StudentDetail, findStudents } from '../data/people';

/**
 * A list that CORRECTS the students already here, matched by roll.
 *
 * The other batch page adds people. This one changes them, which is the job
 * nobody could do: a section is created from a spreadsheet, the office adds a
 * Group column to that same spreadsheet a week later, and the only way to get
 * 78 groups into the app is 78 visits to the edit form. So they never go in —
 * and a student with no group sits every paper in the class, Physics and
 * History and both religion papers, and their result can never be finished.
 *
 * Nothing here creates anybody. A roll this section does not have is reported
 * and skipped, because a list pasted against the wrong section would otherwise
 * quietly double the school.
 */

const LABEL: Record<Editable, string> = {
  fullName: 'Name',
  regNo: 'Registration',
  groupName: 'Group',
  religion: 'Religion',
  gender: 'Gender',
  dob: 'Date of birth',
  fatherName: 'Father',
  motherName: 'Mother',
  bloodGroup: 'Blood group',
  mobileNo: 'Mobile',
};

const EXAMPLE = `Roll,Group
1,Science
2,Humanities`;

type State = 'ready' | 'nothing' | 'stopped' | 'saved' | 'failed';
type Shown = Update & { state: State };

export default function StudentsUpdate() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState('');
  const [text, setText] = useState('');
  const [here, setHere] = useState<StudentDetail[]>([]);
  const [rows, setRows] = useState<Shown[] | null>(null);
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

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
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
      const roll = await findStudents(classId, '');
      setHere(roll);
      // nameRequired false: "Roll, Group" is a complete instruction here.
      const got = matchByRoll(parseStudentRows(text, false), roll);
      if (got.length === 0) { setProblem('There is nothing in the box.'); setRows(null); return; }
      setRows(got.map((u) => ({
        ...u,
        state: u.problem ? 'stopped' : u.changes.length ? 'ready' : 'nothing',
      })));
    } catch {
      setProblem('Could not read this section. Only the head or the office may change students.');
    } finally {
      setReading(false);
    }
  }

  async function save() {
    if (!rows) return;
    setBusy(true); setProblem('');
    const out = [...rows];
    for (let i = 0; i < out.length; i += 1) {
      const u = out[i];
      if (u.state !== 'ready' || !u.studentId) continue;
      const found = here.find((s) => s.studentId === u.studentId);
      if (!found) { out[i] = { ...u, state: 'failed' }; continue; }
      try {
        // Built from the record as it stands, with only the changed fields on
        // top: a column the list does not carry cannot blank what is stored.
        await saveStudent({
          ...found,
          studentId: found.studentId,
          classId,
          ...Object.fromEntries(u.changes.map((c) => [c.field, c.to])),
        }, classes);
        out[i] = { ...u, state: 'saved' };
      } catch {
        out[i] = { ...u, state: 'failed' };
        setRows([...out]);
        setProblem(
          'That save was refused, so the rest were left alone. Only the head or the '
          + 'office may change students.',
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
  const nothing = rows?.filter((r) => r.state === 'nothing').length ?? 0;
  const stopped = rows?.filter((r) => r.state === 'stopped').length ?? 0;
  const saved = rows?.filter((r) => r.state === 'saved').length ?? 0;
  const renaming = rows ? renames(rows.filter((r) => r.state !== 'saved')) : 0;
  const untouched = rows
    ? here.filter((s) => !rows.some((r) => r.row.rollNo === s.rollNo)).length
    : 0;

  return (
    <div className="wrap">
      <div className="card">
        <h1>Update students from a list</h1>
        <h2>
          Matched by roll — nothing new is created
          {' · '}<Link to="/students/batch">add new students instead</Link>
          {' · '}<Link to="/students">all students</Link>
        </h2>

        <label htmlFor="cls">Section</label>
        <select id="cls" value={classId}
                onChange={(e) => { setClassId(e.target.value); setRows(null); }}>
          <option value="">— pick a section —</option>
          {classes.filter((c) => c.active !== false).map((c) => (
            <option key={c.classId} value={c.classId}>{c.displayName}</option>
          ))}
        </select>

        <label htmlFor="file">A file, if you have one</label>
        <input id="file" type="file" accept={SHEET_ACCEPT} onChange={pickFile} />

        <label htmlFor="list">
          The list
          {fromFile && <span style={{ color: 'var(--accent)' }}> · read from {fromFile}</span>}
        </label>
        <textarea
          id="list" className="mono" rows={10} value={text} placeholder={EXAMPLE}
          onChange={(e) => { setText(e.target.value); setFromFile(''); }}
        />

        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0' }}>
          Put a heading line at the top so the columns can be named — <em>roll,
          group</em> is enough to record a whole section&rsquo;s streams, and
          <em> roll, religion</em> is enough for the religion papers. Every line
          must carry the <strong>roll</strong>: that is what finds the student.
          A column you leave out is left alone, so the same file can be read twice
          without harm, and &ldquo;sci&rdquo; or &ldquo;muslim&rdquo; are
          understood as Science and Islam.
        </p>

        <button onClick={read} disabled={reading || busy}>
          {reading ? 'Reading…' : 'Read the list'}
        </button>
        {problem && <div className="err">{problem}</div>}
      </div>

      {rows && (
        <div className="card">
          <h2>
            {rows.length} line{rows.length === 1 ? '' : 's'} read · {section?.displayName}
            {untouched > 0 && ` · ${untouched} student${untouched === 1 ? '' : 's'} here `
              + 'not on this list, left alone'}
          </h2>

          <div className="tiles" style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 200px))',
          }}>
            <div className="tile">
              <div className="tile-value">{saved || ready}</div>
              <div className="tile-label">{saved ? 'updated' : 'will change'}</div>
            </div>
            {nothing > 0 && (
              <div className="tile">
                <div className="tile-value">{nothing}</div>
                <div className="tile-label">already right</div>
              </div>
            )}
            {stopped > 0 && (
              <div className="tile">
                <div className="tile-value" style={{ color: 'var(--bad)' }}>{stopped}</div>
                <div className="tile-label">not found here</div>
              </div>
            )}
          </div>

          {renaming > 2 && !done && (
            <div className="callout bad" style={{ marginTop: 14 }}>
              {renaming} of these lines would change a student&rsquo;s NAME. One or two
              are corrections; this many usually means the list belongs to another
              section. Check it before saving.
            </div>
          )}

          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table className="sheet">
              <thead>
                <tr>
                  <th style={{ width: 54 }}>Roll</th>
                  <th>Student</th>
                  <th>What changes</th>
                  <th>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const found = here.find((s) => s.studentId === u.studentId);
                  return (
                    <tr key={u.row.line} style={
                      u.state === 'stopped' ? { background: 'var(--bad-soft)' } : undefined
                    }>
                      <td>{u.row.rollNo ?? '—'}</td>
                      <td>{found?.fullName ?? <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                      <td style={{ fontSize: 13 }}>
                        {u.changes.length === 0
                          ? <span style={{ color: 'var(--muted)' }}>nothing</span>
                          : u.changes.map((c) => (
                            <div key={c.field}>
                              {LABEL[c.field]}:{' '}
                              <span style={{ color: 'var(--muted)' }}>
                                {c.from || 'not set'}
                              </span>
                              {' → '}<strong>{c.to}</strong>
                            </div>
                          ))}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {u.state === 'saved' && (
                          <Link to={`/students/${u.studentId}`}>updated</Link>
                        )}
                        {u.state === 'failed' && (
                          <span style={{ color: 'var(--bad)' }}>refused</span>
                        )}
                        {u.state === 'stopped' && (
                          <span style={{ color: 'var(--bad)' }}>{u.problem}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!done && (
            <button onClick={save} disabled={busy || ready === 0} style={{ marginTop: 14 }}>
              {busy ? 'Saving…' : `Update ${ready} student${ready === 1 ? '' : 's'}`}
            </button>
          )}
          {done && (
            <p style={{ color: 'var(--accent)', marginTop: 14 }}>
              {saved} student{saved === 1 ? '' : 's'} updated.{' '}
              <Link to="/students">see them</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
