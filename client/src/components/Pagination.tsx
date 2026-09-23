interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

type PageItem = number | "ellipsis-start" | "ellipsis-end";

/** Keep the control strip bounded on small screens even when there are many pages. */
function pageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "ellipsis-end", totalPages];
  if (page >= totalPages - 3) {
    return [1, "ellipsis-start", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "ellipsis-start", page - 1, page, page + 1, "ellipsis-end", totalPages];
}

export function Pagination({ page, pageSize, total, totalPages, onPageChange }: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mt-3">
      <p className="zen-muted mb-0" data-testid="pagination-summary">
        Showing {first} to {last} of {total} tickets
      </p>

      <nav aria-label="Ticket list pages" className="zen-pagination-nav" data-pagination-windowed="true">
        <ul className="pagination mb-0 flex-wrap gap-1">
          <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
            <button
              type="button"
              className="page-link"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              Previous
            </button>
          </li>

          {pageItems(page, totalPages).map((item) => item === "ellipsis-start" || item === "ellipsis-end" ? (
            <li key={item} className="page-item" aria-hidden="true">
              <span className="page-link">…</span>
            </li>
          ) : (
            <li key={item} className={`page-item ${item === page ? "active" : ""}`}>
              <button
                type="button"
                className="page-link"
                // Marked for assistive technology as well as visually, so the
                // current page is not signalled by styling alone.
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPageChange(item)}
              >
                {item}
              </button>
            </li>
          ))}

          <li className={`page-item ${page >= totalPages ? "disabled" : ""}`}>
            <button
              type="button"
              className="page-link"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
