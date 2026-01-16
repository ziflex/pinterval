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
  - [Start Modes](#start-modes)
  - [Auto-Stop Mechanism](#auto-stop-mechanism)
  - [Error Handling](#error-handling)
- [Helper Functions](#helper-functions)
  - [poll](#poll)
  - [until](#until)
  - [retry](#retry)
  - [times](#times)
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
- ✅ **TypeScript First** - Full TypeScript support with comprehensive type definitions
- ✅ **Zero Dependencies** - Minimal footprint with only one tiny dependency
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
    func: (() => boolean | void) | ((counter: number) => boolean | void);
    time: number | ((counter: number) => number);
    start?: 'immediate' | 'delayed';
    onError?: (err: Error) => boolean | void;
}
```

- **func** - Function to execute on each interval. Can be sync or async (returns Promise)
- **time** - Interval duration in milliseconds or a function that calculates it dynamically
- **start** - When to execute the first tick: `'delayed'` (default) waits for first timeout, `'immediate'` executes immediately
- **onError** - Optional error handler. Return `true` to continue, `false` to stop

#### Methods

- **start()** - Starts the interval. Throws if already running.
- **stop()** - Stops the interval. Throws if already stopped.
- **isRunning** - Property that returns `true` if the interval is currently running.

### Start Modes

Control when your interval executes for the first time:

```typescript
// Delayed start (default): waits for timeout before first execution
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
- `false` - Stop interval execution
- `undefined` or no return - Stops interval execution
- If error handler itself throws, the interval stops

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

pinterval provides several high-level helper functions for common patterns. All helpers are Promise-based and work seamlessly with async/await.

### poll

Repeatedly checks a condition until it returns `true`. Perfect for waiting on asynchronous operations. By default, the first check happens immediately.

```typescript
import { poll } from 'pinterval';

// Wait for a condition to be true (checks immediately, then every 1 second)
await poll(async () => {
    const status = await checkStatus();
    return status === 'ready';
}, 1000);

console.log('Condition met!');
```

**Signature:**
```typescript
function poll(
    predicate: () => boolean | Promise<boolean>,
    timeout: number | ((counter: number) => number),
    start?: 'immediate' | 'delayed'
): Promise<void>
```

**Parameters:**

- **predicate** - Function that returns `true` when condition is met
- **timeout** - Interval duration in milliseconds or duration function
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

Similar to `poll`, but returns the value from the predicate once it's defined (not `undefined`). By default, the first check happens immediately.

```typescript
import { until } from 'pinterval';

// Wait until we get actual data (checks immediately, then every 2 seconds)
const data = await until(async () => {
    const response = await fetch('/api/data');
    if (!response.ok) return undefined;
    
    const json = await response.json();
    return json.data; // Returns value once available
}, 2000);

console.log('Data received:', data);
```

**Signature:**
```typescript
function until<T>(
    predicate: () => T | undefined | Promise<T | undefined>,
    timeout: number | ((counter: number) => number),
    start?: 'immediate' | 'delayed'
): Promise<T>
```

**Parameters:**

- **predicate** - Function that returns a value when condition is met, or `undefined` to continue polling
- **timeout** - Interval duration in milliseconds or duration function
- **start** - Start mode: `'immediate'` (default) or `'delayed'`

**Key Difference from poll:**

- `poll` - Waits for `true`, returns `void`
- `until` - Waits for non-`undefined` value, returns that value

### retry

Executes a function with retry logic. Stops after reaching the maximum attempts or when a truthy value is returned.

```typescript
import { retry } from 'pinterval';

// Retry up to 5 times with 2 second intervals
const result = await retry(
    async (attempt) => {
        const response = await fetch('/api/resource');
        if (response.ok) {
            return await response.json();
        }
        return undefined; // Will retry
    },
    5,      // max attempts
    2000    // interval between attempts
);
```

**Signature:**
```typescript
function retry<T>(
    predicate: (attempt: number) => T | Promise<T>,
    attempts: number,
    timeout: number | ((counter: number) => number),
    start?: 'immediate' | 'delayed'
): Promise<T>
```

**Parameters:**

- **predicate** - Function to retry that receives the current attempt number. Return `undefined` to retry, or a value to resolve
- **attempts** - Maximum number of retry attempts
- **timeout** - Interval between retries
- **start** - Start mode: `'immediate'` (default) or `'delayed'`

**With exponential backoff:**

```typescript
import { retry, duration } from 'pinterval';

const result = await retry(
    async (attempt) => {
        try {
            return await fetchData();
        } catch {
            return undefined; // Retry on error
        }
    },
    10,
    duration.exponential(1000, 30000) // 1s, 2s, 4s, 8s, 16s, 30s, 30s...
);
```

### times

Executes a function a specific number of times with an interval between executions. By default, the first execution happens immediately.

```typescript
import { times } from 'pinterval';

// Execute immediately, then 4 more times with 1 second between executions
await times(
    async (counter) => {
        console.log(`Execution ${counter}`);
        await updateMetrics(counter);
    },
    5,
    1000
);

console.log('All executions completed!');
```

**Signature:**
```typescript
function times(
    predicate: (counter: number) => void | Promise<void>,
    amount: number,
    timeout: number | ((counter: number) => number),
    start?: 'immediate' | 'delayed'
): Promise<void>
```

**Parameters:**

- **predicate** - Function to execute. Receives counter (1-based) as parameter
- **amount** - Number of times to execute
- **timeout** - Interval between executions
- **start** - Start mode: `'immediate'` (default) or `'delayed'`

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
    timeout: number | ((counter: number) => number),
    start?: 'immediate' | 'delayed'
): Promise<any>
```

**Important Notes:**

- First function executes with 0 timeout when `start: 'immediate'` (default)
- Each subsequent function waits for the timeout
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
```

**Signature:**
```typescript
function sleep(time: number): Promise<void>
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
    async (attempt) => await fetchData(),
    10,
    duration.exponential(100, 10000)
);

// Executes at: 100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms, 6400ms, 10000ms, 10000ms...
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

// Example execution times (with ±10% jitter):
// ~1000ms (900-1100), ~2000ms (1800-2200), ~4000ms (3600-4400)...
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
    async (attempt) => await fetchData(),
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
            async (attempt) => {
                const response = await fetch(url);
                if (!response.ok) return undefined;
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
            async (attempt) => {
                const response = await fetch(url.replace('api', 'api-backup'));
                if (!response.ok) return undefined;
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
    
    return await retry(
        async (attempt) => {
            try {
                const connection = await createConnection(config);
                await connection.ping();
                console.log('✓ Database connected');
                return connection;
            } catch (error) {
                console.log(`✗ Connection failed (attempt ${attempt}): ${error.message}, retrying...`);
                return undefined;
            }
        },
        10,
        duration.jittered(1000, 30000, 0.2), // ±20% jitter
        'immediate'
    );
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
    func: async (counter) => {
        console.log(`Running cleanup task (iteration ${counter})...`);
        
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
const myFunction: IntervalFunction = (counter) => {
    console.log(`Tick ${counter}`);
    return counter < 10;
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
    if (!response.ok) return undefined;
    return await response.json(); // Typed as User
}, 1000);

// user is typed as User
console.log(user.email);

// Type-safe retry
interface ApiResponse {
    success: boolean;
    data: any;
}

const result = await retry<ApiResponse>(
    async (attempt) => {
        const response = await fetch('/api/data');
        if (!response.ok) return undefined;
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
import { retry } from 'pinterval';

try {
    await retry(async (attempt) => {
        const response = await fetch('/api/status');
        const data = await response.json();
        return data.ready ? data : undefined;
    }, 10, 2000);
    
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
        if (this.interval?.isRunning) {
            this.interval.stop();
        }
    }
}
```

### 5. Choose Between Immediate and Delayed Start

The default start mode is now `'immediate'` for most helper functions, which is ideal for most use cases:

```typescript
// ✅ Default behavior: Check immediately, then retry
await poll(checkStatus, 1000); // Immediate by default

// Use 'delayed' when you specifically want to wait before the first execution
await poll(checkStatus, 1000, 'delayed'); // Wait 1s before first check
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
await times(async (counter) => {
    await retry(async () => await processItem(counter), 3, 1000);
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
- [Changelog](CHANGELOG.md)
