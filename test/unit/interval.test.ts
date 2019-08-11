import { expect } from 'chai';
import sinon from 'sinon';
import { Interval } from '../../src/index';

async function sleep(time: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    })
}

describe('Interval', () => {
    describe('#constructor', () => {
        context('When arguments are missed', () => {
            it('should throw an error', () => {
                expect(() => {
                    return new Interval(null as any);
                }).to.throw(Error);

                expect(() => {
                    return new Interval(({} as any));
                }).to.throw(Error);

                expect(() => {
                    return new Interval({ func: sinon.spy(), time: null as any });
                }).to.throw(Error);

                expect(() => {
                    return new Interval({ func: sinon.spy() } as any);
                }).to.throw(Error);

                expect(() => {
                    return new Interval({ func: sinon.spy(), time: {} as any });
                }).to.throw(Error);
            });
        });
    });

    describe('.start', () => {
        it('should call handler on each tick', async () => {
            const spy = sinon.spy();
            const interval = new Interval({ func: spy, time: 200 });

            interval.start();

            await sleep(210);

            expect(spy.callCount).to.equal(1);

            interval.stop();
        });

        context('When called more then once', () => {
            it('should throw an error', () => {
                const interval = new Interval({ func: sinon.spy(), time: 200 });

                interval.start();

                expect(() => {
                    interval.start();
                }).to.throw(Error);

                interval.stop();
            });
        });
    });

    describe('.stop', () => {
        it('should stop calling handler on each tick', async () => {
            const spy = sinon.spy();
            const interval = new Interval({ func: spy, time: 200 });

            interval.start();

            await sleep(230);

            expect(spy.callCount).to.equal(1);

            interval.stop();

            await sleep(230);

            expect(spy.callCount).to.equal(1);
        });

        context('When called more then once', () => {
            it('should throw an error', () => {
                const interval = new Interval({ func: sinon.spy(), time: 200 });

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
                const interval = new Interval({ func: sinon.spy(), time: 200 });

                expect(interval.isRunning).to.be.false;
            });
        });

        context('When is running', () => {
            it('should return "true"', () => {
                const interval = new Interval({ func: sinon.spy(), time: 200 });

                interval.start();

                expect(interval.isRunning).to.be.true;

                interval.stop();

                expect(interval.isRunning).to.be.false;
            });
        });
    });

    describe('Async execution', () => {
        it('should wait for an end of async execution before next tick', async () => {
            const spy = sinon.spy();
            const fn = () => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        spy();
                        resolve();
                    }, 500)
                })
            };
            const interval = new Interval({
                func: fn,
                time: 500
            });

            interval.start();

            await sleep(1100);
            expect(spy.callCount, 'callCount').to.eql(1);

            interval.stop();
        });
    });

    describe('Error handling', () => {
        context('When error handler is not provided', () => {
            it('should catch an error and stop', async () => {
                const interval = new Interval({ func: sinon.stub().throws(), time: 200 });

                interval.start();

                await sleep(230);

                expect(interval.isRunning, 'isRunning').to.be.false;
            });
        });

        context('When error handler is provided and returns "false"', () => {
            it('should catch an error and stop', async () => {
                const interval = new Interval({
                    func: () => {
                        throw new Error('Test')
                    },
                    onError: () => false,
                    time: 200
                });

                interval.start();
                await sleep(220);
                expect(interval.isRunning, 'isRunning').to.be.false;
            });
        });

        context('When error handler is provided and returns "true"', () => {
            it('should catch an error and continue', async () => {
                const interval = new Interval({
                    func: sinon.stub().throws(),
                    onError: () => {
                        return true;
                    },
                    time: 200
                });

                interval.start();

                await sleep(300);

                expect(interval.isRunning, 'isRunning').to.be.true;

                interval.stop();
            });
        });

        context('When async', () => {
            context('When error handler is not provided', () => {
                it('should catch an error and stop', async () => {
                    const fn = () => {
                        return new Promise((resolve, reject) => {
                            setTimeout(() => {
                                reject(new Error('Async error'));
                            }, 10);
                        })
                    };
                    const interval = new Interval({
                        func: fn,
                        time: 200
                    });

                    interval.start();

                    await sleep(230);

                    expect(interval.isRunning, 'isRunning').to.be.false;
                });
            });

            context('When error handler is provided and returns "false"', () => {
                it('should catch an error and stop', async () => {
                    const fn = () => {
                        return new Promise((resolve, reject) => {
                            setTimeout(() => {
                                reject(new Error('Async error'));
                            });
                        })
                    };
                    const interval = new Interval({
                        func: fn,
                        onError: sinon.stub().returns(false),
                        time: 200
                    });

                    interval.start();

                    await sleep(230);

                    expect(interval.isRunning, 'isRunning').to.be.false;
                });
            });

            context('When error handler is provided and returns "true"', () => {
                it('should catch an error and continue', async () => {
                    const fn = () => {
                        return new Promise((_, reject) => {
                            setTimeout(() => {
                                reject(new Error('Async error'));
                            });
                        })
                    };
                    const interval = new Interval({
                        func: fn,
                        onError: () => true,
                        time: 200
                    });

                    interval.start();

                    await sleep(230);

                    expect(interval.isRunning, 'isRunning').to.be.true;

                    interval.stop();
                });
            });
        });
    });
});
