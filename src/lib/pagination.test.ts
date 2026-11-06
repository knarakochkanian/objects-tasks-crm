import { describe, expect, it } from 'vitest';
import { collectPages } from './pagination';

describe('complete database lists', () => {
  it('loads every range, including a partial final page, without overlaps', async () => {
    const rows = Array.from({ length: 450 }, (_, id) => ({ id }));
    const ranges: [number, number][] = [];
    const result = await collectPages(async (from, to) => {
      ranges.push([from, to]);
      return rows.slice(from, to + 1);
    });
    expect(result).toEqual(rows);
    expect(ranges).toEqual([
      [0, 199],
      [200, 399],
      [400, 599],
    ]);
  });
  it('checks the next page when the last nonempty page is exactly full', async () => {
    const rows = Array.from({ length: 200 }, (_, id) => id);
    const ranges: [number, number][] = [];
    expect(
      await collectPages(async (from, to) => {
        ranges.push([from, to]);
        return rows.slice(from, to + 1);
      }),
    ).toEqual(rows);
    expect(ranges).toEqual([
      [0, 199],
      [200, 399],
    ]);
  });
  it('returns an empty list immediately when no rows are accessible', async () => {
    let requests = 0;
    expect(
      await collectPages(async () => {
        requests += 1;
        return [];
      }),
    ).toEqual([]);
    expect(requests).toBe(1);
  });
  it('rejects a failed later page instead of displaying partial data as complete', async () => {
    const failure = new Error('Network unavailable');
    await expect(
      collectPages(async (from) => {
        if (from > 0) throw failure;
        return Array.from({ length: 200 }, (_, id) => id);
      }),
    ).rejects.toBe(failure);
  });
  it('stops pagination when the query is cancelled', async () => {
    const controller = new AbortController();
    let requests = 0;
    await expect(
      collectPages(async () => {
        requests += 1;
        controller.abort();
        return Array.from({ length: 200 }, (_, id) => id);
      }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(requests).toBe(1);
  });
});
