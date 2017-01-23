# pinterval

> Advanced interval

[![npm version](https://badge.fury.io/js/pinterval.svg)](https://www.npmjs.com/package/pinterval)
[![Build Status](https://secure.travis-ci.org/ziflex/pinterval.svg?branch=master)](http://travis-ci.org/ziflex/pinterval)
[![Coverage Status](https://coveralls.io/repos/github/ziflex/pinterval/badge.svg?branch=master)](https://coveralls.io/github/ziflex/pinterval)

````sh
    npm install --save pinterval
````

## API
You can find API [here](http://ziflex.github.io/pinterval)

## Features
- Error handling
- Async execution

## Usage

### Basic

```javascript

import Interval from 'pinterval';

const interval = Interval({
    func: () => console.log('Tick!'),
    time: 1000
});

interval.start();

```

### Error handling

```javascript

import Interval from 'pinterval';

const interval = Interval({
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

In order to pass async function, it has to accept callback function which will be passed on each tick.
Each tick is calcualated after async function completion in order to avoid race conditions.

```javascript

import Interval from 'pinterval';

const interval = Interval({
    func: (done) => {
        someAsyncTask().then(() => done).catch(done)
    },
    time: 1000
});

interval.start();

```
