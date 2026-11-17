import { useState } from 'react';
import QuickBySubject from './QuickBySubject';
import QuickByStudent from './QuickByStudent';

/**
 * Quick entry — two forms over the same marks, because the paper arrives in
 * two shapes.
 *
 * A bundle of scripts for one subject is keyed in BY SUBJECT: pick the subject
 * once, then roll, marks, Enter, roll, marks, Enter. That is the form the
 * office lives in, and the one the school's own APEX page works this way.
 *
 * A single marksheet for one child — a late sitter, a correction, a transfer
 * in — is keyed in BY STUDENT: every subject at once, with the real GPA under
 * it before anything is saved.
 *
 * Which form is open is the only thing this file decides. Neither form knows
 * about the other.
 */

type Form = 'subject' | 'student';

export default function QuickMarks() {
  const [form, setForm] = useState<Form>('subject');

  return (
    <div className="wrap">
      <div className="card">
        <h1>Quick entry</h1>
        <h2>
          {form === 'subject'
            ? 'One subject, roll after roll — the keyboard does everything'
            : 'One student, every subject — with the GPA before you save'}
        </h2>
        <label htmlFor="qform">Form</label>
        <select id="qform" value={form} onChange={(e) => setForm(e.target.value as Form)}>
          <option value="subject">By subject — a bundle of scripts, roll after roll</option>
          <option value="student">By student — one whole marksheet at once</option>
        </select>
      </div>

      {form === 'subject' ? <QuickBySubject /> : <QuickByStudent />}
    </div>
  );
}
