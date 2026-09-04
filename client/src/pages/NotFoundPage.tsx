import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="text-center py-5">
      <h1 className="h4">Page not found</h1>
      <p className="zen-muted">The page you asked for does not exist.</p>
      <Link className="btn btn-outline-primary" to="/tickets">
        Back to My Tickets
      </Link>
    </div>
  );
}
