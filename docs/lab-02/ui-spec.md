# Lab 2 UI Specification — Zen Green Theme

**Related documents:** [specification.md](./specification.md) · [api-spec.md](./api-spec.md) · [tests.md](./tests.md)

This document is the visual contract. Screens are checked against it, not against memory. Later labs reuse these rules rather than inventing a new visual system per screen.

---

## 1. Colour tokens

Declared once as CSS custom properties in `client/src/theme.css`, imported in `main.tsx` **after** Bootstrap.

| Token | Value | Used for |
|---|---|---|
| `--zen-primary` | `#006B3C` | Application header, primary buttons, strong emphasis |
| `--zen-secondary` | `#0B7A46` | Active tab, focus accent, links, hover states |
| `--zen-pale` | `#EAF6EF` | Selected rows, success backgrounds, subtle section emphasis |
| `--zen-bg` | `#F5F7F6` | Page background |
| `--zen-surface` | `#FFFFFF` | Cards and surfaces |
| `--zen-border` | `#DDE5E0` | Card and field borders |
| `--zen-text` | `#1B2B23` | Body text — dark charcoal-green, deliberately not pure black |
| `--zen-text-muted` | `#5A6B62` | Secondary and helper text |
| `--zen-readonly-bg` | `#F2F4F1` | Read-only field background — soft gray-green, distinct but readable |
| `--zen-error` | `#A4161A` | Error text and error field borders |
| `--zen-warning` | `#B26A00` | Warning callouts and badges |
| `--zen-success` | `#0B7A46` | Success text, paired with `--zen-pale` background |

**Implementation note that must be verified before relying on it.** The project loads the precompiled `bootstrap.min.css`. Bootstrap 5.3 bakes per-variant button colours into each button class at Sass compile time, so overriding `--bs-primary` alone does **not** recolour `.btn-primary`. The theme must therefore override the component-level variables explicitly:

```css
.btn-primary {
  --bs-btn-bg: var(--zen-primary);
  --bs-btn-border-color: var(--zen-primary);
  --bs-btn-hover-bg: var(--zen-secondary);
  --bs-btn-hover-border-color: var(--zen-secondary);
  --bs-btn-active-bg: var(--zen-secondary);
  --bs-btn-disabled-bg: var(--zen-primary);
}
```

Equivalent explicit overrides are required for `.nav-link.active`, `.form-control:focus`, `a`, `.card`, `.table-hover tbody tr:hover`, and the badge variants. This is verified on one screen before the rest of the UI is built on the assumption.

**Contrast.** `--zen-primary` on white and white on `--zen-primary` both exceed WCAG AA for normal text. `--zen-text-muted` on `--zen-bg` is used only for secondary text at normal size and must be checked, not assumed.

---

## 2. Typography and spacing

- Font: the Bootstrap system font stack, unchanged.
- Page title: `1.75rem`, semibold. Section heading: `1.15rem`, semibold. Body and controls: `1rem`. Helper and validation text: `0.875rem`.
- Vertical rhythm: `0.5rem` between a label and its control, `1.25rem` between form fields, `2rem` between form sections.
- Page container: centred, maximum width `1140px`, `2rem` vertical padding at desktop and `1rem` at mobile.
- Cards: `1.5rem` internal padding, `0.5rem` corner radius, `1px solid var(--zen-border)`, and a restrained shadow — no heavy drop shadows.

---

## 3. Control states

| State | Appearance |
|---|---|
| Editable | White background, `1px solid var(--zen-border)`, `--zen-text` text |
| Read-only | `--zen-readonly-bg` background, same border, same text colour, `readonly` attribute set — clearly distinct from editable but still comfortably readable |
| Focused | `2px` outline in `--zen-secondary` plus a soft box-shadow. Never removed for mouse users, since the same rule must serve keyboard users |
| Invalid | `--zen-error` border, `aria-invalid="true"`, `aria-describedby` pointing at the message element |
| Disabled | Reduced opacity, `not-allowed` cursor, non-interactive |
| Busy | Control disabled, label swapped to the progress wording, spinner shown alongside |

**Required-field marker.** Every required field's label carries a red asterisk with an accessible label. The asterisk marks the field as required; it never substitutes for a validation message (labsheet §8.3).

**Validation message placement.** Directly below the field it concerns, in `--zen-error`, at `0.875rem`. A single error at the top of the form is not acceptable on its own; a summary may accompany the per-field messages but never replace them.

---

## 4. Button hierarchy

| Level | Class | Used for |
|---|---|---|
| Primary | `.btn-primary` on `--zen-primary` | The one main action per screen: Continue, Submit Ticket, Upload |
| Secondary | `.btn-outline-primary` | Supporting actions: Cancel, Clear Filters, Back to My Tickets |
| Tertiary | `.btn-link` | Low-emphasis inline actions |
| Destructive | `.btn-outline-danger` in `--zen-error` | Remove Attachment |
| Disabled | Any of the above, disabled | Unavailable actions |
| Busy | Primary, disabled, spinner + progress label | An action in flight |

