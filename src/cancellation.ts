export interface CancellationScope {
    readonly signal?: AbortSignal;
    dispose(): void;
}

export function getAbortReason(signal: AbortSignal): unknown {
    return typeof signal.reason === 'undefined'
        ? new DOMException('The operation was aborted', 'AbortError')
        : signal.reason;
}

function createTimeoutError(): DOMException {
    return new DOMException('The operation timed out', 'TimeoutError');
}

export function createCancellationScope(signal?: AbortSignal, timeout?: number): CancellationScope {
    if (typeof timeout === 'undefined') {
        return {
            signal,
            dispose: () => undefined,
        };
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let listening = false;
    let disposed = false;

    const dispose = (): void => {
        if (disposed) {
            return;
        }

        disposed = true;

        if (typeof timer !== 'undefined') {
            clearTimeout(timer);
            timer = undefined;
        }

        if (signal != null && listening) {
            signal.removeEventListener('abort', handleExternalAbort);
            listening = false;
        }
    };

    const abort = (reason: unknown): void => {
        if (controller.signal.aborted) {
            return;
        }

        dispose();
        controller.abort(reason);
    };

    function handleExternalAbort(): void {
        if (signal != null) {
            abort(getAbortReason(signal));
        }
    }

    if (signal?.aborted) {
        abort(getAbortReason(signal));
    } else {
        if (signal != null) {
            signal.addEventListener('abort', handleExternalAbort, { once: true });
            listening = true;
        }

        timer = setTimeout(() => abort(createTimeoutError()), timeout);
    }

    return {
        signal: controller.signal,
        dispose,
    };
}
