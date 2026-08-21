import {
    assertDurationSource,
    evaluateDuration,
    validateComputedDuration,
    validateFiniteNumber,
    validateTimerDuration,
} from './duration-internal';

/** Calculates a duration from the current one-based scheduling counter. */
export type DurationFunction = (counter: number) => number;

/** A constant duration in milliseconds or a counter-based duration function. */
export type Duration = DurationFunction | number;

type Random = () => number;

function createStrategy(calculate: (counter: number) => unknown): DurationFunction {
    return (counter) => validateComputedDuration(calculate(counter));
}

/** Returns the same duration for every counter. */
const constant = (ms: number): DurationFunction => {
    validateTimerDuration(ms, 'ms');

    return createStrategy(() => ms);
};

/** Increases a duration by a fixed amount for each counter after the first. */
const linear = (initial: number, increment: number): DurationFunction => {
    validateTimerDuration(initial, 'initial');
    validateFiniteNumber(increment, 'increment');

    return createStrategy((counter) => initial + (counter > 0 ? counter - 1 : counter) * increment);
};

/** Doubles a duration for each counter after the first, with an optional maximum. */
const exponential = (initial: number, maximum?: number): DurationFunction => {
    validateTimerDuration(initial, 'initial');

    if (typeof maximum !== 'undefined') {
        validateTimerDuration(maximum, 'maximum');
    }

    return createStrategy((counter) => {
        const value = initial * Math.pow(2, counter > 0 ? counter - 1 : counter);

        return typeof maximum === 'undefined' ? value : Math.min(value, maximum);
    });
};

/** Uses the Fibonacci sequence to calculate a progressively increasing duration. */
const fibonacci = (initial: number): DurationFunction => {
    validateTimerDuration(initial, 'initial');

    return createStrategy((counter) => {
        if (counter === 0 || counter === 1) return initial;

        let previous = initial;
        let current = initial;

        for (let index = 2; index <= counter; index++) {
            const next = previous + current;
            previous = current;
            current = next;
        }

        return current;
    });
};

/** Returns the duration associated with the greatest threshold reached by the counter. */
const steps = (durations: { threshold: number; duration: number }[]): DurationFunction => {
    if (!Array.isArray(durations)) {
        throw new TypeError('"durations" must be an array');
    }

    if (durations.length === 0) {
        throw new RangeError('"durations" must contain at least one step');
    }

    const validated = durations.map((step, index) => {
        if (step == null || typeof step !== 'object') {
            throw new TypeError(`"durations[${index}]" must be an object`);
        }

        validateFiniteNumber(step.threshold, `durations[${index}].threshold`);
        validateTimerDuration(step.duration, `durations[${index}].duration`);

        return { ...step };
    });
    const sorted = validated.slice().sort((left, right) => right.threshold - left.threshold);
    const defaultDuration = validated[0].duration;

    return createStrategy((counter) => {
        const step = sorted.find((candidate) => counter >= candidate.threshold);

        return step?.duration ?? defaultDuration;
    });
};

/** Limits a constant or calculated duration to a maximum value. */
const cap = (source: Duration, maximum: number): DurationFunction => {
    assertDurationSource(source);
    validateTimerDuration(maximum, 'maximum');

    return createStrategy((counter) => Math.min(evaluateDuration(source, counter), maximum));
};

/** Raises a constant or calculated duration to a minimum value. */
const floor = (source: Duration, minimum: number): DurationFunction => {
    assertDurationSource(source);
    validateTimerDuration(minimum, 'minimum');

    return createStrategy((counter) => Math.max(evaluateDuration(source, counter), minimum));
};

function createJitter(source: Duration, factor: number, random: Random): DurationFunction {
    assertDurationSource(source);
    validateFiniteNumber(factor, 'factor');

    if (factor < 0 || factor > 1) {
        throw new RangeError('"factor" must be between 0 and 1');
    }

    return createStrategy((counter) => {
        const value = evaluateDuration(source, counter);
        const multiplier = 1 + (random() * 2 - 1) * factor;

        return value * multiplier;
    });
}

/**
 * Applies a random variation of up to `factor` below or above a duration.
 *
 * For example, a factor of `0.2` produces values from 80% through 120% of the source duration.
 */
const jitter = (source: Duration, factor: number): DurationFunction =>
    createJitter(source, factor, () => Math.random());

/** Transforms a resolved duration while preserving its scheduling counter. */
const map = (source: Duration, transform: (value: number, counter: number) => number): DurationFunction => {
    assertDurationSource(source);

    if (typeof transform !== 'function') {
        throw new TypeError('"transform" must be a function');
    }

    return createStrategy((counter) => transform(evaluateDuration(source, counter), counter));
};

/** Applies jitter to exponential backoff, optionally capping the exponential value before jitter is applied. */
const jittered = (initial: number, maximum?: number, factor = 0.1): DurationFunction =>
    jitter(exponential(initial, maximum), factor);

function createDecorrelatedJitter(initial: number, maximum: number, random: Random): DurationFunction {
    validateTimerDuration(initial, 'initial');
    validateTimerDuration(maximum, 'maximum');

    let previous = initial;

    return createStrategy(() => {
        const next = validateComputedDuration(Math.min(maximum, random() * previous * 3));
        previous = next;

        return next;
    });
}

/** Produces stateful decorrelated jitter based on the previously calculated duration. */
const decorrelatedJitter = (initial: number, maximum: number): DurationFunction =>
    createDecorrelatedJitter(initial, maximum, () => Math.random());

/** Duration primitives and inside-out transformations for composing scheduling strategies. */
export const duration = {
    constant,
    linear,
    exponential,
    fibonacci,
    steps,
    cap,
    floor,
    jitter,
    map,
    jittered,
    decorrelatedJitter,
};
