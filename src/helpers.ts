import { isFunction } from 'util';
import { Interval, Duration } from './interval';

export type PollPredicate = () => boolean;
export type PollPredicateAsync = () => Promise<boolean>;

/**
 * Implements polling mechanism using Interval.
 * @param predicate - Polling predicate. The polling stops when the predicate returns "false".
 * @param timeout - Polling timeout duration.
 */
export function poll(predicate: PollPredicate | PollPredicateAsync, timeout: Duration): Promise<void> {
    return new Promise((resolve, reject) => {
        const interval = new Interval({
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
 * Implements polling mechanism using Interval until data or null is returned.
 * @param predicate - Polling predicate. The polling continues until the predicate returns anything but undefined.
 * @param timeout - Polling timeout duration.
 */
export function until<T>(predicate: UntilPredicate<T> | UntilPredicateAsync<T>, timeout: Duration): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const interval = new Interval({
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
 * Executes a given function a specific amount of times.
 * @param predicate - A function to call.
 * @param amount - A number that indicates how many times to call a given function.
 * @param timeout - A number or function returning a number that indicates time in ms between calls.
 */
export function times(
    predicate: TimesPredicate | TimesPredicateAsync,
    amount: number,
    timeout: Duration,
): Promise<void> {
    if (amount < 0) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        let counter = -1;
        const interval = new Interval({
            time: timeout,
            func: () => {
                counter++;

                if (counter >= amount) {
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

export type PipelinePredicate = (data: any) => void;
export type PipelinePredicateAsync = (data: any) => Promise<void>;

/**
 * Executes a given array of functions with interval. Each function recieves an output of a previous one.
 * If a timeout is number, the value is used between executions only i.e. the first function will be called with 0 timeout value.
 * Otherwise a given function must calculate timeout value for the first call.
 * @param predicates - An array of functions to execute.
 * @param amoun - A number that indicates how many times to call a given function.
 * @param timeout - A number or function returning a number that indicates time in ms between calls.
 * @returns Output of the last function.
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

    const timeoutFn: Duration = isFunction(timeout)
        ? timeout
        : (counter) => {
              // start immediately for the first call
              return counter > 1 ? (timeout as number) : 0;
          };

    return new Promise((resolve, reject) => {
        const steps = predicates.slice();
        let data;

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
 * Returns a promise that gets resolved in a given period.
 * @param time - Sleep period.
 */
export function sleep(time: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}
