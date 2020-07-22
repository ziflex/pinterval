import sinon from 'sinon';
import { expect } from 'chai';
import { poll, times, until, pipeline } from '../../src';

describe('Helpers', () => {
    describe('poll', () => {
        context('When returned "false"', () => {
            it('should stop', async () => {
                const spy = sinon.spy();
                await poll(() => {
                    spy();

                    return spy.callCount < 5;
                }, 200);

                expect(spy.callCount).to.eq(5);
            });
        });
    });

    describe('until', () => {
        context('Until data is returned', () => {
            it('should stop', async () => {
                const spy = sinon.spy();
                const data = await until(() => {
                    spy();

                    if (spy.callCount < 5) {
                        return undefined;
                    }

                    return 'foo';
                }, 200);

                expect(spy.callCount).to.eq(5);
                expect(data).to.eql('foo');
            });
        });
    });

    describe('times', () => {
        context('when value is 0', () => {
            it('should not execute a function', async () => {
                const spy = sinon.spy();
                await times(() => spy(), 0, 200);

                expect(spy.callCount).to.eq(0);
            });
        });

        context('when value is 5', () => {
            it('should execute a function 5 times', async () => {
                const spy = sinon.spy();
                await times(() => spy(), 5, 200);

                expect(spy.callCount).to.eq(5);
            });
        });
    });

    describe('pipeline', () => {
        context('When sync', () => {
            it('should pass data through', async () => {
                const out = await pipeline([() => 1, (i) => i * 2, (i) => i * 3, (i) => i * 4], 100);

                expect(out).to.eq(24);
            });
        });

        context('When async', () => {
            it('should pass data through', async () => {
                const delay: any = (value: number, delay = 100) => {
                    return new Promise((resolve) => {
                        setTimeout(() => resolve(value), delay);
                    });
                };
                const out = await pipeline(
                    [() => delay(1), (i) => delay(i * 2), (i) => delay(i * 3), (i) => delay(i * 4)],
                    100,
                );

                expect(out).to.eq(24);
            });
        });
    });
});
