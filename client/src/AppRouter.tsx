import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import App from "./App.js";
import { AppShell } from "./components/AppShell.js";
import { StateBlock } from "./components/StateBlock.js";
import { AuthProvider, landingPath, useAuth } from "./context/AuthContext.js";
import { ChangePasswordPage } from "./pages/ChangePasswordPage.js";
import { CreateTicketPage } from "./pages/CreateTicketPage.js";
import { ForbiddenPage, RolePlaceholderPage } from "./pages/RolePlaceholderPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { MyTicketsPage } from "./pages/MyTicketsPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { RequesterTicketDetailPage } from "./pages/RequesterTicketDetailPage.js";

function BootstrapFailure() {
  const { refresh } = useAuth();
  return (
    <StateBlock
      kind="error"
      title="TokTickIT could not restore your session"
      description="The service did not respond. Please try again without exposing account details."
      action={<button type="button" className="btn btn-outline-primary" onClick={() => void refresh()}>Retry</button>}
    />
  );
}

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <StateBlock kind="loading" title="Loading your workspace..." />;
  if (status === "unauthenticated") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (status === "error") return <BootstrapFailure />;
  if (status === "forbidden") {
    return <StateBlock kind="error" title="Your account cannot access TokTickIT" description="Contact an administrator if you believe this is incorrect." />;
  }
  if (status === "password-change-required" && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}

function RequireRole({ roles }: { roles: string[] }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <ForbiddenPage />;
  return <Outlet />;
}

function LoginRoute() {
  const { status, user } = useAuth();
  if (status === "loading") return <StateBlock kind="loading" title="Loading TokTickIT..." />;
  if (status === "error") return <BootstrapFailure />;
  if (user && status !== "unauthenticated") return <Navigate to={landingPath(user)} replace />;
  return <LoginPage />;
}

function LandingRoute() {
  const { status, user } = useAuth();
  if (status === "loading") return <StateBlock kind="loading" title="Loading your workspace..." />;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  if (user) return <Navigate to={landingPath(user)} replace />;
  return <BootstrapFailure />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route path="/login" element={<LoginRoute />} />

      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route element={<RequireRole roles={["REQUESTER"]} />}>
            <Route path="/tickets" element={<MyTicketsPage />} />
            <Route path="/tickets/new" element={<CreateTicketPage />} />
            <Route path="/tickets/:id" element={<RequesterTicketDetailPage />} />
          </Route>
          <Route element={<RequireRole roles={["STAFF", "ADMIN"]} />}>
            <Route path="/staff/tickets" element={<RolePlaceholderPage role="staff" />} />
          </Route>
          <Route element={<RequireRole roles={["ADMIN"]} />}>
            <Route path="/admin/users" element={<RolePlaceholderPage role="admin" />} />
          </Route>
        </Route>
      </Route>

      <Route path="/system-check" element={<App />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
