import { createCancellationScope, getAbortReason } from './cancellation';
import { Duration, Interval, StartMode } from './interval';

export interface HelperOptions {
    /** Delay between executions, in milliseconds or as a counter-based duration function. */
    time: Duration;

    /** Determines whether the first execution is immediate or delayed. Defaults to `immediate`. */
    start?: StartMode;

    /** An optional external cancellation signal. */
    signal?: AbortSignal;

    /** Maximum total operation lifetime in milliseconds. */
    timeout?: number;
}

export interface RetryOptions extends HelperOptions {
    /** Maximum number of attempts. */
    attempts: number;
}

export interface TimesOptions extends HelperOptions {
    /** Number of times to execute the predicate. */
    amount: number;
}

export interface SleepOptions {
    /** An optional external cancellation signal. */
    signal?: AbortSignal;
}

interface NormalizedHelperOptions extends HelperOptions {
    start: StartMode;
}

type Complete<T> = (value: T) => void;
type FiniteIntervalFunction<T> = (counter: number, complete: Complete<T>) => boolean | void | Promise<boolean | void>;

function normalizeHelperOptions(timeOrOptions: Duration | HelperOptions, start: StartMode): NormalizedHelperOptions {
    if (typeof timeOrOptions === 'number' || typeof timeOrOptions === 'function') {
        return {
            time: timeOrOptions,
            start,
        };
    }

    return {
        ...timeOrOptions,
        start: timeOrOptions.start ?? 'immediate',
    };
}

function normalizeRetryOptions(
    attemptsOrOptions: number | RetryOptions,
    time: Duration | undefined,
    start: StartMode,
): NormalizedHelperOptions & Pick<RetryOptions, 'attempts'> {
    if (typeof attemptsOrOptions === 'number') {
        return {
            attempts: attemptsOrOptions,
            time: time as Duration,
            start,
        };
    }

    return {
        ...attemptsOrOptions,
        start: attemptsOrOptions.start ?? 'immediate',
    };
}

function normalizeTimesOptions(
    amountOrOptions: number | TimesOptions,
    time: Duration | undefined,
    start: StartMode,
): NormalizedHelperOptions & Pick<TimesOptions, 'amount'> {
    if (typeof amountOrOptions === 'number') {
        return {
            amount: amountOrOptions,
            time: time as Duration,
            start,
        };
    }

    return {
        ...amountOrOptions,
        start: amountOrOptions.start ?? 'immediate',
    };
}

function resolveImmediately<T>(value: T, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
        return Promise.reject(getAbortReason(signal));
    }

    return Promise.resolve(value);
}

function runFiniteInterval<T>(options: NormalizedHelperOptions, func: FiniteIntervalFunction<T>): Promise<T> {
    const cancellation = createCancellationScope(options.signal, options.timeout);
    const signal = cancellation.signal;

    if (signal?.aborted) {
        const reason = getAbortReason(signal);
        cancellation.dispose();

        return Promise.reject(reason);
    }

    return new Promise<T>((resolve, reject) => {
        let interval: Interval | undefined;
        let settled = false;
        let removeAbortHandler = (): void => undefined;

        const settle = (callback: () => void): void => {
            if (settled) {
                return;
            }

            settled = true;
            interval?.stop();
            removeAbortHandler();
            cancellation.dispose();
            callback();
        };

        const complete: Complete<T> = (value) => settle(() => resolve(value));
        const fail = (err: unknown): void => settle(() => reject(err));

        try {
            interval = new Interval({
                start: options.start,
                time: options.time,
                signal,
                func: async (counter) => func(counter, complete),
                onError: fail,
            });

            if (signal != null) {
                const handleAbort = (): void => fail(getAbortReason(signal));

                signal.addEventListener('abort', handleAbort, { once: true });
                removeAbortHandler = (): void => signal.removeEventListener('abort', handleAbort);
            }

            interval.start();
        } catch (err) {
            fail(err);
        }
    });
}

export type PollPredicate = () => boolean;
export type PollPredicateAsync = () => Promise<boolean>;

/**
 * Repeatedly evaluates a predicate while it resolves to `true`, completing when it resolves to `false`.
 */
export function poll(predicate: PollPredicate | PollPredicateAsync, time: Duration, start?: StartMode): Promise<void>;
export function poll(predicate: PollPredicate | PollPredicateAsync, options: HelperOptions): Promise<void>;
export function poll(
    predicate: PollPredicate | PollPredicateAsync,
    timeOrOptions: Duration | HelperOptions,
    start: StartMode = 'immediate',
): Promise<void> {
    const options = normalizeHelperOptions(timeOrOptions, start);

    return runFiniteInterval<void>(options, async (_counter, complete) => {
        const out = await predicate();

        if (out === true) {
            return true;
        }

        complete(undefined);

        return false;
    });
}

export type UntilPredicate<T> = () => T;
export type UntilPredicateAsync<T> = () => Promise<T>;

/**
 * Repeatedly evaluates a predicate until it resolves to a defined value.
 */
