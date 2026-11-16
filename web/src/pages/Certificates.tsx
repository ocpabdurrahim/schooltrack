import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { todayInDhaka } from '../data/attendance';
import {
  CONDUCTS,
  DOCUMENT_TYPES,
  type DocumentType,
  type IssuedDocument,
  issueDocument,
  listDocuments,
  typeLabel,
} from '../data/documents';
import { type StudentDetail, findStudents } from '../data/people';

export default function Certificates() {
  const { access } = useAuth();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [found, setFound] = useState<StudentDetail[]>([]);
  const [student, setStudent] = useState<StudentDetail | null>(null);

  const [type, setType] = useState<DocumentType>('TESTIMONIAL');
  const [issueDate, setIssueDate] = useState(todayInDhaka());
  const [dateOfLeaving, setDateOfLeaving] = useState('');
  const [reason, setReason] = useState('');
  const [conduct, setConduct] = useState(CONDUCTS[0]);
  const [remarks, setRemarks] = useState('');

  const [register, setRegister] = useState<IssuedDocument[]>([]);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  const load = () =>
    listDocuments()
      .then(setRegister)
      .catch(() => setProblem('Could not read the register. Only the head and the office may.'))
      .finally(() => setBusy(false));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (search.trim().length < 2) { setFound([]); return; }
    let live = true;
    const t = setTimeout(() => {
      findStudents(null, search, true)
        .then((r) => { if (live) setFound(r.slice(0, 8)); })
        .catch(() => { if (live) setFound([]); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [search]);

  async function issue() {
    if (!student) { setProblem('Find the student first.'); return; }
    if (type === 'TRANSFER' && !dateOfLeaving) {
      setProblem('A transfer certificate needs the date the student left.');
      return;
    }
    setBusy(true);
    setProblem('');
    try {
      const serialNo = await issueDocument({
        type,
        student,
        issueDate,
        issuedBy: access.kind === 'staff' ? access.email : '',
        dateOfLeaving: type === 'TRANSFER' ? dateOfLeaving : undefined,
        reason: type === 'TRANSFER' ? reason : undefined,
        conduct: type === 'TRANSFER' ? undefined : conduct,
        remarks,
      });
      navigate(`/certificates/${serialNo}`);
    } catch {
      setProblem('That was refused. Only the head or the office may issue a certificate.');
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>Certificates</h1>
        <h2>
          {student
            ? `${student.fullName} · ${student.className} - ${student.section} · Roll ${student.rollNo}`
            : 'Find the student first'}
        </h2>

        <label htmlFor="q">Student</label>
        <input id="q" autoComplete="off" placeholder="name, roll or student number"
               value={search} onChange={(e) => setSearch(e.target.value)} />
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0 0' }}>
          Students who have left are included — a transfer certificate is usually
          asked for after they have gone.
        </p>
        {found.map((s) => (
          <div className="row" key={s.studentId}>
            <span style={{ color: 'var(--ink)' }}>
              {s.fullName}
              <span style={{ color: 'var(--muted)', marginLeft: 10 }}>
                {s.className} {s.section} · roll {s.rollNo}
              </span>
              {s.status === 'I' && <span className="pill none" style={{ marginLeft: 8 }}>left</span>}
            </span>
            <button className="link" onClick={() => { setStudent(s); setSearch(''); setFound([]); }}>
              choose
            </button>
          </div>
        ))}
        {problem && <div className="err">{problem}</div>}
      </div>

      {student && (
        <div className="card">
          <h2>Issue</h2>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 220px' }}>
              <label htmlFor="ty">Certificate</label>
              <select id="ty" value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
                {DOCUMENT_TYPES.map((d) => (
                  <option key={d.type} value={d.type}>{d.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <label htmlFor="id">Issue date</label>
              <input id="id" type="date" value={issueDate}
                     onChange={(e) => setIssueDate(e.target.value)} />
            </div>
          </div>

          {type === 'TRANSFER' ? (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label htmlFor="dl">Date of leaving</label>
                <input id="dl" type="date" value={dateOfLeaving}
                       onChange={(e) => setDateOfLeaving(e.target.value)} />
              </div>
              <div style={{ flex: '2 1 220px' }}>
                <label htmlFor="rs">Reason</label>
                <input id="rs" placeholder="guardian transferred" value={reason}
                       onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
          ) : (
            <>
              <label htmlFor="cd">Conduct</label>
              <select id="cd" value={conduct} onChange={(e) => setConduct(e.target.value)}>
                {CONDUCTS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </>
          )}

          <label htmlFor="rm">Remarks</label>
          <input id="rm" value={remarks} onChange={(e) => setRemarks(e.target.value)} />

          <button onClick={issue} disabled={busy}>
            {busy ? 'Issuing…' : `Issue ${typeLabel(type).toLowerCase()}`}
          </button>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            The certificate is recorded in the register with a serial number before it
            is printed, and the student's class and parents' names are copied onto it
            as they are today — a transfer certificate must keep saying Class 8 even
            after the roll is promoted.
          </p>
        </div>
      )}

      <div className="card">
        <h2>{busy ? 'Working…' : `Register · ${register.length} issued`}</h2>
        {!busy && register.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>Nothing has been issued yet.</p>
        )}
        {register.map((d) => (
          <div className="row" key={d.serialNo}>
            <span style={{ color: 'var(--ink)' }}>
              <Link to={`/certificates/${d.serialNo}`}>{d.serialNo}</Link>
              <span style={{ color: 'var(--muted)', marginLeft: 10 }}>
                {d.studentName} · {d.classLabel}
              </span>
            </span>
            <span>
              <span style={{ color: 'var(--muted)', marginRight: 12 }}>{typeLabel(d.type)}</span>
              {d.issueDate}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
