import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { type ClassRow, listAllClasses, saveStudent } from '../data/admin';
import { groupOptions, normalGroup } from '../data/groups';
import { normalReligion, religionOptions } from '../data/religions';
import { getStudent } from '../data/people';
import { fileToCardPhoto } from '../data/photoFile';
import { deleteStudentPhoto, getStudentPhoto, saveStudentPhoto } from '../data/photos';

type Form = {
  fullName: string;
  rollNo: number;
  classId: string;
  regNo: string;
  groupName: string;
  religion: string;
  gender: string;
  dob: string;
  fatherName: string;
  motherName: string;
  bloodGroup: string;
  mobileNo: string;
  status: 'A' | 'I';
};

const blank: Form = {
  fullName: '', rollNo: 0, classId: '', regNo: '', groupName: '', religion: '', gender: '',
  dob: '', fatherName: '', motherName: '', bloodGroup: '', mobileNo: '', status: 'A',
};

export default function StudentEdit() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const isNew = !studentId;

  const { access } = useAuth();
  const [form, setForm] = useState<Form>(blank);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');

  // The photo is held here until the record is saved, so that backing out of
  // a half-finished form leaves nothing behind -- and so that a NEW student
  // gets their picture written under the number the save hands back.
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const pick = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        // ALL classes, not only the ones in use: a student may sit in a section
        // that has since been retired, and filtering it out here would silently
        // blank their section the next time anyone saved the record.
        const cs = await listAllClasses();
        if (!live) return;
        setClasses(cs);

        if (studentId) {
          const s = await getStudent(studentId);
          if (!live) return;
          if (!s) { setProblem('No student with that number.'); return; }
          getStudentPhoto(studentId).then((j) => { if (live) setPhoto(j); }).catch(() => {});
          setForm({
            fullName: s.fullName ?? '',
            rollNo: s.rollNo ?? 0,
            classId: s.classId ?? '',
            regNo: s.regNo ?? '',
            // Through normalGroup, so a record written "commerce" by hand or by
            // an older import arrives as one of the picker's own options. Left
            // raw it would match none of them, the picker would read as "none",
            // and the next save would quietly wipe the group.
            groupName: normalGroup(s.groupName),
            religion: normalReligion(s.religion),
            gender: s.gender ?? '',
            dob: s.dob ?? '',
            fatherName: s.fatherName ?? '',
            motherName: s.motherName ?? '',
            bloodGroup: s.bloodGroup ?? '',
            mobileNo: s.mobileNo ?? '',
            status: s.status ?? 'A',
          });
        } else {
          const first = cs.find((c) => c.active !== false);
          if (first) setForm((f) => ({ ...f, classId: first.classId }));
        }
      } catch {
        if (live) setProblem('Could not load this page.');
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [studentId]);

  const text = (k: keyof Form) => ({
    value: String(form[k] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [k]: e.target.value }),
  });

  async function choose(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    setProblem('');
    try {
      setPhoto(await fileToCardPhoto(file));
      setPhotoChanged(true);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'That photo could not be read.');
    } finally {
      setPhotoBusy(false);
      // so that picking the SAME file again after a failure still fires
      if (pick.current) pick.current.value = '';
    }
  }

  async function save() {
    if (!form.fullName.trim()) { setProblem('A student needs a name.'); return; }
    if (!form.classId) { setProblem('Pick a section. If there are none, add one first.'); return; }

    setBusy(true);
    setProblem('');
    try {
      const id = await saveStudent({ ...form, studentId, className: '', section: '' }, classes);

      // After the record, never before: a new student has no number to file a
      // photo under until the save has handed one back.
      if (photoChanged) {
        const who = access.kind === 'staff' ? access.email : '';
        if (photo) await saveStudentPhoto(id, photo, who);
        else await deleteStudentPhoto(id);
      }

      navigate(`/students/${id}`);
    } catch {
      setProblem(
        'That save was refused. Only the head or the office may add students.',
      );
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card">
        <h1>{isNew ? 'New student' : `Edit student ${studentId}`}</h1>
        <h2>
          {isNew
            ? 'The student number is given automatically, and becomes the QR code on the ID card'
            : `Card code SMS-STU-${studentId}`}
        </h2>

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <label htmlFor="photo">Photo</label>
            <div style={{
              width: 92, height: 115, borderRadius: 8,
              border: '1px dashed var(--line)', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--muted)', fontSize: 12, background: 'var(--bg-soft, transparent)',
            }}>
              {photo
                ? <img src={photo} alt="" style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                  }} />
                : <span>{photoBusy ? '…' : 'none'}</span>}
            </div>
            <input ref={pick} id="photo" type="file" accept="image/*"
                   style={{ display: 'none' }}
                   onChange={(e) => choose(e.target.files?.[0])} />
            <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 13 }}>
              <button type="button" className="link" onClick={() => pick.current?.click()}
                      disabled={photoBusy}>
                {photo ? 'change' : 'choose'}
              </button>
              {photo && (
                <button type="button" className="link"
                        onClick={() => { setPhoto(null); setPhotoChanged(true); }}>
                  remove
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: '3 1 260px' }}>
            <label htmlFor="fn">Full name</label>
            <input id="fn" {...text('fullName')} />
          </div>
          <div style={{ flex: '1 1 100px' }}>
            <label htmlFor="roll">Roll</label>
            {/* empty rather than 0 on a new record: a prefilled zero has to be
                deleted before every single student is typed in */}
            <input id="roll" type="number" value={form.rollNo || ''}
                   onChange={(e) => setForm({ ...form, rollNo: Number(e.target.value) })} />
          </div>
        </div>

        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '2px 0 10px' }}>
          The photo goes on the ID card, and is shrunk to card size as it is picked —
          pick the original from the camera, there is no need to resize it first. It is
          kept with the record, not in the student list, so it costs nothing to the pages
          that do not show it.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label htmlFor="cls">Section</label>
            <select id="cls" value={form.classId}
                    onChange={(e) => setForm({ ...form, classId: e.target.value })}>
              <option value="">— pick a section —</option>
              {classes
                .filter((c) => c.active !== false || c.classId === form.classId)
                .map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.displayName}{c.active === false ? ' (retired)' : ''}
                  </option>
                ))}
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="reg">Registration no.</label>
            <input id="reg" {...text('regNo')} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="grp">Group</label>
            <select id="grp" value={form.groupName}
                    onChange={(e) => setForm({ ...form, groupName: e.target.value })}>
              <option value="">— none —</option>
              {groupOptions(form.groupName).map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="rel">Religion</label>
            <select id="rel" value={form.religion}
                    onChange={(e) => setForm({ ...form, religion: e.target.value })}>
              <option value="">— none —</option>
              {religionOptions(form.religion).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0 0' }}>
          The religion decides which religion paper this student sits. “Other” is a real
          answer — it means neither paper. Left blank, the student is expected to sit
          both, and their result will say it is not finished until this is filled in.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="g">Gender</label>
            <select id="g" value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">—</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="dob">Date of birth</label>
            <input id="dob" type="date" {...text('dob')} />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label htmlFor="bg">Blood group</label>
            <input id="bg" placeholder="B+" {...text('bloodGroup')} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label htmlFor="fa">Father's name</label>
            <input id="fa" {...text('fatherName')} />
          </div>
          <div style={{ flex: '1 1 220px' }}>
            <label htmlFor="mo">Mother's name</label>
            <input id="mo" {...text('motherName')} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label htmlFor="mob">Guardian's mobile</label>
            <input id="mob" {...text('mobileNo')} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label htmlFor="st">Status</label>
            <select id="st" value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as 'A' | 'I' })}>
              <option value="A">Studying</option>
              <option value="I">Left</option>
            </select>
          </div>
        </div>

        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 14 }}>
          A student who leaves is marked <strong>Left</strong> rather than removed: their
          attendance, receipts and certificates all point at this record.
        </p>

        <button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save student'}</button>
        <Link to={studentId ? `/students/${studentId}` : '/students'}
              style={{ marginLeft: 14, fontSize: 14 }}>
          cancel
        </Link>
        {problem && <div className="err">{problem}</div>}
      </div>
    </div>
  );
}
