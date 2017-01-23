import Symbol from 'es6-symbol';
import isNil from 'is-nil';
import isFunction from 'is-function';

const ERR_START = 'Interval is already running';
const ERR_STOP = 'Interval is already stoped';
const ERR_FUNC_TYPE = '"func" must be a function';
const ERR_ONERROR_TYPE = '"onError" must be a function';
const ERR_TIME_TYPE = '"time" must be a number';
const FIELDS = {
    func: Symbol('func'),
    time: Symbol('time'),
    onError: Symbol('onError'),
    handler: Symbol('handler'),
    isRunning: Symbol('isRunning')
};

function isNumber(i) {
    return typeof i === 'number' && !isNaN(i);
}

function requires(name, value) {
    if (isNil(value)) {
        throw new Error(`"${name}" is required`);
    }
}

function assert(msg, value) {
    if (value === false) {
        throw new Error(msg);
    }
}

function isRunning(instance) {
    return instance && instance[FIELDS.isRunning];
}

function nextTick(instance) {
    if (isRunning(instance)) {
        setTimeout(instance[FIELDS.handler], instance[FIELDS.time]);
    }
}

function handleError(instance, err) {
    if (!isRunning(instance)) {
        // interval was stopped and handler is already disposed
        throw err;
    }

    if (instance[FIELDS.onError]) {
        if (instance[FIELDS.onError](err) === false) {
            instance.stop();
            return;
        }

        nextTick(instance);
    } else {
        instance.stop();

        throw err;
    }
}

function createHandler(that) {
    let instance = that;

    const handler = function handler() {
        if (!isRunning(instance)) {
            return;
        }

        const func = instance[FIELDS.func];
        const isAsync = instance[FIELDS.func].length > 0;

        try {
            if (!isAsync) {
                func.call(null);
                nextTick(instance);
                return;
            }

            func.call(null, (e) => {
                if (e) {
                    return handleError(instance, e);
                }

                return nextTick(instance);
            });
        } catch (e) {
            handleError(instance, e);
        }
    };

    handler.dispose = function disposeInterval() {
        instance = null;
    };

    return handler;
}

class Interval {
    constructor(params) {
        requires('parameters', params);
        requires('parameters.func', params.func);
        requires('parameters.time', params.time);
        assert(ERR_FUNC_TYPE, isFunction(params.func));
        assert(ERR_TIME_TYPE, isNumber(params.time));

        if (params.onError) {
            assert(ERR_ONERROR_TYPE, isFunction(params.onError));
        }

        this[FIELDS.func] = params.func;
        this[FIELDS.time] = params.time;
        this[FIELDS.onError] = params.onError;
        this[FIELDS.handler] = null;
        this[FIELDS.isRunning] = false;
    }

    isRunning() {
        return this[FIELDS.isRunning];
    }

    start() {
        assert(ERR_START, !this.isRunning());

        this[FIELDS.isRunning] = true;
        this[FIELDS.handler] = createHandler(this);

        nextTick(this);

        return this;
    }

    stop() {
        assert(ERR_STOP, this.isRunning());

        this[FIELDS.isRunning] = false;

        this[FIELDS.handler].dispose();
        this[FIELDS.handler] = null;

        return this;
    }
}

module.exports = function create(params) {
    return new Interval(params);
};
