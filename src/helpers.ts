import { Duration, Interval, StartMode } from './interval';

export type PollPredicate = () => boolean;
export type PollPredicateAsync = () => Promise<boolean>;

/**
 * Repeatedly evaluates a predicate function at a defined interval until it resolves to `true` or the timeout is reached.
 *
 * @param {PollPredicate | PollPredicateAsync} predicate - The function to evaluate. Can be synchronous or asynchronous.
 * @param {Duration} timeout - The duration for which the polling continues.
 * @param {StartMode} [start='delayed'] - Determines when the polling interval starts. Default is 'delayed'.
 * @return {Promise<void>} A promise that resolves when the predicate returns `true` or rejects if an error occurs in the process.
 */
export function poll(
    predicate: PollPredicate | PollPredicateAsync,
    timeout: Duration,
    start: StartMode = 'delayed',
): Promise<void> {
    return new Promise((resolve, reject) => {
        const interval = new Interval({
            start,
            time: timeout,
            func: () => {
                return Promise.resolve(predicate()).then((out) => {
                    if (out === true) {
                        return true;
                    }

                    resolve();

                    return false;
                });
            },
            onError: reject,
        });

        interval.start();
    });
}

export type UntilPredicate<T> = () => T;
export type UntilPredicateAsync<T> = () => Promise<T>;

/**
 * Executes a polling mechanism that repeatedly checks a predicate until it resolves to a defined value or a timeout occurs.
 *
 * @param {UntilPredicate<T> | UntilPredicateAsync<T>} predicate - A function or asynchronous function that evaluates the condition to be met. The function should return the desired value once the condition is met or undefined if the condition is not met yet.
 * @param {Duration} timeout - The maximum duration for which the polling should continue before timing out.
 * @param {StartMode} [start='delayed'] - Determines whether the polling starts immediately or with a delay. Defaults to 'delayed'.
 * @return {Promise<T>} A promise that resolves with the value returned by the predicate when its condition is met or rejects if an error occurs.
 */
export function until<T>(
    predicate: UntilPredicate<T> | UntilPredicateAsync<T>,
    timeout: Duration,
    start: StartMode = 'delayed',
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const interval = new Interval({
            start,
            time: timeout,
            func: () => {
                return Promise.resolve(predicate()).then((out: T) => {
                    // if result is not available, continue polling
                    if (typeof out === 'undefined') {
                        return true;
                    }

                    // when result finally is available, stop polling
                    resolve(out);

                    return false;
                });
            },
            onError: reject,
        });

        interval.start();
    });
}

export type TimesPredicate = (counter: number) => void;
export type TimesPredicateAsync = (counter: number) => Promise<void>;

/**
 * Executes a function a specified number of times with a delay between executions.
 *
 * @param {TimesPredicate | TimesPredicateAsync} predicate - A synchronous or asynchronous function
 * to be executed on each iteration. The function receives the current iteration count as an argument.
 * @param {number} amount - The number of times the predicate should be executed. If set to a value less than 0,
 * the method resolves immediately without performing any executions.
 * @param {Duration} timeout - The delay duration between consecutive executions of the predicate.
 * @param {StartMode} [start='delayed'] - Determines how the interval should begin. Defaults to `'delayed'`,
 * which starts the timeout before the first execution.
 * @return {Promise<void>} Resolves when the predicate has been executed the specified number of times
 * or if the specified amount is less than 0. Rejects if an error occurs during predicate execution.
 */
export function times(
    predicate: TimesPredicate | TimesPredicateAsync,
    amount: number,
    timeout: Duration,
    start: StartMode = 'delayed',
): Promise<void> {
    if (amount < 0) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const interval = new Interval({
            start,
            time: timeout,
            func: (counter) => {
                if (counter > amount) {
                    resolve();

                    return Promise.resolve(false);
                }

                return Promise.resolve(predicate(counter)).then(() => true);
            },
            onError: reject,
        });

        interval.start();
    });
}

export type RetryPredicate<T> = () => T;
export type RetryPredicateAsync<T> = () => Promise<T>;
const ERR_ATTEMPT_LIMIT_EXCEEDED = 'Attempt limit exceeded';

/**
 * Executes a retry mechanism for a specified predicate function until it succeeds,
 * the maximum number of attempts is reached, or the timeout is hit.
 *
 * @param predicate - A synchronous or asynchronous predicate function that determines when the retry operation is successful.
 * @param attempts - The maximum number of retry attempts before giving up.
 * @param timeout - The timeout duration between each retry attempt.
 * @param start - The start mode for the retry interval ('immediate' or 'delayed').
 * @return {Promise<T>} A promise that resolves with the result from the predicate function if successful within the configured attempts and timeout. Rejects if the retry attempts are exhausted or another error occurs.
 */
export function retry<T>(
    predicate: RetryPredicate<T> | RetryPredicateAsync<T>,
    attempts: number,
    timeout: Duration,
    start: StartMode = 'delayed',
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const interval = new Interval({
            start,
            time: timeout,
            func: (counter) => {
                if (counter > attempts) {
                    return Promise.reject(new Error(ERR_ATTEMPT_LIMIT_EXCEEDED));
                }

                return Promise.resolve(predicate()).then((out: T) => {
                    // if result is not available, continue polling
                    if (typeof out === 'undefined') {
                        return true;
                    }

                    // when result finally is available, stop polling
                    resolve(out);

                    return false;
                });
            },
            onError: reject,
        });

        interval.start();
    });
}

export type PipelinePredicate = (data: any) => void;
export type PipelinePredicateAsync = (data: any) => Promise<void>;

/**
 * Executes an array of predicates or asynchronous predicates sequentially with an optional timeout between executions.
 *
 * @param {Array<PipelinePredicate | PipelinePredicateAsync>} predicates - A sequence of functions to be executed in order. Each function can be synchronous or asynchronous.
 * @param {Duration} timeout - A duration or a function that determines the timeout between consecutive executions. If it's a constant value, it applies the same timeout for all steps. If it's a function, it receives the execution counter and defines a dynamic timeout.
 * @return {Promise<any>} A promise that resolves with the final output after all predicates have been executed, or resolves immediately if no predicates are provided.
 */
export function pipeline(
    predicates: Array<PipelinePredicate | PipelinePredicateAsync>,
    timeout: Duration,
): Promise<any> {
    if (!Array.isArray(predicates)) {
        throw new TypeError(`Expected "predicates" to by an array, but got ${typeof predicates}`);
    }

    if (!predicates.length) {
        return Promise.resolve();
    }

    const timeoutFn: Duration =
        typeof timeout === 'function'
            ? timeout
            : (counter) => {
                  // start immediately for the first call
                  return counter > 1 ? (timeout as number) : 0;
              };

    return new Promise((resolve, reject) => {
        const steps = predicates.slice();
        let data: any = undefined;

        const interval = new Interval({
            time: timeoutFn,
            func: () => {
                const step = steps.shift();

                if (!step) {
                    return Promise.resolve(false).finally(() => resolve(data));
                }

                return Promise.resolve(step(data)).then((out) => (data = out));
            },
            onError: reject,
        });

        interval.start();
    });
}

/**
 * Pauses the execution of code for a specified amount of time.
 *
 * @param {number} time - The duration to sleep in milliseconds.
 * @return {Promise<void>} A promise that resolves after the specified duration.
 */
export function sleep(time: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}
