# pinterval

> Advanced setInterval

[![npm version](https://badge.fury.io/js/pinterval.svg)](https://www.npmjs.com/package/pinterval)
[![Actions Status](https://github.com/ziflex/pinterval/workflows/Node%20CI/badge.svg)](https://github.com/ziflex/pinterval/actions)


````sh
    npm install --save pinterval
````

## Motivation
``pinterval`` is a small tool that provides an advance mechanism for running an arbitrary code in intervals with flexible and simple API. It's a good fit for small badckground tasks. It supports both sync and async execution of a given function.

## API
You can find API [here](http://ziflex.github.io/pinterval)

## Features
- Support of async execution
- Graceful error handling
- Customization

## Usage

### Basic

```javascript

import { Interval } from 'pinterval';

const interval = new Interval({
    func: () => console.log('Tick!'),
    time: 1000
});

interval.start();

```

### Auto stop

If ``func`` returns ``false``, the interval automatically stops.
The following interval will stop after 10 calls.

```javascript

import { Interval } from 'pinterval';
import sinon from 'sinon';

const spy = sinon.spy();
const interval = new Interval({
    func: () => {
        spy();

        return spy.calledCount < 10;
    },
    time: 1000
});

interval.start();

```

### Error handling

```typescript

import { Interval } from 'pinterval';

const interval = new Interval({
    func: () => console.log('Tick!'),
    time: 1000,
    onError: (err) => {
        if (err instanceof FatalError) {
            return false; // stop interval and terminate all further execution
        }

        return true;
    }
});

interval.start();

```

### Async

In order to pass async function, it must return a promise on each tick.
Each tick is calcualated after async function completion in order to avoid race conditions.

```typescript

import { Interval } from 'pinterval';

const interval = new Interval({
    func: () => {
        return fetch('https://github.com/trending')
    },
    time: 1000
});

interval.start();

```

Additionally, error handler can be asynchronous too:

```typescript

import { Interval } from 'pinterval';

const interval = new Interval({
    func: () => {
        return fetch('https://github.com/trending')
    },
    time: 1000,
    onError: (err: Error) => {
        return fetch('my-service', {
            method: 'POST',
            body: JSON.stringify({
                timerError: err
            })
        })
    }
});

interval.start();

```

### Dynamic duration
Starting v3.3.0, you can pass a duration factory function into the consutrctor, in order to calculate dynamically interval duration for each tick:

```javascript

import { Interval } from 'pinterval';

const minTimeout = 500;
const maxTimeout = 10000;
const interval = new Interval({
    func: () => console.log('Tick!'),
    time: (counter) => {
        const timeout = Math.round(minTimeout * Math.pow(2, counter));

        return Math.min(timeout, maxTimeout);
    }
});

interval.start();

```

The function receives a number of a tick, so you can use it to write an algorithm more accurately.

### Helpers

#### Polling

``poll`` implements a simple polling mechanism.

```typescript

import { poll } from 'pinterval';

await poll(async () => {
    const result = await someProgress();

    return result === true;
}, 5000);

```

#### Until

``until`` is similar to ``poll`` but it gives you a possibility to return a value for a polling function.    
The polling continues until the predicate returns anything but undefined.

```typescript

import { until } from 'pinterval';

const data = await until(async () => {
    const result = await someProgress();

    return result.data;
}, 5000);

```

#### Times

``times`` executes a given function a specific amount of times.

```typescript

import { times } from 'pinterval';

await times(async (counter) => {
    await updateSomething(counter);
}, 5, 1000);

```