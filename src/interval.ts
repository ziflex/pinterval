import isFunction from 'is-function';
import isPromise from 'is-promise';

const ERR_START = 'Interval is already running';
const ERR_STOP = 'Interval is already stoped';
const ERR_MISSED_PARAMS = 'Parameters are required';
const ERR_FUNC_TYPE = '"func" must be a function';
const ERR_ONERROR_TYPE = '"onError" must be a function';
const ERR_TIME_TYPE = '"time" must be either a number or a function';

export type IntervalFunction = () => boolean | void;
export type IntervalFunctionAsync = () => Promise<boolean | void>;
export type ErrorHandler = (err: Error) => boolean | void;
export type ErrorHandlerAsync = (err: Error) => Promise<boolean | void>;
export type DurationFactory = (counter: number) => number;
export type Duration = DurationFactory | number;

/**
 * Interval parameters
 */
export interface Params {
    /**
     * Function to execute
     */
    func: IntervalFunction | IntervalFunctionAsync;

    /**
     * Timeout duration
     */
    time: Duration;

    /**
     * Custom error handler
     */
    onError?: ErrorHandler | ErrorHandlerAsync;
}

export class Interval {
    private readonly __func: IntervalFunction | IntervalFunctionAsync;
    private readonly __duration: Duration;
    private readonly __onError?: ErrorHandler | ErrorHandlerAsync;
    private __counter: 0;
    private __isRunning: boolean;

    constructor(params: Params) {
        if (params == null) {
            throw new Error(ERR_MISSED_PARAMS);
        }

        if (!isFunction(params.func)) {
            throw new Error(ERR_FUNC_TYPE);
        }

        if (typeof params.time !== 'number' && typeof params.time !== 'function') {
            throw new Error(ERR_TIME_TYPE);
        }

        if (params.onError != null && isFunction(params.onError) === false) {
            throw new Error(ERR_ONERROR_TYPE);
        }

        this.__func = params.func;
        this.__duration = params.time;
        this.__onError = params.onError;
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
        this.__nextTick();

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

    private __nextTick(): void {
        if (!this.__isRunning) {
            return;
        }

        this.__counter++;

        const duration = typeof this.__duration !== 'function' ? this.__duration : this.__duration(this.__counter);

        setTimeout(() => this.__exec(), duration);
    }

    private __exec(): void {
        if (!this.__isRunning) {
            return;
        }

        const func = this.__func;

        try {
            const out = func();

            if (!isPromise(out)) {
                if (out !== false) {
                    this.__nextTick();

                    return;
                }

                this.stop();

                return;
            }

            (out as Promise<boolean | undefined>)
                .then((result: boolean | undefined) => {
                    if (result !== false) {
                        this.__nextTick();

                        return;
                    }

                    this.stop();
                })
                .catch((err) => {
                    this.__handleError(err);

                    return null;
                });
        } catch (e) {
            this.__handleError(e);
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
                this.__nextTick();
            } else {
                this.stop();
            }

            return;
        }

        (out as Promise<boolean>)
            .then((res: boolean) => {
                if (res === true) {
                    this.__nextTick();
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
