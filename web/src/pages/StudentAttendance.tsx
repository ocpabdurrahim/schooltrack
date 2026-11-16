import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { type SchoolSettings, getSettings } from '../data/admin';
import { STATUS_LABEL, todayInDhaka } from '../data/attendance';
import {
  type StudentMonth,
  WEEKDAY_CODES,
  daysInMonth,
  holidayMap,
  listHolidays,
  marksForStudentMonth,
  studentMonth,
  weekdayOf,
} from '../data/attendanceReports';
import { longMonth } from '../data/dashboard';
import { type StudentDetail, getStudent } from '../data/people';

/**
 * One child's attendance, month by month — the report a parent opens.
 *
 * A calendar rather than a list, because a parent reads a month the way it sits
 * on a wall: the 14th is a square, not row fourteen. Weekends and holidays are
 * drawn as what they are, so a blank Tuesday cannot be mistaken for an absence
 * — the two look nothing alike, and the summary counts them apart.
 *
 * Staff can open the same page from the student's record; the rules allow a
 * guardian only their own children, and this page says so plainly rather than
 * showing a refusal that reads like a fault in the app.
 */
export default function StudentAttendance() {
  const { studentId = '' } = useParams();
  const { access } = useAuth();
  const mine = access.kind !== 'guardian' || access.studentIds.includes(studentId);

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [school, setSchool] = useState<SchoolSettings | null>(null);
  const [month, setMonth] = useState(todayInDhaka().slice(0, 7));
  const [sheet, setSheet] = useState<StudentMonth | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'forbidden' | 'error'>('loading');

  useEffect(() => {
    if (!mine) { setState('forbidden'); return; }
    (async () => {
      try {
        const [s, settings] = await Promise.all([getStudent(studentId), getSettings()]);
        if (!s) { setState('missing'); return; }
        setStudent(s);
        setSchool(settings);
        setState('ready');
      } catch {
        setState('error');
      }
    })();
  }, [studentId, mine]);

  useEffect(() => {
    if (state !== 'ready') return;
    (async () => {
      const days = daysInMonth(month);
      // Both are allowed to fail without taking the report with them: without
      // the holidays the calendar simply shows those days as working.
      const [marks, holidays] = await Promise.all([
        marksForStudentMonth(studentId, month).catch(() => []),
        listHolidays(days[0], days[days.length - 1]).catch(() => []),
      ]);
      const weekend = school?.weekendDays?.length ? school.weekendDays : ['FRI', 'SAT'];
      setSheet(studentMonth(month, marks, weekend, holidayMap(holidays)));
    })();
  }, [studentId, month, state, school]);

  if (state === 'forbidden') {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Not your student</h1>
          <p className="panel-note">
            This account may only see the children listed against it. If that is
            wrong, the school has to add them.
          </p>
        </div>
      </div>
    );
  }
  if (state === 'loading') return <div className="wrap"><div className="card">Loading…</div></div>;
  if (state === 'missing') return <div className="wrap"><div className="card">No such student.</div></div>;
  if (state === 'error') return <div className="wrap"><div className="card err">Could not read that student.</div></div>;

  return (
    <div className="wrap">
      <div className="card no-print">
        <h1>Attendance report</h1>
        <h2>
          {student?.fullName} · {student?.className} - {student?.section} · Roll {student?.rollNo}
        </h2>
        <label htmlFor="month">Month</label>
        <input id="month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button onClick={() => window.print()}>Print</button>
        <Link to={`/students/${studentId}`} style={{ marginLeft: 14, fontSize: 14 }}>
          Back to the student
        </Link>
      </div>

      {sheet && (
        <div className="card print-sheet">
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <strong style={{ fontSize: 17 }}>{school?.instituteName ?? 'SchoolTrack'}</strong>
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>
              ATTENDANCE — {longMonth(month).toUpperCase()}
            </div>
            <div style={{ fontSize: 14, marginTop: 6 }}>
              {student?.fullName} · {student?.className} - {student?.section} · Roll {student?.rollNo}
            </div>
          </div>

          <div className="tiles" style={{ marginBottom: 16 }}>
            <Tile value={sheet.percent === null ? '—' : `${sheet.percent}%`} label="of days marked"
                  tone={sheet.percent !== null && sheet.percent < 75 ? 'poor' : 'good'} />
            <Tile value={sheet.present} label="present" />
            <Tile value={sheet.absent} label="absent" />
            <Tile value={sheet.late} label="late" />
            <Tile value={sheet.leave} label="leave" />
            <Tile value={sheet.workingDays} label="working days" />
          </div>

          <div className="cal">
            {WEEKDAY_CODES.map((code) => <div className="cal-head" key={code}>{code}</div>)}
            {/* the month starts on its own weekday, not on Sunday */}
            {Array.from({ length: WEEKDAY_CODES.indexOf(weekdayOf(sheet.days[0].date)) }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {sheet.days.map((d) => (
              <div
                key={d.date}
                className={`cal-day ${d.kind}${d.status ? ` s-${d.status}` : ''}`}
                title={d.holiday ?? (d.status ? STATUS_LABEL[d.status] : undefined)}
              >
                <span className="cal-num">{Number(d.date.slice(8))}</span>
                <span className="cal-mark">
                  {d.status ?? (d.kind === 'holiday' ? '·' : '')}
                </span>
              </div>
            ))}
          </div>

          <div className="cal-legend">
            <span><i className="s-P" />P present</span>
            <span><i className="s-A" />A absent</span>
            <span><i className="s-L" />L late</span>
            <span><i className="s-E" />E leave</span>
            <span><i className="holiday" />holiday</span>
            <span><i className="weekend" />weekend</span>
          </div>

          {sheet.days.some((d) => d.kind === 'holiday') && (
            <p className="panel-note" style={{ marginTop: 12 }}>
              Holidays this month:{' '}
              {sheet.days.filter((d) => d.kind === 'holiday')
                .map((d) => `${Number(d.date.slice(8))} ${d.holiday ?? ''}`.trim())
                .join(' · ')}
            </p>
          )}

          <p className="panel-note" style={{ marginTop: 10, lineHeight: 1.5 }}>
            The percentage is of the days attendance was actually taken
            {sheet.notMarked > 0 && (
              <> — {sheet.notMarked} working day{sheet.notMarked === 1 ? '' : 's'} this month
                {' '}{sheet.notMarked === 1 ? 'was' : 'were'} not marked at all, and{' '}
                {sheet.notMarked === 1 ? 'that day is' : 'those days are'} left out rather than counted
                against your child</>
            )}.
            {' '}A late arrival counts as present, and is also shown on its own.
          </p>
        </div>
      )}
    </div>
  );
}

function Tile({ value, label, tone }: { value: number | string; label: string; tone?: 'good' | 'poor' }) {
  return (
    <div className="tile">
      <div className={`tile-value${tone ? ` ${tone}` : ''}`}>{value}</div>
      <div className="tile-label">{label}</div>
    </div>
  );
}
