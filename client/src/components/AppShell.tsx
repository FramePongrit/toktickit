import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { landingPath, roleLabel, useAuth } from "../context/AuthContext.js";

function navClass({ isActive }: { isActive: boolean }): string {
  return `nav-link${isActive ? " active" : ""}`;
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const navigatedFromMenu = Boolean(document.activeElement?.closest("#zen-nav"));
    setMenuOpen(false);
    if (navigatedFromMenu) {
      document.querySelector<HTMLElement>("[data-page-heading]")?.focus();
    }
  }, [location.pathname]);

  if (!user) return null;

  const mandatoryChange = user.mustChangePassword;
  const canRequester = user.role === "REQUESTER";
  const canStaff = user.role === "STAFF" || user.role === "ADMIN";
  const canAdmin = user.role === "ADMIN";

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <header className="zen-header">
        <nav className="navbar container zen-page" aria-label="Main">
          <button type="button" className="navbar-brand fw-semibold btn btn-link text-decoration-none p-0" onClick={() => navigate(landingPath(user))}>
            TokTickIT
          </button>

          <button
            className="navbar-toggler border-light d-md-none"
            type="button"
            aria-controls="zen-nav"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="navbar-toggler-icon" />
          </button>

          <div className={`navbar-collapse d-md-flex${menuOpen ? " show" : ""}`} id="zen-nav">
            <ul className="navbar-nav me-auto">
              {!mandatoryChange && canRequester && (
                <>
                  <li className="nav-item">
                    <NavLink className={navClass} to="/tickets" end>My Tickets</NavLink>
                  </li>
                  <li className="nav-item">
                    <NavLink className={navClass} to="/tickets/new">Create Ticket</NavLink>
                  </li>
                </>
              )}
              {!mandatoryChange && canStaff && (
                <li className="nav-item">
                  <NavLink className={navClass} to="/staff/tickets">Staff Queue</NavLink>
                </li>
              )}
              {!mandatoryChange && canAdmin && (
                <li className="nav-item">
                  <NavLink className={navClass} to="/admin/users">User Management</NavLink>
                </li>
              )}
              <li className="nav-item">
                <NavLink className={navClass} to="/change-password">Change Password</NavLink>
              </li>
            </ul>

            <div className="d-flex flex-column flex-md-row align-items-md-center gap-2 gap-md-3 py-2 py-md-0">
              <span className="text-white" data-testid="current-user">{user.fullName}</span>
              <span className="zen-badge zen-badge-medium bg-white" data-testid="current-role">{roleLabel(user.role)}</span>
              <button type="button" className="btn btn-sm btn-light" onClick={handleLogout}>Logout</button>
            </div>
          </div>
        </nav>
      </header>

      <main id="main-content" ref={mainRef} className="container zen-page py-4" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}
