const ERR_START = 'Interval is already running';
const ERR_MISSED_PARAMS = 'Parameters are required';
const ERR_FUNC_TYPE = '"func" must be a function';
const ERR_ONERROR_TYPE = '"onError" must be a function';
const ERR_TIME_TYPE = '"time" must be either a number or a function';

export type IntervalFunction = (() => boolean | void) | ((counter: number) => boolean | void);
export type IntervalFunctionAsync = (() => Promise<boolean | void>) | ((counter: number) => Promise<boolean | void>);
export type ErrorHandler = (err: Error) => boolean | void;
export type ErrorHandlerAsync = (err: Error) => Promise<boolean | void>;
export type DurationFunction = (counter: number) => number;
export type Duration = DurationFunction | number;
export type StartMode = 'immediate' | 'delayed';

/**
 * Interval parameters
 */
export interface Params {
    /**
     * Represents a function that operates on intervals. This function can be either synchronous or asynchronous.
     *
     * The `func` variable can hold two types of functions:
     * - `IntervalFunction`: A synchronous function that performs operations or computations within a specified interval.
     * - `IntervalFunctionAsync`: An asynchronous function that performs similar operations but allows for asynchronous processing.
     *
     */
    func: IntervalFunction | IntervalFunctionAsync;

    /**
     * Represents a duration of time.
     * It can be either a number (milliseconds) or a function that returns a number based on the counter.
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
     * An optional signal that stops the interval when aborted.
     *
     * Aborting cannot interrupt a callback that is already executing, but it prevents another callback from being
     * scheduled.
     */
    signal?: AbortSignal;
}

export class Interval {
    private readonly __func: IntervalFunction | IntervalFunctionAsync;
    private readonly __duration: Duration;
    private readonly __onError?: ErrorHandler | ErrorHandlerAsync;
    private readonly __signal?: AbortSignal;
    private readonly __startMode: StartMode;
    private __abortHandler?: () => void;
    private __counter: number;
    private __generation: number;
    private __isRunning: boolean;
    private __timer?: ReturnType<typeof setTimeout>;

    constructor(params: Params) {
        if (params == null) {
            throw new Error(ERR_MISSED_PARAMS);
        }

        if (typeof params.func !== 'function') {
            throw new Error(ERR_FUNC_TYPE);
        }

        if (typeof params.time !== 'number' && typeof params.time !== 'function') {
            throw new Error(ERR_TIME_TYPE);
        }

        if (params.onError != null && typeof params.onError !== 'function') {
            throw new Error(ERR_ONERROR_TYPE);
        }

        this.__func = params.func;
        this.__duration = params.time;
        this.__onError = params.onError;
        this.__signal = params.signal;
        this.__startMode = params.start || 'delayed';
        this.__isRunning = false;
        this.__counter = 0;
        this.__generation = 0;
    }

    /**
     * Returns value that defines whether the instance is running.
     * @return {Boolean} Value that defines whether the instance is running.
     */
    public get isRunning(): boolean {
        return this.__isRunning;
    }

    /**
     * Starts the instance.
     * @throws {Error} Throws an error if the instance is already running.
     * @return {Interval} Current instance.
     */
    public start(): this {
        if (this.__isRunning) {
            throw new Error(ERR_START);
        }

        if (this.__signal?.aborted) {
            return this;
        }

        this.__counter = 0;
        this.__isRunning = true;
        const generation = ++this.__generation;

        this.__attachAbortHandler();

        try {
            this.__enqueue(generation);
        } catch (err) {
            this.stop();
            throw err;
        }

        return this;
    }

    /**
     * Stops the instance.
     * @return {Interval} Current instance.
     */
    public stop(): this {
        this.__isRunning = false;
        this.__clearTimer();
        this.__detachAbortHandler();

        return this;
    }

    private __attachAbortHandler(): void {
        const signal = this.__signal;

        if (signal == null) {
            return;
        }

        if (signal.aborted) {
            this.stop();
            return;
        }

        const handler = (): void => {
            this.stop();
        };

        this.__abortHandler = handler;
        signal.addEventListener('abort', handler, { once: true });
    }

    private __clearTimer(): void {
        if (typeof this.__timer === 'undefined') {
            return;
        }

        clearTimeout(this.__timer);
        this.__timer = undefined;
    }

    private __detachAbortHandler(): void {
        if (this.__signal == null || this.__abortHandler == null) {
            return;
        }

        this.__signal.removeEventListener('abort', this.__abortHandler);
        this.__abortHandler = undefined;
    }

    private __isActive(generation: number): boolean {
        return this.__isRunning && this.__generation === generation;
    }

    private __enqueue(generation: number): void {
        if (!this.__isActive(generation)) {
            return;
        }

        this.__counter++;
        let duration = 0;

        if (this.__startMode === 'delayed' || this.__counter > 1) {
            duration = typeof this.__duration !== 'function' ? this.__duration : this.__duration(this.__counter);
        }

        const timer = setTimeout(() => {
            if (this.__timer === timer) {
                this.__timer = undefined;
            }

            void this.__call(generation);
        }, duration);

        this.__timer = timer;
    }

    private async __call(generation: number): Promise<void> {
        if (!this.__isActive(generation)) {
            return;
        }

        const func = this.__func;

        try {
            const result = await func(this.__counter);

            if (!this.__isActive(generation)) {
                return;
            }

            if (result !== false) {
                this.__enqueue(generation);

                return;
            }

            this.stop();
        } catch (e) {
            await this.__handleError(e as Error, generation);
        }
    }

    private async __handleError(err: Error, generation: number): Promise<void> {
        if (!this.__isActive(generation)) {
            // interval was stopped
            return;
        }

        if (this.__onError == null) {
            this.stop();

            return;
        }

        try {
            const result = await this.__onError(err);

            if (!this.__isActive(generation)) {
                return;
            }

            if (result === true) {
                this.__enqueue(generation);

                return;
            }

            this.stop();
        } catch {
            if (this.__isActive(generation)) {
                this.stop();
            }
        }
    }
}
