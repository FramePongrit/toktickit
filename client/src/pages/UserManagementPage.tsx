import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createAdminUser,
  editAdminUser,
  fetchAdminUsers,
  resetAdminUserPassword,
} from "../api/adminUsers.js";
import type {
  CreateAdminUserInput,
  EditAdminUserInput,
  ResetAdminUserPasswordInput,
} from "../api/adminUsers.js";
import { roleLabel, useAuth } from "../context/AuthContext.js";
import { StateBlock } from "../components/StateBlock.js";
import { ApiError } from "../lib/http.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import type { AdminUser, Role } from "../types/index.js";

const ROLES: Role[] = ["REQUESTER", "STAFF", "ADMIN"];
const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex=\"-1\"])";

type FormErrors<T extends string> = Partial<Record<T, string>>;
type LoadState = "loading" | "ready" | "error" | "forbidden";
type DialogKind = "create" | "edit" | "reset" | null;

interface CreateValues extends CreateAdminUserInput {}
interface EditValues {
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
}
interface ResetValues extends ResetAdminUserPasswordInput {}

const EMPTY_CREATE: CreateValues = {
  fullName: "",
  email: "",
  role: "REQUESTER",
  active: true,
  initialPassword: "",
  confirmation: "",
};

const EMPTY_RESET: ResetValues = { initialPassword: "", confirmation: "" };

function formatRole(role: Role): string {
  return roleLabel(role);
}

function formatValidationError(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === "LAST_ACTIVE_ADMINISTRATOR") {
    return "Keep another active Administrator before changing this account.";
  }
  if (error.code === "USER_OWNS_NON_FINAL_TICKETS") {
    const count = Number(error.meta?.nonFinalOwnedTicketCount ?? 0);
    return `Reassign ${count} non-final Ticket${count === 1 ? "" : "s"} before deactivating or changing this User to Requester.`;
  }
  if (error.code === "ADMIN_SELF_PROTECTION") {
    return "You may change your own name and email, but not your Role, active state, or password here.";
  }
  return error.message || fallback;
}

function fieldErrors<T extends string>(error: unknown): FormErrors<T> {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(error.details.map((detail) => [detail.field, detail.message])) as FormErrors<T>;
}

function emailIssue(value: string): string | undefined {
  if (!value.trim()) return "Email is required.";
  if (!/^\S+@\S+\.\S+$/.test(value.trim())) return "Email must be valid.";
  return undefined;
}

function nameIssue(value: string): string | undefined {
  if (!value.trim()) return "Full name is required.";
  if (value.trim().length > 120) return "Full name must be at most 120 characters.";
  return undefined;
}

function passwordIssue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return "Initial Password is required.";
  if (trimmed.length < 10 || trimmed.length > 72) return "Password must be 10-72 characters.";
  if (!/[A-Za-z]/.test(trimmed)) return "Password must contain at least one letter.";
  if (!/[0-9]/.test(trimmed)) return "Password must contain at least one digit.";
  return undefined;
}

function useDialogFocus(
  open: boolean,
  dialogRef: React.RefObject<HTMLDivElement>,
  triggerRef: React.MutableRefObject<HTMLElement | null>,
  onClose: () => void,
  focusVersion: number,
) {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    const elements = focusable();
    (elements[0] ?? dialog).focus();
  }, [open, dialogRef, focusVersion]);

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      return;
    }
    if (!wasOpenRef.current) return;
    wasOpenRef.current = false;
    triggerRef.current?.focus();
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, dialogRef, triggerRef, onClose]);
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { "aria-describedby": describedBy })
    : children;
  return (
    <div className="mb-3">
      <label className="form-label fw-semibold" htmlFor={id}>{label}</label>
      {control}
      {hint && <div id={hintId} className="form-text">{hint}</div>}
      {error && <div id={errorId} className="zen-field-error" role="alert">{error}</div>}
    </div>
  );
}

function DialogShell({
  title,
  description,
  dialogRef,
  children,
  testId,
}: {
  title: string;
  description: string;
  dialogRef: React.RefObject<HTMLDivElement>;
  children: React.ReactNode;
  testId: string;
}) {
  const titleId = `${testId}-title`;
  const descriptionId = `${testId}-description`;
  return (
    <div className="zen-dialog-backdrop" role="presentation">
      <div ref={dialogRef} className="zen-dialog zen-card p-4" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} data-testid={testId} tabIndex={-1}>
        <h2 id={titleId} className="h4 mb-2">{title}</h2>
        <p id={descriptionId} className="zen-muted mb-4">{description}</p>
        {children}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return <span className="zen-badge zen-badge-medium">{formatRole(role)}</span>;
}

