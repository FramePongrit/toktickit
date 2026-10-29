import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

type DetailTab = "details" | "actions";

export function TicketDetailTabs({ details, actions }: { details: ReactNode; actions: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selected: DetailTab = searchParams.get("tab") === "actions" ? "actions" : "details";
  const [actionsMounted, setActionsMounted] = useState(selected === "actions");
  const refs = useRef<Record<DetailTab, HTMLButtonElement | null>>({ details: null, actions: null });

  useEffect(() => {
    if (selected === "actions") setActionsMounted(true);
  }, [selected]);

  function select(tab: DetailTab, moveFocus = false) {
    if (tab === "actions") setActionsMounted(true);
    const next = new URLSearchParams(searchParams);
    if (tab === "actions") next.set("tab", "actions");
    else next.delete("tab");
    setSearchParams(next, { replace: true });
    if (moveFocus) refs.current[tab]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = event.key === "ArrowRight" ? (selected === "details" ? "actions" : "details")
      : event.key === "ArrowLeft" ? (selected === "details" ? "actions" : "details")
        : event.key === "Home" ? "details"
          : event.key === "End" ? "actions" : null;
    if (!next) return;
    event.preventDefault();
    select(next, true);
  }

  return (
    <>
      <div className="zen-ticket-tabs mb-4" role="tablist" aria-label="Ticket detail sections">
        {(["details", "actions"] as const).map((tab) => (
          <button
            key={tab}
            ref={(element) => { refs.current[tab] = element; }}
            id={`ticket-${tab}-tab`}
            type="button"
            role="tab"
            aria-selected={selected === tab}
            aria-controls={`ticket-${tab}-panel`}
            tabIndex={selected === tab ? 0 : -1}
            className={`zen-ticket-tab${selected === tab ? " is-active" : ""}`}
            onClick={() => select(tab)}
            onKeyDown={onKeyDown}
          >
            {tab === "details" ? "Ticket Details" : "Actions Taken"}
          </button>
        ))}
      </div>
      <div id="ticket-details-panel" role="tabpanel" aria-labelledby="ticket-details-tab" tabIndex={0} hidden={selected !== "details"}>
        {details}
      </div>
      <div id="ticket-actions-panel" role="tabpanel" aria-labelledby="ticket-actions-tab" tabIndex={0} hidden={selected !== "actions"}>
        {actionsMounted ? actions : null}
      </div>
    </>
  );
}
