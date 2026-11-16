import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { type SchoolSettings, getSettings } from '../data/admin';
import { type SchoolClass, listClasses } from '../data/attendance';
import { cardCode } from '../data/documents';
import { type StudentDetail, findStudents } from '../data/people';

/**
 * Printable ID cards, front and back side by side.
 *
 * The QR on the back carries exactly what the gate scanner parses —
 * SMS-STU-<studentId> — and it is generated from the student number itself,
 * so a card can never be printed with a code that does not resolve. That is
 * also why the student number is handed out by a counter and never reused.
 */
export default function IdCards() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState('');
  const [students, setStudents] = useState<StudentDetail[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    Promise.all([listClasses(), getSettings()])
      .then(([c, s]) => {
        setClasses(c);
        setSchool(s);
        setClassId(c[0]?.classId ?? '');
      })
      .catch(() => setProblem('Could not read the class list.'))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!classId) return;
    let live = true;
    setBusy(true);
    (async () => {
      try {
        const roll = await findStudents(classId, '');
        if (!live) return;
        setStudents(roll);
        // one QR per student, drawn once and kept as a data URL
        const pairs = await Promise.all(roll.map(async (s) => [
          s.studentId,
          await QRCode.toDataURL(cardCode(s.studentId), { margin: 0, width: 220 }),
        ] as const));
        if (live) setCodes(Object.fromEntries(pairs));
        setProblem('');
      } catch {
        if (live) setProblem('Could not build the cards.');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [classId]);

  const section = classes.find((c) => c.classId === classId);

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>ID cards</h1>
        <h2>{section ? section.displayName : 'Pick a section'} · front and back side by side</h2>

        <label htmlFor="cl">Section</label>
        <select id="cl" value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => (
            <option key={c.classId} value={c.classId}>{c.displayName}</option>
          ))}
        </select>

        <button onClick={() => window.print()} disabled={busy || !students.length}>
          Print {students.length} card{students.length === 1 ? '' : 's'}
        </button>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
          The QR carries <code>SMS-STU-&lt;student number&gt;</code> — exactly what the
          gate scanner reads. Print on card and cut along the border; each row is one
          student, front on the left and back on the right.
        </p>
        {problem && <div className="err">{problem}</div>}
      </div>

      <div className="card">
        {busy && <p>Working…</p>}
        {students.map((s) => (
          <div key={s.studentId} style={{
            display: 'flex', gap: 10, marginBottom: 10, breakInside: 'avoid', pageBreakInside: 'avoid',
          }}>
            {/* front */}
            <div style={{
              width: '86mm', height: '54mm', border: '1px solid #000', borderRadius: 6,
              padding: '6mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {school?.instituteName ?? 'School'}
                </div>
                {school?.eiin && <div style={{ fontSize: 9 }}>EIIN {school.eiin}</div>}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{s.fullName}</div>
                <div style={{ fontSize: 11 }}>
                  {s.className} - {s.section} · Roll {s.rollNo}
                </div>
                {s.regNo && <div style={{ fontSize: 10 }}>Reg {s.regNo}</div>}
                {s.bloodGroup && <div style={{ fontSize: 10 }}>Blood {s.bloodGroup}</div>}
              </div>
              <div style={{ fontSize: 9, textAlign: 'right' }}>{cardCode(s.studentId)}</div>
            </div>

            {/* back */}
            <div style={{
              width: '86mm', height: '54mm', border: '1px solid #000', borderRadius: 6,
              padding: '4mm', display: 'flex', gap: '4mm', alignItems: 'center',
            }}>
              {codes[s.studentId] && (
                <img src={codes[s.studentId]} alt={cardCode(s.studentId)}
                     style={{ width: '32mm', height: '32mm' }} />
              )}
              <div style={{ fontSize: 9, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, fontSize: 11 }}>{cardCode(s.studentId)}</div>
                <div>Scan at the gate to mark attendance.</div>
                {school?.address && <div style={{ marginTop: 6 }}>{school.address}</div>}
                <div style={{ marginTop: 6 }}>
                  If found, please return to the school office.
                </div>
                <div style={{ marginTop: 8, borderTop: '1px solid #000', paddingTop: 3 }}>
                  {school?.headTeacher ?? 'Head teacher'}
                </div>
              </div>
            </div>
          </div>
        ))}

        {!busy && students.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>No students in this section.</p>
        )}
      </div>
    </div>
  );
}
