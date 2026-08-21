import { getAbortReason } from './cancellation';
import type { Duration } from './duration';
import { assertDurationSource, resolveDuration, validateTimerDuration } from './duration-internal';
import { AbortError } from './errors';

const ERR_START = 'Interval is already running';
const ERR_MISSED_PARAMS = 'Parameters are required';
const ERR_FUNC_TYPE = '"func" must be a function';
const ERR_ONERROR_TYPE = '"onError" must be a function';

export type IntervalState = 'idle' | 'running' | 'paused' | 'stopped';

export interface IntervalContext {
    /** The current execution number, starting at 1 for each run. */
    readonly iteration: number;

    /** Wall-clock milliseconds since the current run started, including paused time. */
    readonly elapsed: number;

    /** The effective cancellation signal for the current run. */
    readonly signal: AbortSignal;
}

export type IntervalFunction = (context: IntervalContext) => boolean | void;
export type IntervalFunctionAsync = (context: IntervalContext) => Promise<boolean | void>;
export type ErrorHandler = (err: Error) => boolean | void;
export type ErrorHandlerAsync = (err: Error) => Promise<boolean | void>;
export type StartMode = 'immediate' | 'delayed';

interface PendingExecution {
    readonly iteration: number;
    readonly delay: number;
}

interface RunState {
    state: Exclude<IntervalState, 'idle'>;
    iteration: number;
    readonly startedAt: number;
    readonly controller: AbortController;
    readonly done: Promise<void>;
    readonly resolveDone: () => void;
    readonly rejectDone: (reason: unknown) => void;
    settled: boolean;
    needsSchedule: boolean;
    pending?: PendingExecution;
    timer?: ReturnType<typeof setTimeout>;
    removeExternalAbortHandler: () => void;
}

interface Settlement {
    readonly type: 'resolve' | 'reject';
    readonly reason?: unknown;
    readonly abort?: boolean;
}

/**
 * Interval parameters
 */
export interface Params {
    /**
     * Represents a function that operates on intervals. This function can be either synchronous or asynchronous.
     *
     * The callback receives an `IntervalContext` with the current iteration, elapsed run time, and effective
     * cancellation signal.
     */
    func: IntervalFunction | IntervalFunctionAsync;

    /**
     * Represents a duration of time.
     * It can be either a number (milliseconds) or a function that returns a number based on the counter.
     * Concrete and resolved values must be finite and between 0 and 2,147,483,647 milliseconds inclusive.
     */
    time: Duration;

    /**
     * Determines the initiation mode of a process.
     * It can be set to either:
     * - `'immediate'`: The process begins immediately without delay.
     * - `'delayed'`: The process starts after the first delay.
     */
    start?: StartMode;

    /**
     * A callback function that handles errors during the execution of an operation.
     * This function will be invoked whenever an error is encountered.
     *
     * - If an `ErrorHandler` is provided, it should be a synchronous function that
     *   processes the error immediately.
     *
     * - If an `ErrorHandlerAsync` is provided, it should be an asynchronous function
     *   capable of handling errors with asynchronous operations.
     *
     */
    onError?: ErrorHandler | ErrorHandlerAsync;

    /**
     * An optional external signal that cancels the interval.
     *
     * The callback receives a run-owned signal that also aborts when `stop()` is called. Cancellation cannot forcibly
     * interrupt arbitrary callback code, but signal-aware work can stop cooperatively.
     */
    signal?: AbortSignal;
}

export class Interval {
    private readonly __func: IntervalFunction | IntervalFunctionAsync;
    private readonly __duration: Duration;
    private readonly __onError?: ErrorHandler | ErrorHandlerAsync;
    private readonly __signal?: AbortSignal;
    private readonly __startMode: StartMode;
    private __done: Promise<void>;
    private __run?: RunState;
    private __executingRun?: RunState;

