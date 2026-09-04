import type { Priority, TicketStatus } from "../types/index.js";

const PRIORITY_CLASS: Record<Priority, string> = {
  LOW: "zen-badge-low",
  MEDIUM: "zen-badge-medium",
  HIGH: "zen-badge-high",
  URGENT: "zen-badge-urgent",
};

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/**
 * Both badges always render their label. Colour carries emphasis, never the
 * meaning on its own, so the value stays legible to anyone who cannot
 * distinguish the ramp (ui-spec §5).
 */
export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`zen-badge ${PRIORITY_CLASS[priority]}`} data-testid="priority-badge">
      {titleCase(priority)}
    </span>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className="zen-badge zen-badge-status" data-testid="status-badge">
      {titleCase(status)}
    </span>
  );
}
