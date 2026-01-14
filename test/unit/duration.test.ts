import { expect } from 'chai';

import { duration } from '../../src';

describe('Duration functions', () => {
    describe('constant', () => {
        it('should return the same value for all counters', () => {
            const fn = duration.constant(1000);

            expect(fn(0)).to.equal(1000);
            expect(fn(5)).to.equal(1000);
            expect(fn(100)).to.equal(1000);
        });
    });

    describe('linear', () => {
        it('should increase duration linearly', () => {
            const fn = duration.linear(100, 50);

            expect(fn(0)).to.equal(100); // 100 + 0*50
            expect(fn(1)).to.equal(150); // 100 + 1*50
            expect(fn(2)).to.equal(200); // 100 + 2*50
            expect(fn(5)).to.equal(350); // 100 + 5*50
        });

        it('should handle zero increment', () => {
            const fn = duration.linear(500, 0);

            expect(fn(0)).to.equal(500);
            expect(fn(10)).to.equal(500);
        });

        it('should handle negative increment', () => {
            const fn = duration.linear(1000, -100);

            expect(fn(0)).to.equal(1000);
            expect(fn(5)).to.equal(500);
        });
    });

    describe('exponential', () => {
        it('should double duration each iteration', () => {
            const fn = duration.exponential(100);

            expect(fn(0)).to.equal(100); // 100 * 2^0
            expect(fn(1)).to.equal(200); // 100 * 2^1
            expect(fn(2)).to.equal(400); // 100 * 2^2
            expect(fn(3)).to.equal(800); // 100 * 2^3
        });

        it('should cap at maximum value when provided', () => {
            const fn = duration.exponential(100, 500);

            expect(fn(0)).to.equal(100);
            expect(fn(1)).to.equal(200);
            expect(fn(2)).to.equal(400);
            expect(fn(3)).to.equal(500); // capped
            expect(fn(4)).to.equal(500); // capped
        });

        it('should grow unbounded without max', () => {
            const fn = duration.exponential(10);

            expect(fn(10)).to.equal(10240); // 10 * 2^10
        });
    });

    describe('fibonacci', () => {
        it('should follow Fibonacci sequence', () => {
            const fn = duration.fibonacci(100);

            expect(fn(0)).to.equal(100); // F(0)
            expect(fn(1)).to.equal(100); // F(1)
            expect(fn(2)).to.equal(200); // F(2) = F(0) + F(1)
            expect(fn(3)).to.equal(300); // F(3) = F(1) + F(2)
            expect(fn(4)).to.equal(500); // F(4) = F(2) + F(3)
            expect(fn(5)).to.equal(800); // F(5) = F(3) + F(4)
        });

        it('should work with different initial values', () => {
            const fn = duration.fibonacci(50);

            expect(fn(0)).to.equal(50);
            expect(fn(1)).to.equal(50);
            expect(fn(2)).to.equal(100);
            expect(fn(3)).to.equal(150);
        });
    });

    describe('jittered', () => {
        it('should add randomness to exponential backoff', () => {
            const fn = duration.jittered(100, 1000, 0.1);
            const results = new Set();

            // Run multiple times to check for variation
            for (let i = 0; i < 10; i++) {
                results.add(fn(2));
            }

            // Should have different values due to jitter
            expect(results.size).to.be.greaterThan(1);
        });

        it('should stay within jitter bounds', () => {
            const fn = duration.jittered(100, undefined, 0.1);
            const base = 400; // 100 * 2^2
            const maxJitter = base * 0.1;

            for (let i = 0; i < 20; i++) {
                const result = fn(2);
                expect(result).to.be.at.least(base - maxJitter);
                expect(result).to.be.at.most(base + maxJitter);
            }
        });

        it('should respect max cap', () => {
            const fn = duration.jittered(100, 500, 0.2);

            for (let i = 0; i < 10; i++) {
                const result = fn(10); // Would be 102400 without cap
                expect(result).to.be.at.most(600); // 500 + 20% jitter
            }
        });
    });

    describe('decorrelatedJitter', () => {
        it('should produce values up to 3x previous', () => {
            const fn = duration.decorrelatedJitter(100, 10000);

            let previous = 100;
            for (let i = 0; i < 10; i++) {
                const current = fn(i);
                expect(current).to.be.at.most(previous * 3);
                expect(current).to.be.at.least(0);
                previous = current;
            }
        });

        it('should respect max cap', () => {
            const fn = duration.decorrelatedJitter(100, 500);

            for (let i = 0; i < 20; i++) {
                expect(fn(i)).to.be.at.most(500);
            }
        });

        it('should produce different values on each call', () => {
            const fn = duration.decorrelatedJitter(100, 10000);
            const results = [];

            for (let i = 0; i < 10; i++) {
                results.push(fn(i));
            }

            // Should have variation (not all the same)
            const unique = new Set(results);
            expect(unique.size).to.be.greaterThan(1);
        });
    });

    describe('steps', () => {
        it('should return duration based on threshold', () => {
            const fn = duration.steps([
                { threshold: 0, duration: 100 },
                { threshold: 5, duration: 500 },
                { threshold: 10, duration: 1000 },
            ]);

            expect(fn(0)).to.equal(100);
            expect(fn(4)).to.equal(100);
            expect(fn(5)).to.equal(500);
            expect(fn(9)).to.equal(500);
            expect(fn(10)).to.equal(1000);
            expect(fn(20)).to.equal(1000);
        });

        it('should handle unsorted thresholds', () => {
            const fn = duration.steps([
                { threshold: 10, duration: 1000 },
                { threshold: 0, duration: 100 },
                { threshold: 5, duration: 500 },
            ]);

            expect(fn(3)).to.equal(100);
            expect(fn(7)).to.equal(500);
            expect(fn(15)).to.equal(1000);
        });

        it('should use first duration for counter below all thresholds', () => {
            const fn = duration.steps([
                { threshold: 5, duration: 500 },
                { threshold: 10, duration: 1000 },
            ]);

            expect(fn(0)).to.equal(500);
            expect(fn(3)).to.equal(500);
        });
    });
});
