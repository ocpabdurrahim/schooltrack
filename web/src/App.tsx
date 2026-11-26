import { Navigate, Route, Routes } from 'react-router-dom';
import Nav from './components/Nav';
import UpdateBar from './components/UpdateBar';
import { useAuth } from './auth';
import AdmitCards from './pages/AdmitCards';
import Attendance from './pages/Attendance';
import AttendanceMonthly from './pages/AttendanceMonthly';
import Certificate from './pages/Certificate';
import Certificates from './pages/Certificates';
import Classes from './pages/Classes';
import Collect from './pages/Collect';
import Dues from './pages/Dues';
import Exams from './pages/Exams';
import Expenses from './pages/Expenses';
import FeeSetup from './pages/FeeSetup';
import Holidays from './pages/Holidays';
import Home from './pages/Home';
import IdCards from './pages/IdCards';
import IncomeExpense from './pages/IncomeExpense';
import Login from './pages/Login';
import LowAttendance from './pages/LowAttendance';
import MarkEntry from './pages/MarkEntry';
import MarkSheets from './pages/MarkSheets';
import Promote from './pages/Promote';
import ScanMarks from './pages/ScanMarks';
import QuickMarks from './pages/QuickMarks';
import PaySalary from './pages/PaySalary';
import Payslip from './pages/Payslip';
import Receipt from './pages/Receipt';
import Receipts from './pages/Receipts';
import ReportCard from './pages/ReportCard';
import ResetSchool from './pages/ResetSchool';
import Results from './pages/Results';
import Routine from './pages/Routine';
import SalaryRegister from './pages/SalaryRegister';
import SalaryStructure from './pages/SalaryStructure';
import Scan from './pages/Scan';
import SeatPlan from './pages/SeatPlan';
import Setup from './pages/Setup';
import Staff from './pages/Staff';
import Student from './pages/Student';
import StudentEdit from './pages/StudentEdit';
import StudentAttendance from './pages/StudentAttendance';
import StudentFees from './pages/StudentFees';
import StudentResults from './pages/StudentResults';
import Students from './pages/Students';
import StudentsBatch from './pages/StudentsBatch';
import Users from './pages/Users';

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
      {/* Above everything, because a page running last week's code is the one
          thing the screen cannot otherwise tell you. */}
      <UpdateBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/students" element={staffOnly(<Students />)} />
        <Route path="/students/new" element={recordsOnly(<StudentEdit />)} />
        <Route path="/students/batch" element={recordsOnly(<StudentsBatch />)} />
        {/* "Update from a list" was removed. Without this the old address
            falls through to /students/:studentId and says "No student with
            id update", which reads as a fault rather than as a page that
            is gone. */}
        <Route path="/students/update" element={<Navigate to="/students" replace />} />
        <Route path="/students/:studentId/edit" element={recordsOnly(<StudentEdit />)} />
        {/* guardians reach these for their own children; the page and the
            rules both check that it is theirs */}
        <Route path="/students/:studentId" element={<Student />} />
        <Route path="/students/:studentId/attendance" element={<StudentAttendance />} />
        <Route path="/students/:studentId/results" element={<StudentResults />} />
        <Route path="/students/:studentId/fees" element={<StudentFees />} />
        <Route path="/attendance" element={staffOnly(<Attendance />)} />
        <Route path="/attendance/monthly" element={staffOnly(<AttendanceMonthly />)} />
        <Route path="/attendance/low" element={staffOnly(<LowAttendance />)} />
        {/* the holiday calendar and the weekend decide every percentage, so
            only the head may change them */}
        <Route path="/attendance/holidays" element={adminOnly(<Holidays />)} />
        <Route path="/scan" element={staffOnly(<Scan />)} />
        <Route path="/fees/collect" element={moneyOnly(<Collect />)} />
        <Route path="/fees/receipts" element={moneyOnly(<Receipts />)} />
        <Route path="/fees/receipts/:receiptNo" element={moneyOnly(<Receipt />)} />
        <Route path="/fees/dues" element={moneyOnly(<Dues />)} />
        <Route path="/fees/setup" element={adminOnly(<FeeSetup />)} />
        <Route path="/exams" element={adminOnly(<Exams />)} />
        <Route path="/exams/routine" element={adminOnly(<Routine />)} />
        <Route path="/exams/admit-cards" element={recordsOnly(<AdmitCards />)} />
        {/* the plan is read by whoever is invigilating, not only the office */}
        <Route path="/exams/seat-plan" element={staffOnly(<SeatPlan />)} />
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
        <Route path="/marks/quick" element={staffOnly(<QuickMarks />)} />
        <Route path="/marks/scan" element={staffOnly(<ScanMarks />)} />
        <Route path="/promote" element={adminOnly(<Promote />)} />
        <Route path="/results" element={staffOnly(<Results />)} />
        <Route path="/marks/sheets" element={staffOnly(<MarkSheets />)} />
        {/* a guardian may open their own child's published report */}
        <Route path="/report/:examId/:studentId" element={<ReportCard />} />
        <Route path="/classes" element={adminOnly(<Classes />)} />
        <Route path="/staff" element={adminOnly(<Staff />)} />
        <Route path="/users" element={adminOnly(<Users />)} />
        <Route path="/setup" element={adminOnly(<Setup />)} />
        <Route path="/setup/reset" element={adminOnly(<ResetSchool />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}




