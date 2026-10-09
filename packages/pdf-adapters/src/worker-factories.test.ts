import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoFilterFactory, WorkerCanvasFactory } from './worker-factories';

class FakeOffscreenCanvas {
  context: object | null = {};
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(): object | null {
    return this.context;
  }
}

beforeEach(() => {
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WorkerCanvasFactory', () => {
  it('creates an offscreen canvas of the size asked, with its context', () => {
    const { canvas, context } = new WorkerCanvasFactory().create(30, 20);
    expect([canvas.width, canvas.height]).toEqual([30, 20]);
    expect(context).toBeDefined();
  });

  it('refuses an empty size, and a canvas that cannot give a context', () => {
    const factory = new WorkerCanvasFactory();
    expect(() => factory.create(0, 10)).toThrow('Invalid canvas size');
    expect(() => factory.create(10, -1)).toThrow('Invalid canvas size');
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return null;
        }
      },
    );
    expect(() => factory.create(5, 5)).toThrow('context');
  });

  it('resizes a canvas in place', () => {
    const factory = new WorkerCanvasFactory();
    const target = factory.create(10, 10);
    factory.reset(target, 40, 50);
    expect([target.canvas.width, target.canvas.height]).toEqual([40, 50]);
    expect(() => {
      factory.reset({ canvas: null, context: null }, 1, 1);
    }).toThrow('not specified');
    expect(() => {
      factory.reset(target, 0, 1);
    }).toThrow('Invalid canvas size');
  });

  it('releases the memory of a canvas it is done with', () => {
    const factory = new WorkerCanvasFactory();
    const target = { ...factory.create(10, 10) } as Parameters<WorkerCanvasFactory['destroy']>[0];
    const canvas = target.canvas;
    factory.destroy(target);
    expect([canvas?.width, canvas?.height]).toEqual([0, 0]);
    expect(target).toEqual({ canvas: null, context: null });
    expect(() => {
      factory.destroy(target);
    }).not.toThrow();
  });
});

describe('NoFilterFactory', () => {
  it('answers "no filter" to every request pdf.js can make', () => {
    const factory = new NoFilterFactory();
    expect([
      factory.addFilter(),
      factory.addHCMFilter(),
      factory.addAlphaFilter(),
      factory.addLuminosityFilter(),
      factory.addHighlightHCMFilter(),
    ]).toEqual(['none', 'none', 'none', 'none', 'none']);
    expect(() => {
      factory.destroy();
    }).not.toThrow();
  });
});
