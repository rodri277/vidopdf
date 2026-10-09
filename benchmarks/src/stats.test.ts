import { describe, expect, it } from 'vitest';
import { frameStats, mean, median, percentile, round } from './stats';

describe('percentile and median', () => {
  it('picks the sample at the rank, never interpolating', () => {
    const samples = [5, 1, 4, 2, 3];
    expect(percentile(samples, 0.5)).toBe(3);
    expect(percentile(samples, 0.95)).toBe(5);
    expect(percentile(samples, 0)).toBe(1);
    expect(median([10, 20])).toBe(10);
  });

  it('does not change the array it is given', () => {
    const samples = [3, 1, 2];
    percentile(samples, 0.5);
    expect(samples).toEqual([3, 1, 2]);
  });

  it('is not a number for no samples', () => {
    expect(percentile([], 0.5)).toBeNaN();
    expect(mean([])).toBeNaN();
  });
});

describe('frameStats', () => {
  it('reports 60 fps for a steady 16.67 ms frame', () => {
    const stats = frameStats(Array.from({ length: 120 }, () => 1000 / 60));
    expect(round(stats.fps)).toBe(60);
    expect(stats.slowFrames).toBe(0);
    expect(round(stats.p99Ms, 2)).toBe(16.67);
  });

  it('counts frames that missed their slot and finds the worst one', () => {
    const stats = frameStats([16, 16, 33, 16, 120, 16]);
    expect(stats.slowFrames).toBe(2);
    expect(stats.worstMs).toBe(120);
    expect(stats.frames).toBe(6);
    expect(stats.fps).toBeLessThan(60);
  });

  it('copes with no frames at all', () => {
    expect(frameStats([])).toMatchObject({ frames: 0, fps: 0 });
  });
});

describe('round', () => {
  it('rounds to the digits asked for', () => {
    expect(round(1.2349, 2)).toBe(1.23);
    expect(round(7.5)).toBe(7.5);
  });
});
