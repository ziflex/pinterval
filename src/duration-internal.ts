import type { Duration } from './duration';

export const MAX_TIMER_DURATION = 2_147_483_647;

function typeError(name: string, expectation: string): TypeError {
    return new TypeError(`"${name}" must be ${expectation}`);
}

function rangeError(name: string, expectation: string): RangeError {
    return new RangeError(`"${name}" must be ${expectation}`);
}

export function assertDurationSource(value: unknown, name = 'source'): asserts value is Duration {
    if (typeof value !== 'number' && typeof value !== 'function') {
        throw typeError(name, 'either a number or a function');
    }
}

export function validateFiniteNumber(value: unknown, name: string): number {
    if (typeof value !== 'number') {
        throw typeError(name, 'a number');
    }

    if (!Number.isFinite(value)) {
        throw rangeError(name, 'finite');
    }

    return value;
}

/** Validates an intermediate duration calculation without applying the host timer limit. */
export function validateComputedDuration(value: unknown, name = 'duration'): number {
    const duration = validateFiniteNumber(value, name);

    if (duration < 0) {
        throw rangeError(name, 'greater than or equal to 0 milliseconds');
    }

    return duration;
}

function validateTimerMaximum(duration: number, name: string): number {
    if (duration > MAX_TIMER_DURATION) {
        throw rangeError(name, `less than or equal to ${MAX_TIMER_DURATION} milliseconds`);
    }

    return duration;
}

/** Validates a concrete value that will be passed to setTimeout. */
export function validateTimerDuration(value: unknown, name = 'duration'): number {
    return validateTimerMaximum(validateComputedDuration(value, name), name);
}

/** Evaluates a nested duration source while allowing an outer cap to make oversized finite values timer-safe. */
export function evaluateDuration(source: Duration, counter: number): number {
    const value = typeof source === 'function' ? source(counter) : source;

    return validateComputedDuration(value);
}

/** Resolves and validates the final duration that will be scheduled. */
export function resolveDuration(source: Duration, counter: number): number {
    return validateTimerMaximum(evaluateDuration(source, counter), 'duration');
}
