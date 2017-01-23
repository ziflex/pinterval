/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies, no-empty */
import { expect } from 'chai';
import sinon from 'sinon';
import Interval from '../../src/index';

describe('Interval', () => {
    describe('#constructor', () => {
        context('When arguments are missed', () => {
            it('should throw an error', () => {
                expect(() => {
                    return Interval();
                }).to.throw(Error);

                expect(() => {
                    return Interval({});
                }).to.throw(Error);

                expect(() => {
                    return Interval({ func: sinon.spy(), time: null });
                }).to.throw(Error);

                expect(() => {
                    return Interval({ func: sinon.spy() });
                }).to.throw(Error);

                expect(() => {
                    return Interval({ func: sinon.spy(), time: {} });
                }).to.throw(Error);
            });
        });
    });

    describe('.start', () => {
        let clock = null;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
        });

        afterEach(() => {
            clock.restore();
        });

        it('should call handler on each tick', () => {
            const spy = sinon.spy();
            const interval = Interval({ func: spy, time: 1000 });

            interval.start();

            clock.tick(1000);

            expect(spy.callCount).to.equal(1);
        });

        context('When called more then once', () => {
            it('should throw an error', () => {
                const interval = Interval({ func: sinon.spy(), time: 1000 });

                interval.start();

                expect(() => {
                    interval.start();
                }).to.throw(Error);
            });
        });
    });

    describe('.stop', () => {
        let clock = null;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
        });

        afterEach(() => {
            clock.restore();
        });

        it('should stop calling handler on each tick', () => {
            const spy = sinon.spy();
            const interval = Interval({ func: spy, time: 1000 });

            interval.start();

            clock.tick(1000);

            expect(spy.callCount).to.equal(1);

            interval.stop();

            clock.tick(1200);

            expect(spy.callCount).to.equal(1);
        });

        context('When called more then once', () => {
            it('should throw an error', () => {
                const interval = Interval({ func: sinon.spy(), time: 1000 });

                expect(() => {
                    interval.stop();
                }).to.throw(Error);

                interval.start();
                interval.stop();

                expect(() => {
                    interval.stop();
                }).to.throw(Error);
            });
        });
    });

    describe('.isRunning', () => {
        context('When is stopped', () => {
            it('should return "false"', () => {
                const interval = Interval({ func: sinon.spy(), time: 1000 });

                expect(interval.isRunning()).to.be.false;
            });
        });

        context('When is running', () => {
            it('should return "true"', () => {
                const interval = Interval({ func: sinon.spy(), time: 1000 });

                interval.start();

                expect(interval.isRunning()).to.be.true;

                interval.stop();

                expect(interval.isRunning()).to.be.false;
            });
        });
    });

    describe('Async execution', () => {
        let clock = null;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
        });

        afterEach(() => {
            clock.restore();
        });

        it('should wait for an end of async execution before next tick', () => {
            const spy = sinon.spy();
            const fn = done => spy(done);
            const interval = Interval({
                func: fn,
                time: 1000
            });

            interval.start();

            clock.tick(1000);
            expect(spy.callCount, 'callCount').to.eql(1);

            clock.tick(1000);
            expect(spy.callCount, 'callCount').to.eql(1);

            spy.args[0][0]();

            clock.tick(1000);
            expect(spy.callCount, 'callCount').to.eql(2);
        });
    });

    describe('Error handling', () => {
        let clock = null;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
        });

        afterEach(() => {
            clock.restore();
        });

        context('When error handler is not provided', () => {
            it('should catch an error and stop', () => {
                const interval = Interval({ func: sinon.stub().throws(), time: 1000 });

                interval.start();

                try {
                    clock.tick(1000);
                } catch (e) {
                } finally {
                    expect(interval.isRunning(), 'isRunning').to.be.false;
                }
            });
        });

        context('When error handler is provided and returns "false"', () => {
            it('should catch an error and stop', () => {
                const interval = Interval({
                    func: sinon.stub().throws(),
                    onError: sinon.stub().returns(false),
                    time: 1000
                });

                interval.start();
                clock.tick(1000);
                expect(interval.isRunning(), 'isRunning').to.be.false;
            });
        });

        context('When error handler is provided and returns "true" or undefiend', () => {
            it('should catch an error and continue', () => {
                const interval = Interval({
                    func: sinon.stub().throws(),
                    onError: sinon.stub(),
                    time: 1000
                });

                interval.start();
                clock.tick(1000);
                expect(interval.isRunning(), 'isRunning').to.be.true;
            });
        });

        context('When async', () => {
            context('When error handler is not provided', () => {
                it('should catch an error and stop', () => {
                    const fn = (done) => {
                        setTimeout(() => {
                            done(new Error('Async error'), 10);
                        });
                    };
                    const interval = Interval({
                        func: fn,
                        time: 1000
                    });

                    const onCatch = sinon.spy();
                    interval.start();

                    try {
                        clock.tick(1000);
                        clock.tick(10);
                    } catch (e) {
                        onCatch(e);
                    } finally {
                        expect(interval.isRunning(), 'isRunning').to.be.false;
                        expect(onCatch.called).to.be.true;
                        expect(onCatch.args[0][0]).to.be.error;
                    }
                });
            });

            context('When error handler is provided and returns "false"', () => {
                it('should catch an error and stop', () => {
                    const fn = (done) => {
                        setTimeout(() => {
                            done(new Error('Async error'), 10);
                        });
                    };
                    const interval = Interval({
                        func: fn,
                        onError: sinon.stub().returns(false),
                        time: 1000
                    });

                    interval.start();
                    clock.tick(1000);
                    clock.tick(10);
                    expect(interval.isRunning(), 'isRunning').to.be.false;
                });
            });

            context('When error handler is provided and returns "true" or undefiend', () => {
                it('should catch an error and continue', () => {
                    const fn = (done) => {
                        setTimeout(() => {
                            done(new Error('Async error'), 10);
                        });
                    };
                    const interval = Interval({
                        func: fn,
                        onError: sinon.stub(),
                        time: 1000
                    });

                    interval.start();
                    clock.tick(1000);
                    clock.tick(10);
                    expect(interval.isRunning(), 'isRunning').to.be.true;
                });
            });

            context('When interval stopped before execution', () => {
                it('should propagate an error', () => {
                    const fn = (done) => {
                        setTimeout(() => {
                            done(new Error('Test'), 10);
                        });
                    };
                    const interval = Interval({
                        func: fn,
                        time: 1000
                    });
                    const onError = sinon.spy();
                    interval.start();

                    try {
                        clock.tick(1000);
                        interval.stop();
                        clock.tick(10);
                    } catch (e) {
                        onError(e);
                    } finally {
                        expect(onError.called, 'onError.called').to.be.true;
                        expect(onError.args[0][0]).to.be.error;
                        expect(onError.args[0][0].message).to.eql('Test');
                    }
                });
            });
        });
    });
});
