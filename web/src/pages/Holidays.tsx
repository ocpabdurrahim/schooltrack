import { useEffect, useMemo, useState } from 'react';
import { type SchoolSettings, getSettings, saveSettings } from '../data/admin';
import { todayInDhaka } from '../data/attendance';
import {
  WEEKDAY_CODES,
  type Holiday,
  holidayMap,
  listHolidays,
  removeHoliday,
  saveHoliday,
  weekdayOf,
  workingDays,
} from '../data/attendanceReports';

/**
 * The holiday calendar and the weekend, which together decide what a working
 * day is. APEX p38.
 *
 * A holiday is the one record in this app that can be deleted: a day marked by
 * mistake has to come back, and nothing else points at it. Attendance already
 * marked on a day later made a holiday is left alone — the register says what
 * happened, and the calendar should not rewrite it.
 */
export default function Holidays() {
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [year, setYear] = useState(todayInDhaka().slice(0, 4));

  const [date, setDate] = useState('');
  const [name, setName] = useState('');

  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState('');
  const [note, setNote] = useState('');

  async function reload(forYear: string) {
    setHolidays(await listHolidays(`${forYear}-01-01`, `${forYear}-12-31`));
  }

  useEffect(() => {
    Promise.all([getSettings(), listHolidays(`${year}-01-01`, `${year}-12-31`)])
      .then(([s, h]) => { setSchool(s); setHolidays(h); })
      .catch(() => setProblem('Could not read the calendar.'))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    setBusy(true);
    reload(year)
      .catch(() => setProblem('Could not read the calendar.'))
      .finally(() => setBusy(false));
  }, [year]);

  const weekend = school?.weekendDays ?? ['FRI', 'SAT'];
  const map = useMemo(() => holidayMap(holidays), [holidays]);

  const byMonth = useMemo(() => {
    const out: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${String(m).padStart(2, '0')}`;
      out[month] = workingDays(month, weekend, map).length;
    }
    return out;
  }, [year, weekend, map]);

  async function add() {
    if (!date || !name.trim()) { setProblem('A holiday needs a date and a name.'); return; }
    setBusy(true); setProblem(''); setNote('');
    try {
      await saveHoliday({ date, name });
      await reload(date.slice(0, 4));
      if (date.slice(0, 4) !== year) setYear(date.slice(0, 4));
      setNote(`${name.trim()} saved for ${date}.`);
      setName('');
    } catch {
      setProblem('That was refused. Only an administrator may change the calendar.');
    }
    setBusy(false);
  }

  async function drop(h: Holiday) {
    setBusy(true); setProblem(''); setNote('');
    try {
      await removeHoliday(h.date);
      await reload(year);
      setNote(`${h.name} removed from ${h.date}.`);
    } catch {
      setProblem('That was refused. Only an administrator may change the calendar.');
    }
    setBusy(false);
  }

  async function toggleWeekend(code: string) {
    if (!school) return;
    const next = weekend.includes(code)
      ? weekend.filter((d) => d !== code)
      : [...weekend, code];
    setBusy(true); setProblem(''); setNote('');
    try {
      await saveSettings({ ...school, weekendDays: next });
      setSchool({ ...school, weekendDays: next });
    } catch {
      setProblem('That was refused. Only an administrator may change the weekend.');
    }
    setBusy(false);
  }

  const years = [String(Number(year) - 1), year, String(Number(year) + 1)]
    .filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="wrap">
      <div className="card">
        <h1>Holidays</h1>
        <h2>What counts as a working day</h2>

        <label htmlFor="yr">Year</label>
        <select id="yr" value={year} onChange={(e) => setYear(e.target.value)}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        {problem && <div className="err">{problem}</div>}
        {note && <div style={{ color: 'var(--accent)', fontSize: 14 }}>{note}</div>}
        {busy && <p>Working…</p>}
      </div>

      <div className="card">
        <h2>Weekend</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {WEEKDAY_CODES.map((code) => {
            const on = weekend.includes(code);
            return (
              <button
                key={code}
                onClick={() => toggleWeekend(code)}
                disabled={busy || !school}
                style={{
                  width: 64, padding: '8px 0',
                  background: on ? 'var(--accent)' : 'transparent',
                  color: on ? '#fff' : 'var(--ink)',
                  border: '1px solid var(--line)',
                }}
              >
                {code}
              </button>
            );
          })}
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
          {weekend.length === 0
            ? 'With no weekend set, every day that is not a holiday is a working day.'
            : `${weekend.join(' and ')} are not working days.`}
          {!school && ' Save the school settings first.'}
        </p>
      </div>

      <div className="card">
        <h2>Add a holiday</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label htmlFor="dt">Date</label>
            <input id="dt" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div style={{ flex: '2 1 220px' }}>
            <label htmlFor="nm">Name</label>
            <input id="nm" placeholder="Victory Day" value={name}
                   onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <button onClick={add} disabled={busy}>Save holiday</button>
        {date && (
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 0 }}>
            {date} is a {weekdayOf(date)}
            {weekend.includes(weekdayOf(date)) ? ' — already a weekend, so this changes nothing.' : '.'}
          </p>
        )}
      </div>

      <div className="card">
        <h2>{holidays.length} holiday{holidays.length === 1 ? '' : 's'} in {year}</h2>
        {holidays.length === 0 && (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            Nothing in {year} yet.
          </p>
        )}
        {holidays.map((h) => (
          <div className="row" key={h.date}>
            <span style={{ color: 'var(--ink)' }}>
              {h.name}
              <span style={{ color: 'var(--muted)' }}> · {h.date} ({weekdayOf(h.date)})</span>
            </span>
            <button className="link" onClick={() => drop(h)} disabled={busy}>remove</button>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Working days in {year}</h2>
        {Object.entries(byMonth).map(([month, count]) => (
          <div className="row" key={month}>
            <span>
              {new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-GB', {
                month: 'long', timeZone: 'UTC',
              })}
            </span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
