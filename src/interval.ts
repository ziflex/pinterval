import isPromise from 'is-promise';

const ERR_START = 'Interval is already running';
const ERR_STOP = 'Interval is already stoped';
const ERR_MISSED_PARAMS = 'Parameters are required';
const ERR_FUNC_TYPE = '"func" must be a function';
const ERR_ONERROR_TYPE = '"onError" must be a function';
const ERR_TIME_TYPE = '"time" must be either a number or a function';

export type IntervalFunction = (() => boolean | void) | ((counter: number) => boolean | void);
export type IntervalFunctionAsync = (() => Promise<boolean | void>) | ((counter: number) => Promise<boolean | void>);
export type ErrorHandler = (err: Error) => boolean | void;
export type ErrorHandlerAsync = (err: Error) => Promise<boolean | void>;
export type DurationFactory = (counter: number) => number;
export type Duration = DurationFactory | number;
export type StartMode = 'immediate' | 'delayed';

/**
 * Interval parameters
 */
export interface Params {
    /**
     * Represents a function that can either be synchronous or asynchronous,
     * intended to operate over a specified interval or perform interval-based tasks.
     *
     * @typedef {Function} IntervalFunction
     * A synchronous function that performs a specific task within an interval.
     *
     * @typedef {Function} IntervalFunctionAsync
     * An asynchronous function that performs a specific task within an interval.
     *
     * @type {IntervalFunction | IntervalFunctionAsync}
     */
    func: IntervalFunction | IntervalFunctionAsync;

    /**
     * Represents a specific duration of time.
     * The `time` variable holds a value that specifies a duration or interval.
     * This can be used for calculations or operations involving periods of time.
     */
    time: Duration;

    /**
     * The `start` variable determines the initiation mode of a process.
     * It can be set to either:
     * - `'immediate'`: The process begins immediately without delay.
     * - `'delayed'`: The process starts after the first timeout.
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
     * Use this variable to define custom error-handling logic specific to the
     * implemented context.
     *
     * @type {ErrorHandler|ErrorHandlerAsync}
     */
    onError?: ErrorHandler | ErrorHandlerAsync;
}

export class Interval {
    private readonly __func: IntervalFunction | IntervalFunctionAsync;
    private readonly __duration: Duration;
    private readonly __onError?: ErrorHandler | ErrorHandlerAsync;
    private readonly __startMode: StartMode;
    private __counter: 0;
    private __isRunning: boolean;

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
        this.__startMode = params.start || 'delayed';
        this.__isRunning = false;
        this.__counter = 0;
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

        this.__counter = 0;
        this.__isRunning = true;
        this.__enqueue();

        return this;
    }

    /**
     * Stops the instance.
     * @throws {Error} Throws an error if the instance is already stopped.
     * @return {Interval} Current instance.
     */
    public stop(): this {
        if (!this.__isRunning) {
            throw new Error(ERR_STOP);
        }

        this.__isRunning = false;

        return this;
    }

    private __enqueue(): void {
        if (!this.__isRunning) {
            return;
        }

        this.__counter++;
        let duration = 0;

        if (this.__startMode === 'delayed' || this.__counter > 1) {
            duration = typeof this.__duration !== 'function' ? this.__duration : this.__duration(this.__counter);
        }

        setTimeout(() => this.__call(), duration);
    }

    private __call(): void {
        if (!this.__isRunning) {
            return;
        }

        const func = this.__func;

        try {
            const out = func(this.__counter);

            if (!isPromise(out)) {
                if (out !== false) {
                    this.__enqueue();

                    return;
                }

                this.stop();

                return;
            }

            (out as Promise<boolean | undefined>)
                .then((result: boolean | undefined) => {
                    if (result !== false) {
                        this.__enqueue();

                        return;
                    }

                    this.stop();
                })
                .catch((err) => {
                    this.__handleError(err);

                    return null;
                });
        } catch (e) {
            this.__handleError(e as Error);
        }
    }

    private __handleError(err: Error): void {
        if (!this.__isRunning) {
            // interval was stopped
            return;
        }

        if (this.__onError == null) {
            this.stop();

            return;
        }

        const out = this.__onError(err);

        if (!isPromise(out)) {
            if (out === true) {
                this.__enqueue();
            } else {
                this.stop();
            }

            return;
        }

        (out as Promise<boolean>)
            .then((res: boolean) => {
                if (res === true) {
                    this.__enqueue();
                } else {
                    this.stop();
                }
            })
            .catch(() => {
                this.stop();

                return null;
            });
    }
}
