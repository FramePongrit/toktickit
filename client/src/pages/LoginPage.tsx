import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../lib/http.js";
import { FormField } from "../components/FormField.js";
import { landingPath, useAuth } from "../context/AuthContext.js";

interface Values {
  email: string;
  password: string;
}

function validate(values: Values): Record<keyof Values, string> {
  const errors = {} as Record<keyof Values, string>;
  const email = values.email.trim();
  if (!email) errors.email = "Email is required.";
  else if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address.";
  if (!values.password) errors.password = "Password is required.";
  return errors;
}

function safeLoginMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "We couldn't sign you in. Please try again.";
  if (error.code === "INVALID_CREDENTIALS") return "Email or password is incorrect.";
  if (error.code === "USER_INACTIVE") return "This account is inactive. Contact an administrator.";
  if (error.code === "LOGIN_THROTTLED") return "Too many sign-in attempts. Please wait and try again later.";
  return "We couldn't sign you in. Please try again.";
}

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Values>({ email: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => emailRef.current?.focus(), []);

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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const normalized = { email: values.email.trim().toLowerCase(), password: values.password };
    setValues(normalized);
    const found = validate(normalized);
    setErrors(found);
    setSubmitError(null);
    if (Object.keys(found).length > 0) {
      (found.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const user = await signIn(normalized.email, normalized.password);
      navigate(landingPath(user), { replace: true });
    } catch (error) {
      setSubmitError(safeLoginMessage(error));
      setValues((current) => ({ ...current, password: "" }));
      passwordRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="container zen-page py-5">
      <div className="mx-auto zen-card p-4 p-md-5" style={{ maxWidth: 480 }}>
        <p className="text-center fw-semibold text-success mb-2">TokTickIT</p>
        <h1 className="h3 text-center mb-2" data-page-heading tabIndex={-1}>Sign in</h1>
        <p className="zen-muted text-center mb-4">Access the IT Service Desk with your account.</p>

        {submitError && <div className="zen-error-panel mb-4" role="alert" aria-live="assertive">{submitError}</div>}

        <form onSubmit={submit} noValidate>
          <FormField id="login-email" label="Email" required error={errors.email}>
            {({ id, describedBy, invalid }) => (
              <input
                ref={emailRef}
                id={id}
                type="email"
                className={`form-control${invalid ? " is-invalid" : ""}`}
                value={values.email}
                autoComplete="username"
                disabled={submitting}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onChange={(event) => update("email", event.target.value)}
              />
            )}
          </FormField>

          <FormField id="login-password" label="Password" required error={errors.password}>
            {({ id, describedBy, invalid }) => (
              <input
                ref={passwordRef}
                id={id}
                type="password"
                className={`form-control${invalid ? " is-invalid" : ""}`}
                value={values.password}
                autoComplete="current-password"
                disabled={submitting}
                aria-invalid={invalid}
                aria-describedby={describedBy}
                onChange={(event) => update("password", event.target.value)}
              />
            )}
          </FormField>

          <button type="submit" className="btn btn-primary w-100 mt-2" disabled={submitting} aria-busy={submitting}>
            {submitting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" data-testid="login-spinner" />}
            {submitting ? "Signing in..." : "Sign in"}
          </button>
          {submitting && <div className="visually-hidden" role="status" aria-live="polite" data-testid="login-status">Signing in...</div>}
        </form>

        <p className="zen-muted mt-4 mb-0" style={{ fontSize: "0.875rem" }}>
          Local development sign-in uses the accounts provisioned by the database seed. Never enter real credentials here.
        </p>
      </div>
    </section>
  );
}
