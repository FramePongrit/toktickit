import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchCategories, fetchRelatedSystems } from "../api/referenceData.js";
import { createTicket } from "../api/tickets.js";
import { FormField } from "../components/FormField.js";
import { StateBlock } from "../components/StateBlock.js";
import { ApiError } from "../lib/http.js";
import { useRequester } from "../context/RequesterContext.js";
import type { Priority, ReferenceItem, TicketDetail } from "../types/index.js";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

interface FormValues {
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: Priority | "";
  summary: string;
  description: string;
}

const EMPTY: FormValues = {
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  summary: "",
  description: "",
};

/**
 * Mirrors the server rules so the requester gets feedback without a round
 * trip. It is not the gate — the server validates everything again (BR-24).
 */
function validate(values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!values.categoryId) errors.categoryId = "Select a category.";
  if (!values.relatedSystemId) errors.relatedSystemId = "Select a related system.";
  if (!values.requestedPriority) errors.requestedPriority = "Select a requested priority.";

  const summary = values.summary.trim();
  if (summary.length === 0) errors.summary = "Summary is required.";
  else if (summary.length < 5) errors.summary = "Summary must be at least 5 characters.";
  else if (summary.length > 200) errors.summary = "Summary must be at most 200 characters.";

  const description = values.description.trim();
  if (description.length === 0) errors.description = "Description is required.";
  else if (description.length < 10) errors.description = "Description must be at least 10 characters.";
  else if (description.length > 5000) errors.description = "Description must be at most 5000 characters.";

  return errors;
}

