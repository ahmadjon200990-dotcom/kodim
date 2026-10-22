import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { ExamsList } from "./pages/ExamsList";
import { ExamEdit } from "./pages/ExamEdit";
import { Live } from "./pages/Live";
import { Results } from "./pages/Results";
import { Submissions } from "./pages/Submissions";
import { AttemptDetailPage } from "./pages/AttemptDetail";
import { Teachers } from "./pages/Teachers";
import { SettingsPage } from "./pages/Settings";
import { AuthCallback } from "./pages/AuthCallback";
import { uz } from "./uz";

export function App() {
  const { me, ready } = useAuth();

  // Google OAuth qaytishi — kirishdan oldin ham ishlashi kerak.
  if (window.location.pathname === "/auth/callback") return <AuthCallback />;
  if (!ready) return <div className="center muted">{uz.common.loading}</div>;
  if (!me) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ExamsList />} />
        <Route path="/exams/new" element={<ExamEdit />} />
        <Route path="/exams/:id/edit" element={<ExamEdit />} />
        <Route path="/exams/:id/live" element={<Live />} />
        <Route path="/exams/:id/results" element={<Results />} />
        <Route path="/exams/:id/submissions" element={<Submissions />} />
        <Route path="/attempts/:id" element={<AttemptDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        {me.role === "ADMIN" && <Route path="/teachers" element={<Teachers />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
