import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import App from "./App.js";
import { AppShell } from "./components/AppShell.js";
import { StateBlock } from "./components/StateBlock.js";
import { RequesterProvider, useRequester } from "./context/RequesterContext.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { SelectRequesterPage } from "./pages/SelectRequesterPage.js";

/**
 * Sends the user to the selector when no requester is chosen (BR-46). It waits
 * for hydration first, otherwise a reload would bounce a user who does have a
 * stored selection back to the selector before it had been read.
 */
function RequireRequester() {
  const { requester, hydrating } = useRequester();

  if (hydrating) {
    return <StateBlock kind="loading" title="Loading…" />;
  }

  return requester ? <Outlet /> : <Navigate to="/select-requester" replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/tickets" replace />} />
      <Route path="/select-requester" element={<SelectRequesterPage />} />

      <Route element={<RequireRequester />}>
        <Route element={<AppShell />}>
          {/* Ticket screens arrive in Issues 13 to 15. */}
          <Route path="/tickets" element={<div />} />
          <Route path="/tickets/new" element={<div />} />
          <Route path="/tickets/:id" element={<div />} />
        </Route>
      </Route>

      {/* The Lab 1 system check, kept reachable and unchanged. */}
      <Route path="/system-check" element={<App />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <RequesterProvider>
        <AppRoutes />
      </RequesterProvider>
    </BrowserRouter>
  );
}
