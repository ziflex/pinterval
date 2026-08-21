import { createCancellationScope, getAbortReason } from './cancellation';
import type { Duration } from './duration';
import { Interval, IntervalContext, StartMode } from './interval';

/** Shared scheduling and lifecycle options for finite helpers. */
export interface ExecutionOptions {
    /** Delay between executions, in milliseconds or as a counter-based duration function. */
    time: Duration;

    /** Determines whether the first execution is immediate or delayed. Defaults to `immediate`. */
    start?: StartMode;

    /** An optional external cancellation signal. */
    signal?: AbortSignal;

    /** Maximum total operation lifetime in milliseconds. */
    timeout?: number;
}

/** @deprecated Use {@link ExecutionOptions}. */
export type HelperOptions = ExecutionOptions;

/** Accepts or rejects a value produced by {@link until}. */
export type UntilCondition<T> = (value: T, context: IntervalContext) => boolean | Promise<boolean>;

export interface UntilOptions<T> extends ExecutionOptions {
    /** Determines whether a returned value completes the helper. */
    predicate: UntilCondition<T>;
}

export interface RetryContext {
    /** The current attempt number, starting at 1. */
    readonly attempt: number;

    /** Wall-clock milliseconds since the retry operation started. */
    readonly elapsed: number;

    /** The effective signal, including external cancellation and the overall timeout. */
    readonly signal: AbortSignal;
}

/** Controls whether a failed operation should be retried. `false` stops; `true` or `void` continues. */
export type RetryDecision = boolean | void;
/** Runs after a retryable failure and before the retry delay, optionally deciding whether retrying should proceed. */
export type OnRetry = (error: unknown, context: RetryContext) => RetryDecision | Promise<RetryDecision>;

export interface RetryOptions extends ExecutionOptions {
    /** Maximum total number of executions. Must be a positive integer. */
    attempts: number;

    /** Runs after a retryable failure and before the next delay. Only `false` stops retrying. */
    onRetry?: OnRetry;
}

export interface TimesOptions extends ExecutionOptions {
    /** Number of times to execute the operation. Must be a non-negative integer. */
    amount: number;
}

export interface SleepOptions {
    /** An optional external cancellation signal. */
    signal?: AbortSignal;
}

interface NormalizedExecutionOptions extends ExecutionOptions {
    start: StartMode;
}

interface NormalizedUntilOptions<T> extends NormalizedExecutionOptions {
    predicate: UntilCondition<T>;
}

interface NormalizedRetryOptions extends NormalizedExecutionOptions {
    attempts: number;
    onRetry?: OnRetry;
}

interface NormalizedTimesOptions extends NormalizedExecutionOptions {
    amount: number;
}

type Complete<T> = (value: T) => void;
type FiniteIntervalFunction<T> = (
    context: IntervalContext,
    complete: Complete<T>,
) => boolean | void | Promise<boolean | void>;

function normalizeExecutionOptions(
    timeOrOptions: Duration | ExecutionOptions,
    start: StartMode,
): NormalizedExecutionOptions {
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

function normalizeUntilOptions<T>(
    predicateOrOptions: UntilCondition<T> | UntilOptions<T>,
    time: Duration | undefined,
    start: StartMode,
): NormalizedUntilOptions<T> {
    if (typeof predicateOrOptions === 'function') {
        return {
            predicate: predicateOrOptions,
            time: time as Duration,
            start,
        };
    }

    return {
        ...predicateOrOptions,
        start: predicateOrOptions.start ?? 'immediate',
    };
}

function normalizeRetryOptions(
    attemptsOrOptions: number | RetryOptions,
    time: Duration | undefined,
    start: StartMode,
): NormalizedRetryOptions {
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
): NormalizedTimesOptions {
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

function runFiniteInterval<T>(options: NormalizedExecutionOptions, func: FiniteIntervalFunction<T>): Promise<T> {
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
                func: async (context) => func(context, complete),
                onError: fail,
            });

            if (signal != null) {
                const handleAbort = (): void => fail(getAbortReason(signal));

                signal.addEventListener('abort', handleAbort, { once: true });
                removeAbortHandler = (): void => signal.removeEventListener('abort', handleAbort);
            }

            interval.start();
            void interval.done.catch(fail);
        } catch (err) {
            fail(err);
        }
    });
}

/** Produces `true` when polling should complete and `false` when it should continue. */
export type PollCondition = (context: IntervalContext) => boolean | Promise<boolean>;
/** @deprecated Use {@link PollCondition}. */
export type PollPredicate = (context: IntervalContext) => boolean;
/** @deprecated Use {@link PollCondition}. */
export type PollPredicateAsync = (context: IntervalContext) => Promise<boolean>;

/**
 * Repeatedly evaluates a condition until it resolves to `true`. Condition errors propagate unchanged.
 */
export function poll(condition: PollCondition, time: Duration, start?: StartMode): Promise<void>;
export function poll(condition: PollCondition, options: ExecutionOptions): Promise<void>;
export function poll(
    condition: PollCondition,
    timeOrOptions: Duration | ExecutionOptions,
    start: StartMode = 'immediate',
): Promise<void> {
    const options = normalizeExecutionOptions(timeOrOptions, start);

    return runFiniteInterval<void>(options, async (context, complete) => {
        const satisfied = await condition(context);

        if (context.signal.aborted) {
            return false;
        }

        if (satisfied) {
            complete(undefined);

            return false;
        }

        return true;
    });
}