Every button contains visible text. Icons may support the text but never replace it. Any icon-only control carries both an accessible label and a tooltip.

---

## 5. Badges

| Badge | Values | Rule |
|---|---|---|
| Requested Priority | LOW, MEDIUM, HIGH, URGENT | Consistent colour ramp from neutral to `--zen-warning` to `--zen-error`, **always with the text label**. Colour is never the only carrier of meaning. |
| Current Status | NEW | `--zen-pale` background with `--zen-secondary` text. |

Priority and status badges use identical geometry — same padding, radius, and font size — across My Tickets and Ticket Detail, so the two screens read as one system.

---

## 6. Application shell

- Header bar in `--zen-primary`, full width, containing the TokTickIT identity on the left, primary navigation in the middle, and the selected Requester on the right.
- Navigation: **My Tickets** and **Create Ticket**. The active page is indicated by an underline and a weight change *in addition to* colour, so the indication does not depend on colour perception.
- Requester display: the selected Requester's full name, with a **Change Requester** action beside it.
- Below 768 px the navigation collapses to a toggle; targets remain at least 44 × 44 px.
- A breadcrumb appears on Ticket Detail: `My Tickets > Ticket Details`.

---

## 7. Screens

### 7.1 Development Requester Selection

A single centred card, maximum width 560 px, on the page background.

Contents, in order:
1. TokTickIT title
2. Heading: "Select Development Requester"
3. Explanatory text: *"Select a Development Requester to test requester-specific ticket behavior. This is not a login screen. Authentication and role-based access will be introduced in Lab 3."*
4. Labelled dropdown, required, listing active Requesters loaded from PostgreSQL, showing full name and department
5. An informational note: "Only active development requesters are shown."
6. A Lab 3 notice panel in `--zen-pale`
7. Actions: **Continue** (primary, disabled until a selection is made) and **Cancel** (secondary)

States:

| State | Presentation |
|---|---|
| Loading | Skeleton or spinner in the dropdown region; Continue disabled |
| Loaded | Dropdown populated, Continue enabled once a Requester is chosen |
| Empty | "No active development requesters found. Run the database seed." Continue stays disabled |
| Failure | Safe error message plus a Retry action; no dropdown shown |

All controls are reachable and operable by keyboard.

### 7.2 Create Ticket

Layout, top to bottom:

1. **System-generated section** — Ticket Number ("Will be generated on submit"), Ticket Date, and Requester, all read-only and visually distinct. The Requester field is populated from the selected Development Requester and cannot be edited.
2. **Classification** — Category, Related System, Requested Priority. Three columns at ≥ 992 px, two at 768–991 px, stacked below 768 px.
3. **Ticket Summary** — full width, single line, required.
4. **Description** — full width, multiline, taller than a single input, vertically resizable only where resizing cannot break the layout, required.
5. **Attachments** — file selection with the permitted types and the 5 MB limit stated *before* the user picks a file, a list of selected files, and per-file validation messages.
6. **Actions** — Submit Ticket (primary) and Cancel (secondary), bottom right at desktop and full width stacked at mobile.

States:

| State | Presentation |
|---|---|
| Initial | Empty editable fields, populated dropdowns, read-only section filled, Submit enabled |
| Validation failure | Per-field messages below each offending field; focus moves to the first invalid field; no API request sent |
| Submitting | Submit disabled with a busy label and spinner; fields remain visible |
| Success | `--zen-pale` panel with a check glyph **and** the text "Ticket TKT-YYYY-NNNNNN created successfully", plus a link to the new ticket and a Create Another action |
| API failure | Safe error message; **every entered value preserved**; Submit re-enabled for retry |
| Invalid attachment | The offending file is listed with a specific reason — wrong type, or too large — and is excluded from submission |

### 7.3 My Tickets

Header row: page title with a one-line description on the left; **Clear Filters** (secondary) and **Create Ticket** (primary) on the right.

Filter bar: a search input with a magnifier affordance and placeholder "Search by ticket number or summary…", then Category, Related System, and Requested Priority selects, each defaulting to an "All …" option. Search is debounced so that typing does not issue a request per keystroke. Four columns at desktop, two at tablet, stacked at mobile.

**Desktop (≥ 768 px): table.** Columns: Ticket No., Created Date, Summary, Category, Related System, Requested Priority, Current Status. Sortable columns carry a sort affordance and an `aria-sort` attribute. The whole row is a link to the detail screen, and Ticket No. is independently focusable for keyboard users.

**Mobile (< 768 px): stacked cards.** Each card shows Ticket No. and Created Date on the first line, the Summary prominently, then Category and Related System, with the Priority and Status badges on the last line. Cards are used rather than a horizontally scrolling table so the page itself never scrolls sideways (D-07).

Footer: "Showing X to Y of N tickets" on the left, page controls on the right, with the current page marked and both `aria-current` and a visible style.

