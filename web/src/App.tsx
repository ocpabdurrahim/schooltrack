import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Attendance from './pages/Attendance';
import Certificate from './pages/Certificate';
import Certificates from './pages/Certificates';
import Classes from './pages/Classes';
import Collect from './pages/Collect';
import Dues from './pages/Dues';
import Exams from './pages/Exams';
import Expenses from './pages/Expenses';
import FeeSetup from './pages/FeeSetup';
import Home from './pages/Home';
import IdCards from './pages/IdCards';
import IncomeExpense from './pages/IncomeExpense';
import Login from './pages/Login';
import MarkEntry from './pages/MarkEntry';
import PaySalary from './pages/PaySalary';
import Payslip from './pages/Payslip';
import Receipt from './pages/Receipt';
import Receipts from './pages/Receipts';
import ReportCard from './pages/ReportCard';
import Results from './pages/Results';
import SalaryRegister from './pages/SalaryRegister';
import SalaryStructure from './pages/SalaryStructure';
import Scan from './pages/Scan';
import Setup from './pages/Setup';
import Staff from './pages/Staff';
import Student from './pages/Student';
import StudentEdit from './pages/StudentEdit';
import Students from './pages/Students';
import Users from './pages/Users';

function Nav() {
  const { pathname } = useLocation();
  const { access } = useAuth();
  if (access.kind === 'signedOut' || access.kind === 'none') return null;

  const staff = access.kind === 'staff';
  const admin = staff && access.role === 'ADMIN';
  // who may touch money: the rules let ADMIN and ACCOUNTS read payments
  const money = staff && (access.role === 'ADMIN' || access.role === 'ACCOUNTS');
  // certificates and ID cards are the office's work, with the head
  const records = staff && (access.role === 'ADMIN' || access.role === 'OFFICE');
  const here = (p: string) => (pathname === p ? { fontWeight: 700 } : undefined);

  return (
    <nav className="nav">
      <Link to="/" style={here('/')}>Home</Link>
      {staff && <Link to="/students" style={here('/students')}>Students</Link>}
      {staff && <Link to="/attendance" style={here('/attendance')}>Attendance</Link>}
      {staff && <Link to="/scan" style={here('/scan')}>Scan</Link>}
      {money && <Link to="/fees/collect" style={here('/fees/collect')}>Collect fee</Link>}
      {money && <Link to="/fees/receipts" style={here('/fees/receipts')}>Receipts</Link>}
      {money && <Link to="/fees/dues" style={here('/fees/dues')}>Dues</Link>}
      {staff && <Link to="/marks" style={here('/marks')}>Marks</Link>}
      {staff && <Link to="/results" style={here('/results')}>Results</Link>}
      {admin && <Link to="/exams" style={here('/exams')}>Exams</Link>}
      {records && <Link to="/certificates" style={here('/certificates')}>Certificates</Link>}
      {records && <Link to="/id-cards" style={here('/id-cards')}>ID cards</Link>}
      {admin && <Link to="/fees/setup" style={here('/fees/setup')}>Fee setup</Link>}
      {admin && <Link to="/classes" style={here('/classes')}>Classes</Link>}
      {admin && <Link to="/staff" style={here('/staff')}>Staff</Link>}
      {admin && <Link to="/users" style={here('/users')}>Users</Link>}
      {money && <Link to="/expenses" style={here('/expenses')}>Expenses</Link>}
      {money && <Link to="/reports/income-expense" style={here('/reports/income-expense')}>Report</Link>}
      {admin && <Link to="/payroll" style={here('/payroll')}>Payroll</Link>}
      {admin && <Link to="/setup" style={here('/setup')}>Setup</Link>}
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

  const adminOnly = (el: JSX.Element) =>
    access.kind === 'staff' && access.role === 'ADMIN' ? el : <Navigate to="/" replace />;

  // Student records are the office's work as much as the head's, which is what
  // the rules say too: students are writable by ADMIN and OFFICE.
  const recordsOnly = (el: JSX.Element) =>
    access.kind === 'staff' && (access.role === 'ADMIN' || access.role === 'OFFICE')
      ? el
      : <Navigate to="/" replace />;

  // Fees belong to the head and the accounts user, matching the rules: a
  // teacher cannot read a payment at all, so showing them the screen would
  // only produce a refusal.
  const moneyOnly = (el: JSX.Element) =>
    access.kind === 'staff' && (access.role === 'ADMIN' || access.role === 'ACCOUNTS')
      ? el
      : <Navigate to="/" replace />;

  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/students" element={staffOnly(<Students />)} />
        <Route path="/students/new" element={recordsOnly(<StudentEdit />)} />
        <Route path="/students/:studentId/edit" element={recordsOnly(<StudentEdit />)} />
        {/* guardians reach this for their own children; the page and the
            rules both check that it is theirs */}
        <Route path="/students/:studentId" element={<Student />} />
        <Route path="/attendance" element={staffOnly(<Attendance />)} />
        <Route path="/scan" element={staffOnly(<Scan />)} />
        <Route path="/fees/collect" element={moneyOnly(<Collect />)} />
        <Route path="/fees/receipts" element={moneyOnly(<Receipts />)} />
        <Route path="/fees/receipts/:receiptNo" element={moneyOnly(<Receipt />)} />
        <Route path="/fees/dues" element={moneyOnly(<Dues />)} />
        <Route path="/fees/setup" element={adminOnly(<FeeSetup />)} />
        <Route path="/exams" element={adminOnly(<Exams />)} />
        <Route path="/certificates" element={recordsOnly(<Certificates />)} />
        <Route path="/certificates/:serialNo" element={recordsOnly(<Certificate />)} />
        <Route path="/id-cards" element={recordsOnly(<IdCards />)} />
        <Route path="/expenses" element={moneyOnly(<Expenses />)} />
        <Route path="/reports/income-expense" element={moneyOnly(<IncomeExpense />)} />
        <Route path="/payroll" element={adminOnly(<SalaryStructure />)} />
        <Route path="/payroll/pay" element={adminOnly(<PaySalary />)} />
        <Route path="/payroll/register" element={adminOnly(<SalaryRegister />)} />
        <Route path="/payroll/payslip/:paymentId" element={adminOnly(<Payslip />)} />
        <Route path="/marks" element={staffOnly(<MarkEntry />)} />
        <Route path="/results" element={staffOnly(<Results />)} />
        {/* a guardian may open their own child's published report */}
        <Route path="/report/:examId/:studentId" element={<ReportCard />} />
        <Route path="/classes" element={adminOnly(<Classes />)} />
        <Route path="/staff" element={adminOnly(<Staff />)} />
        <Route path="/users" element={adminOnly(<Users />)} />
        <Route path="/setup" element={adminOnly(<Setup />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}




