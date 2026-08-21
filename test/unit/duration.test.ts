import { expect } from 'chai';
import sinon from 'sinon';

import { duration } from '../../src';
import { MAX_TIMER_DURATION, resolveDuration } from '../../src/duration-internal';

describe('Duration functions', () => {
    afterEach(() => {
        sinon.restore();
    });

    describe('primitives', () => {
        it('returns a constant value for every counter', () => {
            const strategy = duration.constant(1000);

            expect(strategy(1)).to.equal(1000);
            expect(strategy(5)).to.equal(1000);
            expect(strategy(100)).to.equal(1000);
        });

        it('increases linearly and preserves zero and negative increments', () => {
            const increasing = duration.linear(100, 50);
            const constant = duration.linear(500, 0);
            const decreasing = duration.linear(1000, -100);

            expect(increasing(1)).to.equal(100);
            expect(increasing(2)).to.equal(150);
            expect(increasing(5)).to.equal(300);
            expect(constant(11)).to.equal(500);
            expect(decreasing(6)).to.equal(500);
            expect(() => decreasing(12)).to.throw(RangeError);
        });

        it('doubles exponentially and honors an optional maximum, including zero', () => {
            const uncapped = duration.exponential(100);
            const capped = duration.exponential(100, 500);
            const zeroCapped = duration.exponential(100, 0);

            expect([1, 2, 3, 4].map(uncapped)).to.deep.equal([100, 200, 400, 800]);
            expect([1, 2, 3, 4, 5].map(capped)).to.deep.equal([100, 200, 400, 500, 500]);
            expect(zeroCapped(1)).to.equal(0);
        });

        it('follows the existing Fibonacci counter semantics', () => {
            const strategy = duration.fibonacci(100);

            expect([0, 1, 2, 3, 4, 5, 6].map(strategy)).to.deep.equal([100, 100, 200, 300, 500, 800, 1300]);
        });

        it('selects steps without mutating the caller array', () => {
            const definitions = [
                { threshold: 10, duration: 1000 },
                { threshold: 0, duration: 100 },
                { threshold: 5, duration: 500 },
            ];
            const strategy = duration.steps(definitions);

            expect(strategy(3)).to.equal(100);
            expect(strategy(7)).to.equal(500);
            expect(strategy(15)).to.equal(1000);
            expect(definitions.map(({ threshold }) => threshold)).to.deep.equal([10, 0, 5]);
        });

        it('uses the first declared duration below every step threshold', () => {
            const strategy = duration.steps([
                { threshold: 5, duration: 500 },
                { threshold: 10, duration: 1000 },
            ]);

            expect(strategy(0)).to.equal(500);
            expect(strategy(3)).to.equal(500);
        });
    });

    describe('cap', () => {
        it('caps values below, equal to, and above the maximum', () => {
            expect(duration.cap(499, 500)(1)).to.equal(499);
            expect(duration.cap(500, 500)(1)).to.equal(500);
            expect(duration.cap(501, 500)(1)).to.equal(500);
        });

        it('resolves dynamic sources with the unchanged counter', () => {
            const source = sinon.spy((counter: number) => counter * 250);
            const strategy = duration.cap(source, 500);

            expect(strategy(1)).to.equal(250);
            expect(strategy(3)).to.equal(500);
            expect(source.args.map(([counter]) => counter)).to.deep.equal([1, 3]);
        });

        it('makes an oversized finite result timer-safe', () => {
            const strategy = duration.cap(() => MAX_TIMER_DURATION + 1000, 30_000);

            expect(strategy(30)).to.equal(30_000);
            expect(resolveDuration(strategy, 30)).to.equal(30_000);
        });
    });

    describe('floor', () => {
        it('floors values below, equal to, and above the minimum', () => {
            expect(duration.floor(499, 500)(1)).to.equal(500);
            expect(duration.floor(500, 500)(1)).to.equal(500);
            expect(duration.floor(501, 500)(1)).to.equal(501);
        });

        it('composes with a dynamic capped strategy', () => {
            const strategy = duration.floor(duration.cap(duration.linear(250, 500), 1000), 500);

            expect([1, 2, 3, 4].map(strategy)).to.deep.equal([500, 750, 1000, 1000]);
        });
    });

    describe('jitter', () => {
        it('returns the source unchanged when the factor is zero', () => {
            sinon.stub(Math, 'random').returns(0);

            expect(duration.jitter(1000, 0)(1)).to.equal(1000);
        });

        it('produces the exact lower, midpoint, and upper bounds', () => {
            const random = sinon.stub(Math, 'random');
            random.onCall(0).returns(0);
            random.onCall(1).returns(0.5);
            random.onCall(2).returns(1);
            const strategy = duration.jitter(1000, 0.2);

            expect(strategy(1)).to.equal(800);
            expect(strategy(1)).to.equal(1000);
            expect(strategy(1)).to.equal(1200);
        });

        it('supports the full factor boundary and an exponential source', () => {
            sinon.stub(Math, 'random').returns(1);

            expect(duration.jitter(1000, 1)(1)).to.equal(2000);
            expect(duration.jitter(duration.exponential(100), 0.25)(3)).to.equal(500);
        });

        it('preserves observable composition order', () => {
            sinon.stub(Math, 'random').returns(1);
            const cappedAfterJitter = duration.cap(duration.jitter(1000, 0.2), 1000);
            const jitteredAfterCap = duration.jitter(duration.cap(1000, 1000), 0.2);

            expect(cappedAfterJitter(1)).to.equal(1000);
            expect(jitteredAfterCap(1)).to.equal(1200);
        });

        it('keeps jittered as cap-before-jitter convenience with documented spread', () => {
            sinon.stub(Math, 'random').returns(1);
            const strategy = duration.jittered(100, 500, 0.2);

            expect(strategy(10)).to.equal(600);
        });
    });

    describe('map', () => {
        it('transforms constants and strategies', () => {
            const round = (value: number): number => Math.round(value / 100) * 100;

            expect(duration.map(149, round)(1)).to.equal(100);
            expect(duration.map(duration.linear(125, 50), round)(2)).to.equal(200);
        });

        it('passes the unchanged counter to the source and transform', () => {
            const source = sinon.spy((counter: number) => counter * 10);
            const transform = sinon.spy((value: number, counter: number) => value + counter);
            const strategy = duration.map(source, transform);

            expect(strategy(7)).to.equal(77);
            expect(source.calledOnceWithExactly(7)).to.be.true;
            expect(transform.calledOnceWithExactly(70, 7)).to.be.true;
        });

        it('nests with other transformations', () => {
            const strategy = duration.floor(
                duration.cap(
                    duration.map(duration.exponential(100), (value) => value + 25),
                    350,
                ),
                150,
            );

            expect([1, 2, 3].map(strategy)).to.deep.equal([150, 225, 350]);
        });

        it('rejects invalid transformed values', () => {
            for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
                const strategy = duration.map(100, () => value);

                expect(() => strategy(1)).to.throw(RangeError);
            }

            const wrongType = duration.map(100, () => '100' as unknown as number);
            expect(() => wrongType(1)).to.throw(TypeError);
        });
    });

    describe('decorrelatedJitter', () => {
        it('returns the initial duration for the minimum random value without collapsing below it', () => {
            sinon.stub(Math, 'random').returns(0);
            const strategy = duration.decorrelatedJitter(100, 10_000);

            expect([strategy(1), strategy(2), strategy(3)]).to.deep.equal([100, 100, 100]);
        });

        it('returns three times the previous duration for the maximum random value', () => {
            sinon.stub(Math, 'random').returns(1);
            const strategy = duration.decorrelatedJitter(100, 10_000);

            expect(strategy(1)).to.equal(300);
            expect(strategy(2)).to.equal(900);
        });

        it('updates its isolated state from deterministic intermediate random values', () => {
            const random = sinon.stub(Math, 'random');
            random.onCall(0).returns(0.5);
            random.onCall(1).returns(0.25);
            const strategy = duration.decorrelatedJitter(100, 10_000);

            expect(strategy(1)).to.equal(200);
            expect(strategy(2)).to.equal(225);
            expect(random.callCount).to.equal(2);
        });

        it('clamps each generated duration to the maximum and progresses from the clamped value', () => {
            sinon.stub(Math, 'random').returns(1);
            const strategy = duration.decorrelatedJitter(100, 250);

            expect(strategy(1)).to.equal(250);
            expect(strategy(2)).to.equal(250);
        });

        it('never generates a value below the initial duration', () => {
            const random = sinon.stub(Math, 'random');
            random.onCall(0).returns(1);
            random.onCall(1).returns(0);
            random.onCall(2).returns(0.01);
            random.onCall(3).returns(0.5);
            const strategy = duration.decorrelatedJitter(100, 10_000);

            for (let counter = 1; counter <= 4; counter++) {
                expect(strategy(counter)).to.be.at.least(100);
            }
        });

        it('rejects a maximum below the initial duration', () => {
            expect(() => duration.decorrelatedJitter(100, 99)).to.throw(
                RangeError,
                '"maximum" must be greater than or equal to "initial"',
            );
        });
    });

    describe('validation', () => {
        it('accepts zero, fractional values, and the maximum timer duration', () => {
            expect(resolveDuration(0, 1)).to.equal(0);
            expect(resolveDuration(0.5, 1)).to.equal(0.5);
            expect(resolveDuration(MAX_TIMER_DURATION, 1)).to.equal(MAX_TIMER_DURATION);
        });

        it('rejects unusable final timer values', () => {
            for (const value of [
                -1,
                Number.NaN,
                Number.POSITIVE_INFINITY,
                Number.NEGATIVE_INFINITY,
                MAX_TIMER_DURATION + 1,
            ]) {
                expect(() => resolveDuration(value, 1)).to.throw(RangeError);
            }

            expect(() => resolveDuration((() => '100') as any, 1)).to.throw(TypeError);
        });

        it('validates primitive arguments eagerly', () => {
            for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, MAX_TIMER_DURATION + 1]) {
                expect(() => duration.constant(value)).to.throw(RangeError);
                expect(() => duration.exponential(value)).to.throw(RangeError);
                expect(() => duration.fibonacci(value)).to.throw(RangeError);
            }

            expect(() => duration.linear(100, Number.NaN)).to.throw(RangeError);
            expect(() => duration.steps([])).to.throw(RangeError);
            expect(() => duration.steps([{ threshold: Number.NaN, duration: 100 }])).to.throw(RangeError);
            expect(() => duration.steps([{ threshold: 0, duration: -1 }])).to.throw(RangeError);
        });

        it('validates combinator arguments eagerly', () => {
            expect(() => duration.cap({} as any, 100)).to.throw(TypeError);
            expect(() => duration.floor(100, -1)).to.throw(RangeError);
            expect(() => duration.jitter(100, -0.1)).to.throw(RangeError);
            expect(() => duration.jitter(100, 1.1)).to.throw(RangeError);
            expect(() => duration.jitter(100, Number.NaN)).to.throw(RangeError);
            expect(() => duration.map(100, null as any)).to.throw(TypeError);
        });

        it('allows an outer cap to repair oversized nested calculations', () => {
            sinon.stub(Math, 'random').returns(1);
            const oversized = duration.map(duration.jitter(MAX_TIMER_DURATION, 1), (value) => value * 2);

            expect(() => resolveDuration(oversized, 1)).to.throw(RangeError);
            expect(resolveDuration(duration.cap(oversized, 1000), 1)).to.equal(1000);
        });
    });
});
