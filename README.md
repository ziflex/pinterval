# pinterval

> Advanced interval management for JavaScript/TypeScript

[![npm version](https://badge.fury.io/js/pinterval.svg)](https://www.npmjs.com/package/pinterval)
[![Actions Status](https://github.com/ziflex/pinterval/workflows/Node%20CI/badge.svg)](https://github.com/ziflex/pinterval/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A powerful and flexible interval management library that goes beyond JavaScript's native `setInterval`. Perfect for background tasks, polling, retries, and complex scheduling scenarios with built-in support for async/await, error handling, and dynamic timing strategies.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Why pinterval?](#why-pinterval)
- [API Documentation](#api-documentation)
- [Core Concepts](#core-concepts)
  - [Interval Class](#interval-class)
  - [Lifecycle, Completion, and Context](#lifecycle-completion-and-context)
  - [Start Modes](#start-modes)
  - [Auto-Stop Mechanism](#auto-stop-mechanism)
  - [Error Handling](#error-handling)
  - [Cancellation and Timeouts](#cancellation-and-timeouts)
- [Helper Functions](#helper-functions)
  - [poll](#poll)
  - [until](#until)
  - [retry](#retry)
  - [times](#times)
  - [Migrating helper callbacks to v5](#migrating-helper-callbacks-to-v5)
  - [pipeline](#pipeline)
  - [sleep](#sleep)
- [Duration Functions](#duration-functions)
  - [constant](#constant)
  - [linear](#linear)
  - [exponential](#exponential)
  - [fibonacci](#fibonacci)
  - [jittered](#jittered)
  - [decorrelatedJitter](#decorrelatedjitter)
  - [steps](#steps)
- [Real-World Examples](#real-world-examples)
- [TypeScript Support](#typescript-support)
- [Comparison with Native setInterval](#comparison-with-native-setinterval)
- [Best Practices](#best-practices)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

- ✅ **Async/Await Support** - Native promise support for asynchronous operations
- ✅ **Graceful Error Handling** - Built-in error handling with customizable recovery strategies
- ✅ **Dynamic Intervals** - Calculate interval duration dynamically based on iteration count
- ✅ **Auto-Stop Mechanism** - Automatically stop intervals based on return values
- ✅ **Rich Helper Functions** - Pre-built utilities for common patterns (polling, retries, pipelines)
- ✅ **Backoff Strategies** - Multiple built-in duration functions for sophisticated retry logic
- ✅ **Cancellation and Timeouts** - Standard `AbortSignal` support and total-lifetime limits
- ✅ **Observable Lifecycle** - Explicit state, completion promises, and pause/resume controls
- ✅ **TypeScript First** - Full TypeScript support with comprehensive type definitions
- ✅ **Zero Dependencies** - Minimal footprint with absolutely no dependencies
- ✅ **Production Ready** - Battle-tested and actively maintained

## Installation

Install using your preferred package manager:

```bash
# npm
npm install --save pinterval

# yarn
yarn add pinterval

# pnpm
pnpm add pinterval
```

## Quick Start

```typescript
import { Interval } from 'pinterval';

// Create a simple interval
const interval = new Interval({
    func: () => console.log('Tick!'),
    time: 1000
});

// Start the interval
interval.start();

// Stop when needed
setTimeout(() => interval.stop(), 5000);

// Observe normal completion, stop, cancellation, or failure
await interval.done;
```

## Why pinterval?

JavaScript's native `setInterval` has several limitations:

- No native async/await support
- No built-in error handling
- Fixed intervals only (no dynamic timing)
- No automatic cleanup on errors
- Callback-based API

`pinterval` solves all these problems with a modern, Promise-based API that's perfect for:

- **Polling APIs** - Check for updates with intelligent backoff
- **Background Tasks** - Run periodic maintenance with error recovery
- **Retry Logic** - Implement sophisticated retry strategies
- **Health Checks** - Monitor services with adaptive intervals
- **Rate Limiting** - Control execution frequency dynamically
- **Data Synchronization** - Sync data with automatic error handling

## API Documentation

Full API documentation is available at [http://ziflex.github.io/pinterval](http://ziflex.github.io/pinterval)

## Core Concepts

### Interval Class

The `Interval` class is the core building block of pinterval. It provides a flexible way to execute functions repeatedly with configurable timing and error handling.

#### Basic Usage

```typescript
import { Interval } from 'pinterval';

const interval = new Interval({
    func: () => console.log('Tick!'),
    time: 1000
});

interval.start();

// Stop when needed
interval.stop();
```

#### Constructor Parameters

```typescript
interface Params {
    func: (context: IntervalContext) => boolean | void | Promise<boolean | void>;
    time: number | ((counter: number) => number);
    start?: 'immediate' | 'delayed';
    onError?: (err: Error) => boolean | void;
    signal?: AbortSignal;
}
```

- **func** - Synchronous or asynchronous function that receives the current execution context
- **time** - Interval duration in milliseconds or a function that calculates it dynamically
- **start** - When to execute the first tick: `'delayed'` (default) waits for the first delay, `'immediate'` executes immediately
- **onError** - Optional error handler. Return `true` to continue, `false` to stop
- **signal** - Optional cancellation signal. An already-aborted signal prevents the interval from starting

#### Methods

- **start()** - Starts the interval. Throws if the current run is running or paused.
- **stop()** - Stops the interval. Safe to call repeatedly.
- **pause()** - Pauses the current run without completing it.
- **resume()** - Resumes a paused run without resetting its progress.
- **done** - Promise for the current run. It resolves on normal completion or `stop()` and rejects on cancellation or an unhandled error.
- **state** - Current lifecycle state: `'idle'`, `'running'`, `'paused'`, or `'stopped'`.
- **isRunning** - Compatibility property derived from `state === 'running'`.

### Lifecycle, Completion, and Context

`start()` remains synchronous and fluent. Read `done` after starting to await that specific run:

```typescript
const interval = new Interval({
    time: 1000,
    func: async ({ iteration, elapsed, signal }) => {
        console.log(`Execution ${iteration} after ${elapsed}ms`);
        await fetch('/api/refresh', { signal });
    }
});

interval.start();
const firstRun = interval.done;

// Pausing cancels the pending delay but preserves this run and its iteration count.
interval.pause();
interval.resume(); // The pending/next execution waits one normal interval duration.

setTimeout(() => interval.stop(), 5000);
await firstRun;
```

`iteration` is 1-based. `elapsed` is wall-clock time since `start()`, including paused time. `signal` is owned by the run: it reflects the supplied external signal and also aborts when `stop()` is called, allowing signal-aware callback work to stop cooperatively.

Before the first start, `done` is already resolved. Each subsequent `start()` creates a new promise and signal; an old `done` promise can never be settled by a later run. Calling `resume()` after a final stop is a no-op—use `start()` to begin a new run.

In v5, `Interval` callbacks receive this context object instead of a numeric counter:

```typescript
// v4
func: (counter) => counter < 10

// v5
func: ({ iteration }) => iteration < 10
```

Duration functions retain their existing 1-based numeric counters. Finite-helper callbacks receive `IntervalContext` or `RetryContext` in v5.

### Start Modes

Control when your interval executes for the first time:

```typescript
// Delayed start (default): waits for time before first execution
const delayedInterval = new Interval({
    func: () => console.log('First execution after 1 second'),
    time: 1000,
    start: 'delayed' // or omit this, it's the default
});

// Immediate start: executes immediately, then waits for timeout
const immediateInterval = new Interval({
    func: () => console.log('Executes immediately!'),
    time: 1000,
    start: 'immediate'
});
```

### Auto-Stop Mechanism

If your function returns `false`, the interval automatically stops. This is useful for self-terminating intervals.

```typescript
import { Interval } from 'pinterval';

let counter = 0;
const interval = new Interval({
    func: () => {
        counter++;
        console.log(`Tick ${counter}`);
        
        // Stop after 10 ticks
        return counter < 10;
    },
    time: 1000
});

interval.start();
// Will automatically stop after 10 executions
```

### Error Handling

Comprehensive error handling with both synchronous and asynchronous error handlers:

```typescript
import { Interval } from 'pinterval';

// Synchronous error handler
const interval = new Interval({
    func: () => {
        // This might throw
        riskyOperation();
    },
    time: 1000,
    onError: (err) => {
        console.error('Error occurred:', err);
        
        // Return false to stop, true to continue
        if (err instanceof FatalError) {
            return false; // Stop interval
        }
        
        return true; // Continue with next tick
    }
});

// Asynchronous error handler
const asyncInterval = new Interval({
    func: async () => {
        const response = await fetch('https://api.example.com/data');
        return response.ok;
    },
    time: 5000,
    onError: async (err: Error) => {
        // Log error to remote service
        await fetch('https://logging-service.com/log', {
            method: 'POST',
            body: JSON.stringify({ error: err.message })
        });
        
        // Decide whether to continue
        return err.message !== 'FATAL';
    }
});
```

**Error Handler Return Values:**

- `true` - Continue interval execution (schedules next tick)
- `false` - Stop interval execution and resolve `done`
- `undefined` or no return - Stop interval execution and resolve `done`
- If no handler is provided, `done` rejects with the callback error
- If the error handler itself throws, `done` rejects with the handler error

### Async Support

Native support for asynchronous functions with proper race condition prevention:

```typescript
import { Interval } from 'pinterval';

const interval = new Interval({
    func: async () => {
        // The next tick won't start until this Promise resolves
        const data = await fetch('https://api.example.com/status');
        const json = await data.json();
        
        console.log('Status:', json.status);
        
        // Can return false to stop
        return json.status !== 'completed';
    },
    time: 2000
});

interval.start();
```

**Key Points:**

- Each tick waits for the Promise to resolve before scheduling the next one
- No race conditions - async operations won't overlap
- Interval timing starts **after** async operation completes
- Return `false` from async function to stop the interval

### Cancellation and Timeouts

`Interval`, `sleep`, and every finite helper accept an optional standard `AbortSignal`. Aborting clears a pending scheduling timer immediately and prevents future executions. For `Interval`, it also rejects the current `done` promise with the external signal's exact reason.

```typescript
import { Interval, until } from 'pinterval';

const intervalController = new AbortController();
const interval = new Interval({
    time: 1000,
    signal: intervalController.signal,
    func: async ({ signal }) => {
        await refreshData({ signal });
    }
});

interval.start();
intervalController.abort();

try {
    await interval.done;
} catch (err) {
    console.log(err === intervalController.signal.reason); // true
}

const controller = new AbortController();
await until(readState, {
    predicate: state => state.ready,
    time: 500,
    signal: controller.signal
});
```

For finite helpers, `time` and `timeout` have distinct meanings:

- **time** - Delay between executions; it may be a number or duration function.
- **timeout** - Optional maximum lifetime for the entire operation, including its initial delay and callback execution.
- **signal** - External cancellation controlled by the caller. The first of external cancellation and timeout wins.

```typescript
import { retry } from 'pinterval';

await retry(loadData, {
    attempts: 10,
    time: 250,
    timeout: 10_000
});
```

`AbortError` and `TimeoutError` are exported classes that extend the standard `Error` type in both Node and browser environments. pinterval creates an `AbortError` when it needs its own cancellation reason (for example, when `stop()` aborts an interval's effective signal) and a `TimeoutError` when an overall helper timeout expires.

External cancellation still rejects with the exact `signal.reason`. That value belongs to the caller or host runtime and is not normalized, so it may be any value or host-provided error type. Neither cancellation nor timeout can forcibly interrupt arbitrary callback code already executing; it stops the operation promptly and prevents another iteration. Finite-helper callbacks receive the effective signal through `IntervalContext` or `RetryContext`; pass it to APIs such as `fetch` when callback work should also be interruptible.

### Dynamic Duration

Calculate interval duration dynamically based on the iteration count:

```typescript
import { Interval } from 'pinterval';

// Exponential backoff
const interval = new Interval({
    func: () => console.log('Tick!'),
    time: (counter) => {
        const minTimeout = 500;
        const maxTimeout = 10000;
        const timeout = Math.round(minTimeout * Math.pow(2, counter - 1));
        
        return Math.min(timeout, maxTimeout);
    }
});

interval.start();
// Executions at: 500ms, 1000ms, 2000ms, 4000ms, 8000ms, 10000ms, 10000ms...
```

**Counter Parameter:**

- Starts at `1` for the first execution
- Increments with each tick
- Useful for implementing backoff strategies

For complex timing strategies, see the [Duration Functions](#duration-functions) section.

## Helper Functions

pinterval provides focused Promise-based helpers for four distinct finite-execution patterns:

- `poll` waits for a boolean condition.
- `until` waits for a returned value accepted by a predicate.
- `retry` repeats an operation only when it throws or rejects.
- `times` executes an operation a fixed number of times.

Every helper accepts positional scheduling arguments and object options. Its callback receives the same elapsed-time and effective-signal context used by `Interval`:

```typescript
interface ExecutionOptions {
    time: number | ((counter: number) => number); // Delay between executions
    start?: 'immediate' | 'delayed';              // Defaults to 'immediate'
    signal?: AbortSignal;                         // External cancellation
    timeout?: number;                             // Maximum total lifetime
}

interface RetryContext {
    attempt: number;       // One-based execution number
    elapsed: number;       // Milliseconds elapsed at attempt start
    signal: AbortSignal;   // Effective cancellation signal
}

type RetryDecision = boolean | void;
type OnRetry = (
    error: unknown,
    context: RetryContext
) => RetryDecision | Promise<RetryDecision>;

interface RetryOptions extends ExecutionOptions {
    attempts: number;
    onRetry?: OnRetry;
}

interface TimesOptions extends ExecutionOptions {
    amount: number;
}
```

`time`, `attempts`, and `amount` are required. `attempts` is the maximum total number of executions, including the first attempt.

### poll

Repeatedly checks a condition until it returns `true`. It resolves with `void`; errors propagate unchanged. By default, the first check happens immediately.

```typescript
import { poll } from 'pinterval';

// Keep polling until the status becomes ready
await poll(async () => {
    const status = await checkStatus();
    return status === 'ready';
}, 1000);

console.log('Condition met!');
```

**Signature:**
```typescript
function poll(
    condition: (context: IntervalContext) => boolean | Promise<boolean>,
    time: number | ((counter: number) => number),
    start?: 'immediate' | 'delayed'
): Promise<void>
function poll(
    condition: (context: IntervalContext) => boolean | Promise<boolean>,
    options: ExecutionOptions
): Promise<void>
```

**Parameters:**

- **condition** - Function that returns `true` to complete and `false` to keep polling
- **time** - Interval duration in milliseconds or duration function
- **start** - Start mode: `'immediate'` (default) or `'delayed'`

**Example with immediate start:**

```typescript
// Check immediately, then every 5 seconds (default behavior)
await poll(
    async () => (await fetch('/api/status')).ok,
    5000
);
```

**Example with delayed start:**

```typescript
// Wait 5 seconds before first check, then every 5 seconds
await poll(
    async () => (await fetch('/api/status')).ok,
    5000,
    'delayed'
);
```

### until

Repeatedly evaluates a value source and returns the first value accepted by an explicit predicate. The predicate sees every result, including `undefined`, `null`, and other falsy values. Source and predicate errors propagate unchanged.

```typescript
import { until } from 'pinterval';

// Wait until the returned state is ready
const state = await until(async ({ signal }) => {
    const response = await fetch('/api/data', { signal });
    return await response.json();
}, value => value.ready, 2000);

console.log('State ready:', state);
```

**Signature:**
```typescript
function until<T>(
    source: (context: IntervalContext) => T | Promise<T>,
    predicate: (value: T, context: IntervalContext) => boolean | Promise<boolean>,
    time: number | ((counter: number) => number),
    start?: 'immediate' | 'delayed'
): Promise<T>
function until<T>(
    source: (context: IntervalContext) => T | Promise<T>,
    options: ExecutionOptions & {
        predicate: (value: T, context: IntervalContext) => boolean | Promise<boolean>
    }
): Promise<T>
```

**Parameters:**

- **source** - Function that produces the value to inspect
- **predicate** - Function that returns `true` when that value should be returned
- **time** - Interval duration in milliseconds or duration function
- **start** - Start mode: `'immediate'` (default) or `'delayed'`

**Key Difference from poll:**

- `poll` - Waits for a boolean condition and returns `void`
- `until` - Applies a predicate to produced values and returns the qualifying value

### retry

Executes an operation until it returns normally or the maximum total attempt count is reached. Any returned value is success; only thrown or rejected failures are retried.

```typescript
import { retry } from 'pinterval';

// Retry up to 5 times with 2 second intervals
const result = await retry(
    async ({ attempt, signal }) => {
        const response = await fetch('/api/resource', { signal });
        if (!response.ok) throw new Error(`Attempt ${attempt} failed`);

        return await response.json();
    },
    5,      // max attempts
    2000    // interval between attempts
);
```

**Signature:**
```typescript
function retry<T>(
    operation: (context: RetryContext) => T | Promise<T>,
    attempts: number,
    time: number | ((counter: number) => number),
    start?: 'immediate' | 'delayed'
): Promise<T>
function retry<T>(
    operation: (context: RetryContext) => T | Promise<T>,
    options: RetryOptions
): Promise<T>
```

**Parameters:**

- **operation** - Function to execute. Any return is success; throwing or rejecting is failure
- **attempts** - Maximum total executions, including the first attempt
- **time** - Interval between retries
- **start** - Start mode: `'immediate'` (default) or `'delayed'`

Use object options to combine retry limits, delay, external cancellation, and an overall timeout:

```typescript
await retry(loadData, {
    attempts: 10,
    time: 250,
    timeout: 10_000
});
```

Observe failures and decide whether to retry with the same callback:

```typescript
const result = await retry(loadData, {
    attempts: 5,
    time: 500,
    onRetry: (error, { attempt }) => {
        console.warn(`Attempt ${attempt} failed`, error);

        return error instanceof HttpError && error.status >= 500;
    }
});
```

`onRetry` runs after an attempt fails, only when another attempt is available, and before the retry delay begins. Returning `false` stops and rethrows the current operation error unchanged. Returning `true`, returning `undefined`, or omitting a return continues with the retry, so observation-only callbacks do not accidentally disable retries:

```typescript
// Observation only: the missing return continues retrying.
onRetry: (error, { attempt }) => {
    logger.warn(`Attempt ${attempt} failed`, error);
}

// Decision only.
onRetry: error => isTransient(error)
```

The callback may be asynchronous. It is awaited before the retry delay, receives the effective cancellation signal through `RetryContext`, and may combine asynchronous observation with a decision:

```typescript
onRetry: async (error, context) => {
    await recordFailure(error, context);

    return shouldContinue(error);
}
```

If `onRetry` throws or rejects, its error is terminal and propagates unchanged. Exhaustion still rejects with the final operation error without invoking `onRetry` again.

**With exponential backoff:**

```typescript
import { retry, duration } from 'pinterval';

const result = await retry(
    async () => await fetchData(),
    10,
    duration.exponential(1000, 30000)
);
```

With the default immediate start, the first execution has no delay and the first retry uses duration index `2`. Pass `start: 'delayed'` when the first execution should wait for duration index `1`.

### times

Executes a function sequentially exactly `amount` times with a delay between executions. `amount` must be a non-negative integer, and zero resolves without executing.

```typescript
import { times } from 'pinterval';

// Execute immediately, then 4 more times with 1 second between executions
await times(
    async ({ iteration, signal }) => {
        console.log(`Execution ${iteration}`);
        await updateMetrics(iteration, { signal });
    },
    5,
    1000
);

console.log('All executions completed!');
```

**Signature:**
```typescript
function times(
    operation: (context: IntervalContext) => void | Promise<void>,
    amount: number,
    time: number | ((counter: number) => number),
    start?: 'immediate' | 'delayed'
): Promise<void>
function times(
    operation: (context: IntervalContext) => void | Promise<void>,
    options: TimesOptions
): Promise<void>
```

**Parameters:**

- **operation** - Function to execute. Receives one-based `iteration`, `elapsed`, and the effective `signal`
- **amount** - Number of times to execute
- **time** - Interval between executions
- **start** - Start mode: `'immediate'` (default) or `'delayed'`

### Migrating helper callbacks to v5

v5 intentionally removes result-sentinel retry behavior and makes helper conditions positive:

```typescript
// v4: true meant continue
await poll(() => !isReady(), 500);
// v5: true means satisfied
await poll(() => isReady(), 500);

// v4: undefined meant continue
await until(readState, 500);
// v5: the predicate owns acceptance
await until(readState, state => state.ready, 500);

// v4: undefined meant retry
await retry(async attempt => tryLoad(attempt), 5, 500);
// v5: failures retry; every normal return succeeds
await retry(async ({ attempt }) => await load(attempt), 5, 500);
```

Finite-helper callbacks now receive `IntervalContext` or `RetryContext` instead of a numeric counter. Duration functions keep their existing indices: immediate helpers skip index `1`, while delayed helpers use it for the initial delay.

### pipeline

Sequentially executes an array of functions with intervals between them. Each function receives the output of the previous one.

```typescript
import { pipeline } from 'pinterval';

const result = await pipeline([
    () => 1,
    (x) => x * 2,      // receives 1, returns 2
    (x) => x + 3,      // receives 2, returns 5
    (x) => x * 4       // receives 5, returns 20
], 100);

console.log(result); // 20
```

**Signature:**
```typescript
function pipeline(
    predicates: Array<(data: any) => any | Promise<any>>,
    time: number | ((counter: number) => number),
    start?: 'immediate' | 'delayed'
): Promise<any>
function pipeline(
    predicates: Array<(data: any) => any | Promise<any>>,
    options: ExecutionOptions
): Promise<any>
```

**Important Notes:**

- First function executes without a delay when `start: 'immediate'` (default)
- Each subsequent function waits for `time`
- Output of each function is passed to the next
- Perfect for multi-stage data processing

**Async pipeline example:**

```typescript
import { pipeline } from 'pinterval';

const result = await pipeline([
    async () => await fetch('/api/users'),
    async (response) => await response.json(),
    async (users) => users.filter(u => u.active),
    async (activeUsers) => {
        await saveToDatabase(activeUsers);
        return activeUsers.length;
    }
], 500);

console.log(`Processed ${result} active users`);
```

### sleep

Simple utility to pause execution for a specified duration.

```typescript
import { sleep } from 'pinterval';

console.log('Starting...');
await sleep(2000);
console.log('2 seconds later...');

const controller = new AbortController();
const pendingSleep = sleep(5000, { signal: controller.signal });
controller.abort();

try {
    await pendingSleep;
} catch (err) {
    console.log(err === controller.signal.reason); // true
}
```

**Signature:**
```typescript
function sleep(time: number, options?: { signal?: AbortSignal }): Promise<void>
```

## Duration Functions

Starting with v3.7.0, pinterval includes a collection of duration calculation functions for dynamic interval scheduling. These are perfect for implementing sophisticated retry and backoff strategies.

All duration functions are available under the `duration` namespace and follow this signature:

```typescript
type DurationFunction = (counter: number) => number;
```

The `counter` parameter starts at 1 for the first execution and increments with each tick.

### constant

Returns the same duration for every execution. Useful for fixed intervals.

```typescript
import { Interval, duration } from 'pinterval';

const interval = new Interval({
    func: () => console.log('Tick!'),
    time: duration.constant(1000)
});

interval.start();
// Executes every 1000ms: 1000, 1000, 1000, 1000...
```

**Signature:**
```typescript
function constant(ms: number): DurationFunction
```

**Use Cases:**

- Fixed interval polling
- Regular health checks
- Consistent retry delays

### linear

Increases duration linearly by a fixed increment on each iteration.

```typescript
import { Interval, duration } from 'pinterval';

const interval = new Interval({
    func: () => console.log('Tick!'),
    time: duration.linear(100, 50)
});

interval.start();
// Executes at: 100ms, 150ms, 200ms, 250ms, 300ms...
```

**Signature:**
```typescript
function linear(initial: number, increment: number): DurationFunction
```

**Parameters:**

- **initial** - Starting duration in milliseconds
- **increment** - Amount to increase (or decrease if negative) per iteration

**Use Cases:**

- Gradual slowdown for polling
- Progressive backoff with predictable growth
- Testing and debugging scenarios

**Decreasing intervals:**

```typescript
// Start fast, get slower by 100ms each time
const decreasing = duration.linear(2000, -100);
// Executes at: 2000ms, 1900ms, 1800ms, 1700ms...
```

### exponential

Doubles the duration on each iteration with an optional maximum cap. This is the standard backoff strategy used in many systems.

```typescript
import { retry, duration } from 'pinterval';

// Exponential backoff for retries
const result = await retry(
    async () => await fetchData(),
    10,
    duration.exponential(100, 10000)
);

// Immediate first attempt, then retry delays: 200ms, 400ms, 800ms, 1600ms, ...
```

**Signature:**
```typescript
function exponential(initial: number, max?: number): DurationFunction
```

**Parameters:**

- **initial** - Starting duration in milliseconds
- **max** - Optional maximum duration cap

**Use Cases:**

- Standard retry backoff strategy
- Network request retries
- Database reconnection attempts
- API rate limiting

**Without cap:**

```typescript
// Unbounded exponential growth
const uncapped = duration.exponential(100);
// Executes at: 100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms, 6400ms...
```

### fibonacci

Uses the Fibonacci sequence for duration calculation. Provides gentler growth than exponential backoff.

```typescript
import { Interval, duration } from 'pinterval';

const interval = new Interval({
    func: () => console.log('Tick!'),
    time: duration.fibonacci(100)
});

interval.start();
// Executes at: 100ms, 100ms, 200ms, 300ms, 500ms, 800ms, 1300ms...
```

**Signature:**
```typescript
function fibonacci(initial: number): DurationFunction
```

**Parameters:**

- **initial** - Base duration in milliseconds (used for F(0) and F(1))

**Use Cases:**

- Gentler backoff than exponential
- Natural growth patterns
- Alternative retry strategy when exponential is too aggressive

### jittered

Adds randomness to exponential backoff to prevent the "thundering herd" problem where multiple clients retry simultaneously.

```typescript
import { retry, duration } from 'pinterval';

// Add ±10% randomness to prevent synchronized retries
const result = await retry(
    async () => await fetchData(),
    10,
    duration.jittered(1000, 30000, 0.1)
);

// Immediate first attempt, then retry delays (with ±10% jitter):
// ~2000ms (1800-2200), ~4000ms (3600-4400), ~8000ms (7200-8800)...
```

**Signature:**
```typescript
function jittered(
    initial: number,
    max?: number,
    jitterFactor?: number
): DurationFunction
```

**Parameters:**

- **initial** - Starting duration in milliseconds
- **max** - Optional maximum duration cap
- **jitterFactor** - Amount of randomness (default: 0.1 = ±10%)

**Use Cases:**

- Distributed system retries
- Preventing thundering herd problem
- Load distribution across time
- API rate limiting with multiple clients

**Custom jitter:**

```typescript
// ±25% randomness
const highJitter = duration.jittered(1000, 10000, 0.25);

// ±5% randomness  
const lowJitter = duration.jittered(1000, 10000, 0.05);
```

### decorrelatedJitter

AWS-recommended jitter strategy where each delay is based on the previous delay, not the iteration count. This is a stateful function.

```typescript
import { retry, duration } from 'pinterval';

// AWS-style decorrelated jitter
const result = await retry(
    async () => await fetchData(),
    10,
    duration.decorrelatedJitter(100, 10000)
);

// Each delay is random(0, previous_delay * 3), capped at max
// Provides excellent distribution for distributed systems
```

**Signature:**
```typescript
function decorrelatedJitter(initial: number, max: number): DurationFunction
```

**Parameters:**

- **initial** - Starting duration in milliseconds
- **max** - Maximum duration cap (required)

**Use Cases:**

- AWS SDK retry logic
- Best-practice distributed retries
- Optimal backoff with jitter
- Production-ready retry strategies

**Important Note:**

This function is stateful - each instance maintains internal state. Create a new instance for each interval:

```typescript
// ✅ Correct: new instance per interval
const interval1 = new Interval({
    func: task1,
    time: duration.decorrelatedJitter(100, 5000)
});

const interval2 = new Interval({
    func: task2,
    time: duration.decorrelatedJitter(100, 5000)
});

// ❌ Wrong: sharing instance causes unexpected behavior
const sharedDuration = duration.decorrelatedJitter(100, 5000);
const interval3 = new Interval({ func: task1, time: sharedDuration });
const interval4 = new Interval({ func: task2, time: sharedDuration });
```

### steps

Returns different durations based on counter thresholds. Perfect for phase-based intervals that change behavior over time.

```typescript
import { Interval, duration } from 'pinterval';

const interval = new Interval({
    func: () => console.log('Tick!'),
    time: duration.steps([
        { threshold: 0, duration: 100 },   // Fast for first 5
        { threshold: 5, duration: 500 },   // Medium for 5-10
        { threshold: 10, duration: 2000 }  // Slow after 10
    ])
});

interval.start();
// Counter 1-4: 100ms
// Counter 5-9: 500ms  
// Counter 10+: 2000ms
```

**Signature:**
```typescript
function steps(
    thresholds: Array<{ threshold: number; duration: number }>
): DurationFunction
```

**Parameters:**

- **thresholds** - Array of threshold/duration pairs (order doesn't matter, will be sorted)

**Use Cases:**

- Phase-based intervals (fast → medium → slow)
- Polling that changes behavior over time
- Different retry strategies per attempt range
- Multi-stage backoff

**Complex example:**

```typescript
import { retry, duration } from 'pinterval';

// Aggressive at first, then back off
const result = await retry(
    async () => await fetchData(),
    20,
    duration.steps([
        { threshold: 0, duration: 100 },   // First 3 attempts: fast (100ms)
        { threshold: 3, duration: 500 },   // Attempts 3-6: medium (500ms)
        { threshold: 6, duration: 2000 },  // Attempts 6-10: slow (2s)
        { threshold: 10, duration: 5000 }  // Attempts 10+: very slow (5s)
    ])
);
```

## Real-World Examples

### Health Check with Exponential Backoff

Monitor a service health endpoint with intelligent backoff when failures occur:

```typescript
import { Interval, duration } from 'pinterval';

let consecutiveFailures = 0;

const healthCheck = new Interval({
    func: async () => {
        try {
            const response = await fetch('https://api.example.com/health');
            
            if (response.ok) {
                consecutiveFailures = 0;
                console.log('✓ Service is healthy');
                return true;
            }
            
            consecutiveFailures++;
            console.log(`✗ Service unhealthy (${consecutiveFailures} failures)`);
            return true;
        } catch (error) {
            consecutiveFailures++;
            console.error(`✗ Health check failed: ${error.message}`);
            return consecutiveFailures < 10; // Stop after 10 failures
        }
    },
    time: (counter) => {
        // Normal polling: 5s, on failure: exponential backoff up to 60s
        if (consecutiveFailures === 0) return 5000;
        return Math.min(5000 * Math.pow(2, consecutiveFailures - 1), 60000);
    },
    start: 'immediate'
});

healthCheck.start();
```

### API Polling with Conditional Stop

Poll an API until a specific condition is met:

```typescript
import { poll } from 'pinterval';

async function waitForJobCompletion(jobId: string) {
    console.log(`Waiting for job ${jobId} to complete...`);
    
    await poll(async () => {
        const response = await fetch(`/api/jobs/${jobId}`);
        const job = await response.json();
        
        console.log(`Job status: ${job.status}`);
        
        if (job.status === 'completed') {
            console.log('Job completed successfully!');
            return true;
        }
        
        if (job.status === 'failed') {
            throw new Error('Job failed!');
        }
        
        return false; // Keep polling
    }, 2000, 'immediate');
}

// Usage
await waitForJobCompletion('job-123');
```

### Retry with Fallback Strategies

Implement sophisticated retry logic with multiple strategies:

```typescript
import { retry, duration } from 'pinterval';

async function fetchWithRetry(url: string) {
    // Try primary endpoint with exponential backoff
    try {
        return await retry(
            async ({ signal }) => {
                const response = await fetch(url, { signal });
                if (!response.ok) throw new Error(`Primary request failed: ${response.status}`);
                return await response.json();
            },
            5,
            duration.exponential(1000, 10000),
            'immediate'
        );
    } catch (primaryError) {
        console.warn('Primary endpoint failed, trying backup...');
        
        // Fall back to backup endpoint with linear backoff
        return await retry(
            async ({ signal }) => {
                const response = await fetch(url.replace('api', 'api-backup'), { signal });
                if (!response.ok) throw new Error(`Backup request failed: ${response.status}`);
                return await response.json();
            },
            3,
            duration.linear(2000, 1000),
            'immediate'
        );
    }
}
```

### Rate-Limited API Client

Implement a rate-limited API client that respects API limits:

```typescript
import { Interval } from 'pinterval';

class RateLimitedClient {
    private queue: Array<() => Promise<any>> = [];
    private interval: Interval;
    
    constructor(requestsPerSecond: number) {
        const delay = 1000 / requestsPerSecond;
        
        this.interval = new Interval({
            func: async () => {
                if (this.queue.length === 0) {
                    return true; // Keep running
                }
                
                const task = this.queue.shift();
                if (task) {
                    await task();
                }
                
                return true;
            },
            time: delay,
            start: 'immediate'
        });
        
        this.interval.start();
    }
    
    async request(url: string): Promise<Response> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const response = await fetch(url);
                    resolve(response);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }
    
    stop() {
        this.interval.stop();
    }
}

// Usage: max 10 requests per second
const client = new RateLimitedClient(10);

// All requests are automatically rate-limited
const responses = await Promise.all([
    client.request('/api/users/1'),
    client.request('/api/users/2'),
    client.request('/api/users/3'),
    // ... more requests
]);
```

### Database Connection Retry with Jitter

Prevent thundering herd when multiple services try to reconnect to a database:

```typescript
import { retry, duration } from 'pinterval';

async function connectToDatabase(config: DbConfig) {
    console.log('Attempting to connect to database...');
    
    return await retry(async () => {
        const connection = await createConnection(config);
        await connection.ping();
        console.log('✓ Database connected');
        return connection;
    }, {
        attempts: 10,
        time: duration.jittered(1000, 30000, 0.2), // ±20% jitter
        onRetry: (error, { attempt }) => {
            console.log(`✗ Connection failed (attempt ${attempt}): ${error}, retrying...`);
        }
    });
}
```

### Multi-Stage Data Processing Pipeline

Process data through multiple stages with delays:

```typescript
import { pipeline } from 'pinterval';

async function processUserData(userId: string) {
    const result = await pipeline([
        // Stage 1: Fetch user data
        async () => {
            console.log('Stage 1: Fetching user data...');
            const response = await fetch(`/api/users/${userId}`);
            return await response.json();
        },
        
        // Stage 2: Enrich with additional data
        async (user) => {
            console.log('Stage 2: Enriching data...');
            const orders = await fetch(`/api/users/${userId}/orders`);
            return { ...user, orders: await orders.json() };
        },
        
        // Stage 3: Calculate analytics
        async (userData) => {
            console.log('Stage 3: Computing analytics...');
            return {
                ...userData,
                analytics: {
                    totalOrders: userData.orders.length,
                    totalSpent: userData.orders.reduce((sum, o) => sum + o.amount, 0)
                }
            };
        },
        
        // Stage 4: Save to cache
        async (enrichedData) => {
            console.log('Stage 4: Caching results...');
            await saveToCache(`user:${userId}`, enrichedData);
            return enrichedData;
        }
    ], 500); // 500ms between stages
    
    console.log('Pipeline completed!');
    return result;
}
```

### Scheduled Background Task

Run a background cleanup task with dynamic timing:

```typescript
import { Interval, duration } from 'pinterval';

const cleanupTask = new Interval({
    func: async ({ iteration }) => {
        console.log(`Running cleanup task (iteration ${iteration})...`);
        
        try {
            // Clean up old records
            const deleted = await deleteOldRecords();
            console.log(`✓ Cleaned up ${deleted} old records`);
            
            // Clean up temporary files
            await cleanupTempFiles();
            console.log('✓ Temporary files cleaned');
            
            return true; // Continue running
        } catch (error) {
            console.error(`✗ Cleanup failed: ${error.message}`);
            return true; // Continue despite errors
        }
    },
    time: duration.steps([
        { threshold: 0, duration: 60000 },      // First hour: every minute
        { threshold: 60, duration: 300000 },    // Hours 1-5: every 5 minutes
        { threshold: 300, duration: 3600000 }   // After 5 hours: every hour
    ]),
    start: 'delayed',
    onError: async (err) => {
        // Log error to monitoring service
        await logError('cleanup-task', err);
        return true; // Continue running
    }
});

cleanupTask.start();
```

## TypeScript Support

pinterval is written in TypeScript and provides full type definitions out of the box. No need for `@types/*` packages!

### Type-Safe Intervals

```typescript
import { Interval, Params, IntervalFunction } from 'pinterval';

// Type-safe interval function
const myFunction: IntervalFunction = ({ iteration, elapsed, signal }) => {
    console.log(`Tick ${iteration} after ${elapsed}ms`, signal.aborted);
    return iteration < 10;
};

// Type-safe parameters
const params: Params = {
    func: myFunction,
    time: 1000,
    start: 'immediate',
    onError: (err: Error) => {
        console.error(err);
        return false;
    }
};

const interval = new Interval(params);
```

### Generic Return Types

Helper functions support generic types for type-safe return values:

```typescript
import { until, retry } from 'pinterval';

interface User {
    id: string;
    name: string;
    email: string;
}

// Type-safe until
const user = await until<User>(async () => {
    const response = await fetch('/api/user');
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json(); // Typed as User
}, user => user.id.length > 0, 1000);

// user is typed as User
console.log(user.email);

// Type-safe retry
interface ApiResponse {
    success: boolean;
    data: any;
}

const result = await retry<ApiResponse>(
    async ({ signal }) => {
        const response = await fetch('/api/data', { signal });
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        return await response.json();
    },
    5,
    2000
);
```

### Custom Duration Functions

Create type-safe duration functions:

```typescript
import { DurationFunction, Interval } from 'pinterval';

// Custom duration function with full type safety
const customDuration: DurationFunction = (counter: number): number => {
    if (counter <= 3) return 1000;
    if (counter <= 6) return 2000;
    return 5000;
};

const interval = new Interval({
    func: () => console.log('Tick!'),
    time: customDuration
});
```

## Comparison with Native setInterval

Here's why you might choose pinterval over native `setInterval`:

| Feature | Native setInterval | pinterval |
|---------|-------------------|-----------|
| **Async/Await Support** | ❌ No native support | ✅ Built-in Promise support |
| **Error Handling** | ❌ Errors crash the interval | ✅ Graceful error handling with recovery |
| **Dynamic Intervals** | ❌ Fixed interval only | ✅ Calculate interval per iteration |
| **Auto-Stop** | ❌ Manual management only | ✅ Automatic stop on conditions |
| **Backoff Strategies** | ❌ Not supported | ✅ Multiple built-in strategies |
| **Race Conditions** | ❌ Can overlap with async code | ✅ Prevents overlapping execution |
| **Helper Functions** | ❌ Build your own | ✅ poll, retry, until, times, pipeline |
| **TypeScript** | ⚠️ Basic types only | ✅ Full TypeScript support |
| **API** | ⚠️ Callback-based | ✅ Modern Promise-based API |

### Migration Example

**Before (native setInterval):**

```javascript
let intervalId;
let attempts = 0;

intervalId = setInterval(async () => {
    try {
        attempts++;
        const response = await fetch('/api/status');
        const data = await response.json();
        
        if (data.ready) {
            clearInterval(intervalId);
            console.log('Ready!');
        }
        
        if (attempts >= 10) {
            clearInterval(intervalId);
            throw new Error('Max attempts reached');
        }
    } catch (error) {
        clearInterval(intervalId);
        console.error('Error:', error);
    }
}, 2000);
```

**After (pinterval):**

```typescript
import { until } from 'pinterval';

try {
    await until(async ({ signal }) => {
        const response = await fetch('/api/status', { signal });
        return await response.json();
    }, {
        predicate: data => data.ready,
        time: 2000,
        timeout: 20_000
    });
    
    console.log('Ready!');
} catch (error) {
    console.error('Error:', error);
}
```

## Best Practices

### 1. Choose the Right Helper Function

- Use `poll` when waiting for a boolean condition
- Use `until` when you need to return a value
- Use `retry` for operations with a maximum attempt limit
- Use `times` for a fixed number of executions
- Use `pipeline` for sequential multi-stage processing
- Use `Interval` class for complex custom scenarios

### 2. Handle Errors Appropriately

Always provide an error handler for production code:

```typescript
const interval = new Interval({
    func: async () => {
        await riskyOperation();
    },
    time: 5000,
    onError: async (err) => {
        // Log to monitoring service
        await logError(err);
        
        // Decide based on error type
        if (err instanceof NetworkError) {
            return true; // Retry on network errors
        }
        
        return false; // Stop on other errors
    }
});
```

### 3. Use Appropriate Backoff Strategies

- **Constant**: Simple polling with no rate limiting concerns
- **Linear**: Gradually reduce load over time
- **Exponential**: Standard retry strategy, most commonly used
- **Fibonacci**: Gentler than exponential, good for user-facing features
- **Jittered**: Distributed systems with multiple clients
- **DecorrelatedJitter**: Production-grade distributed systems (AWS recommendation)
- **Steps**: Different strategies for different phases

### 4. Prevent Memory Leaks

Always stop intervals when they're no longer needed:

```typescript
class MyComponent {
    private interval: Interval;
    
    start() {
        this.interval = new Interval({
            func: () => this.updateData(),
            time: 5000
        });
        this.interval.start();
    }
    
    // Clean up when component unmounts
    cleanup() {
        this.interval?.stop();
    }
}
```

### 5. Choose Between Immediate and Delayed Start

The default start mode is now `'immediate'` for most helper functions, which is ideal for most use cases:

```typescript
// ✅ Default behavior: check immediately, then resolve when the condition is true
await poll(() => checkStatus(), 1000); // Immediate by default

// Use 'delayed' when you specifically want to wait before the first execution
await poll(() => checkStatus(), 1000, 'delayed'); // Wait 1s before first check
```

**When to use 'delayed' mode:**
- When you need rate limiting from the very first execution
- When polling a resource that you know won't be ready immediately
- When you want consistent timing between all executions

### 6. Test with Shorter Intervals

Use shorter timeouts during testing:

```typescript
const timeout = process.env.NODE_ENV === 'test' ? 100 : 5000;

const interval = new Interval({
    func: myFunction,
    time: timeout
});
```

### 7. Combine Helpers for Complex Scenarios

```typescript
// Wait for service to be ready, then start processing
await poll(async () => await isServiceReady(), 1000);

// Now run the main task with retries
await times(async ({ iteration }) => {
    await retry(async () => await processItem(iteration), 3, 1000);
}, 10, 5000);
```

## Development

### Building the Project

```bash
# Install dependencies
npm install

# Build the project
npm run build

# The compiled JavaScript will be in the lib/ directory
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Linting

```bash
# Lint the code
npm run lint

# Format code
npm run fmt
```

### Generating Documentation

```bash
# Generate TypeDoc documentation
npm run doc

# Documentation will be generated in docs/ directory
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Steps to Contribute

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Guidelines

- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Credits

Created and maintained by [Tim Voronov](https://github.com/ziflex)

## Links

- [npm package](https://www.npmjs.com/package/pinterval)
- [API Documentation](http://ziflex.github.io/pinterval)
- [GitHub Repository](https://github.com/ziflex/pinterval)
- [Issue Tracker](https://github.com/ziflex/pinterval/issues)
- [Release Notes](https://github.com/ziflex/pinterval/releases)
