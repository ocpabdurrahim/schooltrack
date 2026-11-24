import { describe, expect, it } from 'vitest';
import { activeAdmins, lockoutRisk } from './lockout';

/** The SAME cases exist in android/.../data/LockoutTest.kt. */

const admin = (active = true) => ({ role: 'ADMIN', active });
const teacher = () => ({ role: 'TEACHER', active: true });

describe('whether a school can still be got into', () => {
  it('is fine with two administrators', () => {
    const got = lockoutRisk([admin(), admin(), teacher()]);
    expect(got.atRisk).toBe(false);
    expect(got.admins).toBe(2);
    expect(got.warning).toBe('');
  });

  it('WARNS on one, which is how the live school ran for a fortnight', () => {
    const got = lockoutRisk([admin()]);
    expect(got.atRisk).toBe(true);
    expect(got.admins).toBe(1);
    expect(got.warning).toContain('Only one administrator');
    expect(got.warning).toContain('head teacher');
  });

  it('counts only ADMINS — a teacher cannot grant access', () => {
    // Ten teachers and one administrator is exactly as stuck.
    const got = lockoutRisk([admin(), teacher(), teacher(), teacher()]);
    expect(got.atRisk).toBe(true);
    expect(got.admins).toBe(1);
  });

  it('does not count an administrator who has been switched off', () => {
    expect(lockoutRisk([admin(), admin(false)]).atRisk).toBe(true);
    expect(activeAdmins([admin(), admin(false)])).toBe(1);
  });

  it('says something different, and sharper, when there is none at all', () => {
    const got = lockoutRisk([teacher()]);
    expect(got.atRisk).toBe(true);
    expect(got.admins).toBe(0);
    expect(got.warning).toContain('No active administrator');
  });

  it('treats an empty list as no administrator', () => {
    expect(lockoutRisk([]).admins).toBe(0);
    expect(lockoutRisk([]).atRisk).toBe(true);
  });

  it('treats a member with no active flag as active', () => {
    // Older records predate the flag; absent must not read as "switched off",
    // or a healthy school would be told it is locked out.
    expect(activeAdmins([{ role: 'ADMIN' }, { role: 'ADMIN' }])).toBe(2);
  });
});
