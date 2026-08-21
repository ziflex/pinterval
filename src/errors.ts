/** An operation was cancelled before it could complete. */
export class AbortError extends Error {
    constructor(message = 'The operation was aborted') {
        super(message);
        this.name = 'AbortError';
    }
}

/** An operation exceeded its configured lifetime. */
export class TimeoutError extends Error {
    constructor(message = 'The operation timed out') {
        super(message);
        this.name = 'TimeoutError';
    }
}
