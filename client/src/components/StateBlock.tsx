import type { ReactNode } from "react";

type StateKind = "loading" | "empty" | "no-results" | "error";

interface StateBlockProps {
  kind: StateKind;
  title: string;
  description?: string;
  /** Retry, Clear filters, Create ticket — whatever the state makes available. */
  action?: ReactNode;
}

const ICONS: Record<StateKind, string> = {
  loading: "⏳",
  empty: "📄",
  "no-results": "🔍",
  error: "⚠️",
};

/**
 * One component for the four states every asynchronous screen needs, so the
 * empty and no-results cases cannot drift apart between screens.
 *
 * Empty and no-results are deliberately separate kinds: "you have no tickets"
 * and "your filters matched nothing" call for different wording and different
 * actions, and conflating them tells the requester something untrue (BR-42).
 */
export function StateBlock({ kind, title, description, action }: StateBlockProps) {
  const isError = kind === "error";

  return (
    <div
      className={`text-center py-5 px-3 ${isError ? "zen-error-panel" : ""}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      data-state={kind}
    >
      <div aria-hidden="true" style={{ fontSize: "2rem" }}>
        {kind === "loading" ? (
          <span className="spinner-border text-success" role="presentation" />
        ) : (
          ICONS[kind]
        )}
      </div>
      <p className="fw-semibold mt-3 mb-1">{title}</p>
      {description && <p className="zen-muted mb-3">{description}</p>}
      {action}
    </div>
  );
}
