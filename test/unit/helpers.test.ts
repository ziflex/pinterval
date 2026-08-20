import { expect } from 'chai';
import sinon, { SinonFakeTimers } from 'sinon';

import { pipeline, poll, retry, RetryContext, times, until } from '../../src';

function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    return promise.then(
        () => Promise.reject(new Error('Expected promise to reject')),
        (err: unknown) => err,
    );
}

describe('Helpers', () => {
    let clock: SinonFakeTimers;

    beforeEach(() => {
        clock = sinon.useFakeTimers();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('poll', () => {
        it('completes when the condition becomes true and exposes context', async () => {
            const iterations: number[] = [];
            const promise = poll(({ iteration, elapsed, signal }) => {
                iterations.push(iteration);
                expect(elapsed).to.equal((iteration - 1) * 10);
                expect(signal.aborted).to.be.false;

                return iteration === 3;
            }, 10);

            await clock.runAllAsync();
            await promise;

            expect(iterations).to.deep.equal([1, 2, 3]);
            expect(clock.countTimers()).to.equal(0);
        });

        it('supports object options and delayed start', async () => {
            const condition = sinon.stub().returns(true);
            const promise = poll(condition, { time: 25, start: 'delayed' });

            await clock.tickAsync(24);
            expect(condition.callCount).to.equal(0);

            await clock.tickAsync(1);
            await promise;

            expect(condition.callCount).to.equal(1);
            expect(condition.firstCall.args[0].iteration).to.equal(1);
        });

        it('preserves condition errors', async () => {
            const expected = new Error('condition failed');
            const promise = poll(() => {
                throw expected;
            }, 10);
            const rejection = rejectionOf(promise);

            await clock.tickAsync(0);

            expect(await rejection).to.equal(expected);
            expect(clock.countTimers()).to.equal(0);
        });
    });

    describe('until', () => {
        it('returns the first value accepted by a positional predicate, including undefined', async () => {
            const source = sinon.stub();
            source.onFirstCall().returns('pending');
            source.onSecondCall().returns(undefined);
            const predicate = sinon.spy((value: string | undefined, context: { iteration: number }) => {
                expect(context.iteration).to.be.oneOf([1, 2]);

                return typeof value === 'undefined';
            });
            const promise = until(source, predicate, 10);

            await clock.runAllAsync();

            expect(await promise).to.equal(undefined);
            expect(source.callCount).to.equal(2);
            expect(predicate.callCount).to.equal(2);
            expect(predicate.secondCall.args[1].iteration).to.equal(2);
            expect(clock.countTimers()).to.equal(0);
        });

        it('supports an asynchronous predicate in object options and returns falsy values', async () => {
            const values = [1, 0];
            const promise = until(() => values.shift(), {
                predicate: async (value, { iteration }) => {
                    await Promise.resolve();
                    expect(iteration).to.equal(value === 1 ? 1 : 2);

                    return value === 0;
                },
                time: 10,
            });

            await clock.runAllAsync();

            expect(await promise).to.equal(0);
        });

        it('preserves source and predicate errors', async () => {
            const sourceError = new Error('source failed');
            const sourcePromise = until(
                () => {
                    throw sourceError;
                },
                () => true,
                10,
            );
            const sourceRejection = rejectionOf(sourcePromise);

            await clock.tickAsync(0);
            expect(await sourceRejection).to.equal(sourceError);

            const predicateError = new Error('predicate failed');
            const predicatePromise = until(
                () => 'value',
                () => {
                    throw predicateError;
                },
                10,
            );
            const predicateRejection = rejectionOf(predicatePromise);

            await clock.tickAsync(0);
            expect(await predicateRejection).to.equal(predicateError);
            expect(clock.countTimers()).to.equal(0);
        });
    });

    describe('times', () => {
        it('executes exactly the requested amount without a trailing delay', async () => {
            const contexts: Array<{ iteration: number; elapsed: number; signal: AbortSignal }> = [];
            const promise = times(
                (context) => {
                    contexts.push(context);
                },
                { amount: 3, time: 10 },
            );

            await clock.runAllAsync();
            await promise;

            expect(contexts.map(({ iteration }) => iteration)).to.deep.equal([1, 2, 3]);
            expect(contexts.map(({ elapsed }) => elapsed)).to.deep.equal([0, 10, 20]);
            expect(new Set(contexts.map(({ signal }) => signal)).size).to.equal(1);
            expect(clock.now).to.equal(20);
            expect(clock.countTimers()).to.equal(0);
        });

        it('resolves amount zero without executing or scheduling', async () => {
            const operation = sinon.spy();

            await times(operation, 0, 10);

            expect(operation.callCount).to.equal(0);
            expect(clock.countTimers()).to.equal(0);
        });

        it('rejects invalid amounts without executing', async () => {
            for (const amount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
                const operation = sinon.spy();
                const error = await rejectionOf(times(operation, amount, 10));

                expect(error).to.be.instanceOf(RangeError);
                expect((error as RangeError).message).to.equal('"amount" must be a non-negative integer');
                expect(operation.callCount).to.equal(0);
            }

            expect(clock.countTimers()).to.equal(0);
        });

        it('never overlaps asynchronous operations', async () => {
            const releases: Array<() => void> = [];
            let active = 0;
            let maxActive = 0;
            const promise = times(
                async () => {
                    active += 1;
                    maxActive = Math.max(maxActive, active);
                    await new Promise<void>((resolve) => releases.push(resolve));
                    active -= 1;
                },
                2,
                10,
            );

            await clock.tickAsync(0);
            await clock.tickAsync(100);
            expect(releases).to.have.length(1);

            releases.shift()?.();
            await clock.tickAsync(10);
            expect(releases).to.have.length(1);

            releases.shift()?.();
            await promise;

            expect(maxActive).to.equal(1);
            expect(clock.countTimers()).to.equal(0);
        });
    });

    describe('retry', () => {
        for (const [name, value] of [
            ['undefined', undefined],
            ['null', null],
            ['false', false],
            ['zero', 0],
            ['empty string', ''],
        ] as const) {
            it(`treats ${name} as a successful first-attempt result`, async () => {
                const operation = sinon.stub().returns(value);
                const promise = retry(operation, 3, 10);

                await clock.tickAsync(0);

                expect(await promise).to.equal(value);
                expect(operation.callCount).to.equal(1);
                expect(operation.firstCall.args[0].attempt).to.equal(1);
                expect(clock.countTimers()).to.equal(0);
            });
        }

        it('retries failures, exposes one-based context, and returns a later success', async () => {
            const first = new Error('first');
            const second = new Error('second');
            const contexts: RetryContext[] = [];
            const operation = sinon.stub().callsFake((context: RetryContext) => {
                contexts.push(context);

                if (context.attempt === 1) throw first;
                if (context.attempt === 2) throw second;

                return 'done';
            });
            const onRetry = sinon.spy();
            const promise = retry(operation, { attempts: 3, time: 10, onRetry });

            await clock.runAllAsync();

            expect(await promise).to.equal('done');
            expect(contexts.map(({ attempt }) => attempt)).to.deep.equal([1, 2, 3]);
            expect(contexts.map(({ elapsed }) => elapsed)).to.deep.equal([0, 10, 20]);
            expect(new Set(contexts.map(({ signal }) => signal)).size).to.equal(1);
            expect(onRetry.callCount).to.equal(2);
            expect(onRetry.firstCall.args).to.deep.equal([first, contexts[0]]);
            expect(onRetry.secondCall.args).to.deep.equal([second, contexts[1]]);
        });

        it('rejects with the final application error without another decision or delay', async () => {
            const errors = [new Error('one'), new Error('two'), new Error('three')];
            const operation = sinon.stub().callsFake(({ attempt }: RetryContext) => {
                throw errors[attempt - 1];
            });
            const retryIf = sinon.stub().returns(true);
            const onRetry = sinon.spy();
            const promise = retry(operation, { attempts: 3, time: 10, retryIf, onRetry });
            const rejection = rejectionOf(promise);

            await clock.runAllAsync();

            expect(await rejection).to.equal(errors[2]);
            expect(operation.callCount).to.equal(3);
            expect(retryIf.callCount).to.equal(2);
            expect(onRetry.callCount).to.equal(2);
            expect(clock.now).to.equal(20);
            expect(clock.countTimers()).to.equal(0);
        });

        it('supports synchronous and asynchronous retryIf decisions', async () => {
            const firstError = new Error('retry');
            const permitted = sinon.stub();
            permitted.onFirstCall().throws(firstError);
            permitted.onSecondCall().returns('ok');
            const asyncRetryIf = sinon.spy(async (error: unknown, { attempt }: RetryContext) => {
                await Promise.resolve();

                return error === firstError && attempt === 1;
            });
            const permittedPromise = retry(permitted, { attempts: 2, time: 10, retryIf: asyncRetryIf });

            await clock.runAllAsync();
            expect(await permittedPromise).to.equal('ok');
            expect(asyncRetryIf.callCount).to.equal(1);

            const rejectedError = new Error('do not retry');
            const rejected = sinon.stub().throws(rejectedError);
            const rejectedPromise = retry(rejected, { attempts: 3, time: 10, retryIf: () => false });
            const rejection = rejectionOf(rejectedPromise);

            await clock.tickAsync(0);

            expect(await rejection).to.equal(rejectedError);
            expect(rejected.callCount).to.equal(1);
            expect(clock.countTimers()).to.equal(0);
        });

        it('propagates retryIf and onRetry failures unchanged', async () => {
            const operationError = new Error('operation');
            const conditionError = new Error('condition');
            const conditionPromise = retry(
                () => {
                    throw operationError;
                },
                {
                    attempts: 2,
                    time: 10,
                    retryIf: async () => {
                        throw conditionError;
                    },
                },
            );
            const conditionRejection = rejectionOf(conditionPromise);

            await clock.tickAsync(0);
            expect(await conditionRejection).to.equal(conditionError);

            const hookError = new Error('hook');
            const hookPromise = retry(
                () => {
                    throw operationError;
                },
                {
                    attempts: 2,
                    time: 10,
                    onRetry: async () => {
                        throw hookError;
                    },
                },
            );
            const hookRejection = rejectionOf(hookPromise);

            await clock.tickAsync(0);
            expect(await hookRejection).to.equal(hookError);
            expect(clock.countTimers()).to.equal(0);
        });

        it('uses existing duration indices without scheduling after settlement', async () => {
            const immediateDuration = sinon.stub().returns(10);
            const immediatePromise = retry(
                ({ attempt }) => {
                    if (attempt < 3) throw new Error(`attempt ${attempt}`);

                    return 'done';
                },
                3,
                immediateDuration,
            );

            await clock.runAllAsync();
            expect(await immediatePromise).to.equal('done');
            expect(immediateDuration.args.map(([index]) => index)).to.deep.equal([2, 3]);

            const delayedDuration = sinon.stub().returns(10);
            const delayedPromise = retry(
                ({ attempt }) => {
                    if (attempt < 3) throw new Error(`attempt ${attempt}`);

                    return 'done';
                },
                3,
                delayedDuration,
                'delayed',
            );

            await clock.runAllAsync();
            expect(await delayedPromise).to.equal('done');
            expect(delayedDuration.args.map(([index]) => index)).to.deep.equal([1, 2, 3]);

            const finalFailure = new Error('final');
            const failureDuration = sinon.stub().returns(10);
            const failurePromise = retry(
                ({ attempt }) => {
                    if (attempt === 3) throw finalFailure;

                    throw new Error(`attempt ${attempt}`);
                },
                3,
                failureDuration,
            );
            const failureRejection = rejectionOf(failurePromise);

            await clock.runAllAsync();
            expect(await failureRejection).to.equal(finalFailure);
            expect(failureDuration.args.map(([index]) => index)).to.deep.equal([2, 3]);
            expect(clock.countTimers()).to.equal(0);
        });

        it('rejects invalid attempt counts without executing', async () => {
            for (const attempts of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
                const operation = sinon.spy();
                const error = await rejectionOf(retry(operation, attempts, 10));

                expect(error).to.be.instanceOf(RangeError);
                expect((error as RangeError).message).to.equal('"attempts" must be a positive integer');
                expect(operation.callCount).to.equal(0);
            }

            expect(clock.countTimers()).to.equal(0);
        });
    });

    describe('pipeline', () => {
        it('preserves sequential data flow', async () => {
            const promise = pipeline([() => 1, (value) => value * 2, (value) => value * 3], 10);

            await clock.runAllAsync();

            expect(await promise).to.equal(6);
        });
    });
});
