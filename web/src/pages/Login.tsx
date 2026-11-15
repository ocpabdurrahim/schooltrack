import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { auth } from '../firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    } catch {
      // Deliberately one message for every failure: saying "no such account"
      // tells a stranger which addresses exist.
      setError('That email and password did not match.');
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="card" style={{ maxWidth: 380, margin: '60px auto' }}>
        <h1>SchoolTrack</h1>
        <h2>Matkhola ML High School</h2>
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="username" required
                 value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required
                 value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          {error && <div className="err">{error}</div>}
        </form>
      </div>
    </div>
  );
}
