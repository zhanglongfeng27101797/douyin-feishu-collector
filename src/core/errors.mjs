export class CollectorError extends Error {
  constructor(message, { code = "collector_error", retryable = true, cause } = {}) {
    super(message, { cause });
    this.name = "CollectorError";
    this.code = code;
    this.retryable = retryable;
  }
}
