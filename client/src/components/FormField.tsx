import type { ReactNode } from "react";

interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

/**
 * Keeps the label, the required marker and the validation message together, so
 * a message can never end up far from the field it describes.
 *
 * The asterisk is decorative and paired with a visually hidden "(required)",
 * because an asterisk alone is not an accessible name — and it never replaces
 * the validation message either (ui-spec §3).
 */
export function FormField({ id, label, required, error, hint, children }: FormFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");

  return (
    <div className="mb-3">
      <label className="form-label fw-semibold" htmlFor={id}>
        {label}
        {required && (
          <>
            <span className="zen-required" aria-hidden="true">
              *
            </span>
            <span className="visually-hidden">(required)</span>
          </>
        )}
      </label>

      {children({ id, describedBy: describedBy || undefined, invalid: Boolean(error) })}

      {hint && (
        <p id={hintId} className="zen-muted mb-0" style={{ fontSize: "0.875rem" }}>
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="zen-field-error mb-0" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
