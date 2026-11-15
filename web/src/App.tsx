import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Home from './pages/Home';
import Login from './pages/Login';

export default function App() {
  const { access } = useAuth();

  if (access.kind === 'loading') {
    return <div className="wrap"><div className="card">Checking your access…</div></div>;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={access.kind === 'signedOut' ? <Login /> : <Navigate to="/" replace />}
      />
      <Route
        path="/"
        element={access.kind === 'signedOut' ? <Navigate to="/login" replace /> : <Home />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
