import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { type SchoolSettings, getSettings } from '../data/admin';
import { type IssuedDocument, getDocument, typeLabel } from '../data/documents';

/** The printed certificate itself. One layout, three wordings. */
export default function Certificate() {
  const { serialNo = '' } = useParams();
  const [d, setD] = useState<IssuedDocument | null>(null);
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    (async () => {
      try {
        const [got, s] = await Promise.all([getDocument(serialNo), getSettings()]);
        setSchool(s);
        if (!got) { setState('missing'); return; }
        setD(got);
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [serialNo]);

  if (state === 'loading') return <div className="wrap"><div className="card">Loading…</div></div>;
  if (state === 'missing') return (
    <div className="wrap"><div className="card">
      <p style={{ margin: 0 }}>
        No certificate {serialNo}. <Link to="/certificates">The register</Link>
      </p>
    </div></div>
  );
  if (state === 'error' || !d) return (
    <div className="wrap"><div className="card"><div className="err">
      Could not read that certificate. Only the head and the office may.
    </div></div></div>
  );

  const name = <strong>{d.studentName}</strong>;
  const pronoun = 'he/she';

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>{typeLabel(d.type)} · {d.serialNo}</h1>
        <h2>
          <Link to="/certificates">the register</Link>
          {' · '}<Link to={`/students/${d.studentId}`}>{d.studentName}</Link>
        </h2>
        <button onClick={() => window.print()}>Print</button>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
          This is a record of what was issued, not a live view of the student: the
          class, roll and parents' names are as they were on {d.issueDate}.
        </p>
      </div>

      <div className="card">
        <div className="print-sheet" style={{ minHeight: 520 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {school?.instituteName ?? 'School'}
            </div>
            {school?.address && <div style={{ fontSize: 14 }}>{school.address}</div>}
            {school?.eiin && <div style={{ fontSize: 13 }}>EIIN: {school.eiin}</div>}
            <div style={{
              marginTop: 18, fontWeight: 700, fontSize: 18, letterSpacing: 2,
              textTransform: 'uppercase',
            }}>
              {typeLabel(d.type)}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span>Serial: <strong>{d.serialNo}</strong></span>
            <span>Date: {d.issueDate}</span>
          </div>

          <div style={{ marginTop: 24, fontSize: 16, lineHeight: 2 }}>
            {d.type === 'TRANSFER' && (
              <p>
                This is to certify that {name}, son/daughter of{' '}
                <strong>{d.fatherName ?? '—'}</strong> and{' '}
                <strong>{d.motherName ?? '—'}</strong>, was a student of this
                institution in <strong>{d.classLabel}</strong>, roll{' '}
                <strong>{d.rollNo}</strong>
                {d.regNo ? <>, registration number <strong>{d.regNo}</strong></> : null}.
                {' '}{pronoun === 'he/she' ? 'He/She' : ''} left this institution on{' '}
                <strong>{d.dateOfLeaving}</strong>
                {d.reason ? <> on account of <strong>{d.reason}</strong></> : null}.
                All dues to the institution have been paid. I wish every success in life.
              </p>
            )}

            {d.type === 'TESTIMONIAL' && (
              <p>
                This is to certify that {name}, son/daughter of{' '}
                <strong>{d.fatherName ?? '—'}</strong> and{' '}
                <strong>{d.motherName ?? '—'}</strong>, was a student of this
                institution in <strong>{d.classLabel}</strong>, roll{' '}
                <strong>{d.rollNo}</strong>
                {d.dob ? <>, born on <strong>{d.dob}</strong></> : null}.
                {' '}According to the records of this institution, conduct was{' '}
                <strong>{d.conduct}</strong>. I wish every success in life.
              </p>
            )}

            {d.type === 'CHARACTER' && (
              <p>
                This is to certify that {name}, son/daughter of{' '}
                <strong>{d.fatherName ?? '—'}</strong>, a student of{' '}
                <strong>{d.classLabel}</strong> of this institution, bears a{' '}
                <strong>{d.conduct?.toLowerCase()}</strong> moral character.
                {' '}To the best of my knowledge {pronoun === 'he/she' ? 'he/she' : ''} was
                not involved in any activity against the discipline of the institution.
              </p>
            )}

            {d.remarks && <p style={{ fontSize: 15 }}>{d.remarks}</p>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 70 }}>
            <div style={{ borderTop: '1px solid #000', paddingTop: 6, fontSize: 14, textAlign: 'center' }}>
              {school?.headTeacher ?? 'Head teacher'}<br />
              <span style={{ fontSize: 12 }}>Head teacher</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