export function until<T>(
    predicate: UntilPredicate<T> | UntilPredicateAsync<T>,
    time: Duration,
    start?: StartMode,
): Promise<T>;
export function until<T>(predicate: UntilPredicate<T> | UntilPredicateAsync<T>, options: HelperOptions): Promise<T>;
export function until<T>(
    predicate: UntilPredicate<T> | UntilPredicateAsync<T>,
    timeOrOptions: Duration | HelperOptions,
    start: StartMode = 'immediate',
): Promise<T> {
    const options = normalizeHelperOptions(timeOrOptions, start);

    return runFiniteInterval<T>(options, async (_counter, complete) => {
        const out = await predicate();

        if (typeof out === 'undefined') {
            return true;
        }

        complete(out);

        return false;
    });
}

export type TimesPredicate = (counter: number) => void;
export type TimesPredicateAsync = (counter: number) => Promise<void>;

/**
 * Executes a function a specified number of times with a delay between executions.
 */
export function times(
    predicate: TimesPredicate | TimesPredicateAsync,
    amount: number,
    time: Duration,
    start?: StartMode,
): Promise<void>;
export function times(predicate: TimesPredicate | TimesPredicateAsync, options: TimesOptions): Promise<void>;
export function times(
    predicate: TimesPredicate | TimesPredicateAsync,
    amountOrOptions: number | TimesOptions,
    time?: Duration,
    start: StartMode = 'immediate',
): Promise<void> {
    const options = normalizeTimesOptions(amountOrOptions, time, start);

    if (options.amount < 0) {
        return resolveImmediately(undefined, options.signal);
    }

    return runFiniteInterval<void>(options, async (counter, complete) => {
        if (counter > options.amount) {
            complete(undefined);

            return false;
        }

        await predicate(counter);

        return true;
    });
}

export type RetryPredicate<T> = (attempt: number) => T;
export type RetryPredicateAsync<T> = (attempt: number) => Promise<T>;
const ERR_ATTEMPT_LIMIT_EXCEEDED = 'Attempt limit exceeded';

/**
 * Retries a predicate until it returns a defined value or the attempt limit is exceeded.
 */
export function retry<T>(
    predicate: RetryPredicate<T> | RetryPredicateAsync<T>,
    attempts: number,
    time: Duration,
    start?: StartMode,
): Promise<T>;
export function retry<T>(predicate: RetryPredicate<T> | RetryPredicateAsync<T>, options: RetryOptions): Promise<T>;
export function retry<T>(
    predicate: RetryPredicate<T> | RetryPredicateAsync<T>,
    attemptsOrOptions: number | RetryOptions,
    time?: Duration,
    start: StartMode = 'immediate',
): Promise<T> {
    const options = normalizeRetryOptions(attemptsOrOptions, time, start);

    return runFiniteInterval<T>(options, async (counter, complete) => {
        if (counter > options.attempts) {
            throw new Error(ERR_ATTEMPT_LIMIT_EXCEEDED);
        }

        const out = await predicate(counter);

        if (typeof out === 'undefined') {
            return true;
        }

        complete(out);

        return false;
    });
}

export type PipelinePredicate = (data: any) => void;
export type PipelinePredicateAsync = (data: any) => Promise<void>;

/**
 * Executes an array of predicates sequentially with a delay between executions.
 */
export function pipeline(
    predicates: Array<PipelinePredicate | PipelinePredicateAsync>,
    time: Duration,
    start?: StartMode,
): Promise<any>;
export function pipeline(
    predicates: Array<PipelinePredicate | PipelinePredicateAsync>,
    options: HelperOptions,
): Promise<any>;
export function pipeline(
    predicates: Array<PipelinePredicate | PipelinePredicateAsync>,
    timeOrOptions: Duration | HelperOptions,
    start: StartMode = 'immediate',
): Promise<any> {
    if (!Array.isArray(predicates)) {
        throw new TypeError(`Expected "predicates" to by an array, but got ${typeof predicates}`);
    }

    const options = normalizeHelperOptions(timeOrOptions, start);

    if (!predicates.length) {
        return resolveImmediately(undefined, options.signal);
    }

    const steps = predicates.slice();
    let data: any = undefined;

    return runFiniteInterval<any>(options, async (_counter, complete) => {
        const step = steps.shift();

        if (!step) {
            complete(data);

            return false;
        }

        data = await step(data);

        return true;
    });
}

/**
 * Pauses execution for a specified amount of time.
 *
 * If a signal is provided, aborting it clears the pending timer and rejects with the signal's reason.
 */
export function sleep(time: number, options: SleepOptions = {}): Promise<void> {
    const { signal } = options;

    if (signal?.aborted) {
        return Promise.reject(getAbortReason(signal));
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;

        const cleanup = (): void => {
            if (typeof timer !== 'undefined') {
                clearTimeout(timer);
                timer = undefined;
            }

            signal?.removeEventListener('abort', handleAbort);
        };

        const finish = (callback: () => void): void => {
            if (settled) {
                return;
            }

            settled = true;
            cleanup();
            callback();
        };

        function handleAbort(): void {
            if (signal != null) {
                finish(() => reject(getAbortReason(signal)));
            }
        }

        signal?.addEventListener('abort', handleAbort, { once: true });
        timer = setTimeout(() => finish(resolve), time);
    });
}