function UserStatus({ active }: { active: boolean }) {
  return <span className={`zen-badge ${active ? "zen-badge-status" : "zen-badge-low"}`}>{active ? "Active" : "Inactive"}</span>;
}

function UserSummary({ user, onEdit }: { user: AdminUser; onEdit: (trigger: HTMLButtonElement) => void }) {
  return (
    <article className="admin-user-card zen-card p-3" data-testid={`admin-user-card-${user.id}`}>
      <div className="d-flex justify-content-between align-items-start gap-3">
        <div className="min-w-0">
          <h2 className="h6 mb-1 text-break">{user.fullName}</h2>
          <p className="mb-2 text-break zen-muted">{user.email}</p>
        </div>
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={(event) => onEdit(event.currentTarget)} aria-label={`Edit ${user.fullName}`}>Edit</button>
      </div>
      <div className="d-flex flex-wrap gap-2 align-items-center">
        <RoleBadge role={user.role} />
        <UserStatus active={user.active} />
      </div>
    </article>
  );
}

export function UserManagementPage() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | Role>("");
  const [active, setActive] = useState<"" | "true" | "false">("");
  const debouncedSearch = useDebouncedValue(search);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [createValues, setCreateValues] = useState<CreateValues>(EMPTY_CREATE);
  const [editValues, setEditValues] = useState<EditValues | null>(null);
  const [resetValues, setResetValues] = useState<ResetValues>(EMPTY_RESET);
  const [errors, setErrors] = useState<FormErrors<string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const createTriggerRef = useRef<HTMLButtonElement | null>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const resetTriggerRef = useRef<HTMLButtonElement | null>(null);
  const activeTriggerRef = useRef<HTMLElement | null>(null);
  const returnToResetActionRef = useRef(false);
  const createDialogRef = useRef<HTMLDivElement>(null);
  const editDialogRef = useRef<HTMLDivElement>(null);
  const resetDialogRef = useRef<HTMLDivElement>(null);

  const closeDialog = useCallback(() => {
    setDialog(null);
    setEditing(null);
    setCreateValues(EMPTY_CREATE);
    setResetValues(EMPTY_RESET);
    setEditValues(null);
    setErrors({});
    setFormError(null);
  }, []);

  const closeResetDialog = useCallback(() => {
    if (saving) return;
    returnToResetActionRef.current = true;
    activeTriggerRef.current = null;
    setDialog("edit");
    setResetValues(EMPTY_RESET);
    setErrors({});
    setFormError(null);
  }, [saving]);

  useDialogFocus(dialog === "create", createDialogRef, activeTriggerRef, closeDialog, saving ? 1 : 0);
  useDialogFocus(dialog === "edit", editDialogRef, activeTriggerRef, closeDialog, saving ? 1 : 0);
  useDialogFocus(dialog === "reset", resetDialogRef, activeTriggerRef, closeResetDialog, saving ? 1 : 0);

  useEffect(() => {
    if (dialog !== "edit" || !returnToResetActionRef.current) return;
    returnToResetActionRef.current = false;
    resetTriggerRef.current?.focus();
  }, [dialog]);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setLoadError(null);
    fetchAdminUsers({
      q: debouncedSearch.trim() || undefined,
      role: role || undefined,
      active: active === "" ? undefined : active === "true",
    })
      .then((response) => {
        if (cancelled) return;
        setUsers(response.data);
        setLoadState("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        const apiError = error instanceof ApiError ? error : null;
        setLoadError(apiError);
        setLoadState(apiError?.status === 403 ? "forbidden" : "error");
      });
    return () => { cancelled = true; };
  }, [active, debouncedSearch, role, reload]);

  function openCreate() {
    activeTriggerRef.current = createTriggerRef.current;
    setCreateValues(EMPTY_CREATE);
    setErrors({});
    setFormError(null);
    setDialog("create");
  }

  function openEdit(target: AdminUser, trigger?: HTMLButtonElement | null) {
    activeTriggerRef.current = trigger ?? editTriggerRef.current;
    setEditing(target);
    setEditValues({ fullName: target.fullName, email: target.email, role: target.role, active: target.active });
    setErrors({});
    setFormError(null);
    setDialog("edit");
  }

  function updateCreate(field: keyof CreateValues, value: string | boolean) {
    setCreateValues((current) => ({ ...current, [field]: value } as CreateValues));
    setErrors((current) => { const next = { ...current }; delete next[field]; return next; });
    setFormError(null);
  }

  function updateEdit(field: keyof EditValues, value: string | boolean) {
    setEditValues((current) => current ? { ...current, [field]: value } : current);
    setErrors((current) => { const next = { ...current }; delete next[field]; return next; });
    setFormError(null);
  }

  function updateReset(field: keyof ResetValues, value: string) {
    setResetValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => { const next = { ...current }; delete next[field]; return next; });
    setFormError(null);
  }

  function validateCreate(): FormErrors<keyof CreateValues> {
    const found: FormErrors<keyof CreateValues> = {};
    const nameError = nameIssue(createValues.fullName);
    const emailError = emailIssue(createValues.email);
    const passwordError = passwordIssue(createValues.initialPassword);
    if (nameError) found.fullName = nameError;
    if (emailError) found.email = emailError;
    if (passwordError) found.initialPassword = passwordError;
    if (!createValues.confirmation) found.confirmation = "Confirmation is required.";
    else if (createValues.confirmation.trim() !== createValues.initialPassword.trim()) found.confirmation = "Confirmation must match Initial Password.";
    return found;
  }

  function validateEdit(): FormErrors<keyof EditValues> {
    const found: FormErrors<keyof EditValues> = {};
    if (!editValues) return found;
    const nameError = nameIssue(editValues.fullName);
    const emailError = emailIssue(editValues.email);
    if (nameError) found.fullName = nameError;
    if (emailError) found.email = emailError;
    return found;
  }

  function validateReset(): FormErrors<keyof ResetValues> {
    const found: FormErrors<keyof ResetValues> = {};
    const passwordError = passwordIssue(resetValues.initialPassword);
    if (passwordError) found.initialPassword = passwordError;
    if (!resetValues.confirmation) found.confirmation = "Confirmation is required.";
    else if (resetValues.confirmation.trim() !== resetValues.initialPassword.trim()) found.confirmation = "Confirmation must match Initial Password.";
    return found;
  }

  function focusFirstError(found: FormErrors<string>) {
    const first = Object.keys(found)[0];
    if (first) document.getElementById(`admin-user-${first}`)?.focus();
  }

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    const found = validateCreate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) { focusFirstError(found); return; }
    setSaving(true);
    const submitted = createValues;
    setCreateValues((current) => ({ ...current, initialPassword: "", confirmation: "" }));
    try {
      await createAdminUser(submitted);
      setAnnouncement("User created successfully.");
      closeDialog();
      setReload((value) => value + 1);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setErrors(fieldErrors<keyof CreateValues>(error));
      setFormError(apiError?.code === "EMAIL_ALREADY_EXISTS" ? "A User with this email already exists." : formatValidationError(error, "The User could not be created. Please try again."));
    } finally { setSaving(false); }
  }

  async function submitEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || !editValues) return;
    const found = validateEdit();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) { focusFirstError(found); return; }
    const input: EditAdminUserInput = {
      fullName: editValues.fullName,
      email: editValues.email,
      ...(editing.id === currentUser?.id ? {} : { role: editValues.role, active: editValues.active }),
    };
    setSaving(true);
    try {
      const result = await editAdminUser(editing.id, input);
      setAnnouncement(`${result.user.fullName} updated successfully.`);
      closeDialog();
      setReload((value) => value + 1);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setErrors(fieldErrors<keyof EditValues>(error));
      setFormError(apiError?.code === "EMAIL_ALREADY_EXISTS" ? "A User with this email already exists." : formatValidationError(error, "The User could not be updated. Please try again."));
    } finally { setSaving(false); }
  }

  async function submitReset(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const found = validateReset();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) { focusFirstError(found); return; }
    setSaving(true);
    const submitted = resetValues;
    setResetValues(EMPTY_RESET);
    try {
      await resetAdminUserPassword(editing.id, submitted);
      setAnnouncement(`Initial Password reset for ${editing.fullName}. Existing sessions ended.`);
      closeDialog();
      setReload((value) => value + 1);
    } catch (error) {
      setErrors(fieldErrors<keyof ResetValues>(error));
      setFormError(formatValidationError(error, "The Initial Password could not be reset. Please try again."));
    } finally { setSaving(false); }
  }

  function openReset() {
    if (!editing || editing.id === currentUser?.id) return;
    returnToResetActionRef.current = false;
    activeTriggerRef.current = resetTriggerRef.current;
    setResetValues(EMPTY_RESET);
    setErrors({});
    setFormError(null);
    setDialog("reset");
  }

  const filtersActive = Boolean(search || role || active);

  return (
    <section className="admin-user-management" data-testid="user-management-page">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-start gap-3 mb-4">
        <div>
          <h1 className="h3 mb-1" data-page-heading tabIndex={-1}>User Management</h1>
          <p className="zen-muted mb-0">Manage TokTickIT accounts and access safely.</p>
        </div>
        <button ref={createTriggerRef} type="button" className="btn btn-primary" onClick={openCreate}>Create User</button>
      </div>

      {announcement && <div className="zen-success mb-4" role="status" aria-live="polite"><span aria-hidden="true">✓ </span>{announcement}</div>}

      <section className="zen-card p-3 mb-4" aria-label="User filters">
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-5">
            <label className="form-label fw-semibold" htmlFor="admin-user-search">Search</label>
            <input id="admin-user-search" className="form-control" type="search" value={search} placeholder="Name or email" onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label fw-semibold" htmlFor="admin-user-role-filter">Role</label>
            <select id="admin-user-role-filter" className="form-select" value={role} onChange={(event) => setRole(event.target.value as "" | Role)}>
              <option value="">All Roles</option>
              {ROLES.map((value) => <option key={value} value={value}>{formatRole(value)}</option>)}
            </select>
          </div>
          <div className="col-12 col-md-4">
            <label className="form-label fw-semibold" htmlFor="admin-user-active-filter">Active status</label>
            <select id="admin-user-active-filter" className="form-select" value={active} onChange={(event) => setActive(event.target.value as "" | "true" | "false")}>
              <option value="">All account statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
        {filtersActive && <button type="button" className="btn btn-outline-primary mt-3" onClick={() => { setSearch(""); setRole(""); setActive(""); }}>Clear Filters</button>}
      </section>

      {loadState === "loading" && <UserListSkeleton />}
      {loadState === "forbidden" && <StateBlock kind="error" title="You do not have access to User Management" description="Only Administrators can manage User accounts." action={<button type="button" className="btn btn-outline-primary" onClick={() => navigate("/")}>Return to your workspace</button>} />}
      {loadState === "error" && <StateBlock kind="error" title="Could not load Users" description="The service did not respond. Your filters have been kept, so you can safely retry." action={<button type="button" className="btn btn-outline-primary" onClick={() => setReload((value) => value + 1)}>Retry</button>} />}
      {loadState === "ready" && users.length === 0 && !filtersActive && <StateBlock kind="empty" title="No Users found." description="Create the first User to give them access to TokTickIT." action={<button type="button" className="btn btn-primary" onClick={openCreate}>Create User</button>} />}
      {loadState === "ready" && users.length === 0 && filtersActive && <StateBlock kind="no-results" title="No Users match these filters." description="Try a different Search, Role, or Active status filter." action={<button type="button" className="btn btn-outline-primary" onClick={() => { setSearch(""); setRole(""); setActive(""); }}>Clear Filters</button>} />}
      {loadState === "ready" && users.length > 0 && (
        <>
          <div className="admin-user-table d-none d-md-block zen-card" data-testid="admin-users-table">
            <table className="table align-middle mb-0">
              <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col" className="text-end">Edit</th></tr></thead>
              <tbody>{users.map((target) => <tr key={target.id}>
                <td className="fw-semibold text-break">{target.fullName}</td>
                <td className="text-break">{target.email}</td>
                <td><RoleBadge role={target.role} /></td>
                <td><UserStatus active={target.active} /></td>
                <td className="text-end"><button ref={target.id === editing?.id ? editTriggerRef : undefined} type="button" className="btn btn-outline-primary btn-sm" onClick={(event) => openEdit(target, event.currentTarget)}>Edit</button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="d-md-none d-grid gap-3" data-testid="admin-users-cards">
            {users.map((target) => <UserSummary key={target.id} user={target} onEdit={(trigger) => openEdit(target, trigger)} />)}
          </div>
        </>
      )}

      {dialog === "create" && <DialogShell title="Create User" description="The User must change this Initial Password before normal access. Password fields are never saved or shown again." dialogRef={createDialogRef} testId="create-user-dialog">
        <form onSubmit={submitCreate} noValidate aria-busy={saving}>
          <Field id="admin-user-fullName" label="Full name" error={errors.fullName}><input id="admin-user-fullName" className={`form-control${errors.fullName ? " is-invalid" : ""}`} value={createValues.fullName} disabled={saving} aria-invalid={Boolean(errors.fullName)} onChange={(event) => updateCreate("fullName", event.target.value)} /></Field>
          <Field id="admin-user-email" label="Email" error={errors.email}><input id="admin-user-email" type="email" autoComplete="off" className={`form-control${errors.email ? " is-invalid" : ""}`} value={createValues.email} disabled={saving} aria-invalid={Boolean(errors.email)} onChange={(event) => updateCreate("email", event.target.value)} /></Field>
          <div className="row g-3"><div className="col-12 col-sm-7"><Field id="admin-user-create-role" label="Role"><select id="admin-user-create-role" className="form-select" value={createValues.role} disabled={saving} onChange={(event) => updateCreate("role", event.target.value as Role)}>{ROLES.map((value) => <option key={value} value={value}>{formatRole(value)}</option>)}</select></Field></div><div className="col-12 col-sm-5 d-flex align-items-center"><div className="form-check mt-2"><input id="admin-user-active" type="checkbox" className="form-check-input" checked={createValues.active} disabled={saving} onChange={(event) => updateCreate("active", event.target.checked)} /><label className="form-check-label" htmlFor="admin-user-active">Active account</label></div></div></div>
          <Field id="admin-user-initialPassword" label="Initial Password" hint="Use 10-72 characters with at least one letter and one digit." error={errors.initialPassword}><input id="admin-user-initialPassword" type="password" autoComplete="new-password" className={`form-control${errors.initialPassword ? " is-invalid" : ""}`} value={createValues.initialPassword} disabled={saving} aria-invalid={Boolean(errors.initialPassword)} onChange={(event) => updateCreate("initialPassword", event.target.value)} /></Field>
          <Field id="admin-user-confirmation" label="Confirm Initial Password" error={errors.confirmation}><input id="admin-user-confirmation" type="password" autoComplete="new-password" className={`form-control${errors.confirmation ? " is-invalid" : ""}`} value={createValues.confirmation} disabled={saving} aria-invalid={Boolean(errors.confirmation)} onChange={(event) => updateCreate("confirmation", event.target.value)} /></Field>
          {formError && <div className="zen-error-panel mb-3" role="alert">{formError}</div>}
          <DialogActions busy={saving} cancel={closeDialog} submitLabel={saving ? "Creating User..." : "Create User"} />
        </form>
      </DialogShell>}

      {dialog === "edit" && editing && editValues && <DialogShell title={`Edit ${editing.fullName}`} description="Update this User's profile and access state. Changes to Role or active state revoke their existing sessions." dialogRef={editDialogRef} testId="edit-user-dialog">
        <form onSubmit={submitEdit} noValidate aria-busy={saving}>
          <Field id="admin-user-fullName" label="Full name" error={errors.fullName}><input id="admin-user-fullName" className={`form-control${errors.fullName ? " is-invalid" : ""}`} value={editValues.fullName} disabled={saving} aria-invalid={Boolean(errors.fullName)} onChange={(event) => updateEdit("fullName", event.target.value)} /></Field>
          <Field id="admin-user-email" label="Email" error={errors.email}><input id="admin-user-email" type="email" autoComplete="off" className={`form-control${errors.email ? " is-invalid" : ""}`} value={editValues.email} disabled={saving} aria-invalid={Boolean(errors.email)} onChange={(event) => updateEdit("email", event.target.value)} /></Field>
          <div className="row g-3"><div className="col-12 col-sm-7"><Field id="admin-user-edit-role" label="Role"><select id="admin-user-edit-role" className="form-select" value={editValues.role} disabled={saving || editing.id === currentUser?.id} aria-describedby={editing.id === currentUser?.id ? "admin-user-self-restriction" : undefined} onChange={(event) => updateEdit("role", event.target.value as Role)}>{ROLES.map((value) => <option key={value} value={value}>{formatRole(value)}</option>)}</select></Field></div><div className="col-12 col-sm-5 d-flex align-items-center"><div className="form-check mt-2"><input id="admin-user-edit-active" type="checkbox" className="form-check-input" checked={editValues.active} disabled={saving || editing.id === currentUser?.id} onChange={(event) => updateEdit("active", event.target.checked)} /><label className="form-check-label" htmlFor="admin-user-edit-active">Active account</label></div></div></div>
          {editing.id === currentUser?.id && <div id="admin-user-self-restriction" className="zen-warning-panel mb-3" role="note">You cannot change your own Role or active state. You may update your name and email.</div>}
          {formError && <div className="zen-error-panel mb-3" role="alert">{formError}</div>}
          <div className="d-flex flex-column flex-sm-row justify-content-between gap-2 mt-4"><button ref={resetTriggerRef} type="button" className="btn btn-outline-danger" disabled={saving || editing.id === currentUser?.id} aria-describedby={editing.id === currentUser?.id ? "admin-user-reset-restriction" : undefined} onClick={openReset}>Reset Initial Password</button><div className="d-flex flex-column flex-sm-row gap-2"><button type="button" className="btn btn-outline-primary" onClick={closeDialog} disabled={saving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving changes..." : "Save changes"}</button></div></div>
          {editing.id === currentUser?.id && <span id="admin-user-reset-restriction" className="visually-hidden">You cannot reset your own password here.</span>}
        </form>
      </DialogShell>}

      {dialog === "reset" && editing && <DialogShell title={`Reset Initial Password for ${editing.fullName}`} description="This User must choose a new password at next Login. All of their existing sessions will end." dialogRef={resetDialogRef} testId="reset-user-dialog">
        <form onSubmit={submitReset} noValidate aria-busy={saving}>
          <Field id="admin-user-initialPassword" label="New Initial Password" hint="Use 10-72 characters with at least one letter and one digit." error={errors.initialPassword}><input id="admin-user-initialPassword" type="password" autoComplete="new-password" className={`form-control${errors.initialPassword ? " is-invalid" : ""}`} value={resetValues.initialPassword} disabled={saving} aria-invalid={Boolean(errors.initialPassword)} onChange={(event) => updateReset("initialPassword", event.target.value)} /></Field>
          <Field id="admin-user-confirmation" label="Confirm Initial Password" error={errors.confirmation}><input id="admin-user-confirmation" type="password" autoComplete="new-password" className={`form-control${errors.confirmation ? " is-invalid" : ""}`} value={resetValues.confirmation} disabled={saving} aria-invalid={Boolean(errors.confirmation)} onChange={(event) => updateReset("confirmation", event.target.value)} /></Field>
          {formError && <div className="zen-error-panel mb-3" role="alert">{formError}</div>}
          <DialogActions busy={saving} cancel={closeResetDialog} submitLabel={saving ? "Resetting password..." : "Confirm Reset"} />
        </form>
      </DialogShell>}
    </section>
  );
}

function DialogActions({ busy, cancel, submitLabel }: { busy: boolean; cancel: () => void; submitLabel: string }) {
  return <div className="d-flex flex-column flex-sm-row justify-content-end gap-2 mt-4"><button type="button" className="btn btn-outline-primary" onClick={cancel} disabled={busy}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{busy && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}{submitLabel}</button></div>;
}

function UserListSkeleton() {
  return <div className="admin-user-skeleton" data-testid="admin-user-skeleton" aria-busy="true" aria-label="Loading Users"><div className="admin-user-table d-none d-md-block zen-card p-3"><div className="queue-skeleton-block mb-3" style={{ height: "2rem" }} /><div className="queue-skeleton-block mb-3" style={{ height: "4rem" }} /><div className="queue-skeleton-block" style={{ height: "4rem" }} /></div><div className="d-md-none d-grid gap-3"><div className="queue-skeleton-block" style={{ height: "9rem" }} /><div className="queue-skeleton-block" style={{ height: "9rem" }} /></div></div>;
}