export function CreateTicketPage() {
  const { requester } = useRequester();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<ReferenceItem[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<ReferenceItem[]>([]);
  const [referenceState, setReferenceState] = useState<"loading" | "ready" | "error">("loading");

  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<TicketDetail | null>(null);

  function loadReferenceData() {
    setReferenceState("loading");
    Promise.all([fetchCategories(), fetchRelatedSystems()])
      .then(([loadedCategories, loadedSystems]) => {
        setCategories(loadedCategories);
        setRelatedSystems(loadedSystems);
        setReferenceState("ready");
      })
      .catch(() => setReferenceState("error"));
  }

  useEffect(loadReferenceData, []);

  function update<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((previous) => ({ ...previous, [field]: value }));
    // Clear this field's message as soon as it is edited. Without this, a
    // corrected field keeps showing "is required" next to a filled input until
    // the next submit, which states something untrue.
    setErrors((previous) => {
      if (!(field in previous)) return previous;
      const { [field]: _removed, ...rest } = previous;
      return rest;
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const found = validate(values);
    setErrors(found);
    setSubmitError(null);
    if (Object.keys(found).length > 0) {
      // No request is sent when the form is already known to be invalid.
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const ticket = await createTicket({
        categoryId: Number(values.categoryId),
        relatedSystemId: Number(values.relatedSystemId),
        requestedPriority: values.requestedPriority as Priority,
        summary: values.summary.trim(),
        description: values.description.trim(),
      });
      setCreated(ticket);
    } catch (error) {
      // Values are deliberately not cleared: a failure must leave everything
      // the requester typed available to retry (BR-26).
      if (error instanceof ApiError && error.details.length > 0) {
        setErrors(Object.fromEntries(error.details.map((d) => [d.field, d.message])));
        setSubmitError("Please correct the highlighted fields and try again.");
      } else {
        setSubmitError(
          error instanceof ApiError
            ? error.message
            : "The ticket could not be submitted. Check your connection and try again."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function createAnother() {
    setCreated(null);
    setValues(EMPTY);
    setErrors({});
    setSubmitError(null);
  }

  if (created) {
    return (
      <div className="zen-success" role="status">
        <p className="fw-semibold mb-1">
          {/* Meaning is carried by the glyph and the text, not by colour alone. */}
          <span aria-hidden="true">✓ </span>
          Ticket {created.ticketNumber} created successfully
        </p>
        <p className="mb-3">Your request has been submitted and is now awaiting IT support.</p>
        <div className="d-flex flex-wrap gap-2">
          <Link className="btn btn-primary" to={`/tickets/${created.id}`}>
            View ticket
          </Link>
          <button type="button" className="btn btn-outline-primary" onClick={createAnother}>
            Create another ticket
          </button>
          <button type="button" className="btn btn-link" onClick={() => navigate("/tickets")}>
            Back to My Tickets
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1 className="h3 mb-1">Create Ticket</h1>
      <p className="zen-muted mb-4">Describe your problem so IT support can help you.</p>

      {referenceState === "loading" && <StateBlock kind="loading" title="Loading form options…" />}

      {referenceState === "error" && (
        <StateBlock
          kind="error"
          title="Could not load the form options"
          description="Categories and related systems are unavailable. Try again in a moment."
          action={
            <button type="button" className="btn btn-outline-primary" onClick={loadReferenceData}>
              Retry
            </button>
          }
        />
      )}

      {referenceState === "ready" && (
        <form onSubmit={handleSubmit} noValidate>
          {/* System-generated values, visually distinct from editable fields. */}
          <section className="zen-card p-3 p-md-4 mb-4">
            <h2 className="h6 mb-3">Ticket information</h2>
            <div className="row">
              <div className="col-12 col-md-4 mb-3">
                <span className="form-label fw-semibold d-block">Ticket No.</span>
                <div className="zen-readonly" data-testid="readonly-ticket-number">
                  Will be generated on submit
                </div>
              </div>
              <div className="col-12 col-md-4 mb-3">
                <span className="form-label fw-semibold d-block">Ticket Date</span>
                <div className="zen-readonly">{new Date().toLocaleDateString()}</div>
              </div>
              <div className="col-12 col-md-4 mb-3">
                <span className="form-label fw-semibold d-block">Requester</span>
                <div className="zen-readonly" data-testid="readonly-requester">
                  {requester?.fullName ?? ""}
                </div>
              </div>
            </div>
          </section>

          <section className="zen-card p-3 p-md-4 mb-4">
            <h2 className="h6 mb-3">Classification</h2>
            <div className="row">
              <div className="col-12 col-md-6 col-lg-4">
                <FormField id="categoryId" label="Category" required error={errors.categoryId}>
                  {({ id, describedBy, invalid }) => (
                    <select
                      id={id}
                      className={`form-select ${invalid ? "is-invalid" : ""}`}
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      value={values.categoryId}
                      onChange={(e) => update("categoryId", e.target.value)}
                    >
                      <option value="">Select a category…</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
              </div>

              <div className="col-12 col-md-6 col-lg-4">
                <FormField
                  id="relatedSystemId"
                  label="Related System"
                  required
                  error={errors.relatedSystemId}
                >
                  {({ id, describedBy, invalid }) => (
                    <select
                      id={id}
                      className={`form-select ${invalid ? "is-invalid" : ""}`}
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      value={values.relatedSystemId}
                      onChange={(e) => update("relatedSystemId", e.target.value)}
                    >
                      <option value="">Select a related system…</option>
                      {relatedSystems.map((system) => (
                        <option key={system.id} value={system.id}>
                          {system.name}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
              </div>

              <div className="col-12 col-md-6 col-lg-4">
                <FormField
                  id="requestedPriority"
                  label="Requested Priority"
                  required
                  error={errors.requestedPriority}
                >
                  {({ id, describedBy, invalid }) => (
                    <select
                      id={id}
                      className={`form-select ${invalid ? "is-invalid" : ""}`}
                      aria-describedby={describedBy}
                      aria-invalid={invalid}
                      value={values.requestedPriority}
                      onChange={(e) => update("requestedPriority", e.target.value as Priority)}
                    >
                      <option value="">Select a priority…</option>
                      {PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority.charAt(0) + priority.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
              </div>
            </div>
          </section>

          <section className="zen-card p-3 p-md-4 mb-4">
            <h2 className="h6 mb-3">Problem details</h2>

            <FormField
              id="summary"
              label="Ticket Summary"
              required
              error={errors.summary}
              hint="A short headline, 5 to 200 characters."
            >
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  type="text"
                  className={`form-control ${invalid ? "is-invalid" : ""}`}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  maxLength={200}
                  value={values.summary}
                  onChange={(e) => update("summary", e.target.value)}
                />
              )}
            </FormField>

            <FormField
              id="description"
              label="Description"
              required
              error={errors.description}
              hint="Explain what happened, when it started, and what you have already tried."
            >
              {({ id, describedBy, invalid }) => (
                <textarea
                  id={id}
                  rows={6}
                  className={`form-control ${invalid ? "is-invalid" : ""}`}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  maxLength={5000}
                  value={values.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              )}
            </FormField>
          </section>

          {submitError && (
            <div className="zen-error-panel mb-3" role="alert">
              {submitError}
            </div>
          )}

          <div className="d-flex flex-column flex-md-row justify-content-md-end gap-2">
            <button
              type="button"
              className="btn btn-outline-primary order-md-1"
              onClick={() => navigate("/tickets")}
              disabled={submitting}
            >
              Cancel
            </button>
            {/* Disabled while in flight, so a second click cannot create a
                second ticket (BR-25). */}
            <button type="submit" className="btn btn-primary order-md-2" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                  Submitting…
                </>
              ) : (
                "Submit Ticket"
              )}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
