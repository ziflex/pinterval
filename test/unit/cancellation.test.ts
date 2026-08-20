import { expect } from 'chai';
import sinon, { SinonFakeTimers } from 'sinon';

import { AbortError, Interval, pipeline, poll, retry, sleep, TimeoutError, times, until } from '../../src';

function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    return promise.then(
        () => Promise.reject(new Error('Expected promise to reject')),
        (err: unknown) => err,
    );
}

describe('Cancellation and timeouts', () => {
    let clock: SinonFakeTimers;

    beforeEach(() => {
        clock = sinon.useFakeTimers();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('errors', () => {
        it('exposes cross-runtime abort and timeout errors', () => {
            const abortError = new AbortError();
            const timeoutError = new TimeoutError();

            expect(abortError).to.be.instanceOf(Error);
            expect(abortError).to.be.instanceOf(AbortError);
            expect(abortError.name).to.equal('AbortError');
            expect(abortError.message).to.equal('The operation was aborted');

            expect(timeoutError).to.be.instanceOf(Error);
            expect(timeoutError).to.be.instanceOf(TimeoutError);
            expect(timeoutError.name).to.equal('TimeoutError');
            expect(timeoutError.message).to.equal('The operation timed out');
        });

        it('supports custom messages', () => {
            expect(new AbortError('custom abort').message).to.equal('custom abort');
            expect(new TimeoutError('custom timeout').message).to.equal('custom timeout');
        });
    });

    describe('sleep', () => {
        it('resolves normally and releases its timer', async () => {
            const promise = sleep(100);

            expect(clock.countTimers()).to.equal(1);

            await clock.tickAsync(100);
            await promise;

            expect(clock.countTimers()).to.equal(0);
        });

        it('removes its abort listener after resolving', async () => {
            const controller = new AbortController();
            const removeListener = sinon.spy(controller.signal, 'removeEventListener');
            const promise = sleep(100, { signal: controller.signal });

            await clock.tickAsync(100);
            await promise;

            expect(removeListener.calledWith('abort')).to.be.true;
            expect(clock.countTimers()).to.equal(0);
        });

        it('rejects immediately without a timer when the signal is already aborted', async () => {
            const controller = new AbortController();
            const reason = new Error('cancelled');
            controller.abort(reason);

            const err = await rejectionOf(sleep(100, { signal: controller.signal }));

            expect(err).to.equal(reason);
            expect(clock.countTimers()).to.equal(0);
        });

        it('aborts while waiting and removes its timer and listener', async () => {
            const controller = new AbortController();
            const addListener = sinon.spy(controller.signal, 'addEventListener');
            const removeListener = sinon.spy(controller.signal, 'removeEventListener');
            const reason = new Error('cancelled');
            const promise = sleep(100, { signal: controller.signal });

            expect(clock.countTimers()).to.equal(1);

            controller.abort(reason);
            const err = await rejectionOf(promise);

            expect(err).to.equal(reason);
            expect(clock.countTimers()).to.equal(0);
            expect(addListener.calledWith('abort')).to.be.true;
            expect(removeListener.calledWith('abort')).to.be.true;
        });

        it('preserves the host default abort reason', async () => {
            const controller = new AbortController();
            const promise = sleep(100, { signal: controller.signal });

            controller.abort();
            const err = await rejectionOf(promise);

            expect(err).to.equal(controller.signal.reason);
            expect((err as Error).name).to.equal('AbortError');
        });

        it('creates an AbortError when an aborted signal has no reason', async () => {
            const signal = { aborted: true, reason: undefined } as AbortSignal;

            const err = await rejectionOf(sleep(100, { signal }));

            expect(err).to.be.instanceOf(AbortError);
            expect((err as AbortError).name).to.equal('AbortError');
            expect(clock.countTimers()).to.equal(0);
        });

        it('preserves an explicitly supplied null abort reason', async () => {
            const controller = new AbortController();
            controller.abort(null);

            const err = await rejectionOf(sleep(100, { signal: controller.signal }));

            expect(err).to.equal(null);
            expect(clock.countTimers()).to.equal(0);
        });
    });

    describe('Interval', () => {
        it('does not start with an already-aborted signal', async () => {
            const controller = new AbortController();
            const func = sinon.spy();
            controller.abort();

            const interval = new Interval({ func, time: 100, signal: controller.signal });
            interval.start();

            await clock.tickAsync(100);

            expect(interval.isRunning).to.be.false;
            expect(func.callCount).to.equal(0);
            expect(clock.countTimers()).to.equal(0);
        });

        it('clears a pending execution immediately when aborted', async () => {
            const controller = new AbortController();
            const func = sinon.spy();
            const interval = new Interval({ func, time: 100, signal: controller.signal });
            interval.start();

            expect(clock.countTimers()).to.equal(1);

            controller.abort();
            await clock.tickAsync(100);

            expect(interval.isRunning).to.be.false;
            expect(func.callCount).to.equal(0);
            expect(clock.countTimers()).to.equal(0);
        });

        it('does not schedule another execution after aborting an in-flight callback', async () => {
            const controller = new AbortController();
            let release: (() => void) | undefined;
            const func = sinon.spy(
                () =>
                    new Promise<void>((resolve) => {
                        release = resolve;
                    }),
            );
            const interval = new Interval({ func, time: 100, start: 'immediate', signal: controller.signal });
            interval.start();

            await clock.tickAsync(0);
            expect(func.callCount).to.equal(1);

            controller.abort();
            release?.();
            await clock.tickAsync(1_000);

            expect(interval.isRunning).to.be.false;
            expect(func.callCount).to.equal(1);
            expect(clock.countTimers()).to.equal(0);
        });

        it('supports repeated stop and either stop/abort ordering', () => {
            const stoppedFirst = new AbortController();
            const first = new Interval({ func: sinon.spy(), time: 100, signal: stoppedFirst.signal });
            first.start().stop().stop();
            stoppedFirst.abort();
            first.stop();

            const abortedFirst = new AbortController();
            const second = new Interval({ func: sinon.spy(), time: 100, signal: abortedFirst.signal });
            second.start();
            abortedFirst.abort();
            second.stop().stop();

            expect(first.isRunning).to.be.false;
            expect(second.isRunning).to.be.false;
            expect(clock.countTimers()).to.equal(0);
        });

        it('removes its signal listener after natural completion', async () => {
            const controller = new AbortController();
            const removeListener = sinon.spy(controller.signal, 'removeEventListener');
            const interval = new Interval({
                func: () => false,
                time: 100,
                start: 'immediate',
                signal: controller.signal,
            });
            interval.start();

            await clock.tickAsync(0);

            expect(interval.isRunning).to.be.false;
            expect(removeListener.calledWith('abort')).to.be.true;
            expect(clock.countTimers()).to.equal(0);
        });

        it('ignores a stale callback completion after restart', async () => {
            let releaseFirst: ((value: boolean) => void) | undefined;
            const func = sinon.stub();
            func.onFirstCall().returns(
                new Promise<boolean>((resolve) => {
                    releaseFirst = resolve;
                }),
            );
            func.callsFake(async () => true);
            const interval = new Interval({ func, time: 100, start: 'immediate' });

            interval.start();
            await clock.tickAsync(0);
            interval.stop();
            interval.start();
            await clock.tickAsync(0);

            releaseFirst?.(false);
            await clock.tickAsync(0);

            expect(interval.isRunning).to.be.true;
            expect(func.callCount).to.equal(2);
            expect(clock.countTimers()).to.equal(1);

            interval.stop();
        });
    });

    describe('finite helpers', () => {
        const abortCases = [
            {
                name: 'poll',
                run: (func: sinon.SinonSpy, signal: AbortSignal, timeout?: number) =>
                    poll(
                        () => {
                            func();
                            return true;
                        },
                        { time: 100, signal, timeout },
                    ),
            },
            {
                name: 'until',
                run: (func: sinon.SinonSpy, signal: AbortSignal, timeout?: number) =>
                    until(
                        () => {
                            func();
                            return undefined;
                        },
                        { time: 100, signal, timeout },
                    ),
            },
            {
                name: 'retry',
                run: (func: sinon.SinonSpy, signal: AbortSignal, timeout?: number) =>
                    retry(
                        () => {
                            func();
                            return undefined;
                        },
                        { attempts: 100, time: 100, signal, timeout },
                    ),
            },
            {
                name: 'times',
                run: (func: sinon.SinonSpy, signal: AbortSignal, timeout?: number) =>
                    times(() => func(), { amount: 100, time: 100, signal, timeout }),
            },
            {
                name: 'pipeline',
                run: (func: sinon.SinonSpy, signal: AbortSignal, timeout?: number) =>
                    pipeline([() => func(), () => func()], { time: 100, signal, timeout }),
            },
        ];

        for (const testCase of abortCases) {
            it(`${testCase.name} rejects immediately for an already-aborted signal`, async () => {
                const controller = new AbortController();
                const reason = new Error('cancelled');
                const func = sinon.spy();
                controller.abort(reason);

                const err = await rejectionOf(testCase.run(func, controller.signal));

                expect(err).to.equal(reason);
                expect(func.callCount).to.equal(0);
                expect(clock.countTimers()).to.equal(0);
            });

            it(`${testCase.name} aborts a pending delay without another callback`, async () => {
                const controller = new AbortController();
                const reason = new Error('cancelled');
                const func = sinon.spy();
                const promise = testCase.run(func, controller.signal);

                await clock.tickAsync(0);
                expect(func.callCount).to.equal(1);

                controller.abort(reason);
                const err = await rejectionOf(promise);
                await clock.tickAsync(1_000);

                expect(err).to.equal(reason);
                expect(func.callCount).to.equal(1);
                expect(clock.countTimers()).to.equal(0);
            });

            it(`${testCase.name} enforces an overall timeout without aborting the caller signal`, async () => {
                const controller = new AbortController();
                const func = sinon.spy();
                const promise = testCase.run(func, controller.signal, 50);
                const rejection = rejectionOf(promise);

                await clock.tickAsync(50);
                const err = await rejection;
                await clock.tickAsync(1_000);

                expect(err).to.be.instanceOf(TimeoutError);
                expect((err as TimeoutError).name).to.equal('TimeoutError');
                expect(controller.signal.aborted).to.be.false;
                expect(func.callCount).to.equal(1);
                expect(clock.countTimers()).to.equal(0);
            });
        }

        it('supports every object overload without changing helper semantics', async () => {
            const pollFunc = sinon.stub();
            pollFunc.onFirstCall().returns(true);
            pollFunc.onSecondCall().returns(false);
            const pollPromise = poll(pollFunc, { time: 10 });
            await clock.runAllAsync();
            await pollPromise;

            const untilFunc = sinon.stub();
            untilFunc.onFirstCall().returns(undefined);
            untilFunc.onSecondCall().returns('ready');
            const untilPromise = until(untilFunc, { time: 10 });
            await clock.runAllAsync();

            const retryFunc = sinon.stub();
            retryFunc.onFirstCall().returns(undefined);
            retryFunc.onSecondCall().returns('done');
            const retryPromise = retry(retryFunc, { attempts: 2, time: 10 });
            await clock.runAllAsync();

            const timesFunc = sinon.spy();
            const timesPromise = times(timesFunc, { amount: 2, time: 10 });
            await clock.runAllAsync();
            await timesPromise;

            const pipelinePromise = pipeline([() => 2, (value) => value * 3], { time: 10 });
            await clock.runAllAsync();

            expect(await untilPromise).to.equal('ready');
            expect(await retryPromise).to.equal('done');
            expect(timesFunc.callCount).to.equal(2);
            expect(await pipelinePromise).to.equal(6);
            expect(clock.countTimers()).to.equal(0);
        });

        it('lets the first of external cancellation and timeout win', async () => {
            const externalFirst = new AbortController();
            const reason = new Error('external');
            const externalPromise = until(() => undefined, {
                time: 100,
                timeout: 50,
                signal: externalFirst.signal,
            });

            await clock.tickAsync(20);
            externalFirst.abort(reason);
            expect(await rejectionOf(externalPromise)).to.equal(reason);

            const timeoutFirst = new AbortController();
            const timeoutPromise = until(() => undefined, {
                time: 100,
                timeout: 50,
                signal: timeoutFirst.signal,
            });
            const timeoutRejection = rejectionOf(timeoutPromise);

            await clock.tickAsync(50);
            const err = await timeoutRejection;
            timeoutFirst.abort(reason);

            expect(err).to.be.instanceOf(TimeoutError);
            expect(clock.countTimers()).to.equal(0);
        });

        it('includes a delayed first execution in the overall timeout', async () => {
            const func = sinon.spy(() => undefined);
            const promise = until(func, {
                time: 100,
                start: 'delayed',
                timeout: 50,
            });
            const rejection = rejectionOf(promise);

            await clock.tickAsync(50);

            const err = await rejection;
            expect(err).to.be.instanceOf(TimeoutError);
            expect(func.callCount).to.equal(0);
            expect(clock.countTimers()).to.equal(0);
        });

        it('rejects promptly on timeout while a callback is in flight and ignores its later completion', async () => {
            let release: ((value: string) => void) | undefined;
            const func = sinon.spy(
                () =>
                    new Promise<string>((resolve) => {
                        release = resolve;
                    }),
            );
            const promise = until(func, { time: 100, timeout: 50 });
            const rejection = rejectionOf(promise);

            await clock.tickAsync(0);
            await clock.tickAsync(50);
            const err = await rejection;

            release?.('late');
            await clock.tickAsync(1_000);

            expect(err).to.be.instanceOf(TimeoutError);
            expect(func.callCount).to.equal(1);
            expect(clock.countTimers()).to.equal(0);
        });

        it('cleans up timeout and external listeners after successful completion', async () => {
            const controller = new AbortController();
            const removeListener = sinon.spy(controller.signal, 'removeEventListener');
            const promise = until(() => 'ready', {
                time: 100,
                timeout: 1_000,
                signal: controller.signal,
            });

            await clock.tickAsync(0);

            expect(await promise).to.equal('ready');
            expect(removeListener.calledWith('abort')).to.be.true;
            expect(controller.signal.aborted).to.be.false;
            expect(clock.countTimers()).to.equal(0);
        });

        it('preserves callback error identity', async () => {
            const expected = new Error('application failure');
            const promise = retry(
                () => {
                    throw expected;
                },
                { attempts: 3, time: 100, timeout: 1_000 },
            );
            const rejection = rejectionOf(promise);

            await clock.tickAsync(0);

            expect(await rejection).to.equal(expected);
            expect(clock.countTimers()).to.equal(0);
        });
    });
});
