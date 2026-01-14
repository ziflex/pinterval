import { DurationFunction } from './interval';

/**
 * Linear backoff - increases duration by a fixed amount each iteration.
 */
const linear =
    (initial: number, increment: number): DurationFunction =>
    (counter) =>
        initial + counter * increment;

/**
 * Exponential backoff - doubles the duration each iteration with optional max cap.
 */
const exponential =
    (initial: number, max?: number): DurationFunction =>
    (counter) => {
        const duration = initial * Math.pow(2, counter);
        return max ? Math.min(duration, max) : duration;
    };

/**
 * Fibonacci backoff - uses Fibonacci sequence for duration.
 */
const fibonacci = (initial: number): DurationFunction => {
    return (counter) => {
        if (counter === 0) return initial;
        if (counter === 1) return initial;

        let prev = initial;
        let curr = initial;

        for (let i = 2; i <= counter; i++) {
            const next = prev + curr;
            prev = curr;
            curr = next;
        }

        return curr;
    };
};

/**
 * Jittered exponential backoff - adds randomness to prevent thundering herd.
 */
const jittered =
    (initial: number, max?: number, jitterFactor = 0.1): DurationFunction =>
    (counter) => {
        const base = initial * Math.pow(2, counter);
        const capped = max ? Math.min(base, max) : base;
        const jitter = capped * jitterFactor * (Math.random() - 0.5);
        return Math.max(0, capped + jitter);
    };

/**
 * Decorrelated jitter - AWS recommended approach for distributed systems.
 */
const decorrelatedJitter = (initial: number, max: number): DurationFunction => {
    let previous = initial;
    return () => {
        const next = Math.min(max, Math.random() * previous * 3);
        previous = next;
        return next;
    };
};

/**
 * Step function - fixed durations at specific counter thresholds.
 */
const steps =
    (durations: { threshold: number; duration: number }[]): DurationFunction => {
        const sorted = [...durations].sort((a, b) => b.threshold - a.threshold);
        const defaultDuration = durations[0].duration;
        return (counter) => {
            const step = sorted.find((s) => counter >= s.threshold);
            return step?.duration ?? defaultDuration;
        };
    };

/**
 * Constant duration - always returns the same value.
 */
const constant =
    (ms: number): DurationFunction =>
    () =>
        ms;

export const duration = {
    linear,
    exponential,
    fibonacci,
    jittered,
    decorrelatedJitter,
    steps,
    constant,
};
