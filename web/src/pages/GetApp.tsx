import { Link } from 'react-router-dom';

/** Where every release lives. The newest is always the one at the top. */
const RELEASES = 'https://github.com/ocpabdurrahim/schooltrack/releases/latest';

/**
 * How to put SchoolTrack on an Android phone.
 *
 * Deliberately reachable WITHOUT signing in: the person who most needs this
 * page is the one who has just been told "install the app" and has no account
 * yet. It is linked from the sign-in page for that reason.
 *
 * The app is not on Google Play, so this page has to do the job the Play
 * listing would: say what it is, where the file comes from, and what Android
 * will say about it. Every warning below is one a real phone shows — leaving
 * them out would leave a parent stuck at the first dialog, assuming the file
 * is broken when it is only unfamiliar.
 */
export default function GetApp() {
  const step = { marginBottom: 14 } as const;

  return (
    <div className="wrap">
      <div className="card">
        <h1>The Android app</h1>
        <h2>SchoolTrack on a phone — the same school, the same records</h2>

        <p>
          The phone app does everything the website does: attendance, marks,
          results, fees and salaries, against the same records. Either can be
          used, and the school is free to use both at once.
        </p>

        <a className="t-Button" href={RELEASES} target="_blank" rel="noreferrer">
          <button style={{ width: '100%' }}>Download the app (Android)</button>
        </a>

        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 10, marginBottom: 0 }}>
          That link opens the latest release. Tap the file ending in
          {' '}<strong>.apk</strong> to download it.
        </p>
      </div>

      <div className="card">
        <h2>Installing it</h2>

        <div style={step}>
          <strong>1. Download the .apk</strong>
          <div style={{ color: 'var(--muted)' }}>
            From the button above. The file is about 35 MB.
          </div>
        </div>

        <div style={step}>
          <strong>2. Allow the install</strong>
          <div style={{ color: 'var(--muted)' }}>
            Android will ask whether to allow installing apps from this source —
            that is the browser asking, and it only has to be answered once.
          </div>
        </div>

        <div style={step}>
          <strong>3. Google may offer to scan it</strong>
          <div style={{ color: 'var(--muted)' }}>
            Play Protect sometimes says it has not seen this app before. That is
            Google not recognising a small school's app, not a fault. Let it
            scan; it comes back clean, and the install carries on.
          </div>
        </div>

        <div style={{ ...step, marginBottom: 0 }}>
          <strong>4. Sign in with the same account</strong>
          <div style={{ color: 'var(--muted)' }}>
            The account used on this website works on the phone. What a person
            can see and change is the same on both.
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Afterwards</h2>
        <p style={{ marginTop: 0 }}>
          <strong>It updates itself.</strong> The app checks for a new version
          on its own and installs it in the background — this page is only
          needed for the first install, or for a phone that has been wiped.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 0 }}>
          It needs Android 7 or newer. One phone, one account: signing in on a
          second phone is fine, but whoever signs in sees whatever their account
          is allowed to see, so staff accounts should not be shared.
        </p>
      </div>

      <div className="card">
        <Link to="/login">← Back to sign in</Link>
      </div>
    </div>
  );
}