    constructor(params: Params) {
        if (params == null) {
            throw new Error(ERR_MISSED_PARAMS);
        }

        if (typeof params.func !== 'function') {
            throw new Error(ERR_FUNC_TYPE);
        }

        assertDurationSource(params.time, 'time');

        if (typeof params.time === 'number') {
            validateTimerDuration(params.time, 'time');
        }

        if (params.onError != null && typeof params.onError !== 'function') {
            throw new Error(ERR_ONERROR_TYPE);
        }

        this.__func = params.func;
        this.__duration = params.time;
        this.__onError = params.onError;
        this.__signal = params.signal;
        this.__startMode = params.start || 'delayed';
        this.__done = Promise.resolve();
    }

    /** The lifecycle state of the current run, or `idle` before the first start. */
    public get state(): IntervalState {
        return this.__run?.state ?? 'idle';
    }

    /**
     * The completion promise for the current run.
     *
     * It is resolved before the first start. Every call to `start()` creates a new promise that resolves on natural
     * completion or `stop()` and rejects on external cancellation or an unhandled execution error.
     */
    public get done(): Promise<void> {
        return this.__done;
    }

    /** Whether the current run is actively executing or waiting for its next execution. */
    public get isRunning(): boolean {
        return this.state === 'running';
    }

    /**
     * Starts a new run.
     * @throws {Error} Throws an error if the current run is running or paused.
     * @return {Interval} Current instance.
     */
    public start(): this {
        if (this.state === 'running' || this.state === 'paused') {
            throw new Error(ERR_START);
        }

        const run = this.__createRun();
        this.__run = run;
        this.__done = run.done;

        if (this.__signal?.aborted) {
            const reason = getAbortReason(this.__signal);
            this.__finish(run, { type: 'reject', reason, abort: true });

            return this;
        }

        this.__attachExternalAbortHandler(run);

        try {
            this.__schedule(run);
        } catch (err) {
            this.__finish(run, { type: 'reject', reason: err });
            throw err;
        }

        return this;
    }

    /**
     * Stops the current run, aborts its effective signal, and resolves its completion promise.
     * @return {Interval} Current instance.
     */
    public stop(): this {
        const run = this.__run;

        if (run == null || run.state === 'stopped') {
            return this;
        }

        this.__finish(run, {
            type: 'resolve',
            reason: new AbortError('The interval was stopped'),
            abort: true,
        });

        return this;
    }

    /**
     * Pauses the current run without completing it or resetting its iteration.
     * @return {Interval} Current instance.
     */
    public pause(): this {
        const run = this.__run;

        if (run == null || run.state !== 'running') {
            return this;
        }

        run.state = 'paused';
        this.__clearTimer(run, false);

        return this;
    }

    /**
     * Resumes a paused run after one full normal delay without resetting its progress.
     * @return {Interval} Current instance.
     */
    public resume(): this {
        const run = this.__run;

        if (run == null || run.state !== 'paused') {
            return this;
        }

        run.state = 'running';
        this.__scheduleCurrentRun();

        return this;
    }

    private __createRun(): RunState {
        let resolveDone!: () => void;
        let rejectDone!: (reason: unknown) => void;
        const done = new Promise<void>((resolve, reject) => {
            resolveDone = resolve;
            rejectDone = reject;
        });

        // Keep the original promise observable while preventing a delayed consumer from causing an unhandled rejection.
        void done.catch(() => undefined);

        return {
            state: 'running',
            iteration: 0,
            startedAt: Date.now(),
            controller: new AbortController(),
            done,
            resolveDone,
            rejectDone,
            settled: false,
            needsSchedule: true,
            removeExternalAbortHandler: () => undefined,
        };
    }

    private __attachExternalAbortHandler(run: RunState): void {
        const signal = this.__signal;

        if (signal == null) {
            return;
        }

        const handler = (): void => {
            const reason = getAbortReason(signal);
            this.__finish(run, { type: 'reject', reason, abort: true });
        };

        signal.addEventListener('abort', handler, { once: true });
        run.removeExternalAbortHandler = (): void => signal.removeEventListener('abort', handler);
    }

