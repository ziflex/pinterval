import { Interval } from './interval';

export type PollPredicate = () => boolean;
export type PollPredicateAsync = () => Promise<boolean>;

/**
 * Implements polling mechanism using Interval.
 * @param predicate - Polling predicate. The polling stops when the predicate returns "false".
 * @param time - Polling intervals.
 */
export function poll(predicate: PollPredicate | PollPredicateAsync, time: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const interval = new Interval({
            time,
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
 * @param time - Polling intervals.
 */
export function until<T>(predicate: UntilPredicate<T> | UntilPredicateAsync<T>, time: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const interval = new Interval({
            time,
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
 * @param amoun - A number that indicates how many times to call a given function.
 * @param time - A number that indicates time in ms between calls.
 */
export function times(predicate: TimesPredicate | TimesPredicateAsync, amount: number, time: number): Promise<void> {
    if (amount < 0) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        let counter = -1;
        const interval = new Interval({
            time,
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

/**
 * Returns a promise that gets resolved in a given period.
 * @param time - Sleep period.
 */
export function sleep(time: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}
