import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { BRAND } from "@exam-ide/shared";
import { useAuth } from "../lib/auth";
import { uz } from "../uz";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export function Layout({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const loc = useLocation();
  const isExams = loc.pathname === "/" || loc.pathname.startsWith("/exams") || loc.pathname.startsWith("/attempts");

  return (
    <div className="app">
      <aside className="sidenav">
        <Link to="/" className="brand">
          <span className="brand-mark">&lt;/&gt;</span>
          {BRAND.panelName}
        </Link>
        <nav className="nav-links">
          <Link to="/" className={isExams ? "nav-link nav-active" : "nav-link"}>
            <span className="nav-icon">▤</span>
            {uz.nav.exams}
          </Link>
          {me?.role === "ADMIN" && (
            <Link to="/teachers" className={loc.pathname.startsWith("/teachers") ? "nav-link nav-active" : "nav-link"}>
              <span className="nav-icon">◎</span>
              {uz.nav.teachers}
            </Link>
          )}
          <Link to="/settings" className={loc.pathname.startsWith("/settings") ? "nav-link nav-active" : "nav-link"}>
            <span className="nav-icon">⚙</span>
            {uz.nav.settings}
          </Link>
        </nav>
        <div className="nav-user">
          <span className="avatar" title={me?.name}>
            {initials(me?.name ?? "")}
          </span>
          <div className="nav-user-info">
            <div className="nav-user-name">{me?.name}</div>
            <div className="nav-user-role">{me?.role === "ADMIN" ? uz.teachers.admin : uz.teachers.teacher}</div>
          </div>
          <button className="nav-logout" onClick={logout} title={uz.nav.logout}>
            {uz.nav.logout}
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
