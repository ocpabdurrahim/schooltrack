import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { activeItem, menuFor } from '../nav';

/**
 * The bar across the top.
 *
 * It used to be every link the person could reach, in one row, which ran off
 * the side of a laptop and was unusable on a phone. Now it is six menus at
 * most (nav.ts decides which), each opening a panel — a dropdown on a desktop,
 * an accordion inside the collapsed menu on a small screen. The same markup
 * serves both; only the CSS differs, so there is one set of behaviour to get
 * right, not two.
 *
 * Opened by click, not hover: half the people using this are on a tablet at a
 * desk, where there is no hover, and a menu that opens as the pointer crosses
 * it is a menu that opens by accident.
 */
export default function Nav() {
  const { pathname } = useLocation();
  const { access, logout } = useAuth();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);   // the small-screen panel, open?
  const bar = useRef<HTMLElement | null>(null);

  const groups = menuFor(access);
  const active = activeItem(groups, pathname);

  // Going somewhere closes whatever was open. Without this the panel is still
  // hanging over the page you just navigated to.
  useEffect(() => {
    setOpenGroup(null);
    setCollapsed(false);
  }, [pathname]);

  // Escape, and a click anywhere else. A dropdown with neither follows you
  // around the screen until you click the exact button again.
  useEffect(() => {
    if (openGroup === null && !collapsed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpenGroup(null); setCollapsed(false); }
    };
    const onDown = (e: MouseEvent) => {
      if (bar.current && !bar.current.contains(e.target as Node)) {
        setOpenGroup(null);
        setCollapsed(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [openGroup, collapsed]);

  if (access.kind === 'loading' || access.kind === 'signedOut') return null;

  return (
    <nav className="nav" aria-label="Main" ref={bar}>
      <Link className="nav-brand" to="/" aria-label="SchoolTrack home">
        <i aria-hidden="true" />SchoolTrack
      </Link>

      {/* Outside the collapsible part on purpose: a guardian has no menus, so
          no Menu button either, and Home inside it would be unreachable. */}
      <Link className={`nav-top nav-home${pathname === '/' ? ' here' : ''}`} to="/">Home</Link>

      {groups.length > 0 && (
        <button
          type="button"
          className={`nav-burger${collapsed ? ' open' : ''}`}
          aria-expanded={collapsed}
          aria-controls="nav-menu"
          aria-label={collapsed ? 'Close the menu' : 'Open the menu'}
          onClick={() => { setCollapsed(!collapsed); setOpenGroup(null); }}
        >
          <span aria-hidden="true"><b /><b /><b /></span>Menu
        </button>
      )}

      <div className={`nav-menu${collapsed ? ' open' : ''}`} id="nav-menu">
        {groups.map((group) => {
          const isOpen = openGroup === group.label;
          const isHere = active?.group.label === group.label;
          return (
            <div className="nav-group" key={group.label}>
              <button
                type="button"
                className={`nav-top${isHere ? ' here' : ''}${isOpen ? ' showing' : ''}`}
                aria-expanded={isOpen}
                aria-haspopup="true"
                onClick={() => setOpenGroup(isOpen ? null : group.label)}
              >
                {group.label}
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                     strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {isOpen && (
                <div className="nav-panel">
                  {group.items.map((item) => {
                    const here = active?.item.to === item.to;
                    return (
                      <Link
                        key={item.to}
                        className={`nav-item${here ? ' here' : ''}`}
                        to={item.to}
                        aria-current={here ? 'page' : undefined}
                      >
                        <span>{item.label}</span>
                        {item.hint && <small>{item.hint}</small>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="nav-user">
        {access.kind === 'staff' && <span className="nav-role">{access.role}</span>}
        {access.kind === 'guardian' && <span className="nav-role">Guardian</span>}
        <button type="button" className="nav-signout" onClick={() => void logout()}>Sign out</button>
      </div>
    </nav>
  );
}
