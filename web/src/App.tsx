import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Attendance from './pages/Attendance';
import Home from './pages/Home';
import Login from './pages/Login';
import Scan from './pages/Scan';
import Student from './pages/Student';
import Students from './pages/Students';

function Nav() {
  const { pathname } = useLocation();
  const { access } = useAuth();
  if (access.kind === 'signedOut' || access.kind === 'none') return null;
  const here = (p: string) => (pathname === p ? { fontWeight: 700 } : undefined);
  return (
    <nav className="nav">
      <Link to="/" style={here('/')}>Home</Link>
      {access.kind === 'staff' && <Link to="/students" style={here('/students')}>Students</Link>}
      {access.kind === 'staff' && <Link to="/attendance" style={here('/attendance')}>Attendance</Link>}
      {access.kind === 'staff' && <Link to="/scan" style={here('/scan')}>Scan</Link>}
    </nav>
  );
}

export default function App() {
  const { access } = useAuth();

  if (access.kind === 'loading') {
    return <div className="wrap"><div className="card">Checking your access…</div></div>;
  }
  if (access.kind === 'signedOut') {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const staffOnly = (el: JSX.Element) =>
    access.kind === 'staff' ? el : <Navigate to="/" replace />;

  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/students" element={staffOnly(<Students />)} />
        {/* guardians reach this for their own children; the page and the
            rules both check that it is theirs */}
        <Route path="/students/:studentId" element={<Student />} />
        <Route path="/attendance" element={staffOnly(<Attendance />)} />
        <Route path="/scan" element={staffOnly(<Scan />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
