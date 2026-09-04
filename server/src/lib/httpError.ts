export interface FieldIssue {
  field: string;
  message: string;
}

/**
 * Every deliberate failure is thrown as an HttpError so that one error handler
 * can render it. `code` is the machine-readable identifier documented in
 * docs/lab-02/api-spec.md §8; `message` is safe to show an end user and must
 * never carry a stack trace, SQL, or a file path (BR-27).
 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: FieldIssue[];

  constructor(status: number, code: string, message: string, details?: FieldIssue[]) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(code: string, message: string, details?: FieldIssue[]) {
    return new HttpError(400, code, message, details);
  }

  static validationFailed(message: string, details: FieldIssue[]) {
    return new HttpError(400, "VALIDATION_FAILED", message, details);
  }

  static unauthorized(code: string, message: string) {
    return new HttpError(401, code, message);
  }

  static forbidden(code: string, message: string) {
    return new HttpError(403, code, message);
  }

  static notFound(code: string, message: string) {
    return new HttpError(404, code, message);
  }

  static conflict(code: string, message: string) {
    return new HttpError(409, code, message);
  }

  static gone(code: string, message: string) {
    return new HttpError(410, code, message);
  }
}
