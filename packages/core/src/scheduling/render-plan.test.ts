import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { planRenders } from './render-plan';

const none = () => false;

describe('planRenders', () => {
  it('starts the most urgent renders first, up to the limit', () => {
    const plan = planRenders({
      wanted: ['a', 'b', 'c', 'd'],
      inFlight: new Set(),
      cached: none,
      maxInFlight: 2,
    });
    expect(plan).toEqual({ cancel: [], start: ['a', 'b'] });
  });

  it('cancels renders that are no longer wanted and frees their slots', () => {
    const plan = planRenders({
      wanted: ['c', 'd'],
      inFlight: new Set(['a', 'b']),
      cached: none,
      maxInFlight: 2,
    });
    expect(plan).toEqual({ cancel: ['a', 'b'], start: ['c', 'd'] });
  });

  it('keeps a wanted render that is already running and fills the rest', () => {
    const plan = planRenders({
      wanted: ['a', 'b', 'c'],
      inFlight: new Set(['a']),
      cached: none,
      maxInFlight: 2,
    });
    expect(plan).toEqual({ cancel: [], start: ['b'] });
  });

  it('skips pages that are already cached', () => {
    const plan = planRenders({
      wanted: ['a', 'b', 'c'],
      inFlight: new Set(),
      cached: (key) => key === 'a',
      maxInFlight: 2,
    });
    expect(plan.start).toEqual(['b', 'c']);
  });

  it('starts nothing when every slot is busy with wanted work', () => {
    const plan = planRenders({
      wanted: ['a', 'b', 'c'],
      inFlight: new Set(['a', 'b']),
      cached: none,
      maxInFlight: 2,
    });
    expect(plan).toEqual({ cancel: [], start: [] });
  });

  it('starts a duplicated wanted key only once', () => {
    const plan = planRenders({
      wanted: ['a', 'a', 'b'],
      inFlight: new Set(),
      cached: none,
      maxInFlight: 3,
    });
    expect(plan.start).toEqual(['a', 'b']);
  });

  it('never exceeds the limit and never starts what is cached or running', () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(30), { maxLength: 40 }),
        fc.array(fc.nat(30), { maxLength: 6 }),
        fc.array(fc.nat(30), { maxLength: 10 }),
        fc.integer({ min: 1, max: 5 }),
        (wanted, running, cachedList, maxInFlight) => {
          const inFlight = new Set(running);
          const cached = new Set(cachedList);
          const plan = planRenders({ wanted, inFlight, cached: (k) => cached.has(k), maxInFlight });
          const kept = [...inFlight].filter((k) => !plan.cancel.includes(k));
          expect(kept.length + plan.start.length).toBeLessThanOrEqual(
            Math.max(maxInFlight, kept.length),
          );
          for (const key of plan.start) {
            expect(inFlight.has(key) || cached.has(key)).toBe(false);
            expect(wanted).toContain(key);
          }
        },
      ),
    );
  });
});
