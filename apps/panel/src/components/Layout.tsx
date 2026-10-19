import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { BRAND } from "@exam-ide/shared";
import { useAuth } from "../lib/auth";
import { uz } from "../uz";

export function Layout({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const loc = useLocation();
  const active = (to: string) => (to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to));

  return (
    <div className="app">
      <header className="topnav">
        <Link to="/" className="brand">
          <span className="brand-mark">&lt;/&gt;</span> {BRAND.panelName}
        </Link>
        <nav className="nav-links">
          <Link to="/" className={active("/") ? "nav-link nav-active" : "nav-link"}>
            {uz.nav.exams}
          </Link>
          {me?.role === "ADMIN" && (
            <Link to="/teachers" className={active("/teachers") ? "nav-link nav-active" : "nav-link"}>
              {uz.nav.teachers}
            </Link>
          )}
        </nav>
        <div className="nav-right">
          <span className="muted">{me?.name}</span>
          <button className="btn btn-ghost" onClick={logout}>
            {uz.nav.logout}
          </button>
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
