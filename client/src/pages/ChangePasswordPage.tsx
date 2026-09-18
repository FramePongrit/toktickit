import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../lib/http.js";
import { FormField } from "../components/FormField.js";
import { landingPath, useAuth } from "../context/AuthContext.js";

interface Values {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
}

const EMPTY: Values = { currentPassword: "", newPassword: "", confirmation: "" };

function passwordIssue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "New password is required.";
  if (trimmed.length < 10 || trimmed.length > 72) return "Password must be 10-72 characters.";
  if (!/[A-Za-z]/.test(trimmed)) return "Password must contain at least one letter.";
  if (!/[0-9]/.test(trimmed)) return "Password must contain at least one digit.";
  return undefined;
}

function safePasswordError(error: unknown): string {
  if (!(error instanceof ApiError)) return "The password could not be changed. Please try again.";
  if (error.code === "CURRENT_PASSWORD_INVALID") return "The current password is incorrect.";
  return "The password could not be changed. Please check the fields and try again.";
}

export function ChangePasswordPage() {
  const { user, updatePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const currentRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const mandatory = user.mustChangePassword;

  function update(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setSubmitError(null);
  }

  function validate(): Partial<Record<keyof Values, string>> {
    const found: Partial<Record<keyof Values, string>> = {};
    if (!values.currentPassword) found.currentPassword = "Current password is required.";
    const newIssue = passwordIssue(values.newPassword);
    if (newIssue) found.newPassword = newIssue;
    if (!values.confirmation) found.confirmation = "Confirmation is required.";
    else if (values.confirmation.trim() !== values.newPassword.trim()) {
      found.confirmation = "Confirmation must match the new password.";
    }
    if (!newIssue && values.currentPassword.trim() === values.newPassword.trim()) {
      found.newPassword = "The new password must differ from the current password.";
    }
    return found;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    const found = validate();
    setErrors(found);
    setSubmitError(null);
    setSuccess(false);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0] as keyof Values;
      document.getElementById(first === "currentPassword" ? "current-password" : first === "newPassword" ? "new-password" : "confirm-password")?.focus();
      return;
    }

    setSaving(true);
    // Password values are never retained after a submission attempt.
    const submitted = values;
    setValues(EMPTY);
    try {
      const updated = await updatePassword(submitted.currentPassword, submitted.newPassword, submitted.confirmation);
      setSuccess(true);
      window.setTimeout(() => navigate(landingPath(updated), { replace: true }), 250);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      const fieldErrors: Partial<Record<keyof Values, string>> = {};
      for (const detail of apiError?.details ?? []) {
        if (detail.field === "currentPassword" || detail.field === "newPassword" || detail.field === "confirmation") {
          fieldErrors[detail.field] = detail.message;
        }
      }
      if (apiError?.code === "CURRENT_PASSWORD_INVALID") {
        fieldErrors.currentPassword = "The current password is incorrect.";
      }
      setErrors(fieldErrors);
      setSubmitError(safePasswordError(error));
      if (apiError?.code === "CURRENT_PASSWORD_INVALID") currentRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <section className="container zen-page py-5">
      <div className="mx-auto zen-card p-4 p-md-5" style={{ maxWidth: 560 }}>
        <h1 className="h3 mb-2" data-page-heading tabIndex={-1}>Change password</h1>
        {mandatory ? (
          <div className="zen-warning-panel mb-4" role="status">
            Your initial password must be changed before you can use the rest of TokTickIT.
          </div>
        ) : (
          <p className="zen-muted mb-4">Update your password for future sign-ins.</p>
        )}

        {submitError && <div className="zen-error-panel mb-4" role="status" aria-live="assertive">{submitError}</div>}
        {success && <div className="zen-success mb-4" role="status">Password changed successfully. Redirecting...</div>}

        <form onSubmit={submit} noValidate aria-busy={saving}>
          <FormField id="current-password" label="Current Password" required error={errors.currentPassword}>
            {({ id, describedBy, invalid }) => (
              <input ref={currentRef} id={id} type="password" className={`form-control${invalid ? " is-invalid" : ""}`} value={values.currentPassword} autoComplete="current-password" disabled={saving} aria-invalid={invalid} aria-describedby={describedBy} onChange={(event) => update("currentPassword", event.target.value)} />
            )}
          </FormField>
          <FormField id="new-password" label="New Password" required error={errors.newPassword} hint="Use 10-72 characters with at least one letter and one digit.">
            {({ id, describedBy, invalid }) => (
              <input id={id} type="password" className={`form-control${invalid ? " is-invalid" : ""}`} value={values.newPassword} autoComplete="new-password" disabled={saving} aria-invalid={invalid} aria-describedby={describedBy} onChange={(event) => update("newPassword", event.target.value)} />
            )}
          </FormField>
          <FormField id="confirm-password" label="Confirm New Password" required error={errors.confirmation}>
            {({ id, describedBy, invalid }) => (
              <input id={id} type="password" className={`form-control${invalid ? " is-invalid" : ""}`} value={values.confirmation} autoComplete="new-password" disabled={saving} aria-invalid={invalid} aria-describedby={describedBy} onChange={(event) => update("confirmation", event.target.value)} />
            )}
          </FormField>

          <div className="d-flex flex-column flex-sm-row justify-content-end gap-2 mt-4">
            <button type="button" className="btn btn-outline-primary" onClick={handleLogout} disabled={saving}>Logout</button>
            <button type="submit" className="btn btn-primary" disabled={saving || success} aria-busy={saving}>
              {saving && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" data-testid="password-save-spinner" />}
              {saving ? "Saving password..." : "Save new password"}
            </button>
          </div>
          {saving && <div className="visually-hidden" role="status" aria-live="polite" data-testid="password-save-status">Saving password...</div>}
        </form>
      </div>
    </section>
  );
}