    private __finish(run: RunState, settlement: Settlement): void {
        if (this.__run !== run || run.settled) {
            return;
        }

        run.settled = true;
        run.state = 'stopped';
        run.needsSchedule = false;
        run.pending = undefined;
        this.__clearTimer(run, true);
        run.removeExternalAbortHandler();
        run.removeExternalAbortHandler = () => undefined;

        if (settlement.type === 'resolve') {
            run.resolveDone();
        } else {
            run.rejectDone(settlement.reason);
        }

        if (settlement.abort === true && !run.controller.signal.aborted) {
            run.controller.abort(settlement.reason);
        }
    }

    private __isCurrentRunActive(run: RunState): boolean {
        return this.__run === run && run.state !== 'stopped';
    }

    private __clearTimer(run: RunState, discardPending: boolean): void {
        if (typeof run.timer !== 'undefined') {
            clearTimeout(run.timer);
            run.timer = undefined;
        }

        if (discardPending) {
            run.pending = undefined;
        }
    }

    private __schedule(run: RunState): void {
        if (
            this.__run !== run ||
            run.state !== 'running' ||
            typeof run.timer !== 'undefined' ||
            this.__executingRun != null
        ) {
            return;
        }

        let pending = run.pending;

        if (pending == null) {
            if (!run.needsSchedule) {
                return;
            }

            const iteration = run.iteration + 1;
            let delay = 0;

            if (this.__startMode === 'delayed' || iteration > 1) {
                delay = resolveDuration(this.__duration, iteration);
            }

            pending = { iteration, delay };
            run.pending = pending;
            run.needsSchedule = false;
        }

        const timer = setTimeout(() => {
            if (run.timer === timer) {
                run.timer = undefined;
            }

            if (this.__run !== run || run.state !== 'running' || run.pending !== pending) {
                return;
            }

            run.pending = undefined;
            run.iteration = pending.iteration;
            void this.__execute(run);
        }, pending.delay);

        run.timer = timer;
    }

    private __scheduleCurrentRun(): void {
        const run = this.__run;

        if (run == null) {
            return;
        }

        try {
            this.__schedule(run);
        } catch (err) {
            this.__finish(run, { type: 'reject', reason: err });
        }
    }

    private async __execute(run: RunState): Promise<void> {
        if (!this.__isCurrentRunActive(run) || this.__executingRun != null) {
            return;
        }

        this.__executingRun = run;

        try {
            const context: IntervalContext = {
                iteration: run.iteration,
                elapsed: Date.now() - run.startedAt,
                signal: run.controller.signal,
            };

            let result: boolean | void;

            try {
                result = await this.__func(context);
            } catch (err) {
                await this.__handleError(err as Error, run);

                return;
            }

            if (!this.__isCurrentRunActive(run)) {
                return;
            }

            if (result === false) {
                this.__finish(run, { type: 'resolve' });

                return;
            }

            run.needsSchedule = true;
        } finally {
            if (this.__executingRun === run) {
                this.__executingRun = undefined;
            }

            this.__scheduleCurrentRun();
        }
    }

    private async __handleError(err: Error, run: RunState): Promise<void> {
        if (!this.__isCurrentRunActive(run)) {
            return;
        }

        if (this.__onError == null) {
            this.__finish(run, { type: 'reject', reason: err });

            return;
        }

        let result: boolean | void;

        try {
            result = await this.__onError(err);
        } catch (handlerError) {
            this.__finish(run, { type: 'reject', reason: handlerError });

            return;
        }

        if (!this.__isCurrentRunActive(run)) {
            return;
        }

        if (result === true) {
            run.needsSchedule = true;

            return;
        }

        this.__finish(run, { type: 'resolve' });
    }
}
