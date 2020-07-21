import sinon from 'sinon';
import { expect } from 'chai';
import { poll, times, until } from '../../src';

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
});