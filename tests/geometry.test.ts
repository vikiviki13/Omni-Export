import { describe, expect, it } from 'vitest';
import { intersectRect, layerPlacement, toLocal, unionRects } from '../src/ui/utilities/geometry';

describe('coordinates', () => {
  it('converts absolute to local (incl. negative)', () => {
    expect(toLocal({ x: 90, y: 40 }, { x: 100, y: 50 })).toEqual({ x: -10, y: -10 });
  });
  it('places layers using render bounds and scale', () => {
    expect(layerPlacement({ x: 110, y: 60, width: 5, height: 5 }, { x: 100, y: 50 }, 2)).toEqual({
      left: 20,
      top: 20,
    });
  });
  it('intersects and unions', () => {
    expect(
      intersectRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }),
    ).toEqual({ x: 5, y: 5, width: 5, height: 5 });
    expect(
      intersectRect({ x: 0, y: 0, width: 1, height: 1 }, { x: 5, y: 5, width: 1, height: 1 }),
    ).toBeNull();
    expect(
      unionRects([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: 5, width: 5, height: 20 },
      ]),
    ).toEqual({ x: 0, y: 0, width: 25, height: 25 });
  });
});
