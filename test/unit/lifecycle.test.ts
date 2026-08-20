import { expect } from 'chai';
import sinon, { SinonFakeTimers } from 'sinon';

import { AbortError, Interval, IntervalContext } from '../../src';

function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    return promise.then(
        () => Promise.reject(new Error('Expected promise to reject')),
        (err: unknown) => err,
    );
}

describe('Interval lifecycle', () => {
    let clock: SinonFakeTimers;

    beforeEach(() => {
        clock = sinon.useFakeTimers();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('state and completion', () => {
        it('starts idle with an already-resolved completion promise', async () => {
            const interval = new Interval({ func: sinon.spy(), time: 100 });

            expect(interval.state).to.equal('idle');
            expect(interval.isRunning).to.be.false;
            expect(interval.done).to.be.instanceOf(Promise);
            expect(interval.stop().pause().resume()).to.equal(interval);
            expect(interval.state).to.equal('idle');
            await interval.done;
        });

        it('resolves on natural completion and explicit stop', async () => {
            const natural = new Interval({ func: () => false, time: 100, start: 'immediate' });
            natural.start();
            const naturalDone = natural.done;

            expect(natural.state).to.equal('running');
            await clock.tickAsync(0);
            await naturalDone;
            expect(natural.state).to.equal('stopped');

            const stopped = new Interval({ func: sinon.spy(), time: 100 });
            stopped.start();
            const stoppedDone = stopped.done;
            stopped.stop().stop();

            await stoppedDone;
            expect(stopped.state).to.equal('stopped');
            expect(clock.countTimers()).to.equal(0);
        });

        it('rejects unhandled callback and error-handler failures with their original errors', async () => {
            const callbackError = new Error('callback failed');
            const callbackFailure = new Interval({
                func: () => {
                    throw callbackError;
                },
                time: 100,
                start: 'immediate',
            });
            callbackFailure.start();
            const callbackDone = callbackFailure.done;

            await clock.tickAsync(0);
            expect(await rejectionOf(callbackDone)).to.equal(callbackError);
            expect(callbackFailure.state).to.equal('stopped');

            const handlerError = new Error('handler failed');
            const handlerFailure = new Interval({
                func: () => {
                    throw callbackError;
                },
                onError: () => {
                    throw handlerError;
                },
                time: 100,
                start: 'immediate',
            });
            handlerFailure.start();
            const handlerDone = handlerFailure.done;

            await clock.tickAsync(0);
            expect(await rejectionOf(handlerDone)).to.equal(handlerError);
            expect(handlerFailure.state).to.equal('stopped');
        });

        it('resolves when onError handles a failure without continuing', async () => {
            const interval = new Interval({
                func: () => {
                    throw new Error('handled');
                },
                onError: () => false,
                time: 100,
                start: 'immediate',
            });
            interval.start();
            const done = interval.done;

            await clock.tickAsync(0);
            await done;

            expect(interval.state).to.equal('stopped');
            expect(clock.countTimers()).to.equal(0);
        });

        it('creates independent completion promises and signals for restarted runs', async () => {
            const contexts: IntervalContext[] = [];
            const interval = new Interval({
                func: (context) => {
                    contexts.push(context);
                    return false;
                },
                time: 100,
                start: 'immediate',
            });

            interval.start();
            const firstDone = interval.done;
            await clock.tickAsync(0);
            await firstDone;

            interval.start();
            const secondDone = interval.done;
            await clock.tickAsync(0);
            await secondDone;

            expect(secondDone).not.to.equal(firstDone);
            expect(contexts.map(({ iteration }) => iteration)).to.deep.equal([1, 1]);
            expect(contexts[1]).not.to.equal(contexts[0]);
            expect(contexts[1]?.signal).not.to.equal(contexts[0]?.signal);
            expect(interval.state).to.equal('stopped');
        });

        it('rejects a fresh run immediately when the external signal is already aborted', async () => {
            const controller = new AbortController();
            const reason = new Error('cancelled');
            const func = sinon.spy();
            const interval = new Interval({ func, time: 100, signal: controller.signal });
            const idleDone = interval.done;
            controller.abort(reason);

            interval.start();
            const runDone = interval.done;

            expect(runDone).not.to.equal(idleDone);
            expect(await rejectionOf(runDone)).to.equal(reason);
            expect(interval.state).to.equal('stopped');
            expect(func.callCount).to.equal(0);
            expect(clock.countTimers()).to.equal(0);
        });

        it('does not emit an unhandled rejection before done is observed', async () => {
            const error = new Error('boom');
            const unhandled = sinon.spy();
            const interval = new Interval({
                func: () => {
                    throw error;
                },
                time: 100,
                start: 'immediate',
            });
            process.on('unhandledRejection', unhandled);

            try {
                interval.start();
                await clock.tickAsync(0);
                await Promise.resolve();

                expect(unhandled.callCount).to.equal(0);
                expect(await rejectionOf(interval.done)).to.equal(error);
            } finally {
                process.removeListener('unhandledRejection', unhandled);
            }
        });
    });

    describe('pause and resume', () => {
        it('preserves a pending iteration and its full computed delay', async () => {
            const duration = sinon.stub().returns(100);
            const contexts: IntervalContext[] = [];
            const interval = new Interval({
                func: (context) => {
                    contexts.push(context);
                    return false;
                },
                time: duration,
            });
            interval.start();
            const done = interval.done;
            const settled = sinon.spy();
            void done.then(settled);

            await clock.tickAsync(40);
            interval.pause().pause();

            expect(interval.state).to.equal('paused');
            expect(interval.isRunning).to.be.false;
            expect(clock.countTimers()).to.equal(0);
            expect(() => interval.start()).to.throw('Interval is already running');

            await clock.tickAsync(500);
            expect(contexts).to.be.empty;
            expect(settled.callCount).to.equal(0);

            interval.resume().resume();
            expect(interval.state).to.equal('running');
            expect(interval.done).to.equal(done);
            expect(duration.callCount).to.equal(1);
            expect(clock.countTimers()).to.equal(1);

            await clock.tickAsync(99);
            expect(contexts).to.be.empty;
            await clock.tickAsync(1);
            await done;

            expect(contexts).to.have.length(1);
            expect(contexts[0]?.iteration).to.equal(1);
            expect(contexts[0]?.elapsed).to.equal(640);
            expect(interval.state).to.equal('stopped');
            expect(settled.callCount).to.equal(1);
        });

        it('pauses an active callback and resumes without overlap or a counter reset', async () => {
            let releaseFirst: (() => void) | undefined;
            let active = 0;
            let maxActive = 0;
            const iterations: number[] = [];
            const interval = new Interval({
                func: async ({ iteration }) => {
                    iterations.push(iteration);
                    active++;
                    maxActive = Math.max(maxActive, active);

                    if (iteration === 1) {
                        await new Promise<void>((resolve) => {
                            releaseFirst = resolve;
                        });
                    }

                    active--;
                    return iteration < 2;
                },
                time: 100,
                start: 'immediate',
            });
            interval.start();
            const done = interval.done;
            await clock.tickAsync(0);

            interval.pause();
            expect(interval.state).to.equal('paused');
            expect(clock.countTimers()).to.equal(0);

            interval.resume().resume();
            await clock.tickAsync(1_000);
            expect(iterations).to.deep.equal([1]);

            releaseFirst?.();
            await clock.tickAsync(99);
            expect(iterations).to.deep.equal([1]);
            await clock.tickAsync(1);
            await done;

            expect(iterations).to.deep.equal([1, 2]);
            expect(maxActive).to.equal(1);
            expect(interval.state).to.equal('stopped');
        });

        it('does not schedule after an active callback completes while paused', async () => {
            let releaseFirst: (() => void) | undefined;
            const iterations: number[] = [];
            const interval = new Interval({
                func: async ({ iteration }) => {
                    iterations.push(iteration);

                    if (iteration === 1) {
                        await new Promise<void>((resolve) => {
                            releaseFirst = resolve;
                        });
                    }

                    return iteration < 2;
                },
                time: 100,
                start: 'immediate',
            });
            interval.start();
            const done = interval.done;
            await clock.tickAsync(0);

            interval.pause();
            releaseFirst?.();
            await clock.tickAsync(1_000);

            expect(interval.state).to.equal('paused');
            expect(iterations).to.deep.equal([1]);
            expect(clock.countTimers()).to.equal(0);

            interval.resume();
            await clock.tickAsync(100);
            await done;

            expect(iterations).to.deep.equal([1, 2]);
            expect(interval.state).to.equal('stopped');
        });

        it('settles correctly when stopped or aborted while paused', async () => {
            const stopped = new Interval({ func: sinon.spy(), time: 100 });
            stopped.start().pause();
            const stoppedDone = stopped.done;
            stopped.stop();
            await stoppedDone;

            const controller = new AbortController();
            const reason = new Error('abort while paused');
            const aborted = new Interval({ func: sinon.spy(), time: 100, signal: controller.signal });
            aborted.start().pause();
            const abortedDone = aborted.done;
            controller.abort(reason);

            expect(await rejectionOf(abortedDone)).to.equal(reason);
            expect(stopped.state).to.equal('stopped');
            expect(aborted.state).to.equal('stopped');
            expect(clock.countTimers()).to.equal(0);
        });
    });

    describe('context and races', () => {
        it('exposes a run-owned signal that aborts on stop while done resolves', async () => {
            let context: IntervalContext | undefined;
            let release: (() => void) | undefined;
            const interval = new Interval({
                func: async (value) => {
                    context = value;
                    await new Promise<void>((resolve) => {
                        release = resolve;
                    });
                },
                time: 100,
                start: 'immediate',
            });
            interval.start();
            const done = interval.done;
            await clock.tickAsync(0);

            interval.stop();
            await done;

            expect(context?.signal.aborted).to.be.true;
            expect(context?.signal.reason).to.be.instanceOf(AbortError);
            expect((context?.signal.reason as AbortError).name).to.equal('AbortError');
            expect(interval.state).to.equal('stopped');

            release?.();
            await clock.tickAsync(1_000);
            expect(clock.countTimers()).to.equal(0);
        });

        it('forwards external abort to the effective signal and rejects with the exact reason', async () => {
            const controller = new AbortController();
            const reason = new Error('external');
            let effectiveSignal: AbortSignal | undefined;
            const interval = new Interval({
                func: async ({ signal }) => {
                    effectiveSignal = signal;
                    await new Promise<void>(() => undefined);
                },
                time: 100,
                start: 'immediate',
                signal: controller.signal,
            });
            interval.start();
            const done = interval.done;
            await clock.tickAsync(0);

            controller.abort(reason);

            expect(await rejectionOf(done)).to.equal(reason);
            expect(effectiveSignal).not.to.equal(controller.signal);
            expect(effectiveSignal?.aborted).to.be.true;
            expect(effectiveSignal?.reason).to.equal(reason);
            expect(interval.state).to.equal('stopped');
        });

        it('uses first-wins settlement for stop, abort, and a later callback failure', async () => {
            const controller = new AbortController();
            let rejectCallback: ((reason: unknown) => void) | undefined;
            const interval = new Interval({
                func: () =>
                    new Promise<void>((_resolve, reject) => {
                        rejectCallback = reject;
                    }),
                time: 100,
                start: 'immediate',
                signal: controller.signal,
            });
            interval.start();
            const done = interval.done;
            const resolved = sinon.spy();
            const rejected = sinon.spy();
            void done.then(resolved, rejected);
            await clock.tickAsync(0);

            interval.stop();
            controller.abort(new Error('too late'));
            rejectCallback?.(new Error('also too late'));
            await clock.tickAsync(0);
            await done;

            expect(resolved.callCount).to.equal(1);
            expect(rejected.callCount).to.equal(0);
            expect(clock.countTimers()).to.equal(0);
        });

        it('does not overlap a restarted run with a stale callback', async () => {
            let releaseFirst: (() => void) | undefined;
            let active = 0;
            let maxActive = 0;
            let calls = 0;
            const interval = new Interval({
                func: async () => {
                    calls++;
                    active++;
                    maxActive = Math.max(maxActive, active);

                    if (calls === 1) {
                        await new Promise<void>((resolve) => {
                            releaseFirst = resolve;
                        });
                    }

                    active--;
                    return false;
                },
                time: 100,
                start: 'immediate',
            });
            interval.start();
            const firstDone = interval.done;
            await clock.tickAsync(0);

            interval.stop();
            await firstDone;
            interval.start();
            const secondDone = interval.done;
            await clock.tickAsync(0);

            expect(calls).to.equal(1);
            expect(clock.countTimers()).to.equal(0);

            releaseFirst?.();
            await clock.runAllAsync();
            await secondDone;

            expect(calls).to.equal(2);
            expect(maxActive).to.equal(1);
            expect(secondDone).not.to.equal(firstDone);
            expect(interval.state).to.equal('stopped');
        });
    });
});
