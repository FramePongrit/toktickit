import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useRequester } from "../context/RequesterContext.js";

export function AppShell() {
  const { requester, clearRequester } = useRequester();
  const navigate = useNavigate();

  function changeRequester() {
    // Clearing before navigating is what guarantees no data from the previous
    // requester survives the switch (BR-08).
    clearRequester();
    navigate("/select-requester");
  }

  return (
    <>
      <header className="zen-header">
        <nav className="navbar navbar-expand-md container zen-page" aria-label="Main">
          <span className="navbar-brand fw-semibold">TokTickIT</span>

          <button
            className="navbar-toggler border-light"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#zen-nav"
            aria-controls="zen-nav"
            aria-expanded="false"
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>

          <div className="collapse navbar-collapse" id="zen-nav">
            <ul className="navbar-nav me-auto">
              <li className="nav-item">
                <NavLink className="nav-link" to="/tickets" end>
                  My Tickets
                </NavLink>
              </li>
              <li className="nav-item">
                <NavLink className="nav-link" to="/tickets/new">
                  Create Ticket
                </NavLink>
              </li>
            </ul>

            {requester && (
              <div className="d-flex align-items-center gap-3 py-2 py-md-0">
                <span className="text-white" data-testid="current-requester">
                  {requester.fullName}
                </span>
                <button type="button" className="btn btn-sm btn-light" onClick={changeRequester}>
                  Change Requester
                </button>
              </div>
            )}
          </div>
        </nav>
      </header>

      <main className="container zen-page py-4">
        <Outlet />
      </main>
    </>
  );
}
