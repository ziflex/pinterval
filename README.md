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

#### Retry

``retry`` is a combination of ``poll`` and ``until``. 
It executes a given function until it returns a truthy value or number of retries is reached.

```typescript

import { retry } from 'pinterval';

const data = await retry(async () => {
    const result = await someProgress();
    return result.data;
}, 5, 2000);

```

#### Times

``times`` executes a given function a specific amount of times.

```typescript

import { times } from 'pinterval';

await times(async (counter) => {
    await updateSomething(counter);
}, 5, 1000);

```

#### Pipeline

``pipeline`` sequentially executes a given array of functions with an interval between executions.
Each function recieves an output of a previous one.
**NOTE**: Unlike other functions, ``pipeline`` executes a first function with 0 timeout time, which means the provided timeout value is used between executions only.
If you want to override this behavior, you must provide a function that calculates timeouts.

```typescript

import { pipeline } from 'pinterval';

const out = await pipeline([() => 1, (i) => i * 2, (i) => i * 3, (i) => i * 4], 100);

console.log(out); // 24

```

### Duration Functions

Starting v3.7.0, `pinterval` contains a collection of duration calculation functions for dynamic interval scheduling with various backoff strategies.

The duration functions calculate the delay (in milliseconds) before the next execution. They're useful for:
- Retry logic with backoff strategies
- Polling with adaptive intervals
- Rate limiting and throttling
- Distributed system coordination

#### `constant(ms: number)`

Returns the same duration for every execution.

```typescript
import { duration } from 'pinterval';

const fn = duration.constant(1000);
fn(0); // 1000
fn(5); // 1000
fn(100); // 1000
```

**Use cases:**
- Fixed interval polling
- Regular health checks
- Consistent retry delays

---

#### `linear(initial: number, increment: number)`

Increases duration linearly by a fixed increment on each iteration.

```typescript
const fn = duration.linear(100, 50);
fn(0); // 100
fn(1); // 150
fn(2); // 200
fn(5); // 350
```

**Parameters:**
- `initial` - Starting duration in milliseconds
- `increment` - Amount to increase (or decrease if negative) per iteration

**Use cases:**
- Gradual slowdown for polling
- Progressive backoff with predictable growth
- Testing and debugging (slow down over time)

---

#### `exponential(initial: number, max?: number)`

Doubles the duration on each iteration with optional maximum cap.

```typescript
const fn = duration.exponential(100);
fn(0); // 100
fn(1); // 200
fn(2); // 400
fn(3); // 800

const capped = duration.exponential(100, 500);
capped(3); // 500 (capped)
capped(4); // 500 (capped)
```

**Parameters:**
- `initial` - Starting duration in milliseconds
- `max` - Optional maximum duration cap

**Use cases:**
- Standard retry backoff strategy
- Network request retries
- Database reconnection attempts

---

#### `fibonacci(initial: number)`

Uses the Fibonacci sequence for duration calculation.

```typescript
const fn = duration.fibonacci(100);
fn(0); // 100
fn(1); // 100
fn(2); // 200
fn(3); // 300
fn(4); // 500
fn(5); // 800
```

**Parameters:**
- `initial` - Base duration in milliseconds (F(0) and F(1))

**Use cases:**
- Gentler backoff than exponential
- Natural growth patterns
- Alternative retry strategy

---

#### `jittered(initial: number, max?: number, jitterFactor = 0.1)`

Adds randomness to exponential backoff to prevent synchronized retries (thundering herd problem).

```typescript
const fn = duration.jittered(100, 1000, 0.1);
fn(2); // ~400 ± 10% (e.g., 360-440)
fn(2); // Different value each call
```

**Parameters:**
- `initial` - Starting duration in milliseconds
- `max` - Optional maximum duration cap
- `jitterFactor` - Amount of randomness (0.1 = ±10%)

**Use cases:**
- Distributed system retries
- Preventing thundering herd
- Load distribution across time
- API rate limiting with multiple clients

---

#### `decorrelatedJitter(initial: number, max: number)`

AWS-recommended jitter strategy where each delay is based on the previous delay.

```typescript
const fn = duration.decorrelatedJitter(100, 10000);
fn(0); // Random value up to 300 (3x initial)
fn(1); // Random value up to 3x previous result
```

**Parameters:**
- `initial` - Starting duration in milliseconds
- `max` - Maximum duration cap (required)

**Use cases:**
- AWS SDK retry logic
- Best-practice distributed retries
- Optimal backoff with jitter
- Production-ready retry strategies

**Note:** This is a stateful function - the result of each call affects the next.

---

#### `steps(thresholds: Array<{ threshold: number; duration: number }>)`

Returns different durations based on counter thresholds.

```typescript
const fn = duration.steps([
    { threshold: 0, duration: 100 },
    { threshold: 5, duration: 500 },
    { threshold: 10, duration: 1000 }
]);

fn(0);  // 100
fn(4);  // 100
fn(5);  // 500
fn(10); // 1000
```

**Parameters:**
- `thresholds` - Array of threshold/duration pairs (order doesn't matter)

**Use cases:**
- Phase-based intervals (fast → medium → slow)
- Polling that changes behavior over time
- Different retry strategies per attempt range
- Multi-stage backoff

---
