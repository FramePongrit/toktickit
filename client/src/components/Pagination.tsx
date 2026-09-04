interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, totalPages, onPageChange }: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mt-3">
      <p className="zen-muted mb-0" data-testid="pagination-summary">
        Showing {first} to {last} of {total} tickets
      </p>

      <nav aria-label="Ticket list pages">
        <ul className="pagination mb-0">
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

          {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => (
            <li key={number} className={`page-item ${number === page ? "active" : ""}`}>
              <button
                type="button"
                className="page-link"
                // Marked for assistive technology as well as visually, so the
                // current page is not signalled by styling alone.
                aria-current={number === page ? "page" : undefined}
                onClick={() => onPageChange(number)}
              >
                {number}
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
