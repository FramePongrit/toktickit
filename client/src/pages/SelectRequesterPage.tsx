import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchDevRequesters } from "../api/referenceData.js";
import { useRequester } from "../context/RequesterContext.js";
import { StateBlock } from "../components/StateBlock.js";
import type { DevRequester } from "../types/index.js";

type LoadState = "loading" | "ready" | "error";

export function SelectRequesterPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [requesters, setRequesters] = useState<DevRequester[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const { selectRequester } = useRequester();
  const navigate = useNavigate();

  function load() {
    setState("loading");
    fetchDevRequesters()
      .then((list) => {
        setRequesters(list);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, []);

  function handleContinue() {
    const chosen = requesters.find((r) => String(r.id) === selectedId);
    if (!chosen) return;
    selectRequester(chosen);
    navigate("/tickets");
  }

  return (
    <main className="container zen-page py-5">
      <div className="mx-auto zen-card p-4" style={{ maxWidth: 560 }}>
        <h1 className="h4 text-center mb-1">TokTickIT</h1>
        <h2 className="h5 text-center mb-2">Select Development Requester</h2>
        <p className="text-center zen-muted mb-4">
          Select a Development Requester to test requester-specific ticket behavior. This is not a
          login screen. Authentication and role-based access will be introduced in Lab 3.
        </p>

        {state === "loading" && <StateBlock kind="loading" title="Loading development requesters…" />}

        {state === "error" && (
          <StateBlock
            kind="error"
            title="Could not load development requesters"
            description="The service did not respond. Check that the API is running and try again."
            action={
              <button type="button" className="btn btn-outline-primary" onClick={load}>
                Retry
              </button>
            }
          />
        )}

        {state === "ready" && requesters.length === 0 && (
          <StateBlock
            kind="empty"
            title="No active development requesters found"
            description="Run the database seed to create them, then reload this page."
          />
        )}

        {state === "ready" && requesters.length > 0 && (
          <>
            <div className="mb-3">
              <label className="form-label fw-semibold" htmlFor="requester-select">
                Development Requester
                <span className="zen-required" aria-hidden="true">
                  *
                </span>
                <span className="visually-hidden">(required)</span>
              </label>
              <select
                id="requester-select"
                className="form-select"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                <option value="">Choose a requester…</option>
                {requesters.map((requester) => (
                  <option key={requester.id} value={requester.id}>
                    {requester.fullName}
                    {requester.department ? ` — ${requester.department}` : ""}
                  </option>
                ))}
              </select>
              <p className="zen-muted mt-2 mb-0" style={{ fontSize: "0.875rem" }}>
                Only active development requesters are shown.
              </p>
            </div>

            <div className="zen-success mb-4">
              <p className="fw-semibold mb-1">Authentication coming in Lab 3</p>
              <p className="mb-0" style={{ fontSize: "0.9rem" }}>
                In Lab 3 this selection will be replaced with secure authentication so you can
                access the system with your own account.
              </p>
            </div>

            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={selectedId === ""}
                onClick={handleContinue}
              >
                Continue
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