/** Produces the next value for {@link until} to inspect. */
export type UntilSource<T> = (context: IntervalContext) => T | Promise<T>;
/** @deprecated Use {@link UntilSource}. */
export type UntilPredicate<T> = (context: IntervalContext) => T;
/** @deprecated Use {@link UntilSource}. */
export type UntilPredicateAsync<T> = (context: IntervalContext) => Promise<T>;

/**
 * Repeatedly evaluates a source until its result is accepted by a predicate.
 *
 * Every returned value, including `undefined` and other falsy values, is passed to the predicate. Source and predicate
 * errors propagate unchanged.
 */
export function until<T>(
    source: UntilSource<T>,
    predicate: UntilCondition<T>,
    time: Duration,
    start?: StartMode,
): Promise<T>;
export function until<T>(source: UntilSource<T>, options: UntilOptions<T>): Promise<T>;
export function until<T>(
    source: UntilSource<T>,
    predicateOrOptions: UntilCondition<T> | UntilOptions<T>,
    time?: Duration,
    start: StartMode = 'immediate',
): Promise<T> {
    const options = normalizeUntilOptions(predicateOrOptions, time, start);

    return runFiniteInterval<T>(options, async (context, complete) => {
        const value = await source(context);

        if (context.signal.aborted) {
            return false;
        }

        const satisfied = await options.predicate(value, context);

        if (context.signal.aborted) {
            return false;
        }

        if (satisfied) {
            complete(value);

            return false;
        }

        return true;
    });
}

/** Performs one sequential execution for {@link times}. */
export type TimesOperation = (context: IntervalContext) => void | Promise<void>;
/** @deprecated Use {@link TimesOperation}. */
export type TimesPredicate = (context: IntervalContext) => void;
/** @deprecated Use {@link TimesOperation}. */
export type TimesPredicateAsync = (context: IntervalContext) => Promise<void>;

/**
 * Executes an operation sequentially a specified number of times with a delay between executions.
 */
export function times(operation: TimesOperation, amount: number, time: Duration, start?: StartMode): Promise<void>;
export function times(operation: TimesOperation, options: TimesOptions): Promise<void>;
export function times(
    operation: TimesOperation,
    amountOrOptions: number | TimesOptions,
    time?: Duration,
    start: StartMode = 'immediate',
): Promise<void> {
    const options = normalizeTimesOptions(amountOrOptions, time, start);

    if (!Number.isInteger(options.amount) || options.amount < 0) {
        return Promise.reject(new RangeError('"amount" must be a non-negative integer'));
    }

    if (options.amount === 0) {
        return resolveImmediately(undefined, options.signal);
    }

    return runFiniteInterval<void>(options, async (context, complete) => {
        await operation(context);

        if (context.signal.aborted) {
            return false;
        }

        if (context.iteration === options.amount) {
            complete(undefined);

            return false;
        }

        return true;
    });
}

/** Performs one execution for {@link retry}. Any normal return value is successful. */
export type RetryOperation<T> = (context: RetryContext) => T | Promise<T>;
/** @deprecated Use {@link RetryOperation}. */
export type RetryPredicate<T> = (context: RetryContext) => T;
/** @deprecated Use {@link RetryOperation}. */
export type RetryPredicateAsync<T> = (context: RetryContext) => Promise<T>;

/**
 * Repeatedly executes an operation while it throws or rejects.
 *
 * `attempts` is the maximum total execution count. Any normal return value is successful, and exhaustion rejects with
 * the final operation error unchanged. For failures eligible for another attempt, `onRetry` runs before the retry delay;
 * return `false` to reject with that operation error, or return `true` or `void` to continue.
 */
export function retry<T>(operation: RetryOperation<T>, attempts: number, time: Duration, start?: StartMode): Promise<T>;
export function retry<T>(operation: RetryOperation<T>, options: RetryOptions): Promise<T>;
export function retry<T>(
    operation: RetryOperation<T>,
    attemptsOrOptions: number | RetryOptions,
    time?: Duration,
    start: StartMode = 'immediate',
): Promise<T> {
    const options = normalizeRetryOptions(attemptsOrOptions, time, start);

    if (!Number.isInteger(options.attempts) || options.attempts < 1) {
        return Promise.reject(new RangeError('"attempts" must be a positive integer'));
    }

    return runFiniteInterval<T>(options, async (context, complete) => {
        const retryContext: RetryContext = {
            attempt: context.iteration,
            elapsed: context.elapsed,
            signal: context.signal,
        };

        let value: T;

        try {
            value = await operation(retryContext);
        } catch (error) {
            if (context.signal.aborted) {
                return false;
            }

            if (retryContext.attempt === options.attempts) {
                throw error;
            }

            const decision = await options.onRetry?.(error, retryContext);

            if (context.signal.aborted) {
                return false;
            }

            if (decision === false) {
                throw error;
            }

            return true;
        }

        if (context.signal.aborted) {
            return false;
        }

        complete(value);

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
    options: ExecutionOptions,
): Promise<any>;
export function pipeline(
    predicates: Array<PipelinePredicate | PipelinePredicateAsync>,
    timeOrOptions: Duration | ExecutionOptions,
    start: StartMode = 'immediate',
): Promise<any> {
    if (!Array.isArray(predicates)) {
        throw new TypeError(`Expected "predicates" to by an array, but got ${typeof predicates}`);
    }

    const options = normalizeExecutionOptions(timeOrOptions, start);

    if (!predicates.length) {
        return resolveImmediately(undefined, options.signal);
    }

    const steps = predicates.slice();
    let data: any = undefined;

    return runFiniteInterval<any>(options, async (_context, complete) => {
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
