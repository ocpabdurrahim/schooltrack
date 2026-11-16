import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { auth } from '../firebase';

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNote('');

    const address = email.trim().toLowerCase();
    try {
      if (mode === 'in') {
        const cred = await signInWithEmailAndPassword(auth, address, password);
        if (!cred.user.emailVerified) {
          // The rules require a verified address, so a signed-in but unverified
          // account would land on "no access" with no way to tell why.
          await signOut(auth);
          setNote('Confirm your email address first — check your inbox for the link, ' +
                  'then sign in again.');
          setBusy(false);
        }
      } else {
        const cred = await createUserWithEmailAndPassword(auth, address, password);
        await sendEmailVerification(cred.user);
        await signOut(auth);
        setMode('in');
        setNote('Account created. Confirm your email address using the link we just sent, ' +
                'then sign in. An administrator still has to grant you access before you ' +
                'can see anything.');
        setBusy(false);
      }
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      if (mode === 'up' && code === 'auth/email-already-in-use') {
        setError('There is already an account with that email. Sign in instead.');
      } else if (mode === 'up' && code === 'auth/weak-password') {
        setError('Pick a longer password — at least six characters.');
      } else if (mode === 'up' && code === 'auth/operation-not-allowed') {
        setError('Sign-up is switched off for this project.');
      } else {
        // Deliberately one message for every sign-in failure: saying "no such
        // account" tells a stranger which addresses exist.
        setError(mode === 'in'
          ? 'That email and password did not match.'
          : 'That account could not be created.');
      }
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card" style={{ maxWidth: 380, margin: '60px auto' }}>
        <h1>SchoolTrack</h1>
        <h2>{mode === 'in' ? 'Sign in to continue' : 'Create your account'}</h2>

        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required
                 value={email} onChange={(e) => setEmail(e.target.value)} />

          <label htmlFor="password">Password</label>
          <input id="password" type="password" required
                 autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                 value={password} onChange={(e) => setPassword(e.target.value)} />

          <button type="submit" disabled={busy}>
            {busy
              ? (mode === 'in' ? 'Signing in…' : 'Creating…')
              : (mode === 'in' ? 'Sign in' : 'Create account')}
          </button>

          {error && <div className="err">{error}</div>}
          {note && (
            <div style={{ color: 'var(--accent)', fontSize: 14, marginTop: 10 }}>{note}</div>
          )}
        </form>

        <p style={{ fontSize: 14, marginTop: 18 }}>
          {mode === 'in' ? 'First time here? ' : 'Already have an account? '}
          <button className="link"
                  onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); setNote(''); }}>
            {mode === 'in' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
