import { Duration, Interval, StartMode } from './interval';

export type PollPredicate = () => boolean;
export type PollPredicateAsync = () => Promise<boolean>;

/**
 * Repeatedly evaluates a predicate function at a defined interval until it resolves to `true` or the timeout is reached.
 *
 * @param {PollPredicate | PollPredicateAsync} predicate - The function to evaluate. Can be synchronous or asynchronous.
 * @param {Duration} timeout - The duration for which the polling continues.
 * @param {StartMode} [start='immediate'] - Determines when the polling interval starts. Default is 'immediate'.
 * @return {Promise<void>} A promise that resolves when the predicate returns `true` or rejects if an error occurs in the process.
 */
export function poll(
    predicate: PollPredicate | PollPredicateAsync,
    timeout: Duration,
    start: StartMode = 'immediate',
): Promise<void> {
    return new Promise((resolve, reject) => {
        const interval = new Interval({
            start,
            time: timeout,
            func: async () => {
                const out = await predicate();

                if (out === true) {
                    return true;
                }

                resolve();

                return false;
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
 * @param {StartMode} [start='immediate'] - Determines whether the polling starts immediately or with a delay. Defaults to 'immediate'.
 * @return {Promise<T>} A promise that resolves with the value returned by the predicate when its condition is met or rejects if an error occurs.
 */
export function until<T>(
    predicate: UntilPredicate<T> | UntilPredicateAsync<T>,
    timeout: Duration,
    start: StartMode = 'immediate',
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const interval = new Interval({
            start,
            time: timeout,
            func: async () => {
                const out = await predicate();

                // if result is not available, continue polling
                if (typeof out === 'undefined') {
                    return true;
                }

                // when result finally is available, stop polling
                resolve(out);

                return false;
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
 * @param {StartMode} [start='immediate'] - Determines how the interval should begin. Defaults to `'immediate'`,
 * which executes the first invocation immediately without waiting for the timeout interval.
 * @return {Promise<void>} Resolves when the predicate has been executed the specified number of times
 * or if the specified amount is less than 0. Rejects if an error occurs during predicate execution.
 */
export function times(
    predicate: TimesPredicate | TimesPredicateAsync,
    amount: number,
    timeout: Duration,
    start: StartMode = 'immediate',
): Promise<void> {
    if (amount < 0) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const interval = new Interval({
            start,
            time: timeout,
            func: async (counter) => {
                if (counter > amount) {
                    resolve();

                    return false;
                }

                await predicate(counter);

                return true;
            },
            onError: reject,
        });

        interval.start();
    });
}

export type RetryPredicate<T> = (attempt: number) => T;
export type RetryPredicateAsync<T> = (attempt: number) => Promise<T>;
const ERR_ATTEMPT_LIMIT_EXCEEDED = 'Attempt limit exceeded';

/**
 * Retries a given predicate function or asynchronous predicate function until a condition is met or a maximum number of attempts is reached.
 *
 * @param {RetryPredicate<T> | RetryPredicateAsync<T>} predicate - The predicate function or async function to be invoked for each retry attempt. The function should return a defined result to be considered successful.
 * @param {number} attempts - The maximum number of retry attempts before failing.
 * @param {Duration} timeout - The duration between each retry attempt.
 * @param {StartMode} [start='immediate'] - Determines whether the retry process starts immediately ('immediate') or after the first timeout period ('delayed').
 * @return {Promise<T>} A promise that resolves with the result of the predicate when it succeeds or rejects if the maximum number of attempts is exceeded or an error occurs.
 */
export function retry<T>(
    predicate: RetryPredicate<T> | RetryPredicateAsync<T>,
    attempts: number,
    timeout: Duration,
    start: StartMode = 'immediate',
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const interval = new Interval({
            start,
            time: timeout,
            func: async (counter) => {
                if (counter > attempts) {
                    return Promise.reject(new Error(ERR_ATTEMPT_LIMIT_EXCEEDED));
                }

                const out = await predicate(counter);

                // if result is not available, continue polling
                if (typeof out === 'undefined') {
                    return true;
                }

                // when result finally is available, stop polling
                resolve(out);

                return false;
            },
            onError: reject,
        });

        interval.start();
    });
}

export type PipelinePredicate = (data: any) => void;
export type PipelinePredicateAsync = (data: any) => Promise<void>;

/**
 * Executes a sequence of predicates asynchronously with a specified timeout between each execution.
 *
 * The function takes an array of predicates, either synchronous or asynchronous, and executes them in sequence.
 * A timeout value specifies the delay between each function execution, and an optional start mode determines whether
 * the interval should begin immediately or after the first delay.
 *
 * @param {Array<PipelinePredicate | PipelinePredicateAsync>} predicates - An array of functions (either synchronous or asynchronous) to execute in sequence.
 * @param {Duration} timeout - The duration of the delay between each predicate execution.
 * @param {StartMode} [start='immediate'] - Specifies whether the execution interval should start immediately or after the first delay.
 * @return {Promise<any>} A promise that resolves with the result of the last predicate in the sequence, or resolves immediately if the predicates array is empty.
 */
export function pipeline(
    predicates: Array<PipelinePredicate | PipelinePredicateAsync>,
    timeout: Duration,
    start: StartMode = 'immediate',
): Promise<any> {
    if (!Array.isArray(predicates)) {
        throw new TypeError(`Expected "predicates" to by an array, but got ${typeof predicates}`);
    }

    if (!predicates.length) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const steps = predicates.slice();
        let data: any = undefined;

        const interval = new Interval({
            start,
            time: timeout,
            func: async () => {
                const step = steps.shift();

                if (!step) {
                    resolve(data);

                    return false;
                }

                data = await step(data);

                return true;
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
