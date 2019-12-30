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
- Error handling
- Async execution

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
