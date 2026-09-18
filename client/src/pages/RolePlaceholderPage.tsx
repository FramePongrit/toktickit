import { Link } from "react-router-dom";

export function RolePlaceholderPage({ role }: { role: "staff" | "admin" }) {
  const admin = role === "admin";
  return (
    <section className="zen-card p-4" data-testid={`${role}-landing`}>
      <h1 className="h3" data-page-heading tabIndex={-1}>{admin ? "User Management" : "Staff Queue"}</h1>
      <p className="zen-muted mb-3">
        {admin ? "Manage TokTickIT users and access." : "Review and work on active support tickets."}
      </p>
      <p className="mb-0">This role workspace is ready for the next Lab 3 feature increment.</p>
      {admin && <Link className="btn btn-outline-primary mt-3" to="/staff/tickets">Open Tickets</Link>}
    </section>
  );
}

export function ForbiddenPage() {
  return (
    <section className="zen-error-panel" role="alert">
      <h1 className="h4" data-page-heading tabIndex={-1}>You do not have access to this page</h1>
      <p className="mb-3">Your account can only open the destinations shown in the navigation.</p>
      <Link className="btn btn-primary" to="/">Return to your workspace</Link>
    </section>
  );
}
