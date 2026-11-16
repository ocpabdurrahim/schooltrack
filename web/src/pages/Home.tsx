import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { type Role, useAuth } from '../auth';
import { SCHOOL_ID, db } from '../firebase';
import { getSettings } from '../data/admin';
import { todayInDhaka } from '../data/attendance';
import {
  type MoneySnapshot,
  type TrendDay,
  attendanceTrend,
  longDate,
  longMonth,
  moneySnapshot,
  percentOf,
  trendSummary,
} from '../data/dashboard';
import { money } from '../data/fees';
import { type Child, myChildren } from '../data/guardian';
import { type SchoolStats, schoolStats } from '../data/people';

/**
 * The dashboard.
 *
 * Every panel is independent and renders only from figures that actually came
 * back: a teacher cannot read staff or payments, and a refusal has to remove a
 * panel, never produce an error or a zero. A zero on a dashboard is a claim —
 * "nothing was collected today" — and claiming that because the read was
 * denied is worse than showing nothing at all.
 */
export default function Home() {
  const { access } = useAuth();
  const staff = access.kind === 'staff';
  const today = todayInDhaka();

  const [school, setSchool] = useState('');
  const [session, setSession] = useState('');
  const [stats, setStats] = useState<SchoolStats | null>(null);
  const [trend, setTrend] = useState<TrendDay[] | null>(null);
  const [cash, setCash] = useState<MoneySnapshot | null>(null);
  const [children, setChildren] = useState<Child[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // The name shown everywhere comes from settings/school, which an
        // administrator can edit in the app. The school document itself is
        // writable only by the app owner, so it is the fallback, not the source.
        const [s, settings] = await Promise.all([
          getDoc(doc(db, 'schools', SCHOOL_ID)),
          getSettings(),
        ]);
        setSchool(settings?.instituteName ?? (s.data()?.name as string) ?? SCHOOL_ID);
        setSession(settings?.sessionLabel ?? '');
      } catch {
        setProblem('Could not read the school record — your account may have no access yet.');
      }

      if (staff) {
        // Started together: the counts answer in one round of aggregation
        // queries while the month's payments are still being read.
        try { setStats(await schoolStats()); } catch { /* panel simply absent */ }
        void attendanceTrend(7).then(setTrend).catch(() => setTrend(null));
        void moneySnapshot().then(setCash).catch(() => setCash(null));
      }
      if (access.kind === 'guardian') {
        try { setChildren(await myChildren(access.studentIds)); } catch { setChildren([]); }
      }
      setLoading(false);
    })();
  }, [staff, access]);

  const role: Role | null = access.kind === 'staff' ? access.role : null;
  const money$ = role === 'ADMIN' || role === 'ACCOUNTS';
  const records = role === 'ADMIN' || role === 'OFFICE';
  const admin = role === 'ADMIN';

  return (
    <div className="wrap">
      <div className="dash">
        <header className="hero">
          <div className="hero-mark" aria-hidden="true">{initialsOf(school || 'School')}</div>
          <div>
            <h1 className={school ? undefined : 'skeleton'}>{school || 'Loading the school'}</h1>
            <p className="hero-sub">
              {session && <>{session} · </>}{longDate(today)}
            </p>
          </div>
          <div className="hero-me">
            {access.kind === 'staff' && <span className="chip">{access.role}</span>}
            {access.kind === 'guardian' && (
              <span className="chip">
                Guardian · {access.studentIds.length} student{access.studentIds.length === 1 ? '' : 's'}
              </span>
            )}
            {access.kind === 'none' && <span className="chip">No access</span>}
            <span className="hero-who">
              {'name' in access ? access.name : 'email' in access ? access.email : ''}
            </span>
            {/* Sign out lives in the bar now, on every page rather than this one */}
          </div>
        </header>

        {access.kind === 'none' && (
          <section className="panel">
            <div className="panel-head"><h2>No access record</h2></div>
            <p className="panel-note" style={{ fontSize: 15, lineHeight: 1.55 }}>
              Your sign-in worked, but nobody has been given access to this school
              under <strong>{access.email}</strong>. An administrator has to add you
              first — signing in by itself grants nothing.
            </p>
          </section>
        )}

        {staff && (
          <>
            <div className="dash-grid two">
              <AttendanceToday stats={stats} loading={loading && !stats} />
              <section className="panel">
                <div className="panel-head">
                  <h2>The school</h2>
                  {records && <Link className="panel-link" to="/students/new">Add student →</Link>}
                </div>
                <div className="stats">
                  <Stat label="Students" value={stats?.students ?? null} icon={<IconStudents />}
                        to="/students" foot="on the roll" loading={loading && !stats} />
                  <Stat label="Staff" value={stats?.staff ?? null} icon={<IconStaff />} tone="blue"
                        to={admin ? '/staff' : undefined} foot="teaching and office"
                        loading={loading && !stats} />
                  <Stat label="Sections" value={stats?.classes ?? null} icon={<IconClasses />} tone="amber"
                        to={admin ? '/classes' : undefined} foot="classes and sections"
                        loading={loading && !stats} />
                  {money$ && (
                    <Stat label="Today's fees" value={cash ? Number(cash.collectedToday) : null}
                          display={cash ? money(cash.collectedToday) : null}
                          icon={<IconMoney />} to="/fees/receipts"
                          foot={cash ? `${cash.receipts} receipt${cash.receipts === 1 ? '' : 's'} this month` : 'collected'}
                          loading={loading && !cash} />
                  )}
                </div>
              </section>
            </div>

            <Trend days={trend} today={today} loading={loading && !trend} />

            {money$ && cash && <Money cash={cash} />}

            <section className="panel">
              <div className="panel-head"><h2>Go straight to</h2></div>
              <nav className="actions">
                <Action to="/attendance" label="Mark attendance" icon={<IconCheck />} />
                <Action to="/scan" label="Scan ID cards" icon={<IconScan />} />
                <Action to="/attendance/monthly" label="Monthly sheet" icon={<IconSheet />} />
                {money$ && <Action to="/fees/collect" label="Collect fee" icon={<IconMoney />} />}
                {money$ && <Action to="/fees/dues" label="Dues" icon={<IconDues />} />}
                <Action to="/marks" label="Enter marks" icon={<IconMarks />} />
                <Action to="/results" label="Results" icon={<IconResults />} />
                {records && <Action to="/certificates" label="Certificates" icon={<IconCert />} />}
                {admin && <Action to="/payroll/pay" label="Pay salary" icon={<IconPayroll />} />}
                {admin && <Action to="/setup" label="Setup" icon={<IconSetup />} />}
              </nav>
            </section>
          </>
        )}

        {children && children.length === 0 && (
          <section className="panel">
            <div className="panel-head"><h2>My children</h2></div>
            <p className="panel-note">No student records are linked to this account yet.</p>
          </section>
        )}

        {children && children.length > 0 && (
          <div className="dash-grid">
            {children.map(({ student, month }) => (
              <section className="panel" key={student.studentId}>
                <div className="panel-head">
                  <h2>{student.fullName}</h2>
                  <Link className="panel-link" to={`/students/${student.studentId}/attendance`}>
                    Attendance report →
                  </Link>
                </div>
                <div className="ring-wrap">
                  <Ring percent={month.percent} />
                  <div className="ring-side">
                    <div className="legend"><i className="dot-p" />Present<b>{month.present}</b></div>
                    <div className="legend">
                      <i className="dot-a" />Absent<b>{Math.max(0, month.marked - month.present)}</b>
                    </div>
                    <p className="panel-note">
                      {student.className} - {student.section} · Roll {student.rollNo}
                      <br />
                      {month.marked === 0
                        ? 'No days marked this month yet.'
                        : `${month.marked} day${month.marked === 1 ? '' : 's'} marked this month.`}
                      <br />
                      <Link to={`/students/${student.studentId}/results`}>Results report →</Link>
                      <br />
                      <Link to={`/students/${student.studentId}/fees`}>Fees report →</Link>
                      <br />
                      <Link to={`/students/${student.studentId}`}>Student details →</Link>
                    </p>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}

        {problem && <div className="callout bad">{problem}</div>}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   today's attendance
   -------------------------------------------------------------------------- */

function AttendanceToday({ stats, loading }: { stats: SchoolStats | null; loading: boolean }) {
  if (loading) {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Attendance today</h2></div>
        <div className="ring-wrap">
          <div className="ring-box skeleton" />
          <div className="ring-side">
            <div className="skeleton" style={{ height: 16 }} />
            <div className="skeleton" style={{ height: 16 }} />
            <div className="skeleton" style={{ height: 16 }} />
          </div>
        </div>
      </section>
    );
  }
  if (!stats) return null;

  const marked = stats.markedToday ?? 0;
  const present = stats.presentToday ?? 0;
  const absent = Math.max(0, marked - present);
  const percent = percentOf(present, marked);
  // Unmarked is the rest of the roll — known only when the student count came
  // back, and never counted as absent.
  const unmarked = stats.students === null ? null : Math.max(0, stats.students - marked);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Attendance today</h2>
        <Link className="panel-link" to="/attendance">Register →</Link>
      </div>

      {!stats.takenToday && marked === 0 ? (
        <div className="callout">
          <span>
            Not taken yet today. <Link to="/scan">Scan cards</Link> or <Link to="/attendance">mark the register</Link>.
          </span>
        </div>
      ) : (
        <div className="ring-wrap">
          <Ring percent={percent} />
          <div className="ring-side">
            <div className="legend"><i className="dot-p" />Present<b>{present}</b></div>
            <div className="legend"><i className="dot-a" />Absent<b>{absent}</b></div>
            {unmarked !== null && (
              <div className="legend"><i className="dot-u" />Not marked<b>{unmarked}</b></div>
            )}
            {unmarked !== null && unmarked > 0 && (
              <p className="panel-note">
                {unmarked} student{unmarked === 1 ? '' : 's'} still to mark —{' '}
                <Link to="/attendance">finish the register</Link>.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** A donut. 0% draws nothing, and "no marks at all" draws no figure either. */
function Ring({ percent }: { percent: number | null }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const shown = percent ?? 0;
  const poor = percent !== null && percent < 75;

  return (
    <div className="ring-box">
      <svg className="ring" viewBox="0 0 128 128" role="img"
           aria-label={percent === null ? 'Nothing marked yet' : `${percent} percent present`}>
        <circle className="ring-track" cx="64" cy="64" r={R} />
        <circle className={`ring-value${poor ? ' poor' : ''}`} cx="64" cy="64" r={R}
                strokeDasharray={`${(C * shown) / 100} ${C}`} />
      </svg>
      <div className="ring-mid">
        <div style={{ textAlign: 'center' }}>
          <div className={`ring-pct${poor ? ' poor' : ' good'}`}>
            {percent === null ? '—' : `${percent}%`}
          </div>
          <div className="ring-cap">present</div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   the last seven days
   -------------------------------------------------------------------------- */

function Trend({ days, today, loading }: { days: TrendDay[] | null; today: string; loading: boolean }) {
  if (loading) {
    return (
      <section className="panel">
        <div className="panel-head"><h2>Last seven days</h2></div>
        <div className="skeleton" style={{ height: 132 }} />
      </section>
    );
  }
  if (!days) return null;

  const { average, taken, working, missed } = trendSummary(days);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Last seven days</h2>
        <Link className="panel-link" to="/attendance/low">Low attendance →</Link>
      </div>

      <div className="bars">
        {days.map((d) => {
          const label = d.date.slice(8);
          const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
            new Date(Date.UTC(+d.date.slice(0, 4), +d.date.slice(5, 7) - 1, +label)).getUTCDay()];
          const kind = d.kind === 'holiday' ? 'holiday'
            : d.kind === 'weekend' ? 'off'
              : d.marked === 0 ? 'none' : '';
          const taken = d.marked > 0 ? `${d.present} present of ${d.marked} marked` : 'nothing marked';
          const title = d.kind !== 'working'
            ? `${d.date} — ${d.kind}${d.marked > 0 ? `, ${taken}` : ''}`
            : `${d.date} — ${taken}`;
          return (
            <div className="bar-col" key={d.date} title={title}>
              {/* a weekend or holiday draws no bar, so a figure floating above
                  one would be a percentage of nothing visible */}
              {d.kind === 'working' && d.percent !== null && <span className="bar-pct">{d.percent}%</span>}
              <div className={`bar ${kind}${d.date === today && !kind ? ' today' : ''}`}
                   style={d.percent !== null ? { height: `${Math.max(4, d.percent)}%` } : undefined} />
              <span className="bar-cap"><b>{weekday}</b>{label}</span>
            </div>
          );
        })}
      </div>

      <p className="panel-note" style={{ marginTop: 12 }}>
        {average === null
          ? 'Nothing has been marked in the last seven days.'
          : <>
              <strong className={average >= 75 ? 'good' : 'poor'}>{average}% present</strong>
              {' '}across {taken} of {working} working day{working === 1 ? '' : 's'}
              {missed.length > 0 && <> · nothing marked on {missed.map((d) => d.slice(8)).join(', ')}</>}
            </>}
      </p>
    </section>
  );
}

/* --------------------------------------------------------------------------
   money
   -------------------------------------------------------------------------- */

function Money({ cash }: { cash: MoneySnapshot }) {
  const bar = (n: number, of: number) => `${of <= 0 ? 0 : Math.round((n / of) * 100)}%`;
  const scale = Math.max(cash.collectedMonth, cash.spentMonth ?? 0);

  return (
    <div className="dash-grid two">
      <section className="panel">
        <div className="panel-head">
          <h2>{longMonth(cash.month)}</h2>
          <Link className="panel-link" to="/reports/income-expense">Full report →</Link>
        </div>

        <div className="list">
          <div className="list-row">
            <div style={{ flex: 1 }}>
              <div className="list-main">Collected</div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--line-soft)', marginTop: 6 }}>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--accent)', width: bar(cash.collectedMonth, scale) }} />
              </div>
            </div>
            <div className="amount good">{money(cash.collectedMonth)}</div>
          </div>

          {cash.spentMonth !== null && (
            <div className="list-row">
              <div style={{ flex: 1 }}>
                <div className="list-main">Spent</div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--line-soft)', marginTop: 6 }}>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--warn)', width: bar(cash.spentMonth, scale) }} />
                </div>
              </div>
              <div className="amount" style={{ color: 'var(--warn)' }}>{money(cash.spentMonth)}</div>
            </div>
          )}

          {cash.net !== null && (
            <div className="list-row">
              <div className="list-main">
                Net
                <div className="list-sub">collected, not charged — dues are not income</div>
              </div>
              <div className={`amount ${cash.net >= 0 ? 'good' : 'poor'}`}>{money(cash.net)}</div>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Latest receipts</h2>
          <Link className="panel-link" to="/fees/receipts">All →</Link>
        </div>
        {cash.latest.length === 0 && <p className="panel-note">No fees collected this month yet.</p>}
        <div className="list">
          {cash.latest.map((p) => (
            <div className="list-row" key={p.receiptNo}>
              <div>
                <div className="list-main">
                  <Link to={`/fees/receipts/${p.receiptNo}`}>{p.studentName}</Link>
                </div>
                <div className="list-sub">{p.classLabel} · Roll {p.rollNo} · {p.paymentDate}</div>
              </div>
              <div className="amount">{money(p.totalAmount)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------------------
   small pieces
   -------------------------------------------------------------------------- */

function Stat({ label, value, display, icon, foot, to, tone, loading }: {
  label: string;
  value: number | null;
  display?: string | null;
  icon: ReactNode;
  foot?: string;
  to?: string;
  tone?: 'blue' | 'amber';
  loading?: boolean;
}) {
  if (!loading && value === null) return null;   // denied or absent: no tile at all

  const body = (
    <>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className={`stat-ico${tone ? ` ${tone}` : ''}`} aria-hidden="true">{icon}</span>
      </div>
      <div className={`stat-value${loading ? ' skeleton' : ''}`}>
        {loading ? '000' : display ?? value}
      </div>
      {foot && <div className="stat-foot">{foot}</div>}
    </>
  );

  return to && !loading
    ? <Link className="stat" to={to}>{body}</Link>
    : <div className="stat">{body}</div>;
}

function Action({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <Link className="action" to={to}>
      <i aria-hidden="true">{icon}</i>{label}
    </Link>
  );
}

/** "Matkhola ML High School" → "MM". Two letters fit the square; three crowd it. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
  if (words.length === 0) return 'S';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/* --------------------------------------------------------------------------
   icons — drawn here rather than pulled from a package, so the app ships one
   bundle and works with no network at all
   -------------------------------------------------------------------------- */

const svg = {
  width: 17, height: 17, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const, 'aria-hidden': true,
};

const IconStudents = () => (
  <svg {...svg}><path d="M12 3 2 8l10 5 10-5-10-5Z" /><path d="M6 10.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-6.5" /></svg>
);
const IconStaff = () => (
  <svg {...svg}><circle cx="12" cy="8" r="3.4" /><path d="M4.5 20c0-3.6 3.4-5.6 7.5-5.6s7.5 2 7.5 5.6" /></svg>
);
const IconClasses = () => (
  <svg {...svg}><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 20h8M7 9h7M7 13h4" /></svg>
);
const IconMoney = () => (
  <svg {...svg}><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 12h.01M18 12h.01" /></svg>
);
const IconCheck = () => (
  <svg {...svg}><path d="M20 6 9 17l-5-5" /></svg>
);
const IconScan = () => (
  <svg {...svg}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M4 12h16" /></svg>
);
const IconSheet = () => (
  <svg {...svg}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>
);
const IconDues = () => (
  <svg {...svg}><path d="M12 3v18M12 3 7 8M12 3l5 5" /><path d="M5 21h14" /></svg>
);
const IconMarks = () => (
  <svg {...svg}><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" /></svg>
);
const IconResults = () => (
  <svg {...svg}><path d="M5 20V10M12 20V4M19 20v-6" /></svg>
);
const IconCert = () => (
  <svg {...svg}><circle cx="12" cy="10" r="5.2" /><path d="M9 14.6 8 21l4-2 4 2-1-6.4" /></svg>
);
const IconPayroll = () => (
  <svg {...svg}><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M8 9h8M8 13h5M8 17h3" /></svg>
);
const IconSetup = () => (
  <svg {...svg}><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" /></svg>
);