States:

| State | Presentation |
|---|---|
| Loading | Skeleton rows or a spinner in the list region; the filter bar stays interactive |
| Loaded | Table or cards, plus the pagination footer |
| Empty *(no tickets at all)* | "You have not created any tickets yet." plus a Create Ticket action |
| No results *(filters matched nothing)* | "No tickets match your filters." plus **Clear Filters**. Must not imply the Requester has no tickets |
| Failure | Safe error message plus Retry; filters remain set so a retry repeats the same query |

### 7.4 Requester Ticket Detail

Breadcrumb, then a header with the Ticket Number and a **Back to My Tickets** action.

**Ticket information card** — every field read-only with `--zen-readonly-bg`: Ticket No., Ticket Date, Category, Related System, Requester, Requested Priority (badge), Current Status (badge), Summary, Description. Four columns at desktop, two at tablet, stacked at mobile; Summary and Description always span the full width.

The screen must not show Public Comments, Internal Notes, Actions Taken, IT Priority, Ticket Owner, Resolution Summary, or any status-changing control (BR-45).

**Attachment section** — visually separated from the ticket information by its own card and heading, showing "Attachments (n active of 5)".

Per attachment: filename, type, size, upload time, and the available actions.

| Attachment state | Presentation |
|---|---|
| Active | Normal text, **Download** and **Remove** actions available |
| Uploading | Row shown with a progress indicator; actions disabled |
| Invalid | Not added to the list; a message states the specific reason |
| Removed | Greyed text, a "Removed" badge, the removal reason and time shown, **no Download and no Remove action, and no preview** |
| None | "No attachments on this ticket." rather than an empty region |

Upload control: disabled with an explanatory note once 5 active attachments exist. Removal opens a confirmation dialog requiring a reason of 3–200 characters; Confirm stays disabled until the reason is valid.

---

## 8. Responsive rules

| Viewport | Behaviour |
|---|---|
| Desktop ≥ 992 px | Multi-column layouts as specified; content centred with a maximum width |
| Tablet 768–991 px | Two columns where practical; Summary and Description keep full width |
| Mobile < 768 px | Everything stacks; touch targets ≥ 44 px; ticket list becomes cards; **no horizontal page scrolling** |
| All sizes | No clipped labels, no overlapping messages, no hidden buttons, no unreadable attachment filenames — long filenames truncate with an ellipsis and expose the full name on hover and to assistive technology |

---

## 9. Accessibility

- Every input has a `<label>` associated by `htmlFor`/`id`. Placeholders are never used as labels.
- Invalid fields set `aria-invalid="true"` and reference their message with `aria-describedby`.
- Async regions that update in place announce themselves with `aria-live="polite"`; errors use `aria-live="assertive"`.
- Focus is visible on every interactive element and is never suppressed.
- The removal dialog traps focus, returns focus to the trigger on close, and closes on Escape.
- No information is conveyed by colour alone: badges carry text, success carries a glyph and text, and validation carries a message rather than only a red border.
- Sortable table headers expose `aria-sort`.

---

## 10. Visual inspection checklist

Performed at 1440 × 900, 820 × 1024, and 390 × 844 against the screenshots in `artifacts/lab-02/screenshots/`, comparing against this document rather than from memory.

- [ ] Header uses `--zen-primary`; primary buttons use `--zen-primary` and hover to `--zen-secondary`
- [ ] Page background is `--zen-bg`; cards are white with a subtle border and restrained shadow
- [ ] Body text is dark charcoal-green, not pure black
- [ ] Editable fields are white with a neutral border; read-only fields are visibly distinct yet readable
- [ ] Required fields show a red asterisk **and** produce a validation message when empty
- [ ] Validation messages appear directly below their field in dark red
- [ ] Button hierarchy is consistent: exactly one primary action per screen
- [ ] Submit shows a busy state and is disabled while in flight
- [ ] Success states use text and a glyph, not colour alone
- [ ] Priority and Status badges are geometrically identical across screens
- [ ] Empty state and no-results state are visibly and textually different
- [ ] Removed attachments are greyed, show their reason, and expose no download or preview affordance
- [ ] Focus indicators are visible on every control at every breakpoint
- [ ] No clipping, no overlap, no hidden buttons at any of the three widths
- [ ] No horizontal page scrolling below 768 px
- [ ] Filters, pagination, and attachment controls remain usable at every viewport
- [ ] Long attachment filenames truncate rather than overflow

## 11. Screenshot paths

```
artifacts/lab-02/screenshots/
├── create-ticket/     initial · validation-failure · submitting · success · api-failure · invalid-attachment · desktop · tablet · mobile
├── my-tickets/        loaded · search · filtered · sorted · paginated · empty · no-results · failure · desktop · tablet · mobile
└── ticket-detail/     loaded · attachment-active · attachment-removed · remove-dialog · desktop · tablet · mobile
```
