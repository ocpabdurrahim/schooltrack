import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SCHOOL_ID, auth, db } from './firebase';

export type Role = 'ADMIN' | 'TEACHER' | 'ACCOUNTS' | 'OFFICE';

export type Access =
  | { kind: 'loading' }
  | { kind: 'signedOut' }
  | { kind: 'staff'; role: Role; name: string; email: string }
  | { kind: 'guardian'; name: string; email: string; studentIds: string[] }
  | { kind: 'none'; email: string };   // signed in, but nobody has granted access

type Ctx = { user: User | null; access: Access; logout: () => Promise<void> };

const AuthCtx = createContext<Ctx>({
  user: null,
  access: { kind: 'loading' },
  logout: async () => {},
});

export const useAuth = () => useContext(AuthCtx);

/**
 * Resolves who the signed-in person is, in the same order the rules do:
 * a staff member first, then a guardian, then nobody.
 *
 * Access is never inferred from the account itself — it comes from
 * members/{email} or guardians/{email}, which only an administrator can write
 * (data-model.md §2). Signing in successfully grants nothing on its own.
 */
async function resolveAccess(user: User): Promise<Access> {
  const email = (user.email ?? '').toLowerCase();
  if (!email) return { kind: 'none', email: '' };

  const member = await getDoc(doc(db, 'schools', SCHOOL_ID, 'members', email));
  if (member.exists()) {
    const m = member.data();
    if (m.active === true && m.deleted !== true) {
      return { kind: 'staff', role: m.role as Role, name: m.name ?? email, email };
    }
  }

  const guardian = await getDoc(doc(db, 'schools', SCHOOL_ID, 'guardians', email));
  if (guardian.exists()) {
    const g = guardian.data();
    if (g.active === true) {
      return {
        kind: 'guardian',
        name: g.name ?? email,
        email,
        studentIds: (g.studentIds ?? []) as string[],
      };
    }
  }

  return { kind: 'none', email };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<Access>({ kind: 'loading' });

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setAccess({ kind: 'signedOut' });
        return;
      }
      setAccess({ kind: 'loading' });
      try {
        setAccess(await resolveAccess(u));
      } catch {
        // A rules denial here means no access record exists for this account.
        setAccess({ kind: 'none', email: (u.email ?? '').toLowerCase() });
      }
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({ user, access, logout: () => signOut(auth) }),
    [user, access],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
